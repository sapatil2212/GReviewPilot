/**
 * POST /api/auth/verify-email
 * Body: { token: string }
 * Marks the user's email verified and their status ACTIVE.
 */

import type { NextRequest } from "next/server";
import { authService } from "@/server/services/auth.service";
import { verifyEmailSchema } from "@/server/validators/auth.schema";
import { ok, handleError } from "@/server/utils/response";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const input = verifyEmailSchema.parse(body);
    const result = await authService.verifyEmail(input.token);
    return ok({ userId: result.userId }, { message: "Email verified successfully" });
  } catch (err) {
    return handleError(err);
  }
}
