/**
 * Retention for Google observability tables.
 *
 * `GoogleApiRequestLog` gets one row per Google HTTP attempt, retries
 * included. Nothing pruned it, so on a busy deployment it grows without bound
 * and eventually becomes the largest table in the database — while the only
 * thing that reads it, the diagnostics endpoint, never looks back further than
 * the last hour.
 *
 * `SyncRun` doubles as the job queue and the run history, so finished rows are
 * pruned on a longer window and only in terminal states — deleting a QUEUED or
 * RETRYING row would drop pending work.
 */

import { SyncStatus } from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import { env } from "@/server/utils/env";
import { logger } from "@/server/utils/logger";

/**
 * Rows removed per statement. Bounded so the first run on a table that has
 * been accumulating for months cannot hold a lock long enough to stall
 * request-path writes.
 */
const BATCH_SIZE = 5_000;
/** Ceiling on statements per invocation; the rest waits for the next tick. */
const MAX_BATCHES = 20;

export interface RetentionReport {
  requestLogsDeleted: number;
  syncRunsDeleted: number;
  /** True when the cap was hit and rows remain for the next run. */
  truncated: boolean;
}

export async function pruneGoogleTelemetry(): Promise<RetentionReport> {
  const report: RetentionReport = {
    requestLogsDeleted: 0,
    syncRunsDeleted: 0,
    truncated: false,
  };

  const logCutoff = new Date(
    Date.now() - env.GOOGLE_REQUEST_LOG_RETENTION_DAYS * 86_400_000,
  );

  try {
    for (let i = 0; i < MAX_BATCHES; i++) {
      // Raw DELETE ... LIMIT: Prisma's deleteMany has no limit, and an
      // unbounded delete over a large table is exactly the lock we are
      // trying to avoid.
      const deleted = await prisma.$executeRaw`
        DELETE FROM GoogleApiRequestLog
        WHERE createdAt < ${logCutoff}
        LIMIT ${BATCH_SIZE}
      `;
      report.requestLogsDeleted += deleted;
      if (deleted < BATCH_SIZE) break;
      if (i === MAX_BATCHES - 1) report.truncated = true;
    }
  } catch (err) {
    // Retention is housekeeping; never fail the cron tick over it.
    logger.warn("Request log pruning failed", {
      err: err instanceof Error ? err.message : String(err),
    });
  }

  const runCutoff = new Date(
    Date.now() - env.GOOGLE_SYNC_RUN_RETENTION_DAYS * 86_400_000,
  );

  try {
    const { count } = await prisma.syncRun.deleteMany({
      where: {
        finishedAt: { lt: runCutoff },
        // Only terminal states. QUEUED / PENDING / RUNNING / RETRYING rows are
        // live queue entries regardless of age.
        status: {
          in: [
            SyncStatus.SUCCESS,
            SyncStatus.PARTIAL,
            SyncStatus.FAILED,
            SyncStatus.CANCELLED,
          ],
        },
      },
    });
    report.syncRunsDeleted = count;
  } catch (err) {
    logger.warn("Sync run pruning failed", {
      err: err instanceof Error ? err.message : String(err),
    });
  }

  if (report.requestLogsDeleted > 0 || report.syncRunsDeleted > 0) {
    logger.info("Pruned Google telemetry", { ...report });
  }

  return report;
}
