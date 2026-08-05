/**
 * GET /s/[slug]/robots.txt
 *
 * Per-site robots file, also served at `https://<custom-domain>/robots.txt`.
 *
 * An unpublished or unknown site returns a blanket Disallow rather than a 404:
 * a 404 on robots.txt makes crawlers assume everything is permitted, which is
 * the opposite of what a draft site needs.
 */

import { sitePublicRepository } from "@/server/repositories/sitePublic.repository";
import { siteDomainRepository } from "@/server/repositories/siteDomain.repository";
import { findSiteForHost, parseSiteSlug } from "@/server/services/sitePublic.service";
import { env } from "@/server/utils/env";

export const runtime = "nodejs";
export const revalidate = 3600;

const DISALLOW_ALL = "User-agent: *\nDisallow: /\n";

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
    return new Response(DISALLOW_ALL, {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const primary = await siteDomainRepository.findPrimary(site.id);
  const origin = parsed.host
    ? `https://${parsed.host}`
    : primary
      ? `https://${primary.hostname}`
      : env.APP_URL.replace(/\/$/, "");
  const basePath = parsed.host ? "" : `/s/${site.slug}`;

  const body = [
    "User-agent: *",
    "Allow: /",
    "",
    `Sitemap: ${origin}${basePath}/sitemap.xml`,
    "",
  ].join("\n");

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
