/**
 * Google sync worker — claims due SyncRun jobs and runs handlers
 * under distributed locks. Invoked by /api/cron/google-sync-worker.
 */

import { SyncKind, SyncStatus } from "@prisma/client";
import { syncJobService } from "./syncJob.service";
import { syncLockKey, syncLockService } from "./syncLock.service";
import { handleAccountDiscovery } from "./handlers/accountDiscovery";
import { handleLocationSync } from "./handlers/locationSync";
import { handleReviewSync } from "./handlers/reviewSync";
import { env } from "@/server/utils/env";
import { logger } from "@/server/utils/logger";

export interface WorkerReport {
  claimed: number;
  completed: number;
  failed: number;
  skippedLock: number;
}

export async function runGoogleSyncWorker(
  opts: { batch?: number } = {},
): Promise<WorkerReport> {
  const batch = opts.batch ?? env.GOOGLE_SYNC_WORKER_BATCH;
  const jobs = await syncJobService.claimDue(batch);

  const report: WorkerReport = {
    claimed: jobs.length,
    completed: 0,
    failed: 0,
    skippedLock: 0,
  };

  for (const job of jobs) {
    if (!job.googleAccountId) {
      report.failed += 1;
      continue;
    }

    const lockKey = syncLockKey({
      tenantId: job.tenantId,
      googleAccountId: job.googleAccountId,
      kind: job.kind,
      googleLocationId: job.googleLocationId,
    });

    const lock = await syncLockService.acquire(lockKey);
    if (!lock.acquired || !lock.ownerId) {
      // Re-queue shortly — another worker holds the lock.
      await syncJobService.scheduleRetry(job.id, {
        category: "GOOGLE_RATE_LIMIT",
        message: "Sync lock busy",
        attemptCount: Math.max(0, job.attemptCount - 1),
      });
      report.skippedLock += 1;
      continue;
    }

    try {
      switch (job.kind) {
        case SyncKind.ACCOUNTS:
        case SyncKind.FULL:
          await handleAccountDiscovery(job);
          break;
        case SyncKind.LOCATIONS:
        case SyncKind.BUSINESS_PROFILE:
          await handleLocationSync(job);
          break;
        case SyncKind.REVIEWS:
          await handleReviewSync(job);
          break;
        default:
          logger.info("Skipping unsupported sync kind", {
            kind: job.kind,
            jobId: job.id,
          });
          await syncJobService.complete(job.id, {
            status: SyncStatus.CANCELLED,
            itemsProcessed: 0,
            itemsCreated: 0,
            itemsUpdated: 0,
            itemsFailed: 0,
            errorMessage: `Unsupported sync kind: ${job.kind}`,
          });
      }
      report.completed += 1;
    } catch (err) {
      report.failed += 1;
      logger.warn("Sync worker job crashed", {
        jobId: job.id,
        err: err instanceof Error ? err.message : String(err),
      });
    } finally {
      await syncLockService.release(lockKey, lock.ownerId);
    }
  }

  // Spread rather than passing `report` directly: LogFields relies on an index
  // signature, which TypeScript does not infer for an interface type.
  logger.info("Google sync worker tick", { ...report });
  return report;
}
