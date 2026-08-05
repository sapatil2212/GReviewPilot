/**
 * Assembles everything a public page needs, in one pass.
 *
 * Called once per request by the public route. Deliberately batches all data
 * fetching here rather than letting components fetch for themselves: a page
 * with a navbar, a reviews grid, a map, opening hours, and a blog list would
 * otherwise issue five or more round trips and could not be cached as a unit.
 */

import { Prisma, SitePageStatus } from "@prisma/client";
import { sitePublicRepository } from "@/server/repositories/sitePublic.repository";
import { sitePageRepository } from "@/server/repositories/sitePage.repository";
import { siteDomainRepository } from "@/server/repositories/siteDomain.repository";
import { env, placesApiEnabled } from "@/server/utils/env";
import { normalizeDocument } from "@/site/document/operations";
import { createTheme } from "@/site/document/theme";
import { themeSchema } from "@/server/validators/site.schema";
import type {
  BrandContext,
  RenderContext,
  SeoMeta,
  SiteDocument,
  SiteRenderData,
  ThemeTokens,
} from "@/site/document/types";
import { findNodesByType } from "@/site/document/operations";

function readJson<T>(value: Prisma.JsonValue | null | undefined, fallback: T): T {
  if (value === null || value === undefined) return fallback;
  if (typeof value !== "object" || Array.isArray(value)) return fallback;
  return value as unknown as T;
}

export interface ResolvedSitePage {
  site: {
    id: string;
    tenantId: string;
    name: string;
    slug: string;
    logoUrl: string | null;
    faviconUrl: string | null;
    locationId: string | null;
  };
  page: {
    id: string;
    title: string;
    path: string;
    noIndex: boolean;
  };
  ctx: RenderContext;
  seo: SeoMeta;
  settings: {
    googleAnalyticsId?: string;
    googleTagManagerId?: string;
    searchConsoleVerification?: string;
    customHeadHtml?: string;
    hidePlatformBranding?: boolean;
  };
  /** Absolute canonical origin, custom domain if one is connected. */
  origin: string;
  /** Set when this hostname should 301 to the primary domain. */
  redirectTo: string | null;
}

/**
 * Internal marker middleware uses to signal a host-addressed request.
 * Mirrors DOMAIN_SLUG_PREFIX in middleware.ts, duplicated because that module
 * is Edge-only and importing it here would pull Edge code into the Node bundle.
 */
const DOMAIN_SLUG_PREFIX = "_d~";

/**
 * Split a route's `[slug]` segment into either a platform slug or a hostname.
 *
 * Middleware rewrites `https://clinic.com/services` to
 * `/s/_d~clinic.com/services`, so the renderer needs to know which of the two
 * addressing modes it is in.
 */
export function parseSiteSlug(slug: string): { slug?: string; host?: string } {
  if (slug.startsWith(DOMAIN_SLUG_PREFIX)) {
    const host = slug.slice(DOMAIN_SLUG_PREFIX.length).toLowerCase();
    return host ? { host } : {};
  }
  return { slug };
}

/**
 * True when `host` is `<slug>.SITES_ROOT_DOMAIN` — the free platform address
 * every site gets, the same idea as a Lovable/Vercel/Bolt preview URL.
 *
 * Unlike a tenant-owned custom domain, this needs no DNS verification: the
 * platform controls SITES_ROOT_DOMAIN's DNS (a wildcard record) and its
 * wildcard TLS certificate, so the hostname itself already proves the request
 * legitimately reached this deployment.
 */
function platformSubdomainSlug(host: string): string | null {
  const root = env.SITES_ROOT_DOMAIN.toLowerCase();
  if (!root || host === root || !host.endsWith(`.${root}`)) return null;
  const label = host.slice(0, -(root.length + 1));
  // A wildcard cert covers exactly one level of subdomain; a request for
  // `a.b.SITES_ROOT_DOMAIN` is not a valid site address.
  return label && !label.includes(".") ? label : null;
}

/**
 * Resolve a hostname to its site, trying the platform subdomain first and a
 * verified custom domain second.
 *
 * Shared by the sitemap/robots routes and `resolvePublicPage()` so the three
 * places that need "does this host serve a site" agree by construction rather
 * than by two independent implementations staying in sync.
 */
export async function findSiteForHost(host: string) {
  const subdomainSlug = platformSubdomainSlug(host);
  if (subdomainSlug) return sitePublicRepository.findSiteBySlug(subdomainSlug);
  return (await sitePublicRepository.findSiteByHostname(host))?.site ?? null;
}

/**
 * Resolve a request into a fully-rendered page context.
 *
 * Resolution order: platform subdomain, then a verified custom domain, then a
 * platform slug (/s/<slug>) — all three ultimately key off the same globally
 * unique `Site.slug` or a CONNECTED `SiteDomain` row, so exactly one site can
 * ever answer for a given request.
 */
export async function resolvePublicPage(input: {
  slug?: string;
  host?: string | null;
  path: string;
}): Promise<ResolvedSitePage | null> {
  let site = null;
  let matchedDomain: { isPrimary: boolean; redirectToPrimary: boolean } | null = null;
  // The platform subdomain behaves like a domain for basePath/origin purposes
  // (links are at the root, not under /s/<slug>) but is never eligible for a
  // redirect-to-primary, since it has no concept of "primary" of its own.
  let isPlatformSubdomain = false;

  if (input.host) {
    const subdomainSlug = platformSubdomainSlug(input.host);
    if (subdomainSlug) {
      site = await sitePublicRepository.findSiteBySlug(subdomainSlug);
      isPlatformSubdomain = Boolean(site);
    } else {
      const byHost = await sitePublicRepository.findSiteByHostname(input.host);
      if (byHost) {
        site = byHost.site;
        matchedDomain = byHost.domain;
      }
    }
    // A host-addressed request that does not resolve must 404 rather than fall
    // through to a slug lookup — otherwise an unverified domain pointed at us
    // could serve an arbitrary tenant's site.
    if (!site) return null;
  }
  if (!site && input.slug) {
    site = await sitePublicRepository.findSiteBySlug(input.slug);
  }
  if (!site) return null;

  const path = normalizeRequestPath(input.path);

  // A page must be published AND carry a snapshot; drafts are invisible.
  const page = await sitePageRepository.findPublished(site.id, path);
  if (!page) return null;

  const document = normalizeDocument(
    readJson<SiteDocument>(page.publishedDocument ?? page.document, {
      version: 1,
      root: "root",
      nodes: {},
    }),
  );

  const brand = readJson<BrandContext>(site.brand, {});
  const settings = readJson<Record<string, unknown>>(site.settings, {});
  const siteSeo = readJson<SeoMeta>(site.seo, {});
  const pageSeo = readJson<SeoMeta>(page.seo, {});

  const themeParsed = themeSchema.safeParse(site.theme);
  const theme: ThemeTokens = themeParsed.success
    ? (themeParsed.data as ThemeTokens)
    : createTheme({ industry: site.industry });

  // Only fetch data for components the page actually contains. A contact page
  // with no reviews widget should not query the reviews table.
  const needs = {
    reviews: findNodesByType(document, "GoogleReviews").length > 0,
    location:
      findNodesByType(document, "Map").length > 0 ||
      findNodesByType(document, "OpeningHours").length > 0 ||
      findNodesByType(document, "Footer").length > 0,
    collections: findNodesByType(document, "CollectionList").length > 0,
    forms: findNodesByType(document, "Form").length > 0,
  };

  const [pages, reviewData, location, collections, forms, primaryDomain] = await Promise.all([
    sitePageRepository.listPublishedMeta(site.id),
    needs.reviews
      ? Promise.all([
          sitePublicRepository.publishedReviews(site.tenantId, site.locationId),
          sitePublicRepository.ratingSummary(site.tenantId, site.locationId),
        ])
      : Promise.resolve(null),
    needs.location && site.locationId
      ? sitePublicRepository.location(site.locationId)
      : Promise.resolve(null),
    needs.collections ? loadCollections(site.id) : Promise.resolve({}),
    needs.forms ? loadForms(site.id) : Promise.resolve({}),
    siteDomainRepository.findPrimary(site.id),
  ]);

  // A connected custom domain is the strongest canonical signal (the tenant
  // deliberately set it up); the free platform subdomain is next; /s/<slug>
  // on APP_URL is the fallback when neither exists.
  const origin = primaryDomain
    ? `https://${primaryDomain.hostname}`
    : isPlatformSubdomain
      ? `https://${input.host}`
      : env.APP_URL.replace(/\/$/, "");

  // Serve one canonical hostname: a non-primary CUSTOM domain flagged for
  // redirect sends a 301 so search engines do not index duplicate content.
  // The platform subdomain is never redirected away from on its own — once a
  // tenant connects a real domain and makes it primary, NEW visits to the
  // subdomain still work (it is a free extra address, not deprecated), they
  // simply are not the canonical URL search engines are pointed at.
  const redirectTo =
    matchedDomain && !matchedDomain.isPrimary && matchedDomain.redirectToPrimary && primaryDomain
      ? `https://${primaryDomain.hostname}${path === "/" ? "" : path}`
      : null;

  /**
   * Internal links are relative to the addressing mode, not to whether a
   * primary domain happens to exist. On a custom domain OR the platform
   * subdomain the site is at the root, so links must be bare paths; on the
   * platform host they need the /s/<slug> prefix. Keying this off
   * `primaryDomain` instead of `matchedDomain`/`isPlatformSubdomain` would emit
   * /s/<slug> links on a custom domain whose primary was never set.
   */
  const basePath = matchedDomain || isPlatformSubdomain ? "" : `/s/${site.slug}`;

  const data: SiteRenderData = {
    ...(reviewData
      ? {
          reviews: reviewData[0].map((r) => ({
            id: r.id,
            authorName: r.reviewerIsAnonymous ? "Google user" : (r.reviewerName ?? "Google user"),
            authorPhotoUrl: r.reviewerIsAnonymous ? null : r.reviewerPhotoUrl,
            rating: r.starRating,
            comment: r.comment,
            createdAt: r.reviewCreatedAt.toISOString(),
          })),
          ratingSummary: reviewData[1],
        }
      : {}),
    writeReviewUrl: location?.googlePlaceId
      ? `https://search.google.com/local/writereview?placeid=${location.googlePlaceId}`
      : null,
    location: location
      ? {
          ...location,
          // Prisma Decimal does not survive the server/client boundary, so
          // coordinates are converted before they reach a client component.
          latitude: location.latitude ? Number(location.latitude) : null,
          longitude: location.longitude ? Number(location.longitude) : null,
          workingHours: readJson<Record<string, Array<{ open: string; close: string }>>>(
            location.workingHours,
            {},
          ),
        }
      : null,
    collections,
    forms,
    socialLinks: (settings.socialLinks as Record<string, string> | undefined) ?? {},
    // Absent when unconfigured, so the Map component renders its address
    // fallback instead of an error frame.
    mapsApiKey: placesApiEnabled ? env.GOOGLE_MAPS_API_KEY : null,
  };

  const ctx: RenderContext = {
    document,
    theme,
    brand,
    pages: pages.map((p) => ({
      id: p.id,
      title: p.title,
      path: p.path,
      hiddenInNav: p.hiddenInNav,
    })),
    basePath,
    data,
    editor: false,
    submitEndpoint: `/api/site/${site.slug}/submit`,
    trackEndpoint: `/api/site/${site.slug}/track`,
  };

  return {
    site: {
      id: site.id,
      tenantId: site.tenantId,
      name: site.name,
      slug: site.slug,
      logoUrl: site.logoUrl,
      faviconUrl: site.faviconUrl,
      locationId: site.locationId,
    },
    page: {
      id: page.id,
      title: page.title,
      path: page.path,
      noIndex: page.noIndex,
    },
    ctx,
    // Page SEO overrides site defaults field by field, so a page only has to
    // specify what differs.
    seo: { ...siteSeo, ...pageSeo },
    settings,
    origin,
    redirectTo,
  };
}

async function loadCollections(siteId: string): Promise<SiteRenderData["collections"]> {
  const collections = await sitePublicRepository.collectionsForSite(siteId);
  const entries = await Promise.all(
    collections.map(async (collection) => {
      const items = await sitePublicRepository.publishedItems(collection.id);
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
            data: readJson<Record<string, unknown>>(item.data, {}),
          })),
        },
      ] as const;
    }),
  );
  return Object.fromEntries(entries);
}

async function loadForms(siteId: string): Promise<SiteRenderData["forms"]> {
  const forms = await sitePublicRepository.formsForSite(siteId);
  return Object.fromEntries(
    forms.map((form) => [
      form.id,
      {
        id: form.id,
        name: form.name,
        successMessage: form.successMessage,
        fields: readJson<
          Array<{
            key: string;
            label: string;
            kind: string;
            required?: boolean;
            placeholder?: string;
            options?: string[];
            helpText?: string;
          }>
        >(form.fields, []),
      },
    ]),
  );
}

/** Normalize an incoming request path to the stored form. */
export function normalizeRequestPath(path: string): string {
  let p = (path || "/").toLowerCase();
  if (!p.startsWith("/")) p = `/${p}`;
  p = p.replace(/\/{2,}/g, "/");
  if (p.length > 1) p = p.replace(/\/+$/, "");
  return p || "/";
}

/** Published pages for sitemap generation. */
export async function sitemapEntries(siteId: string) {
  const pages = await sitePageRepository.listPublishedMeta(siteId);
  return pages
    .filter((p) => !p.noIndex && p.status === SitePageStatus.PUBLISHED)
    .map((p) => ({
      path: p.path,
      lastModified: p.publishedAt ?? p.updatedAt,
      // The home page is the most important URL, and top-level pages outrank
      // nested ones. Derived from depth so it needs no manual curation.
      priority: p.isHome ? 1 : Math.max(0.3, 0.8 - (p.path.split("/").length - 2) * 0.2),
    }));
}
