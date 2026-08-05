/**
 * GET /api/private/locations/[id]/review-profile
 *   → returns the location's AI review profile (services/keywords/brief)
 *
 * PUT /api/private/locations/[id]/review-profile
 *   → saves tenant inputs and (re)synthesizes the AI brief that drives
 *     funnel review generation. Body: reviewProfileInputSchema.
 */

import type { NextRequest } from "next/server";
import { requireSession } from "@/server/auth/requireSession";
import { requirePermission } from "@/server/permissions/permissions";
import { locationRepository } from "@/server/repositories/location.repository";
import { reviewContextService } from "@/server/services/reviewContext.service";
import { reviewProfileInputSchema } from "@/server/validators/review.schema";
import { handleError, ok } from "@/server/utils/response";
import { NotFoundError } from "@/server/utils/errors";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "location:read");
    const { id } = await params;
    const location = await locationRepository.findByIdForTenant(id, ctx.tenantId);
    if (!location) throw new NotFoundError("Location not found");
    const profile = await reviewContextService.getForLocation(id);
    return ok({
      location: {
        id: location.id,
        name: location.name,
        city: location.city,
        googlePlaceId: location.googlePlaceId,
      },
      profile,
    });
  } catch (err) {
    return handleError(err);
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "location:update");
    const { id } = await params;
    const location = await locationRepository.findByIdForTenant(id, ctx.tenantId);
    if (!location) throw new NotFoundError("Location not found");

    const input = reviewProfileInputSchema.parse(await req.json().catch(() => null));

    await reviewContextService.synthesizeAndSave(
      id,
      ctx.tenantId,
      location.name,
      location.city,
      location.googlePlaceId,
      {
        gmbProfileUrl: input.gmbProfileUrl ?? null,
        websiteUrl: input.websiteUrl ?? null,
        businessType: input.businessType ?? null,
        description: input.description ?? null,
        highlights: input.highlights ?? null,
        keywords: input.keywords ?? null,
        tone: input.tone ?? "warm",
        aiContext: input.aiContext ?? null,
      },
    );

    const profile = await reviewContextService.getForLocation(id);
    return ok({ profile }, { message: "AI review profile updated" });
  } catch (err) {
    return handleError(err);
  }
}
