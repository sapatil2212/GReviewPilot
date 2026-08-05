/**
 * POST /api/private/team/invitations/[id]/revoke
 */

import type { NextRequest } from "next/server";
import { requireSession } from "@/server/auth/requireSession";
import { requirePermission } from "@/server/permissions/permissions";
import { invitationService } from "@/server/services/invitation.service";
import { handleError, ok } from "@/server/utils/response";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "invitation:manage");
    const { id } = await params;
    const inv = await invitationService.revoke(ctx, id, req);
    return ok(inv, { message: "Invitation revoked" });
  } catch (err) {
    return handleError(err);
  }
}
