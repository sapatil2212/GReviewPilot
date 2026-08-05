/**
 * GET  /api/private/team/invitations   — list invitations (paginated, filterable)
 * POST /api/private/team/invitations   — invite a new member
 *
 * Query for GET:
 *   page, pageSize, search, sortBy (createdAt|expiresAt|status|email), sortDir
 *   status=PENDING|ACCEPTED|REVOKED|EXPIRED
 *   role=<UserRole>
 */

import type { NextRequest } from "next/server";
import { requireSession } from "@/server/auth/requireSession";
import { requirePermission } from "@/server/permissions/permissions";
import { invitationService } from "@/server/services/invitation.service";
import {
  createInvitationSchema,
  listInvitationsQuerySchema,
} from "@/server/validators/team.schema";
import { handleError, ok } from "@/server/utils/response";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "invitation:read");
    const url = new URL(req.url);
    const filter = listInvitationsQuerySchema.parse({
      status: url.searchParams.get("status") ?? undefined,
      role: url.searchParams.get("role") ?? undefined,
    });
    const page = await invitationService.list(ctx, req, filter);
    return ok(page);
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "invitation:manage");
    const body = await req.json().catch(() => null);
    const input = createInvitationSchema.parse(body);
    const invitation = await invitationService.create(ctx, input, req);
    return ok(invitation, { message: "Invitation sent", status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
