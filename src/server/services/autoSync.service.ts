/**
 * Auto-sync orchestrator (scheduled job).
 *
 * Walks every CONNECTED GoogleAccount whose last sync is older than the
 * configured interval and runs a location sync for it. Designed to be
 * driven by an external scheduler hitting /api/cron/auto-sync (Vercel
 * Cron, GitHub Actions, Task Scheduler, etc.) — there is no in-process
 * timer, so it stays correct on serverless and multi-instance deploys.
 *
 * Each tenant is isolated: a failure for one never aborts the rest.
 */

import { GoogleAccountStatus, UserRole } from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import { googleLocationSyncService } from "@/server/services/google/googleLocationSync.service";
import { env } from "@/server/utils/env";
import { logger } from "@/server/utils/logger";
import type { AuthContext } from "@/server/auth/requireSession";

export interface AutoSyncReport {
  checked: number;
  synced: number;
  skipped: number;
  failed: number;
  details: Array<{
    tenantId: string;
    status: "synced" | "skipped" | "failed";
    reason?: string;
  }>;
}

/**
 * Build a synthetic auth context for a background run. The sync service
 * only needs tenantId (scoping) and userId (audit attribution).
 */
function systemContext(
  tenantId: string,
  userId: string,
  email: string,
): AuthContext {
  return {
    userId,
    tenantId,
    role: UserRole.SUPER_ADMIN,
    sessionId: "system-cron",
    email,
    firstName: "System",
    lastName: "Cron",
  };
}

export async function runAutoSync(
  opts: { force?: boolean; tenantId?: string } = {},
): Promise<AutoSyncReport> {
  const intervalMs = env.AUTO_SYNC_INTERVAL_MINUTES * 60 * 1000;
  const cutoff = new Date(Date.now() - intervalMs);

  const accounts = await prisma.googleAccount.findMany({
    where: {
      status: GoogleAccountStatus.CONNECTED,
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
    synced: 0,
    skipped: 0,
    failed: 0,
    details: [],
  };

  for (const acc of accounts) {
    // Respect the interval unless explicitly forced.
    if (!opts.force && acc.lastSyncedAt && acc.lastSyncedAt > cutoff) {
      report.skipped += 1;
      report.details.push({
        tenantId: acc.tenantId,
        status: "skipped",
        reason: "synced recently",
      });
      continue;
    }

    // Attribute the run to whoever connected the account; fall back to
    // any owner/admin so audit rows always resolve to a real user.
    let userId = acc.connectedById;
    if (!userId) {
      const fallback = await prisma.user.findFirst({
        where: {
          tenantId: acc.tenantId,
          role: { in: [UserRole.TENANT_OWNER, UserRole.ADMIN] },
        },
        select: { id: true },
      });
      userId = fallback?.id ?? null;
    }
    if (!userId) {
      report.skipped += 1;
      report.details.push({
        tenantId: acc.tenantId,
        status: "skipped",
        reason: "no user to attribute the run to",
      });
      continue;
    }

    try {
      const ctx = systemContext(acc.tenantId, userId, acc.email);
      // `runFor` records its own SyncRun row and never throws for
      // per-item failures; it returns the completed/failed run.
      const run = await googleLocationSyncService.runFor(
        ctx,
        new Request(`${env.APP_URL}/api/cron/auto-sync`),
      );
      if (run.status === "FAILED") {
        report.failed += 1;
        report.details.push({
          tenantId: acc.tenantId,
          status: "failed",
          reason: run.errorMessage ?? "sync failed",
        });
      } else {
        report.synced += 1;
        report.details.push({ tenantId: acc.tenantId, status: "synced" });
      }
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      logger.warn("Auto-sync failed for tenant", {
        tenantId: acc.tenantId,
        err: reason,
      });
      report.failed += 1;
      report.details.push({ tenantId: acc.tenantId, status: "failed", reason });
    }
  }

  logger.info("Auto-sync run complete", {
    checked: report.checked,
    synced: report.synced,
    skipped: report.skipped,
    failed: report.failed,
  });

  return report;
}
