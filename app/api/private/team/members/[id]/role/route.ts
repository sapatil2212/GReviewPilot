/**
 * PATCH /api/private/team/members/[id]/role
 *
 * Change a member's role. Guardrails:
 *   - Actor cannot change their own role
 *   - Actor cannot manage a user of higher rank
 *   - Actor cannot grant a role higher than their own
 *   - Cannot demote the last active TENANT_OWNER
 */

import type { NextRequest } from "next/server";
import { requireSession } from "@/server/auth/requireSession";
import { requirePermission } from "@/server/permissions/permissions";
import { teamService } from "@/server/services/team.service";
import { changeRoleSchema } from "@/server/validators/team.schema";
import { handleError, ok } from "@/server/utils/response";

export const runtime = "nodejs";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "user:changeRole");
    const { id } = await params;
    const body = await req.json().catch(() => null);
    const input = changeRoleSchema.parse(body);
    const updated = await teamService.changeRole(ctx, id, input, req);
    return ok(updated, { message: "Role updated" });
  } catch (err) {
    return handleError(err);
  }
}
