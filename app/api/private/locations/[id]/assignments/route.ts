/**
 * GET  /api/private/locations/[id]/assignments       — list users assigned to a location
 * POST /api/private/locations/[id]/assignments       — assign a user to this location
 *   Body: { userId }
 */

import type { NextRequest } from "next/server";
import { requireSession } from "@/server/auth/requireSession";
import { requirePermission } from "@/server/permissions/permissions";
import { locationAssignmentService } from "@/server/services/locationAssignment.service";
import { assignUserSchema } from "@/server/validators/team.schema";
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
    const items = await locationAssignmentService.listForLocation(ctx, id);
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
    const { userId } = assignUserSchema.parse(body);
    const assignment = await locationAssignmentService.assign(
      ctx,
      { userId, locationId: id },
      req,
    );
    return ok(assignment, { message: "User assigned", status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
