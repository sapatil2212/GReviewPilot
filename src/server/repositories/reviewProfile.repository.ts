/**
 * LocationReviewProfile repository — the per-location AI review context.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/server/db/prisma";

export const reviewProfileRepository = {
  findByLocationId(locationId: string) {
    return prisma.locationReviewProfile.findUnique({ where: { locationId } });
  },

  upsert(
    locationId: string,
    tenantId: string,
    data: {
      gmbProfileUrl?: string | null;
      websiteUrl?: string | null;
      websiteSummary?: string | null;
      websiteFetchedAt?: Date | null;
      businessType?: string | null;
      description?: string | null;
      highlights?: string[] | null;
      keywords?: string[] | null;
      tone?: string;
      aiContext?: string | null;
      synthesizedAt?: Date | null;
    },
  ) {
    const jsonArr = (v: string[] | null | undefined) =>
      v === undefined ? undefined : v === null ? Prisma.JsonNull : (v as unknown as Prisma.InputJsonValue);

    return prisma.locationReviewProfile.upsert({
      where: { locationId },
      create: {
        location: { connect: { id: locationId } },
        tenantId,
        gmbProfileUrl: data.gmbProfileUrl ?? null,
        websiteUrl: data.websiteUrl ?? null,
        websiteSummary: data.websiteSummary ?? null,
        websiteFetchedAt: data.websiteFetchedAt ?? null,
        businessType: data.businessType ?? null,
        description: data.description ?? null,
        highlights: jsonArr(data.highlights) ?? Prisma.JsonNull,
        keywords: jsonArr(data.keywords) ?? Prisma.JsonNull,
        tone: data.tone ?? "warm",
        aiContext: data.aiContext ?? null,
        synthesizedAt: data.synthesizedAt ?? null,
      },
      update: {
        ...(data.gmbProfileUrl !== undefined ? { gmbProfileUrl: data.gmbProfileUrl } : {}),
        ...(data.websiteUrl !== undefined ? { websiteUrl: data.websiteUrl } : {}),
        ...(data.websiteSummary !== undefined ? { websiteSummary: data.websiteSummary } : {}),
        ...(data.websiteFetchedAt !== undefined ? { websiteFetchedAt: data.websiteFetchedAt } : {}),
        ...(data.businessType !== undefined ? { businessType: data.businessType } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.highlights !== undefined ? { highlights: jsonArr(data.highlights) } : {}),
        ...(data.keywords !== undefined ? { keywords: jsonArr(data.keywords) } : {}),
        ...(data.tone !== undefined ? { tone: data.tone } : {}),
        ...(data.aiContext !== undefined ? { aiContext: data.aiContext } : {}),
        ...(data.synthesizedAt !== undefined ? { synthesizedAt: data.synthesizedAt } : {}),
      },
    });
  },
};
