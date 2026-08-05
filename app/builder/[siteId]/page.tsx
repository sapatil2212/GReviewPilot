/**
 * Builder route.
 *
 * Lives at /builder rather than under /dashboard because the editor needs the
 * whole viewport: the dashboard layout imposes a sidebar, a header, and a
 * max-width container, none of which a full-bleed canvas can work inside.
 *
 * Protected by middleware.ts (the /builder prefix) and again by
 * `requireSession()` here, matching the defence-in-depth pattern used by the
 * private API routes.
 */

import { notFound, redirect } from "next/navigation";
import { tryGetSession } from "@/server/auth/requireSession";
import { can } from "@/server/permissions/permissions";
import { siteService } from "@/server/services/site.service";
import { sitePageService } from "@/server/services/sitePage.service";
import { sitePublicRepository } from "@/server/repositories/sitePublic.repository";
import { placesApiEnabled, env } from "@/server/utils/env";
import { BuilderShell } from "@/components/builder/BuilderShell";
import type { SiteRenderData } from "@/site/document/types";
import type { SiteDetailDto, SitePageDto } from "@/lib/api/site";

interface BuilderPageProps {
  params: Promise<{ siteId: string }>;
  searchParams: Promise<{ pageId?: string }>;
}

export const dynamic = "force-dynamic";

export default async function BuilderPage({ params, searchParams }: BuilderPageProps) {
  const { siteId } = await params;
  const { pageId } = await searchParams;

  const ctx = await tryGetSession();
  if (!ctx) redirect(`/auth?callbackUrl=/builder/${siteId}`);
  if (!can(ctx.role, "site:read")) redirect("/dashboard");

  const site = await siteService.get(ctx, siteId).catch(() => null);
  if (!site) notFound();

  // Default to the requested page, else home, else the first page.
  const target =
    site.pages.find((p) => p.id === pageId) ??
    site.pages.find((p) => p.isHome) ??
    site.pages[0];
  if (!target) notFound();

  const page = await sitePageService.get(ctx, site.id, target.id);

  // Preview data for the smart components. Fetched here so the canvas shows
  // real reviews and hours rather than empty placeholders — the editor should
  // look like the published page.
  const renderData = await loadPreviewData(ctx.tenantId, site.id, site.locationId);

  return (
    <BuilderShell
      site={site as unknown as SiteDetailDto}
      page={page as unknown as SitePageDto}
      renderData={renderData}
    />
  );
}

async function loadPreviewData(
  tenantId: string,
  siteId: string,
  locationId: string | null,
): Promise<SiteRenderData> {
  const [reviews, summary, location, forms, collections] = await Promise.all([
    sitePublicRepository.publishedReviews(tenantId, locationId, 12).catch(() => []),
    sitePublicRepository.ratingSummary(tenantId, locationId).catch(() => ({ average: 0, total: 0 })),
    locationId ? sitePublicRepository.location(locationId).catch(() => null) : Promise.resolve(null),
    sitePublicRepository.formsForSite(siteId).catch(() => []),
    sitePublicRepository.collectionsForSite(siteId).catch(() => []),
  ]);

  const collectionItems = await Promise.all(
    collections.map(async (collection) => {
      const items = await sitePublicRepository.publishedItems(collection.id, 6).catch(() => []);
      return [
        collection.id,
        {
          slug: collection.slug,
          items: items.map((item) => ({
            id: item.id,
            slug: item.slug,
            title: item.title,
            excerpt: item.excerpt,
            featuredImageUrl: item.featuredImageUrl,
            publishedAt: item.publishedAt?.toISOString() ?? null,
          })),
        },
      ] as const;
    }),
  );

  return {
    reviews: reviews.map((r) => ({
      id: r.id,
      authorName: r.reviewerIsAnonymous ? "Google user" : (r.reviewerName ?? "Google user"),
      authorPhotoUrl: r.reviewerIsAnonymous ? null : r.reviewerPhotoUrl,
      rating: r.starRating,
      comment: r.comment,
      createdAt: r.reviewCreatedAt.toISOString(),
    })),
    ratingSummary: summary,
    writeReviewUrl: location?.googlePlaceId
      ? `https://search.google.com/local/writereview?placeid=${location.googlePlaceId}`
      : null,
    location: location
      ? {
          ...location,
          // Prisma Decimal cannot cross the server/client boundary.
          latitude: location.latitude ? Number(location.latitude) : null,
          longitude: location.longitude ? Number(location.longitude) : null,
          workingHours:
            (location.workingHours as Record<
              string,
              Array<{ open: string; close: string }>
            > | null) ?? {},
        }
      : null,
    forms: Object.fromEntries(
      forms.map((form) => [
        form.id,
        {
          id: form.id,
          name: form.name,
          successMessage: form.successMessage,
          fields:
            (form.fields as Array<{
              key: string;
              label: string;
              kind: string;
              required?: boolean;
              placeholder?: string;
              options?: string[];
              helpText?: string;
            }>) ?? [],
        },
      ]),
    ),
    collections: Object.fromEntries(collectionItems),
    mapsApiKey: placesApiEnabled ? env.GOOGLE_MAPS_API_KEY : null,
  };
}
