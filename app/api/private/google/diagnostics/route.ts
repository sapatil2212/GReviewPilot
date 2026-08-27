/**
 * GET /api/private/google/diagnostics
 * Admin / owner view of Google API health + sync queue.
 */

import type { NextRequest } from "next/server";
import { requireSession } from "@/server/auth/requireSession";
import { requirePermission } from "@/server/permissions/permissions";
import { syncJobService } from "@/server/google/sync/syncJob.service";
import { googleAccountService } from "@/server/services/google/googleAccount.service";
import { prisma } from "@/server/db/prisma";
import { SyncStatus } from "@prisma/client";
import { handleError, ok } from "@/server/utils/response";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "audit:read");

    // Static config audit is free. The live API probe costs one Account
    // Management quota unit, so it is opt-in via ?probe=true.
    const config = googleAccountService.configCheck();
    const wantProbe =
      new URL(req.url).searchParams.get("probe") === "true";
    const probe = wantProbe
      ? await googleAccountService.probe(ctx.tenantId).catch((err) => ({
          reachable: false,
          accountCount: null,
          category: null,
          remediation: null,
          detail: err instanceof Error ? err.message : String(err),
        }))
      : null;

    const since = new Date(Date.now() - 60 * 60 * 1000);

    const [
      queueDepth,
      activeJobs,
      recentFailures,
      requestsLastHour,
      rateLimitErrorsLastHour,
      byApi,
    ] = await Promise.all([
      syncJobService.queueDepth(),
      prisma.syncRun.count({
        where: {
          status: {
            in: [
              SyncStatus.QUEUED,
              SyncStatus.PENDING,
              SyncStatus.RUNNING,
              SyncStatus.RETRYING,
            ],
          },
        },
      }),
      syncJobService.recentFailures(15),
      prisma.googleApiRequestLog.count({
        where: { createdAt: { gte: since } },
      }),
      prisma.googleApiRequestLog.count({
        where: {
          createdAt: { gte: since },
          errorCategory: {
            in: ["GOOGLE_RATE_LIMIT", "GOOGLE_QUOTA_EXCEEDED"],
          },
        },
      }),
      prisma.googleApiRequestLog.groupBy({
        by: ["apiName"],
        where: { createdAt: { gte: since } },
        _count: { _all: true },
      }),
    ]);

    const errorByApi = await prisma.googleApiRequestLog.groupBy({
      by: ["apiName"],
      where: {
        createdAt: { gte: since },
        errorCategory: { not: null },
      },
      _count: { _all: true },
    });
    const errMap = new Map(
      errorByApi.map((r) => [r.apiName, r._count._all]),
    );

    return ok({
      config,
      probe,
      queueDepth,
      activeJobs,
      requestsLastHour,
      rateLimitErrorsLastHour,
      recentFailures,
      apiBreakdown: byApi.map((r) => ({
        apiName: r.apiName,
        count: r._count._all,
        errors: errMap.get(r.apiName) ?? 0,
      })),
    });
  } catch (err) {
    return handleError(err);
  }
}
