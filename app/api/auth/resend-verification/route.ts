/**
 * POST /api/auth/resend-verification
 * Body: { email: string }
 * Returns { sent: true } regardless of outcome (enumeration protection).
 */

import type { NextRequest } from "next/server";
import { authService } from "@/server/services/auth.service";
import { resendVerificationSchema } from "@/server/validators/auth.schema";
import { ok, handleError } from "@/server/utils/response";
import { callerKey, limiters } from "@/server/middleware/rateLimit";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const input = resendVerificationSchema.parse(body);
    limiters.resendVerification(callerKey(req, input.email));
    await authService.resendVerification(input.email);
    return ok(
      { sent: true },
      { message: "If an account exists, a verification email has been sent." },
    );
  } catch (err) {
    return handleError(err);
  }
}
