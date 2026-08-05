/**
 * Public site renderer.
 *
 * A server component, deliberately: the rendered HTML must contain the real
 * headings, copy, and JSON-LD when a crawler fetches it. A client-rendered
 * builder output would defeat the entire SEO module.
 *
 * Route shape `/s/[slug]/[[...path]]` handles the platform-hosted URL. Custom
 * domains reach the same code through a rewrite in middleware.ts, so there is
 * exactly one rendering path regardless of how a visitor arrived.
 */

import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import Script from "next/script";
import { SiteRenderer } from "@/site/render/SiteRenderer";
import { googleFontsHref } from "@/site/document/theme";
import { parseSiteSlug, resolvePublicPage } from "@/server/services/sitePublic.service";

interface PageProps {
  params: Promise<{ slug: string; path?: string[] }>;
}

/**
 * Revalidate rather than render per request.
 *
 * Published pages change only on publish, so caching them is what makes the
 * builder's Core Web Vitals claims achievable. 5 minutes keeps a publish
 * visible quickly without hammering the database for every visitor.
 */
export const revalidate = 300;
export const dynamicParams = true;

function pathFrom(segments?: string[]): string {
  if (!segments || segments.length === 0) return "/";
  return `/${segments.join("/")}`;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug, path } = await params;
  const resolved = await resolvePublicPage({ ...parseSiteSlug(slug), path: pathFrom(path) });
  if (!resolved) return { title: "Page not found" };

  const { seo, site, page, origin, ctx } = resolved;
  const canonical = seo.canonical ?? `${origin}${ctx.basePath}${page.path === "/" ? "" : page.path}`;
  const title = seo.title ?? `${page.title} | ${site.name}`;
  const description = seo.description ?? undefined;

  return {
    title,
    description,
    ...(seo.keywords?.length ? { keywords: seo.keywords } : {}),
    alternates: { canonical },
    // A page marked noIndex must also not be followed, or crawlers will still
    // discover and weight the links on it.
    robots: {
      index: !page.noIndex && !seo.noIndex,
      follow: !seo.noFollow,
    },
    openGraph: {
      type: "website",
      siteName: site.name,
      title: seo.ogTitle ?? title,
      description: seo.ogDescription ?? description,
      url: canonical,
      ...(seo.ogImage ? { images: [{ url: seo.ogImage }] } : {}),
    },
    twitter: {
      card: seo.twitterCard ?? "summary_large_image",
      title: seo.ogTitle ?? title,
      description: seo.ogDescription ?? description,
      ...(seo.ogImage ? { images: [seo.ogImage] } : {}),
    },
    ...(site.faviconUrl ? { icons: { icon: site.faviconUrl } } : {}),
    ...(resolved.settings.searchConsoleVerification
      ? { verification: { google: resolved.settings.searchConsoleVerification } }
      : {}),
  };
}

export default async function PublicSitePage({ params }: PageProps) {
  const { slug, path } = await params;
  const resolved = await resolvePublicPage({ ...parseSiteSlug(slug), path: pathFrom(path) });
  if (!resolved) notFound();

  // Non-canonical hostnames redirect so search engines index one URL.
  if (resolved.redirectTo) permanentRedirect(resolved.redirectTo);

  const { ctx, site, page, settings } = resolved;
  const fontsHref = googleFontsHref(ctx.theme);
  const jsonLd = buildJsonLd(resolved);

  return (
    <>
      {fontsHref && (
        <>
          {/* Preconnect before the stylesheet request so the font handshake
              overlaps with HTML parsing instead of blocking after it. */}
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
          <link rel="stylesheet" href={fontsHref} />
        </>
      )}

      <script
        type="application/ld+json"
        // Structured data must be in the initial HTML for crawlers to see it.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <SiteRenderer ctx={ctx} />

      {settings.googleAnalyticsId && (
        <>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${settings.googleAnalyticsId}`}
            strategy="afterInteractive"
          />
          <Script id="ga-init" strategy="afterInteractive">
            {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${settings.googleAnalyticsId}');`}
          </Script>
        </>
      )}

      {settings.googleTagManagerId && (
        <Script id="gtm-init" strategy="afterInteractive">
          {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${settings.googleTagManagerId}');`}
        </Script>
      )}

      {/* First-party page view. Fires after hydration so it does not compete
          with the critical render path. */}
      <Script id="sb-pageview" strategy="afterInteractive">
        {`(function(){try{fetch(${JSON.stringify(`/api/site/${site.slug}/track`)},{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'PAGE_VIEW',path:${JSON.stringify(page.path)},referrer:document.referrer||undefined}),keepalive:true}).catch(function(){});}catch(e){}})();`}
      </Script>

      {/* Verified head snippet, injected last so it can override site styles. */}
      {settings.customHeadHtml && (
        <div
          style={{ display: "none" }}
          dangerouslySetInnerHTML={{ __html: settings.customHeadHtml }}
        />
      )}

    </>
  );
}

/**
 * schema.org JSON-LD.
 *
 * This is the highest-leverage SEO output for a local business: it is what
 * populates the rating stars, opening hours, and address in Google's results.
 * Built from the site's real linked data, so it stays accurate automatically.
 */
function buildJsonLd(resolved: Awaited<ReturnType<typeof resolvePublicPage>>) {
  if (!resolved) return {};
  const { ctx, site, seo, origin, page } = resolved;
  const location = ctx.data.location;
  const summary = ctx.data.ratingSummary;

  const graph: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": seo.schemaType ?? "LocalBusiness",
    name: ctx.brand.businessName ?? site.name,
    url: `${origin}${ctx.basePath || ""}` || origin,
    ...(seo.description ? { description: seo.description } : {}),
    ...(site.logoUrl ? { logo: site.logoUrl, image: site.logoUrl } : {}),
    ...(location?.phone ? { telephone: location.phone } : {}),
    ...(location?.email ? { email: location.email } : {}),
  };

  if (location?.addressLine1) {
    graph.address = {
      "@type": "PostalAddress",
      streetAddress: [location.addressLine1, location.addressLine2].filter(Boolean).join(", "),
      addressLocality: location.city ?? undefined,
      addressRegion: location.state ?? undefined,
      postalCode: location.postalCode ?? undefined,
      addressCountry: location.country ?? undefined,
    };
  }

  if (location?.latitude && location?.longitude) {
    graph.geo = {
      "@type": "GeoCoordinates",
      latitude: location.latitude,
      longitude: location.longitude,
    };
  }

  // Only emit aggregateRating with real reviews behind it. Google penalises
  // structured data that does not match visible page content.
  if (summary && summary.total > 0) {
    graph.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: Number(summary.average.toFixed(1)),
      reviewCount: summary.total,
      bestRating: 5,
      worstRating: 1,
    };
  }

  if (location?.workingHours && Object.keys(location.workingHours).length > 0) {
    const days = [
      "Sunday",
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
    ];
    const spec: unknown[] = [];
    for (const [dayIndex, ranges] of Object.entries(location.workingHours)) {
      for (const range of ranges ?? []) {
        spec.push({
          "@type": "OpeningHoursSpecification",
          dayOfWeek: `https://schema.org/${days[Number(dayIndex)] ?? "Monday"}`,
          opens: range.open,
          closes: range.close,
        });
      }
    }
    if (spec.length > 0) graph.openingHoursSpecification = spec;
  }

  if (ctx.data.socialLinks && Object.keys(ctx.data.socialLinks).length > 0) {
    graph.sameAs = Object.values(ctx.data.socialLinks);
  }

  // A breadcrumb trail on inner pages gives Google the site hierarchy.
  if (page.path !== "/") {
    graph.breadcrumb = {
      "@type": "BreadcrumbList",
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: "Home",
          item: `${origin}${ctx.basePath || ""}` || origin,
        },
        {
          "@type": "ListItem",
          position: 2,
          name: page.title,
          item: `${origin}${ctx.basePath}${page.path}`,
        },
      ],
    };
  }

  return graph;
}
