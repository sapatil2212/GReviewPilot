/**
 * POST /api/auth/change-password
 * Authenticated. Verifies current password, sets new one, revokes
 * all OTHER sessions of the user, and emails a confirmation.
 */

import type { NextRequest } from "next/server";
import { requireSession } from "@/server/auth/requireSession";
import { authService } from "@/server/services/auth.service";
import { changePasswordSchema } from "@/server/validators/auth.schema";
import { ok, handleError } from "@/server/utils/response";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireSession();
    const body = await req.json().catch(() => null);
    const input = changePasswordSchema.parse(body);
    await authService.changePassword(
      ctx.userId,
      input.currentPassword,
      input.newPassword,
      ctx.sessionId,
      req,
    );
    return ok({ ok: true }, { message: "Password updated" });
  } catch (err) {
    return handleError(err);
  }
}
