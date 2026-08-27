/**
 * Auto-sync orchestrator (scheduled job).
 *
 * Enqueues LOCATION sync jobs for CONNECTED Google accounts that are
 * due — does NOT call Google APIs inline. Actual work is done by
 * /api/cron/google-sync-worker under the global rate limiter.
 *
 * Tenant start times are jittered so thousands of tenants don't fire
 * at the same clock minute.
 */

import { GoogleAccountStatus, SyncKind } from "@prisma/client";
import { createHash } from "node:crypto";
import { prisma } from "@/server/db/prisma";
import { syncJobService } from "@/server/google/sync/syncJob.service";
import { runGoogleSyncWorker } from "@/server/google/sync/worker";
import {
  pruneGoogleTelemetry,
  type RetentionReport,
} from "@/server/google/sync/retention";
import { env } from "@/server/utils/env";
import { logger } from "@/server/utils/logger";

export interface AutoSyncReport {
  checked: number;
  queued: number;
  skipped: number;
  failed: number;
  worker?: Awaited<ReturnType<typeof runGoogleSyncWorker>>;
  retention?: RetentionReport;
  details: Array<{
    tenantId: string;
    status: "queued" | "skipped" | "failed";
    reason?: string;
    jobId?: string;
  }>;
}

/** Deterministic jitter 0..intervalMs based on tenant id. */
function tenantJitterMs(tenantId: string, intervalMs: number): number {
  const hash = createHash("sha256").update(tenantId).digest();
  const n = hash.readUInt32BE(0);
  return n % Math.max(1, intervalMs);
}

export async function runAutoSync(
  opts: { force?: boolean; tenantId?: string } = {},
): Promise<AutoSyncReport> {
  const intervalMs = env.AUTO_SYNC_INTERVAL_MINUTES * 60 * 1000;

  const accounts = await prisma.googleAccount.findMany({
    where: {
      status: {
        in: [
          GoogleAccountStatus.CONNECTED,
          GoogleAccountStatus.RATE_LIMITED,
          GoogleAccountStatus.SYNCING,
        ],
      },
      ...(opts.tenantId ? { tenantId: opts.tenantId } : {}),
    },
    select: {
      id: true,
      tenantId: true,
      email: true,
      connectedById: true,
      lastSyncedAt: true,
    },
  });

  const report: AutoSyncReport = {
    checked: accounts.length,
    queued: 0,
    skipped: 0,
    failed: 0,
    details: [],
  };

  const now = Date.now();

  for (const acc of accounts) {
    const jitter = tenantJitterMs(acc.tenantId, intervalMs);
    // Effective due time = lastSyncedAt + interval + jitter offset within window
    if (!opts.force && acc.lastSyncedAt) {
      const dueAt = acc.lastSyncedAt.getTime() + intervalMs + jitter;
      if (now < dueAt) {
        report.skipped += 1;
        report.details.push({
          tenantId: acc.tenantId,
          status: "skipped",
          reason: "synced recently (jittered interval)",
        });
        continue;
      }
    }

    try {
      const delayMs = 500 + (jitter % 30_000);
      const { job, created } = await syncJobService.enqueue({
        tenantId: acc.tenantId,
        googleAccountId: acc.id,
        kind: SyncKind.LOCATIONS,
        triggeredById: acc.connectedById,
        priority: 150,
        delayMs,
        metadata: { source: "auto_sync" },
      });

      if (created) {
        report.queued += 1;
        report.details.push({
          tenantId: acc.tenantId,
          status: "queued",
          jobId: job.id,
        });
      } else {
        report.skipped += 1;
        report.details.push({
          tenantId: acc.tenantId,
          status: "skipped",
          reason: "active job already exists",
          jobId: job.id,
        });
      }
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      logger.warn("Auto-sync enqueue failed", {
        tenantId: acc.tenantId,
        err: reason,
      });
      report.failed += 1;
      report.details.push({
        tenantId: acc.tenantId,
        status: "failed",
        reason,
      });
    }
  }

  // Process a batch of due jobs in this same cron tick.
  report.worker = await runGoogleSyncWorker();

  // Housekeeping rides on the lower-frequency cron rather than the worker
  // tick, and never throws — a retention failure must not fail the sync run.
  report.retention = await pruneGoogleTelemetry();

  logger.info("Auto-sync enqueue complete", {
    checked: report.checked,
    queued: report.queued,
    skipped: report.skipped,
    failed: report.failed,
    worker: report.worker,
    retention: report.retention,
  });

  return report;
}
