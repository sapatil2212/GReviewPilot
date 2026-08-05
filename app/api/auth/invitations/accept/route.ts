/**
 * POST /api/auth/invitations/accept
 *
 * Public endpoint. Consumes an invitation token, creates the User
 * (email-verified, ACTIVE), applies preselected location assignments,
 * and returns basic identity so the client can redirect to sign-in.
 *
 * Note: we do NOT auto-create a session here — the invitee still
 * signs in through the normal flow. This keeps the accept flow
 * side-effect-free from the auth-cookie perspective.
 */

import type { NextRequest } from "next/server";
import { invitationService } from "@/server/services/invitation.service";
import { acceptInvitationSchema } from "@/server/validators/team.schema";
import { handleError, ok } from "@/server/utils/response";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const input = acceptInvitationSchema.parse(body);
    const result = await invitationService.accept(input, req);
    return ok(result, { message: "Invitation accepted", status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
