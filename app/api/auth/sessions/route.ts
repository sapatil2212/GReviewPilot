/**
 * GET  /api/auth/sessions           — list active sessions for the caller
 * DELETE /api/auth/sessions         — revoke all sessions EXCEPT the current one
 */

import { requireSession } from "@/server/auth/requireSession";
import { sessionService } from "@/server/services/session.service";
import { requirePermission } from "@/server/permissions/permissions";
import { ok, handleError } from "@/server/utils/response";

export const runtime = "nodejs";

export async function GET() {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "session:read");
    const sessions = await sessionService.listActiveForUser(ctx.userId);
    return ok({
      current: ctx.sessionId,
      sessions: sessions.map((s) => ({
        id: s.id,
        browser: s.browser,
        os: s.os,
        device: s.device,
        ipAddress: s.ipAddress,
        country: s.country,
        lastActivityAt: s.lastActivityAt,
        expiresAt: s.expiresAt,
        createdAt: s.createdAt,
        current: s.id === ctx.sessionId,
      })),
    });
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE() {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "session:revoke");
    const result = await sessionService.revokeAllForUser(
      ctx.userId,
      "LOGOUT_OTHER_DEVICES",
      ctx.sessionId,
    );
    return ok(
      { revokedCount: result.count },
      { message: "Signed out of all other devices" },
    );
  } catch (err) {
    return handleError(err);
  }
}
