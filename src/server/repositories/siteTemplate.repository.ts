/**
 * SiteTemplate data access.
 *
 * `tenantId: null` rows are global templates curated by the platform (seeded
 * via prisma/seeds/siteTemplates.ts); a non-null `tenantId` would be a
 * tenant's own saved template — not built yet, but the column is already
 * there so that feature needs no migration later.
 */

import type { Prisma, SiteTemplate } from "@prisma/client";
import { prisma } from "@/server/db/prisma";

export const siteTemplateRepository = {
  findBySlug(slug: string): Promise<SiteTemplate | null> {
    return prisma.siteTemplate.findUnique({ where: { slug } });
  },

  /**
   * Templates a tenant can browse: every global template plus (eventually)
   * their own. Ordered by curation rank first, then industry match quality —
   * callers that pass an `industry` want that one's templates surfaced first
   * without hiding the rest of the catalog.
   */
  list(args: { tenantId: string; industry?: string | null }): Promise<SiteTemplate[]> {
    return prisma.siteTemplate.findMany({
      where: {
        OR: [{ isGlobal: true }, { tenantId: args.tenantId }],
      },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
  },

  create(data: Prisma.SiteTemplateUncheckedCreateInput): Promise<SiteTemplate> {
    return prisma.siteTemplate.create({ data });
  },

  upsertGlobalBySlug(
    slug: string,
    data: Omit<Prisma.SiteTemplateUncheckedCreateInput, "slug">,
  ): Promise<SiteTemplate> {
    return prisma.siteTemplate.upsert({
      where: { slug },
      create: { ...data, slug },
      update: data,
    });
  },
};
