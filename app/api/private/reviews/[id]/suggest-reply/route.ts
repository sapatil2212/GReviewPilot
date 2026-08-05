/**
 * POST /api/private/reviews/[id]/suggest-reply
 *
 * Returns an AI-drafted reply for the review. Does not persist anything —
 * the owner reviews/edits it, then sends it via the reply endpoint.
 */

import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireSession } from "@/server/auth/requireSession";
import { requirePermission } from "@/server/permissions/permissions";
import { prisma } from "@/server/db/prisma";
import { generateReply } from "@/server/services/replyGenerator.service";
import { handleError, ok } from "@/server/utils/response";
import { NotFoundError } from "@/server/utils/errors";

export const runtime = "nodejs";

const schema = z.object({
  tone: z.string().trim().max(50).optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "review:reply");
    const { id } = await params;
    const input = schema.parse((await req.json().catch(() => null)) ?? {});

    const review = await prisma.review.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: {
        starRating: true,
        comment: true,
        reviewerName: true,
        location: {
          select: {
            name: true,
            reviewProfile: { select: { aiContext: true, businessType: true } },
          },
        },
      },
    });
    if (!review) throw new NotFoundError("Review not found");

    const tenant = await prisma.tenant.findUnique({
      where: { id: ctx.tenantId },
      select: { name: true, industry: true },
    });
    const profile = await prisma.businessProfile.findUnique({
      where: { tenantId: ctx.tenantId },
      select: { primaryCategory: { select: { name: true } } },
    });

    const draft = await generateReply({
      businessName: review.location?.name ?? tenant?.name ?? "our business",
      reviewerName: review.reviewerName,
      starRating: review.starRating,
      reviewComment: review.comment,
      category:
        review.location?.reviewProfile?.businessType ??
        profile?.primaryCategory?.name ??
        tenant?.industry ??
        null,
      tone: input.tone ?? null,
      aiContext: review.location?.reviewProfile?.aiContext ?? null,
    });

    return ok(draft);
  } catch (err) {
    return handleError(err);
  }
}
