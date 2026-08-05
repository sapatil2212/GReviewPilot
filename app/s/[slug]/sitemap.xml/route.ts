/**
 * GET /s/[slug]/sitemap.xml
 *
 * Per-site sitemap. Also serves `https://<custom-domain>/sitemap.xml` via the
 * middleware rewrite, so the URLs it advertises always match the host the
 * crawler used — advertising /s/<slug> URLs on a custom domain would split
 * ranking signals across two hostnames.
 *
 * A route handler rather than Next's `sitemap.ts` convention because the site
 * is resolved per request from a slug or hostname, which the file-based
 * convention cannot express.
 */

import { sitePublicRepository } from "@/server/repositories/sitePublic.repository";
import { siteDomainRepository } from "@/server/repositories/siteDomain.repository";
import {
  findSiteForHost,
  parseSiteSlug,
  sitemapEntries,
} from "@/server/services/sitePublic.service";
import { env } from "@/server/utils/env";

export const runtime = "nodejs";
export const revalidate = 3600;

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const parsed = parseSiteSlug(slug);

  const site = parsed.host
    ? await findSiteForHost(parsed.host)
    : parsed.slug
      ? await sitePublicRepository.findSiteBySlug(parsed.slug)
      : null;

  if (!site) {
    return new Response("Not found", { status: 404 });
  }

  const primary = await siteDomainRepository.findPrimary(site.id);

  // Prefer the host the request came in on, so a site reachable at both
  // /s/<slug> and a custom domain (or the platform subdomain) advertises
  // self-consistent URLs.
  const origin = parsed.host
    ? `https://${parsed.host}`
    : primary
      ? `https://${primary.hostname}`
      : env.APP_URL.replace(/\/$/, "");
  const basePath = parsed.host ? "" : `/s/${site.slug}`;

  const entries = await sitemapEntries(site.id);

  const urls = entries
    .map((entry) => {
      const loc = `${origin}${basePath}${entry.path === "/" ? "" : entry.path}` || origin;
      return [
        "  <url>",
        `    <loc>${escapeXml(loc || `${origin}/`)}</loc>`,
        `    <lastmod>${entry.lastModified.toISOString()}</lastmod>`,
        `    <priority>${entry.priority.toFixed(1)}</priority>`,
        "  </url>",
      ].join("\n");
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
