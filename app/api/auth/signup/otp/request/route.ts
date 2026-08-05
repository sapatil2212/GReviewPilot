/**
 * POST /api/auth/signup/otp/request
 * Body: { email }
 * Always returns { sent: true } to prevent email enumeration during
 * the pre-signup window (the caller hasn't proven ownership yet).
 */

import type { NextRequest } from "next/server";
import { authService } from "@/server/services/auth.service";
import { requestSignupOtpSchema } from "@/server/validators/auth.schema";
import { ok, handleError } from "@/server/utils/response";
import { callerKey, limiters } from "@/server/middleware/rateLimit";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const input = requestSignupOtpSchema.parse(body);

    // Rate limit per (IP, email). Also caps how often a single mailbox
    // can be pinged.
    limiters.resendVerification(callerKey(req, input.email));

    await authService.requestSignupOtp(input.email, req);

    return ok(
      { sent: true },
      { message: "If you can receive email at that address, a code is on the way." },
    );
  } catch (err) {
    return handleError(err);
  }
}
