/**
 * Public read models for rendered sites.
 *
 * ---------------------------------------------------------------------
 * Why this is a separate repository
 * ---------------------------------------------------------------------
 * Every other repository in this codebase takes a `tenantId` and scopes its
 * queries by it, because every other caller is an authenticated tenant user.
 * The public site renderer has no session — so the scoping key becomes the
 * *site*, which is itself resolved from a slug or verified hostname.
 *
 * Isolating those queries here makes the trust boundary explicit and
 * reviewable, rather than sprinkling unscoped reads through repositories whose
 * contract is "always tenant-scoped". Each function below derives tenant
 * scope from the site row it was given, never from caller input, and every
 * projection is an allowlist so no internal column can leak into public HTML.
 */

import { CmsItemStatus, Prisma, SiteStatus } from "@prisma/client";
import { prisma } from "@/server/db/prisma";

export const sitePublicRepository = {
  /** Resolve a site by its platform slug. Published only. */
  findSiteBySlug(slug: string) {
    return prisma.site.findFirst({
      where: { slug, status: SiteStatus.PUBLISHED, deletedAt: null },
    });
  },

  /**
   * Resolve a site by verified custom domain.
   *
   * Requires CONNECTED status: an unverified hostname must never serve a
   * tenant's site, or an attacker could point their own DNS at us and host
   * someone else's content under a domain they control.
   */
  async findSiteByHostname(hostname: string) {
    const domain = await prisma.siteDomain.findFirst({
      where: { hostname: hostname.toLowerCase(), status: "CONNECTED" },
      select: { siteId: true, isPrimary: true, redirectToPrimary: true },
    });
    if (!domain) return null;

    const site = await prisma.site.findFirst({
      where: { id: domain.siteId, status: SiteStatus.PUBLISHED, deletedAt: null },
    });
    return site ? { site, domain } : null;
  },

  /** Reviews for the site's linked location, for the reviews widget. */
  publishedReviews(tenantId: string, locationId: string | null, limit = 24) {
    return prisma.review.findMany({
      where: {
        tenantId,
        ...(locationId ? { locationId } : {}),
        isArchived: false,
        // Empty reviews render as blank cards, so they are excluded here rather
        // than filtered in the component.
        comment: { not: null },
      },
      select: {
        id: true,
        reviewerName: true,
        reviewerPhotoUrl: true,
        reviewerIsAnonymous: true,
        starRating: true,
        comment: true,
        reviewCreatedAt: true,
      },
      orderBy: [{ starRating: "desc" }, { reviewCreatedAt: "desc" }],
      take: limit,
    });
  },

  /** Aggregate rating across all reviews, not just the displayed subset. */
  async ratingSummary(tenantId: string, locationId: string | null) {
    const where: Prisma.ReviewWhereInput = {
      tenantId,
      ...(locationId ? { locationId } : {}),
      isArchived: false,
    };
    const [aggregate, total] = await Promise.all([
      prisma.review.aggregate({ where, _avg: { starRating: true } }),
      prisma.review.count({ where }),
    ]);
    return { average: aggregate._avg.starRating ?? 0, total };
  },

  location(locationId: string) {
    return prisma.location.findFirst({
      where: { id: locationId, deletedAt: null },
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        website: true,
        addressLine1: true,
        addressLine2: true,
        city: true,
        state: true,
        postalCode: true,
        country: true,
        latitude: true,
        longitude: true,
        googlePlaceId: true,
        timezone: true,
        workingHours: true,
      },
    });
  },

  collectionsForSite(siteId: string) {
    return prisma.cmsCollection.findMany({
      where: { siteId, deletedAt: null },
      select: { id: true, slug: true, name: true, detailPageId: true, fields: true },
    });
  },

  /** Published items only — drafts must never appear on a live site. */
  publishedItems(collectionId: string, limit = 48) {
    return prisma.cmsItem.findMany({
      where: {
        collectionId,
        deletedAt: null,
        status: CmsItemStatus.PUBLISHED,
      },
      select: {
        id: true,
        slug: true,
        title: true,
        excerpt: true,
        featuredImageUrl: true,
        publishedAt: true,
        data: true,
      },
      orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
      take: limit,
    });
  },

  publishedItemBySlug(collectionId: string, slug: string) {
    return prisma.cmsItem.findFirst({
      where: { collectionId, slug, deletedAt: null, status: CmsItemStatus.PUBLISHED },
    });
  },

  formsForSite(siteId: string) {
    return prisma.siteForm.findMany({
      where: { siteId, deletedAt: null },
      // `notifyEmails` is deliberately excluded: it is internal routing
      // configuration and would otherwise be serialised into public HTML.
      select: { id: true, name: true, slug: true, fields: true, successMessage: true },
    });
  },

  formById(siteId: string, formId: string) {
    return prisma.siteForm.findFirst({
      where: { id: formId, siteId, deletedAt: null },
    });
  },

  defaultFormForSite(siteId: string) {
    return prisma.siteForm.findFirst({
      where: { siteId, deletedAt: null },
      orderBy: { createdAt: "asc" },
    });
  },

  createSubmission(data: Prisma.SiteFormSubmissionUncheckedCreateInput) {
    return prisma.siteFormSubmission.create({ data });
  },

  incrementSubmissionCount(formId: string) {
    return prisma.siteForm.update({
      where: { id: formId },
      data: { submissionCount: { increment: 1 } },
    });
  },

  recordEvent(data: Prisma.SiteEventUncheckedCreateInput) {
    return prisma.siteEvent.create({ data });
  },

  /** Bulk insert for batched beacons. */
  recordEvents(rows: Prisma.SiteEventUncheckedCreateInput[]) {
    return prisma.siteEvent.createMany({ data: rows });
  },
};
