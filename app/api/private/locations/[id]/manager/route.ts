/**
 * PUT /api/private/locations/[id]/manager
 * Body: { managerId: <cuid> | null }
 *
 * Assign or clear the location's manager. Manager must be an active
 * user in the same tenant.
 */

import type { NextRequest } from "next/server";
import { requireSession } from "@/server/auth/requireSession";
import { requirePermission } from "@/server/permissions/permissions";
import { locationService } from "@/server/services/location.service";
import { assignManagerSchema } from "@/server/validators/business.schema";
import { handleError, ok } from "@/server/utils/response";

export const runtime = "nodejs";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "location:assignManager");
    const { id } = await params;
    const body = await req.json().catch(() => null);
    const { managerId } = assignManagerSchema.parse(body);
    const data = await locationService.assignManager(ctx, id, managerId, req);
    return ok(data, {
      message: managerId ? "Manager assigned" : "Manager cleared",
    });
  } catch (err) {
    return handleError(err);
  }
}
