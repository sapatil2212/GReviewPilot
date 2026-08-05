/**
 * POST /api/auth/signup
 * Body: SignupInput (see validators/auth.schema.ts)
 *
 * Two-phase signup:
 *   1. Client requests an OTP via /api/auth/signup/otp/request
 *   2. Client submits the full form + the 6-digit OTP here.
 *
 * Because the OTP proves control of the mailbox, we create the account
 * with `emailVerified = now` and `status = ACTIVE`. Callers can sign
 * in immediately after this returns.
 */

import type { NextRequest } from "next/server";
import { authService } from "@/server/services/auth.service";
import { signupSchema } from "@/server/validators/auth.schema";
import { ok, handleError } from "@/server/utils/response";
import { callerKey, limiters } from "@/server/middleware/rateLimit";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    limiters.signup(callerKey(req));
    const body = await req.json().catch(() => null);
    const input = signupSchema.parse(body);
    const result = await authService.signup(input, req);
    return ok(
      { userId: result.userId, email: result.email, tenantId: result.tenantId },
      { status: 201, message: "Account created" },
    );
  } catch (err) {
    return handleError(err);
  }
}
