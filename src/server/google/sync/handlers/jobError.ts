/**
 * Shared failure handling for Google sync job handlers.
 *
 * Previously each handler carried its own copy of this logic, and each copy
 * only understood HTTP 401 and 429. Everything else — a revoked refresh
 * token, a Cloud project that is not allowlisted for the Business Profile
 * APIs, a token missing `business.manage` — fell through to a generic
 * failure that left `GoogleAccount.status` as CONNECTED. Auto-sync then
 * re-queued the same doomed job on every interval, and the tenant was never
 * told to reconnect.
 *
 * One decision table now drives all of it: which category, which account
 * status, and whether the job is worth retrying.
 */

import { GoogleAccountStatus, SyncStatus } from "@prisma/client";
import {
  isRetryableCategory,
  isTerminalCategory,
  operatorRemediation,
  requiresReconnect,
  userFacingGoogleMessage,
} from "@/server/google/gateway/errorClassifier";
import type { GoogleErrorCategory } from "@/server/google/gateway/types";
import { syncJobService } from "@/server/google/sync/syncJob.service";
import { googleAccountRepository } from "@/server/repositories/googleAccount.repository";
import { GoogleApiError } from "@/server/services/google/googleClient";
import { logger } from "@/server/utils/logger";

export interface SyncOutcome {
  itemsProcessed: number;
  itemsCreated: number;
  itemsUpdated: number;
  itemsFailed: number;
}

const EMPTY_OUTCOME: SyncOutcome = {
  itemsProcessed: 0,
  itemsCreated: 0,
  itemsUpdated: 0,
  itemsFailed: 1,
};

/**
 * Best-effort category for any thrown value.
 *
 * `GoogleApiError.category` is populated by the gateway, which is the
 * authoritative classification. The status fallbacks only matter for errors
 * raised inside the client itself (e.g. "no refresh token available").
 */
export function categorizeSyncError(err: unknown): GoogleErrorCategory {
  if (err instanceof GoogleApiError) {
    if (err.category) return err.category;
    if (err.status === 429) return "GOOGLE_QUOTA_EXCEEDED";
    if (err.status === 401) return "GOOGLE_AUTH_ERROR";
    if (err.status === 403) return "GOOGLE_PERMISSION_ERROR";
    if (err.status >= 500) return "GOOGLE_SERVER_ERROR";
  }
  return "GOOGLE_UNKNOWN_ERROR";
}

/**
 * Which account status a category implies. `null` means "leave the status
 * alone" — a transient per-location failure should not change how the
 * connection itself is described to the tenant.
 */
function accountStatusFor(
  category: GoogleErrorCategory,
): GoogleAccountStatus | null {
  if (requiresReconnect(category)) {
    // AUTH_ERROR, SCOPE_INSUFFICIENT, CONSENT_REQUIRED — the tenant can fix
    // these by reconnecting, so drive the "Reconnect" banner.
    return GoogleAccountStatus.REAUTH_REQUIRED;
  }
  if (category === "GOOGLE_QUOTA_EXCEEDED" || category === "GOOGLE_RATE_LIMIT") {
    return GoogleAccountStatus.RATE_LIMITED;
  }
  if (category === "GOOGLE_API_DISABLED" || category === "GOOGLE_CONFIG_ERROR") {
    // Reconnecting cannot fix a Cloud project problem. ERROR parks the
    // connection so auto-sync stops picking it up until an operator acts.
    return GoogleAccountStatus.ERROR;
  }
  if (category === "GOOGLE_PERMISSION_ERROR") {
    return GoogleAccountStatus.ERROR;
  }
  return null;
}

/**
 * Record a handler failure: update the account status, then either schedule a
 * retry or complete the job as FAILED.
 *
 * Only ever stores `userFacingGoogleMessage(category)` on the job, so raw
 * Google quota strings and project identifiers never reach a tenant's screen.
 * The raw message goes to the log instead.
 */
export async function handleSyncJobError(opts: {
  job: { id: string; googleAccountId: string | null; attemptCount: number };
  err: unknown;
  /** Handler name, for logs. */
  label: string;
  outcome?: SyncOutcome;
}): Promise<void> {
  const { job, err, label } = opts;
  const outcome = opts.outcome ?? EMPTY_OUTCOME;

  const category = categorizeSyncError(err);
  const rawMessage = err instanceof Error ? err.message : String(err);
  const userMessage = userFacingGoogleMessage(category);
  const remediation = operatorRemediation(category);

  const log = remediation ? logger.error : logger.warn;
  log(`${label} failed`, {
    jobId: job.id,
    category,
    googleMessage: rawMessage,
    ...(remediation ? { remediation } : {}),
  });

  if (job.googleAccountId) {
    const status = accountStatusFor(category);
    if (status) {
      await googleAccountRepository
        .updateStatus(job.googleAccountId, status, userMessage)
        .catch((e) => {
          logger.warn("Could not update Google account status", {
            googleAccountId: job.googleAccountId,
            err: e instanceof Error ? e.message : String(e),
          });
        });
    }
  }

  // Terminal categories are never retried: the same call will fail
  // identically until a human reconnects or fixes the Cloud project.
  if (isRetryableCategory(category) && !isTerminalCategory(category)) {
    await syncJobService.scheduleRetry(job.id, {
      category,
      message: userMessage,
      attemptCount: job.attemptCount,
    });
    return;
  }

  await syncJobService.complete(job.id, {
    status: SyncStatus.FAILED,
    ...outcome,
    lastErrorCode: category,
    errorMessage: userMessage,
  });
}
