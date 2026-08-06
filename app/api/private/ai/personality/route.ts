/**
 * GET    /api/private/ai/personality — current personality (+ suggestions)
 * PATCH  /api/private/ai/personality — save one wizard step
 * DELETE /api/private/ai/personality — start over
 *
 * PATCH rather than PUT: the wizard saves after each step, so a request
 * legitimately carries a single answer and must not clear the rest.
 */

import type { NextRequest } from "next/server";
import { requireSession } from "@/server/auth/requireSession";
import { requirePermission } from "@/server/permissions/permissions";
import { businessPersonalityService } from "@/server/services/businessPersonality.service";
import { updatePersonalitySchema } from "@/server/validators/ai.schema";
import { handleError, ok } from "@/server/utils/response";

export const runtime = "nodejs";

export async function GET() {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "ai:personality:read");
    return ok(await businessPersonalityService.get(ctx));
  } catch (err) {
    return handleError(err);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "ai:personality:update");
    const body = await req.json().catch(() => null);
    const input = updatePersonalitySchema.parse(body);
    const data = await businessPersonalityService.update(ctx, input, req);
    return ok(data, { message: "Saved" });
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE() {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "ai:personality:update");
    return ok(await businessPersonalityService.reset(ctx), { message: "Personality reset" });
  } catch (err) {
    return handleError(err);
  }
}
