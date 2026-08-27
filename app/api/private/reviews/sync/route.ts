/**
 * POST /api/private/reviews/sync
 * Enqueue a REVIEW sync job (non-blocking) when Official Google is connected.
 * Quick Connect–only tenants still run Places sync inline.
 */

import type { NextRequest } from "next/server";
import { SyncKind } from "@prisma/client";
import { requireSession } from "@/server/auth/requireSession";
import { requirePermission } from "@/server/permissions/permissions";
import { googleAccountRepository } from "@/server/repositories/googleAccount.repository";
import { syncJobService } from "@/server/google/sync/syncJob.service";
import { googleReviewSyncService } from "@/server/services/google/googleReviewSync.service";
import { handleError, ok } from "@/server/utils/response";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "review:read");

    const account = await googleAccountRepository.findConnectedByTenantId(
      ctx.tenantId,
    );

    if (!account) {
      // Quick Connect tenants have no OAuth account, so Places sync runs
      // inline and can report real counts.
      const result = await googleReviewSyncService.syncForTenant(ctx, req);
      return ok({ ...result, queued: false }, { message: "Review sync completed" });
    }

    const { job, created } = await syncJobService.enqueue({
      tenantId: ctx.tenantId,
      googleAccountId: account.id,
      kind: SyncKind.REVIEWS,
      triggeredById: ctx.userId,
      priority: 120,
      delayMs: 100 + Math.floor(Math.random() * 500),
      metadata: { source: "manual_reviews" },
    });

    void import("@/server/google/sync/worker")
      .then(({ runGoogleSyncWorker }) => runGoogleSyncWorker({ batch: 2 }))
      .catch(() => undefined);

    // Deliberately does NOT return counts. This path only enqueues a job, so
    // the work has not happened yet; the previous response padded the shape
    // with zeros to match the inline Quick Connect path, which read as
    // "synced 0 reviews, 0 failures" in the UI and hid real results. Callers
    // poll the job for progress instead.
    return ok(
      {
        job,
        queued: true as const,
        jobCreated: created,
        message: created
          ? "Review sync queued"
          : "A synchronization is already in progress",
      },
      {
        message: created
          ? "Review sync queued"
          : "A synchronization is already in progress",
      },
    );
  } catch (err) {
    return handleError(err);
  }
}
