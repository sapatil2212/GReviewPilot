/**
 * GET    /api/private/team/members/[id]   — full member details + location assignments
 * PATCH  /api/private/team/members/[id]   — update firstName/lastName/phone/avatar
 * DELETE /api/private/team/members/[id]   — soft-delete member (revokes sessions)
 */

import type { NextRequest } from "next/server";
import { requireSession } from "@/server/auth/requireSession";
import { requirePermission } from "@/server/permissions/permissions";
import { teamService } from "@/server/services/team.service";
import { updateMemberSchema } from "@/server/validators/team.schema";
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
    const member = await teamService.getById(ctx, id);
    return ok(member);
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
    // Self-edits require no elevated permission; edits to others do.
    const { id } = await params;
    if (id !== ctx.userId) {
      requirePermission(ctx, "user:update");
    }
    const body = await req.json().catch(() => null);
    const input = updateMemberSchema.parse(body);
    const updated = await teamService.updateProfile(ctx, id, input, req);
    return ok(updated, { message: "Member updated" });
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
    requirePermission(ctx, "user:remove");
    const { id } = await params;
    const result = await teamService.remove(ctx, id, req);
    return ok(result, { message: "Member removed" });
  } catch (err) {
    return handleError(err);
  }
}
