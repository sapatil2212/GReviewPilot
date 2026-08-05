/**
 * GET /api/review/[tenantSlug]/[locationSlug]
 *
 * Public. Returns the business info needed by the customer-facing
 * review funnel page: business name, category, location, Google
 * Place ID (for the review URL), and branding.
 *
 * POST /api/review/[tenantSlug]/[locationSlug]
 *
 * Public. Generates an AI review and records a funnel event.
 * Body: { starRating: 1-5, hint?: string, sessionId: string }
 */

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/server/db/prisma";
import {
  generateReviewOptions,
  buildGoogleReviewUrl,
} from "@/server/services/reviewGenerator.service";
import {
  generatedReviewRepository,
  fingerprint,
} from "@/server/repositories/generatedReview.repository";
import { handleError, ok, fail } from "@/server/utils/response";
import { z } from "zod";

export const runtime = "nodejs";

const generateSchema = z.object({
  starRating: z.coerce.number().int().min(1).max(5),
  hint: z.string().trim().max(100).optional(),
  sessionId: z.string().min(1).max(100),
  count: z.coerce.number().int().min(1).max(5).optional().default(3),
});

const trackSchema = z.object({
  step: z.enum([
    "PAGE_VIEW",
    "STAR_SELECTED",
    "REVIEW_GENERATED",
    "REVIEW_COPIED",
    "REDIRECTED_TO_GOOGLE",
  ]),
  starRating: z.coerce.number().int().min(1).max(5).optional(),
  sessionId: z.string().min(1).max(100),
});

const feedbackSchema = z.object({
  action: z.literal("feedback"),
  rating: z.coerce.number().int().min(1).max(5),
  comment: z.string().trim().min(1).max(5000),
  customerName: z.string().trim().max(200).optional(),
  customerPhone: z.string().trim().max(30).optional(),
  customerEmail: z.string().trim().email().max(255).optional().or(z.literal("")),
  sessionId: z.string().min(1).max(100),
});

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ tenantSlug: string; locationSlug: string }> },
) {
  try {
    const { tenantSlug, locationSlug } = await params;

    const tenant = await prisma.tenant.findUnique({
      where: { slug: tenantSlug },
      select: {
        id: true,
        name: true,
        slug: true,
        logo: true,
        industry: true,
        businessType: true,
      },
    });
    if (!tenant) {
      return fail("NOT_FOUND", "Business not found", { status: 404 });
    }

    const location = await prisma.location.findUnique({
      where: { tenantId_slug: { tenantId: tenant.id, slug: locationSlug } },
      select: {
        id: true,
        name: true,
        slug: true,
        city: true,
        country: true,
        googlePlaceId: true,
        phone: true,
        website: true,
      },
    });
    if (!location) {
      return fail("NOT_FOUND", "Location not found", { status: 404 });
    }

    if (!location.googlePlaceId) {
      return fail(
        "INVALID_REQUEST",
        "This location doesn't have a Google Place ID configured yet. The business owner needs to link it in their dashboard.",
        { status: 422 },
      );
    }

    const profile = await prisma.businessProfile.findUnique({
      where: { tenantId: tenant.id },
      select: {
        description: true,
        shortDescription: true,
        primaryCategory: { select: { name: true } },
      },
    });

    // Prefer the linked Google location's category (it's per-branch and
    // accurate), then the tenant's business profile category, then industry.
    const googleLoc = await prisma.googleLocation.findFirst({
      where: { tenantId: tenant.id, localLocationId: location.id },
      select: { primaryCategory: true },
    });

    // Trust signal — avg rating + count from reviews we already have.
    const agg = await prisma.review.aggregate({
      where: { tenantId: tenant.id, locationId: location.id },
      _avg: { starRating: true },
      _count: { _all: true },
    });

    const category =
      googleLoc?.primaryCategory ??
      profile?.primaryCategory?.name ??
      tenant.industry ??
      null;

    return ok({
      // The "business" the customer is reviewing is the LOCATION, not the
      // workspace/account owner. Lead with the location's identity.
      business: {
        name: location.name,
        slug: location.slug,
        logo: tenant.logo,
        industry: tenant.industry,
        description: profile?.shortDescription ?? profile?.description ?? null,
        category,
      },
      location: {
        id: location.id,
        name: location.name,
        slug: location.slug,
        city: location.city,
        country: location.country,
      },
      stats: {
        averageRating: agg._avg.starRating
          ? Number(agg._avg.starRating.toFixed(1))
          : null,
        totalReviews: agg._count._all,
      },
      googleReviewUrl: buildGoogleReviewUrl(location.googlePlaceId),
    });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ tenantSlug: string; locationSlug: string }> },
) {
  try {
    const { tenantSlug, locationSlug } = await params;
    const body = await req.json().catch(() => null);

    // Private feedback submission (low-rating funnel branch).
    if (body && typeof body === "object" && body.action === "feedback") {
      const input = feedbackSchema.parse(body);
      const tenant = await prisma.tenant.findUnique({
        where: { slug: tenantSlug },
        select: { id: true },
      });
      if (!tenant) return fail("NOT_FOUND", "Business not found", { status: 404 });
      const location = await prisma.location.findUnique({
        where: { tenantId_slug: { tenantId: tenant.id, slug: locationSlug } },
        select: { id: true },
      });
      const ipAddress =
        req.headers.get("cf-connecting-ip") ||
        req.headers.get("x-real-ip") ||
        req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
        null;

      await prisma.privateFeedback.create({
        data: {
          tenantId: tenant.id,
          locationId: location?.id ?? null,
          rating: input.rating,
          comment: input.comment,
          customerName: input.customerName || null,
          customerPhone: input.customerPhone || null,
          customerEmail: input.customerEmail || null,
          sessionId: input.sessionId,
          ipAddress,
        },
      });
      await prisma.reviewFunnelEvent.create({
        data: {
          tenantId: tenant.id,
          locationId: location?.id ?? null,
          step: "PRIVATE_FEEDBACK",
          starRating: input.rating,
          sessionId: input.sessionId,
          ipAddress,
          userAgent: req.headers.get("user-agent"),
        },
      });
      return ok({ received: true });
    }

    // Determine if this is a "generate" call or a "track" call.
    // Track calls have a `step` field.
    if (body && typeof body === "object" && "step" in body) {
      const input = trackSchema.parse(body);

      const tenant = await prisma.tenant.findUnique({
        where: { slug: tenantSlug },
        select: { id: true },
      });
      if (!tenant) return fail("NOT_FOUND", "Business not found", { status: 404 });

      const location = await prisma.location.findUnique({
        where: { tenantId_slug: { tenantId: tenant.id, slug: locationSlug } },
        select: { id: true },
      });

      const ipAddress =
        req.headers.get("cf-connecting-ip") ||
        req.headers.get("x-real-ip") ||
        req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
        null;

      await prisma.reviewFunnelEvent.create({
        data: {
          tenantId: tenant.id,
          locationId: location?.id ?? null,
          step: input.step,
          starRating: input.starRating ?? null,
          sessionId: input.sessionId,
          ipAddress,
          userAgent: req.headers.get("user-agent"),
          device: null,
          referrer: req.headers.get("referer") ?? null,
        },
      });

      return ok({ tracked: true });
    }

    // Generate flow
    const input = generateSchema.parse(body);

    const tenant = await prisma.tenant.findUnique({
      where: { slug: tenantSlug },
      select: { id: true, name: true, industry: true },
    });
    if (!tenant) return fail("NOT_FOUND", "Business not found", { status: 404 });

    const location = await prisma.location.findUnique({
      where: { tenantId_slug: { tenantId: tenant.id, slug: locationSlug } },
      select: { id: true, name: true, city: true, googlePlaceId: true },
    });
    if (!location) {
      return fail("NOT_FOUND", "Location not found", { status: 404 });
    }

    const profile = await prisma.businessProfile.findUnique({
      where: { tenantId: tenant.id },
      select: { primaryCategory: { select: { name: true } } },
    });
    const googleLoc = await prisma.googleLocation.findFirst({
      where: { tenantId: tenant.id, localLocationId: location.id },
      select: { primaryCategory: true },
    });
    // Per-location AI review context (highlights, keywords, brief).
    const reviewProfile = await prisma.locationReviewProfile.findUnique({
      where: { locationId: location.id },
      select: { aiContext: true, highlights: true, keywords: true, businessType: true },
    });

    const asStringArray = (v: unknown): string[] =>
      Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];

    // Uniqueness: never serve a review we've generated before for this
    // location. Feed recent ones to the model as an avoid-list, then
    // hard-filter the results against the full history.
    const avoidTexts = await generatedReviewRepository.recentTexts(location.id, 30);

    const result = await generateReviewOptions(
      {
        // Use the LOCATION's name — that's the business the customer visited.
        businessName: location.name,
        category:
          reviewProfile?.businessType ??
          googleLoc?.primaryCategory ??
          profile?.primaryCategory?.name ??
          tenant.industry ??
          null,
        starRating: input.starRating,
        locationCity: location.city ?? null,
        customerHint: input.hint,
        aiContext: reviewProfile?.aiContext ?? null,
        highlights: asStringArray(reviewProfile?.highlights),
        keywords: asStringArray(reviewProfile?.keywords),
        avoidTexts,
      },
      input.count,
    );

    // Hard-filter against the persisted history (covers duplicates the
    // model may still produce), then record the survivors so they're never
    // reused for this location again.
    const uniqueOptions: string[] = [];
    const toRecord: { text: string; hash: string }[] = [];
    const candidateHashes = result.options.map((t) => fingerprint(t));
    const already = await generatedReviewRepository.existingHashes(
      location.id,
      candidateHashes,
    );
    const seenNow = new Set<string>();
    result.options.forEach((text, i) => {
      const hash = candidateHashes[i]!;
      if (already.has(hash) || seenNow.has(hash)) return;
      seenNow.add(hash);
      uniqueOptions.push(text);
      toRecord.push({ text, hash });
    });

    await generatedReviewRepository.record(
      tenant.id,
      location.id,
      input.starRating,
      input.sessionId,
      toRecord,
    );

    // Track the generation event
    const ipAddress =
      req.headers.get("cf-connecting-ip") ||
      req.headers.get("x-real-ip") ||
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      null;

    await prisma.reviewFunnelEvent.create({
      data: {
        tenantId: tenant.id,
        locationId: location?.id ?? null,
        step: "REVIEW_GENERATED",
        starRating: input.starRating,
        sessionId: input.sessionId,
        ipAddress,
        userAgent: req.headers.get("user-agent"),
        referrer: req.headers.get("referer") ?? null,
      },
    });

    return ok({
      // Prefer the de-duplicated set; if everything collided with history
      // (rare), fall back to the raw options so the funnel never breaks.
      options: uniqueOptions.length > 0 ? uniqueOptions : result.options,
      starRating: input.starRating,
      source: result.source,
      googleReviewUrl: location?.googlePlaceId
        ? buildGoogleReviewUrl(location.googlePlaceId)
        : null,
    });
  } catch (err) {
    return handleError(err);
  }
}
