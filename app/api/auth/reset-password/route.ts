/**
 * POST /api/auth/reset-password
 * Body: { token, password, confirmPassword }
 * Sets the new password, revokes all outstanding sessions, and emails
 * the user a confirmation.
 */

import type { NextRequest } from "next/server";
import { authService } from "@/server/services/auth.service";
import { resetPasswordSchema } from "@/server/validators/auth.schema";
import { ok, handleError } from "@/server/utils/response";
import { callerKey, limiters } from "@/server/middleware/rateLimit";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    limiters.resetPassword(callerKey(req));
    const body = await req.json().catch(() => null);
    const input = resetPasswordSchema.parse(body);
    const result = await authService.resetPassword(input.token, input.password, req);
    return ok({ userId: result.userId }, { message: "Password reset successful. Please sign in." });
  } catch (err) {
    return handleError(err);
  }
}
