/**
 * GET    /api/private/media/[id]   — details + signed URL
 * PATCH  /api/private/media/[id]   — update altText/caption/category/visibility/locationId
 * DELETE /api/private/media/[id]   — soft delete (unpins from Tenant/Profile/User if attached)
 */

import type { NextRequest } from "next/server";
import { requireSession } from "@/server/auth/requireSession";
import { requirePermission } from "@/server/permissions/permissions";
import { mediaService } from "@/server/services/media.service";
import { updateMediaSchema } from "@/server/validators/media.schema";
import { handleError, ok } from "@/server/utils/response";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "media:read");
    const { id } = await params;
    const asset = await mediaService.getById(ctx, id);
    return ok(asset);
  } catch (err) {
    return handleError(err);
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "media:manage");
    const { id } = await params;
    const body = await req.json().catch(() => null);
    const input = updateMediaSchema.parse(body);
    const asset = await mediaService.update(ctx, id, input, req);
    return ok(asset, { message: "Media updated" });
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "media:delete");
    const { id } = await params;
    const result = await mediaService.remove(ctx, id, req);
    return ok(result, { message: "Media deleted" });
  } catch (err) {
    return handleError(err);
  }
}
