/**
 * POST /api/private/google/sync/locations
 * Enqueue a LOCATION sync (non-blocking). Kept for backward compatibility
 * with the existing UI client that calls syncLocations().
 */

import type { NextRequest } from "next/server";
import { SyncKind } from "@prisma/client";
import { requireSession } from "@/server/auth/requireSession";
import { requirePermission } from "@/server/permissions/permissions";
import { googleAccountRepository } from "@/server/repositories/googleAccount.repository";
import { syncJobService } from "@/server/google/sync/syncJob.service";
import { ConflictError } from "@/server/utils/errors";
import { handleError, ok } from "@/server/utils/response";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "google:sync");

    const account = await googleAccountRepository.findConnectedByTenantId(
      ctx.tenantId,
    );
    if (!account) {
      throw new ConflictError(
        "CONFLICT",
        "No Google Business account is connected to this workspace",
      );
    }

    const { job, created } = await syncJobService.enqueue({
      tenantId: ctx.tenantId,
      googleAccountId: account.id,
      kind: SyncKind.LOCATIONS,
      triggeredById: ctx.userId,
      priority: 100,
      delayMs: 100 + Math.floor(Math.random() * 500),
      metadata: { source: "manual_locations" },
    });

    // Kick the worker opportunistically in the same process (best-effort)
    // so local/dev feels snappy without waiting for external cron.
    void import("@/server/google/sync/worker")
      .then(({ runGoogleSyncWorker }) => runGoogleSyncWorker({ batch: 2 }))
      .catch(() => undefined);

    return ok(
      {
        ...job,
        queued: true,
        created,
        message: created
          ? "Sync queued"
          : "A synchronization is already in progress",
      },
      {
        message: created
          ? "Sync queued"
          : "A synchronization is already in progress",
        status: created ? 202 : 200,
      },
    );
  } catch (err) {
    return handleError(err);
  }
}
