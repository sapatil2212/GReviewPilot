/**
 * POST /api/auth/login
 *
 * Credential login with structured business errors (trial ended,
 * deleted account) that Auth.js would otherwise collapse into a
 * generic CredentialsSignin.
 */

import type { NextRequest } from "next/server";
import { signIn } from "@/server/auth/handlers";
import { authService } from "@/server/services/auth.service";
import { loginSchema } from "@/server/validators/auth.schema";
import { ok, handleError } from "@/server/utils/response";
import { callerKey, limiters } from "@/server/middleware/rateLimit";
import { AppError } from "@/server/utils/errors";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    limiters.login(callerKey(req));
    const body = await req.json().catch(() => null);
    const input = loginSchema.parse(body);

    try {
      await authService.verifyCredentials(input, req);
    } catch (err) {
      // Surface typed business errors (trial / deleted) with payload.
      return handleError(err);
    }

    const result = await signIn("credentials", {
      email: input.email,
      password: input.password,
      redirect: false,
    });

    if (!result || (typeof result === "object" && "error" in result && result.error)) {
      throw new AppError("INVALID_CREDENTIALS", "Invalid email or password", 401);
    }

    return ok({ ok: true }, { message: "Signed in" });
  } catch (err) {
    return handleError(err);
  }
}
