/**
 * GET /api/private/google/sync/[id]
 * Poll a sync job's status.
 */

import type { NextRequest } from "next/server";
import { requireSession } from "@/server/auth/requireSession";
import { requirePermission } from "@/server/permissions/permissions";
import { syncJobService } from "@/server/google/sync/syncJob.service";
import { NotFoundError } from "@/server/utils/errors";
import { handleError, ok } from "@/server/utils/response";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "google:read");
    const { id } = await params;
    const job = await syncJobService.getById(id, ctx.tenantId);
    if (!job) throw new NotFoundError("Sync job not found");
    return ok(job);
  } catch (err) {
    return handleError(err);
  }
}
