/**
 * DELETE /api/private/team/members/[id]/locations/[locationId]
 * Remove a user's assignment to a location.
 */

import type { NextRequest } from "next/server";
import { requireSession } from "@/server/auth/requireSession";
import { requirePermission } from "@/server/permissions/permissions";
import { locationAssignmentService } from "@/server/services/locationAssignment.service";
import { handleError, ok } from "@/server/utils/response";

export const runtime = "nodejs";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; locationId: string }> },
) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "user:location:assign");
    const { id, locationId } = await params;
    const result = await locationAssignmentService.unassign(
      ctx,
      { userId: id, locationId },
      req,
    );
    return ok(result, { message: "Location unassigned" });
  } catch (err) {
    return handleError(err);
  }
}
