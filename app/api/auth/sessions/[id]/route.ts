/**
 * DELETE /api/auth/sessions/[id]
 * Revokes a specific session belonging to the caller.
 * Users cannot revoke sessions belonging to other users.
 */

import type { NextRequest } from "next/server";
import { requireSession } from "@/server/auth/requireSession";
import { sessionService } from "@/server/services/session.service";
import { requirePermission } from "@/server/permissions/permissions";
import { ForbiddenError, NotFoundError } from "@/server/utils/errors";
import { ok, handleError } from "@/server/utils/response";

export const runtime = "nodejs";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const ctx = await requireSession();
    requirePermission(ctx, "session:revoke");

    // Look up the target within the caller's own active sessions to
    // enforce ownership without exposing IDs across tenants.
    const active = await sessionService.listActiveForUser(ctx.userId);
    const found = active.find((s) => s.id === id);
    if (!found) throw new NotFoundError("Session not found");
    if (found.userId !== ctx.userId) throw new ForbiddenError();

    await sessionService.revoke(id, "MANUAL_REVOKE");
    return ok({ revoked: id }, { message: "Session revoked" });
  } catch (err) {
    return handleError(err);
  }
}
