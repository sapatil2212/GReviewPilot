/**
 * GET   /api/private/business/profile
 * PATCH /api/private/business/profile
 *
 * Returns / updates the extended business profile of the caller's
 * tenant. Same endpoint accepts Tenant-level fields under `tenant: {}`
 * so the UI can save "Business Info" as a single payload.
 */

import type { NextRequest } from "next/server";
import { requireSession } from "@/server/auth/requireSession";
import { requirePermission } from "@/server/permissions/permissions";
import { businessProfileService } from "@/server/services/businessProfile.service";
import { updateBusinessProfileSchema } from "@/server/validators/business.schema";
import { handleError, ok } from "@/server/utils/response";

export const runtime = "nodejs";

export async function GET() {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "business:read");
    const data = await businessProfileService.getForTenant(ctx);
    return ok(data);
  } catch (err) {
    return handleError(err);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "business:update");
    const body = await req.json().catch(() => null);
    const input = updateBusinessProfileSchema.parse(body);
    const profile = await businessProfileService.update(ctx, input, req);
    return ok(profile, { message: "Business profile updated" });
  } catch (err) {
    return handleError(err);
  }
}
