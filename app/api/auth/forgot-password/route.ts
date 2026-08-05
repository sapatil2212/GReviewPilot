/**
 * POST /api/auth/forgot-password
 * Body: { email: string }
 * Always returns { sent: true } to prevent email enumeration.
 */

import type { NextRequest } from "next/server";
import { authService } from "@/server/services/auth.service";
import { forgotPasswordSchema } from "@/server/validators/auth.schema";
import { ok, handleError } from "@/server/utils/response";
import { callerKey, limiters } from "@/server/middleware/rateLimit";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const input = forgotPasswordSchema.parse(body);
    limiters.forgotPassword(callerKey(req, input.email));
    await authService.requestPasswordReset(input.email, req);
    return ok(
      { sent: true },
      { message: "If an account exists, a password reset email has been sent." },
    );
  } catch (err) {
    return handleError(err);
  }
}
