/**
 * GET  /api/private/team/members/[id]/locations       — list locations a user is assigned to
 * POST /api/private/team/members/[id]/locations       — assign a location
 *   Body: { locationId }
 */

import type { NextRequest } from "next/server";
import { requireSession } from "@/server/auth/requireSession";
import { requirePermission } from "@/server/permissions/permissions";
import { locationAssignmentService } from "@/server/services/locationAssignment.service";
import { assignLocationSchema } from "@/server/validators/team.schema";
import { handleError, ok } from "@/server/utils/response";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "user:read");
    const { id } = await params;
    const items = await locationAssignmentService.listForUser(ctx, id);
    return ok({ items, total: items.length });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "user:location:assign");
    const { id } = await params;
    const body = await req.json().catch(() => null);
    const { locationId } = assignLocationSchema.parse(body);
    const assignment = await locationAssignmentService.assign(
      ctx,
      { userId: id, locationId },
      req,
    );
    return ok(assignment, { message: "Location assigned", status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
