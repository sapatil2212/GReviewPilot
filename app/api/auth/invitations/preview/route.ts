/**
 * GET /api/auth/invitations/preview?token=<raw>
 *
 * Public endpoint. Returns non-sensitive metadata about an invitation
 * so the accept page can render the workspace name, inviter, role,
 * and expiry before asking the invitee to set their password.
 *
 * Only PENDING, unexpired tokens resolve; everything else raises the
 * appropriate 4xx.
 */

import type { NextRequest } from "next/server";
import { invitationService } from "@/server/services/invitation.service";
import { previewInvitationQuerySchema } from "@/server/validators/team.schema";
import { handleError, ok } from "@/server/utils/response";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const { token } = previewInvitationQuerySchema.parse({
      token: url.searchParams.get("token") ?? "",
    });
    const data = await invitationService.preview(token);
    return ok(data);
  } catch (err) {
    return handleError(err);
  }
}
