/**
 * DELETE /api/private/locations/[id]/assignments/[userId]
 */

import type { NextRequest } from "next/server";
import { requireSession } from "@/server/auth/requireSession";
import { requirePermission } from "@/server/permissions/permissions";
import { locationAssignmentService } from "@/server/services/locationAssignment.service";
import { handleError, ok } from "@/server/utils/response";

export const runtime = "nodejs";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; userId: string }> },
) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "user:location:assign");
    const { id, userId } = await params;
    const result = await locationAssignmentService.unassign(
      ctx,
      { userId, locationId: id },
      req,
    );
    return ok(result, { message: "User unassigned" });
  } catch (err) {
    return handleError(err);
  }
}
