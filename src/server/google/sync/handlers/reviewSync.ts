/**
 * REVIEW sync handler — delegates to googleReviewSyncService for the
 * actual upsert logic, but is invoked only from the queued worker.
 */

import { GoogleAccountStatus, SyncStatus } from "@prisma/client";
import { googleAccountRepository } from "@/server/repositories/googleAccount.repository";
import { googleAccountService } from "@/server/services/google/googleAccount.service";
import { GoogleApiError } from "@/server/services/google/googleClient";
import { googleReviewSyncService } from "@/server/services/google/googleReviewSync.service";
import { syncJobService } from "@/server/google/sync/syncJob.service";
import { logger } from "@/server/utils/logger";
import type { AuthContext } from "@/server/auth/requireSession";
import { UserRole } from "@prisma/client";

export async function handleReviewSync(job: {
  id: string;
  tenantId: string;
  googleAccountId: string | null;
  attemptCount: number;
  triggeredById: string | null;
}) {
  try {
    if (job.googleAccountId) {
      await googleAccountRepository.updateStatus(
        job.googleAccountId,
        GoogleAccountStatus.SYNCING,
      );
    }

    // Ensure client/tokens are warm (also validates connection).
    await googleAccountService.getClient(job.tenantId).catch(() => null);

    const ctx: AuthContext = {
      userId: job.triggeredById ?? "system",
      tenantId: job.tenantId,
      role: UserRole.SUPER_ADMIN,
      sessionId: "sync-worker",
      email: "system@sync",
      firstName: "Sync",
      lastName: "Worker",
    };

    const result = await googleReviewSyncService.syncForTenant(ctx);

    await syncJobService.complete(job.id, {
      status:
        result.failed > 0 && result.created + result.updated === 0
          ? SyncStatus.FAILED
          : result.failed > 0
            ? SyncStatus.PARTIAL
            : SyncStatus.SUCCESS,
      totalItems: result.processed,
      itemsProcessed: result.processed,
      itemsCreated: result.created,
      itemsUpdated: result.updated,
      itemsFailed: result.failed,
      metadata: {
        removedSeeds: result.removedSeeds,
        placesFetched: result.placesFetched,
        gmbFetched: result.gmbFetched,
        warnings: result.warnings,
      },
    });

    if (job.googleAccountId) {
      await googleAccountRepository.updateStatus(
        job.googleAccountId,
        GoogleAccountStatus.CONNECTED,
      );
      await googleAccountRepository.updateSyncTimestamp(
        job.googleAccountId,
        new Date(),
        null,
      );
    }
  } catch (err) {
    const category =
      err instanceof GoogleApiError && err.category
        ? err.category
        : err instanceof GoogleApiError && err.status === 429
          ? "GOOGLE_QUOTA_EXCEEDED"
          : "GOOGLE_UNKNOWN_ERROR";
    const message = err instanceof Error ? err.message : String(err);
    logger.warn("Review sync job failed", {
      jobId: job.id,
      category,
      message,
    });

    if (
      category === "GOOGLE_QUOTA_EXCEEDED" ||
      category === "GOOGLE_RATE_LIMIT" ||
      category === "GOOGLE_SERVER_ERROR" ||
      category === "GOOGLE_NETWORK_ERROR"
    ) {
      if (job.googleAccountId) {
        await googleAccountRepository.updateStatus(
          job.googleAccountId,
          GoogleAccountStatus.RATE_LIMITED,
          message,
        );
      }
      await syncJobService.scheduleRetry(job.id, {
        category,
        message,
        attemptCount: job.attemptCount,
      });
      return;
    }

    await syncJobService.complete(job.id, {
      status: SyncStatus.FAILED,
      itemsProcessed: 0,
      itemsCreated: 0,
      itemsUpdated: 0,
      itemsFailed: 1,
      lastErrorCode: category,
      errorMessage:
        "Google is temporarily limiting requests. Your synchronization has been queued and will retry automatically.",
    });
  }
}
