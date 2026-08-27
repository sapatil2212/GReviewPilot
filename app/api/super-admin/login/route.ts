/**
 * POST /api/super-admin/login
 * Super Admin authentication endpoint validating email, password, and secret key.
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { env } from "@/server/utils/env";
import { authService } from "@/server/services/auth.service";
import { ok, fail, handleError } from "@/server/utils/response";
import { UnauthorizedError } from "@/server/utils/errors";

export const runtime = "nodejs";

const superAdminLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  secret: z.string().min(1),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = superAdminLoginSchema.parse(body);

    const targetEmail = (env.SUPER_ADMIN_USER || "contactgreviewpilot@gmail.com").toLowerCase();
    const targetPassword = env.SUPER_ADMIN_PASSWORD || "greviewpilot@2026";
    const targetSecret = env.SUPER_ADMIN_SECRET || "123";

    if (
      parsed.email.toLowerCase() !== targetEmail ||
      parsed.password !== targetPassword ||
      parsed.secret !== targetSecret
    ) {
      throw new UnauthorizedError("INVALID_SUPER_ADMIN_CREDENTIALS", "Invalid Super Admin credentials or secret key");
    }

    // Ensure Super Admin user exists in DB & verify credentials
    const user = await authService.ensureSuperAdminUser();
    if (!user) {
      throw new UnauthorizedError("SUPER_ADMIN_PROVISION_FAILED", "Failed to provision Super Admin account");
    }

    return ok(
      {
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          firstName: user.firstName,
          lastName: user.lastName,
        },
      },
      { message: "Super Admin authenticated successfully" }
    );
  } catch (err) {
    return handleError(err);
  }
}
