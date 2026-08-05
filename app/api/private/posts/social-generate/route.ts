/**
 * POST /api/private/posts/social-generate
 *
 * Turns a freeform user prompt into platform-tailored social captions.
 * Stateless — nothing is persisted. The user reviews the output, copies
 * it, or carries it into a Google post draft.
 */

import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireSession } from "@/server/auth/requireSession";
import { requirePermission } from "@/server/permissions/permissions";
import { prisma } from "@/server/db/prisma";
import {
  SOCIAL_PLATFORMS,
  generateSocialPosts,
} from "@/server/services/socialPostGenerator.service";
import { handleError, ok } from "@/server/utils/response";

export const runtime = "nodejs";
export const maxDuration = 60;

const schema = z.object({
  prompt: z
    .string()
    .trim()
    .min(3, "Describe what the post should be about")
    .max(1000),
  platforms: z.array(z.enum(SOCIAL_PLATFORMS)).min(1).max(5),
  locationId: z.string().cuid().optional(),
  tone: z.string().trim().max(60).optional(),
  callToAction: z.string().trim().max(200).optional(),
  includeHashtags: z.boolean().optional().default(true),
  includeEmoji: z.boolean().optional().default(true),
});

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "post:create");
    const input = schema.parse(await req.json().catch(() => null));

    const tenant = await prisma.tenant.findUnique({
      where: { id: ctx.tenantId },
      select: { name: true, industry: true },
    });
    const profile = await prisma.businessProfile.findUnique({
      where: { tenantId: ctx.tenantId },
      select: { primaryCategory: { select: { name: true } } },
    });

    let businessName = tenant?.name ?? "our business";
    let city: string | null = null;
    let aiContext: string | null = null;
    let highlights: string[] = [];
    let businessType: string | null = null;

    if (input.locationId) {
      const loc = await prisma.location.findFirst({
        where: { id: input.locationId, tenantId: ctx.tenantId },
        select: {
          name: true,
          city: true,
          reviewProfile: {
            select: { aiContext: true, highlights: true, businessType: true },
          },
        },
      });
      if (loc) {
        businessName = loc.name;
        city = loc.city;
        aiContext = loc.reviewProfile?.aiContext ?? null;
        businessType = loc.reviewProfile?.businessType ?? null;
        const h = loc.reviewProfile?.highlights;
        highlights = Array.isArray(h)
          ? h.filter((x): x is string => typeof x === "string")
          : [];
      }
    }

    const result = await generateSocialPosts({
      prompt: input.prompt,
      platforms: input.platforms,
      businessName,
      category:
        businessType ??
        profile?.primaryCategory?.name ??
        tenant?.industry ??
        null,
      city,
      tone: input.tone ?? null,
      callToAction: input.callToAction ?? null,
      includeHashtags: input.includeHashtags,
      includeEmoji: input.includeEmoji,
      aiContext,
      highlights,
    });

    return ok(result);
  } catch (err) {
    return handleError(err);
  }
}
