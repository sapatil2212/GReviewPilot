/**
 * POST /api/auth/signup/google/complete
 *
 * Completes a provisional Google OAuth signup with the remaining
 * business + onboarding fields collected in the signup wizard.
 * Requires an authenticated session whose tenant still has
 * `metadata.signupIncomplete = true`.
 */

import type { NextRequest } from "next/server";
import { requireSession } from "@/server/auth/requireSession";
import { authService } from "@/server/services/auth.service";
import { completeGoogleSignupSchema } from "@/server/validators/auth.schema";
import { ok, handleError } from "@/server/utils/response";
import { callerKey, limiters } from "@/server/middleware/rateLimit";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    limiters.signup(callerKey(req));
    const ctx = await requireSession();
    const body = await req.json().catch(() => null);
    const input = completeGoogleSignupSchema.parse(body);
    const result = await authService.completeGoogleSignup(
      ctx.userId,
      ctx.tenantId,
      input,
      req,
    );
    return ok(
      {
        userId: result.userId,
        tenantId: result.tenantId,
        alreadyComplete: result.alreadyComplete,
      },
      {
        status: result.alreadyComplete ? 200 : 200,
        message: result.alreadyComplete
          ? "Signup already completed"
          : "Workspace ready",
      },
    );
  } catch (err) {
    return handleError(err);
  }
}
