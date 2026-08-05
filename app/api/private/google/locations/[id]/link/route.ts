/**
 * POST   /api/private/google/locations/[id]/link — Body: { localLocationId }
 * DELETE /api/private/google/locations/[id]/link — remove the link
 */

import type { NextRequest } from "next/server";
import { requireSession } from "@/server/auth/requireSession";
import { requirePermission } from "@/server/permissions/permissions";
import { googleLocationSyncService } from "@/server/services/google/googleLocationSync.service";
import { linkLocationSchema } from "@/server/validators/google.schema";
import { handleError, ok } from "@/server/utils/response";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "google:manage");
    const { id } = await params;
    const body = await req.json().catch(() => null);
    const { localLocationId } = linkLocationSchema.parse(body);
    const linked = await googleLocationSyncService.link(
      ctx,
      id,
      localLocationId,
    );
    return ok(linked, { message: "Google location linked" });
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "google:manage");
    const { id } = await params;
    const unlinked = await googleLocationSyncService.unlink(ctx, id);
    return ok(unlinked, { message: "Google location unlinked" });
  } catch (err) {
    return handleError(err);
  }
}
