/**
 * POST /api/private/posts/generate
 *
 * Drafts AI post copy for the composer. Does NOT persist anything —
 * the user reviews/edits the draft and then saves it as a post.
 */

import type { NextRequest } from "next/server";
import { PostType } from "@prisma/client";
import { z } from "zod";
import { requireSession } from "@/server/auth/requireSession";
import { requirePermission } from "@/server/permissions/permissions";
import { prisma } from "@/server/db/prisma";
import { generatePost } from "@/server/services/postGenerator.service";
import { handleError, ok } from "@/server/utils/response";

export const runtime = "nodejs";

const schema = z.object({
  locationId: z.string().cuid().optional(),
  type: z.nativeEnum(PostType).default(PostType.STANDARD),
  topic: z.string().trim().max(300).optional(),
  tone: z.string().trim().max(50).optional(),
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

    // Location context (optional) — reuse the AI review brief when present
    // so posts stay consistent with how we describe the business.
    let city: string | null = null;
    let aiContext: string | null = null;
    let highlights: string[] = [];
    let businessName = tenant?.name ?? "our business";

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
        const h = loc.reviewProfile?.highlights;
        highlights = Array.isArray(h)
          ? h.filter((x): x is string => typeof x === "string")
          : [];
      }
    }

    const draft = await generatePost({
      businessName,
      category: profile?.primaryCategory?.name ?? tenant?.industry ?? null,
      city,
      type: input.type,
      topic: input.topic ?? null,
      tone: input.tone ?? null,
      aiContext,
      highlights,
    });

    return ok(draft);
  } catch (err) {
    return handleError(err);
  }
}
