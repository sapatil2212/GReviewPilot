/**
 * GET /api/private/team/invitations/[id] — fetch a single invitation
 */

import type { NextRequest } from "next/server";
import { requireSession } from "@/server/auth/requireSession";
import { requirePermission } from "@/server/permissions/permissions";
import { invitationService } from "@/server/services/invitation.service";
import { handleError, ok } from "@/server/utils/response";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "invitation:read");
    const { id } = await params;
    const inv = await invitationService.getById(ctx, id);
    return ok(inv);
  } catch (err) {
    return handleError(err);
  }
}
