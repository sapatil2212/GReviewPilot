/**
 * POST /api/auth/restore-account
 *
 * Restores a soft-deleted account after the owner confirms. If the
 * restored workspace's trial has also expired, returns TRIAL_ENDED
 * so the client can open the subscribe modal next.
 */

import type { NextRequest } from "next/server";
import { signIn } from "@/server/auth/handlers";
import { authService } from "@/server/services/auth.service";
import { restoreAccountSchema } from "@/server/validators/auth.schema";
import { ok, handleError } from "@/server/utils/response";
import { callerKey, limiters } from "@/server/middleware/rateLimit";
import { AppError } from "@/server/utils/errors";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    limiters.login(callerKey(req));
    const body = await req.json().catch(() => null);
    const input = restoreAccountSchema.parse(body);

    try {
      await authService.restoreAccount(
        { email: input.email, password: input.password, rememberMe: false },
        req,
      );
    } catch (err) {
      // Restore may succeed then fail the trial gate — surface that.
      return handleError(err);
    }

    const result = await signIn("credentials", {
      email: input.email,
      password: input.password,
      redirect: false,
    });
    if (!result || (typeof result === "object" && "error" in result && result.error)) {
      throw new AppError("INVALID_CREDENTIALS", "Account restored but sign-in failed", 401);
    }

    return ok({ ok: true }, { message: "Account restored" });
  } catch (err) {
    return handleError(err);
  }
}
