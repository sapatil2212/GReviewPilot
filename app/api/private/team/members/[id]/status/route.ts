/**
 * PATCH /api/private/team/members/[id]/status
 * Body: { status: "ACTIVE" | "BLOCKED", reason?: string }
 *
 * Blocking a member revokes all their sessions. Cannot block the last
 * active TENANT_OWNER, and users cannot change their own status.
 */

import type { NextRequest } from "next/server";
import { requireSession } from "@/server/auth/requireSession";
import { requirePermission } from "@/server/permissions/permissions";
import { teamService } from "@/server/services/team.service";
import { changeStatusSchema } from "@/server/validators/team.schema";
import { handleError, ok } from "@/server/utils/response";

export const runtime = "nodejs";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "user:block");
    const { id } = await params;
    const body = await req.json().catch(() => null);
    const input = changeStatusSchema.parse(body);
    const updated = await teamService.changeStatus(ctx, id, input, req);
    return ok(updated, { message: "Member status updated" });
  } catch (err) {
    return handleError(err);
  }
}
