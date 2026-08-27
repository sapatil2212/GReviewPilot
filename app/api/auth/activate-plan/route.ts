/**
 * POST /api/auth/activate-plan
 *
 * Activates a subscription plan after the free trial ends, then
 * signs the user in (email/password path) or updates the current
 * session's tenant (authenticated dashboard path).
 */

import type { NextRequest } from "next/server";
import { signIn } from "@/server/auth/handlers";
import { tryGetSession } from "@/server/auth/requireSession";
import { authService } from "@/server/services/auth.service";
import { activatePlanSchema } from "@/server/validators/auth.schema";
import { ok, handleError } from "@/server/utils/response";
import { callerKey, limiters } from "@/server/middleware/rateLimit";
import { AppError } from "@/server/utils/errors";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    limiters.login(callerKey(req));
    const body = await req.json().catch(() => null);
    const input = activatePlanSchema.parse(body);
    const session = await tryGetSession();

    if (session) {
      await authService.activatePlanForSession(
        session.userId,
        session.tenantId,
        input.plan,
        req,
      );
      return ok({ ok: true, plan: input.plan }, { message: "Plan activated" });
    }

    if (!input.email || !input.password) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Email and password are required to activate a plan",
        400,
      );
    }

    await authService.activatePlan(
      {
        email: input.email,
        password: input.password,
        rememberMe: false,
        plan: input.plan,
      },
      req,
    );

    const result = await signIn("credentials", {
      email: input.email,
      password: input.password,
      redirect: false,
    });
    if (!result || (typeof result === "object" && "error" in result && result.error)) {
      throw new AppError("INVALID_CREDENTIALS", "Could not sign you in after activating", 401);
    }

    return ok({ ok: true, plan: input.plan }, { message: "Plan activated" });
  } catch (err) {
    return handleError(err);
  }
}
