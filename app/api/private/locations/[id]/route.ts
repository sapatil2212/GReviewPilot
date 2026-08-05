/**
 * GET    /api/private/locations/[id]   — fetch one location
 * PATCH  /api/private/locations/[id]   — update fields (partial)
 * DELETE /api/private/locations/[id]   — soft delete (status = DELETED, recoverable)
 */

import type { NextRequest } from "next/server";
import { requireSession } from "@/server/auth/requireSession";
import { requirePermission } from "@/server/permissions/permissions";
import { locationService } from "@/server/services/location.service";
import { updateLocationSchema } from "@/server/validators/business.schema";
import { handleError, ok } from "@/server/utils/response";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "location:read");
    const { id } = await params;
    const data = await locationService.getById(ctx, id);
    return ok(data);
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
    requirePermission(ctx, "location:update");
    const { id } = await params;
    const body = await req.json().catch(() => null);
    const input = updateLocationSchema.parse(body);
    const data = await locationService.update(ctx, id, input, req);
    return ok(data, { message: "Location updated" });
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
    requirePermission(ctx, "location:delete");
    const { id } = await params;
    const data = await locationService.softDelete(ctx, id, req);
    return ok(data, { message: "Location deleted" });
  } catch (err) {
    return handleError(err);
  }
}
