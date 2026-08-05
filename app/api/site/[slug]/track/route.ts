/**
 * POST /api/site/[slug]/track
 *
 * First-party, cookieless analytics for published sites.
 *
 * ---------------------------------------------------------------------
 * Privacy design
 * ---------------------------------------------------------------------
 * No cookies are set and no raw IP is stored. Visitor and session ids are
 * salted SHA-256 hashes of (IP + user agent + day), which means:
 *   - repeat views within a day are recognisably the same visitor
 *   - the hash cannot be reversed to an IP
 *   - the identifier rotates automatically at midnight, so it cannot be used
 *     to build a long-term profile
 *
 * That keeps the analytics module useful for the tenant while avoiding the
 * consent-banner obligations that a persistent tracking cookie would create.
 */

import type { NextRequest } from "next/server";
import { createHash } from "node:crypto";
import { sitePublicRepository } from "@/server/repositories/sitePublic.repository";
import { trackEventSchema } from "@/server/validators/site.schema";
import { callerKey, checkRateLimit } from "@/server/middleware/rateLimit";
import { extractRequestContext } from "@/server/middleware/requestContext";
import { env } from "@/server/utils/env";
import { ok } from "@/server/utils/response";

export const runtime = "nodejs";

type Params = { params: Promise<{ slug: string }> };

function dailyHash(parts: Array<string | null | undefined>, salt: string): string {
  return createHash("sha256")
    .update([...parts.map((p) => p ?? ""), salt, env.AUTH_SECRET].join("|"))
    .digest("hex")
    .slice(0, 32);
}

/** Coarse device bucket from the parsed user agent. */
function deviceBucket(device: string | null): string {
  if (!device) return "unknown";
  if (device === "mobile" || device === "tablet") return device;
  return "desktop";
}

/** Group referrers into readable acquisition sources. */
function classifySource(referrer: string | null, host: string | null): string {
  if (!referrer) return "direct";
  try {
    const url = new URL(referrer);
    if (host && url.host === host) return "internal";
    const h = url.host.replace(/^www\./, "");
    if (/google\./.test(h)) return "google";
    if (/bing\.|duckduckgo\.|yahoo\./.test(h)) return "search";
    if (/facebook\.|instagram\.|t\.co|twitter\.|x\.com|linkedin\.|pinterest\./.test(h)) {
      return "social";
    }
    if (/wa\.me|whatsapp\./.test(h)) return "whatsapp";
    return h.slice(0, 120);
  } catch {
    return "direct";
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  // Analytics must never surface an error to a visitor or block a page, so
  // every failure path returns 200. A dropped event is strictly better than a
  // console error on the tenant's live site.
  try {
    const { slug } = await params;

    checkRateLimit({ key: `site-track:${callerKey(req)}`, max: 240, windowMs: 60 * 1000 });

    const site = await sitePublicRepository.findSiteBySlug(slug);
    if (!site) return ok({ recorded: false });

    const body = await req.json().catch(() => null);
    const parsed = trackEventSchema.safeParse(body);
    if (!parsed.success) return ok({ recorded: false });
    const input = parsed.data;

    const request = extractRequestContext(req);
    const today = new Date().toISOString().slice(0, 10);
    const host = req.headers.get("host");

    const visitorId = dailyHash([request.ipAddress, request.userAgent, today], "visitor");
    // Session rotates on a 30-minute bucket, the standard web-analytics window.
    const sessionBucket = Math.floor(Date.now() / (30 * 60 * 1000));
    const sessionId = dailyHash([visitorId, String(sessionBucket)], "session");

    const referrer = input.referrer ?? req.headers.get("referer");

    await sitePublicRepository.recordEvent({
      siteId: site.id,
      tenantId: site.tenantId,
      type: input.type,
      path: input.path?.slice(0, 300) ?? null,
      visitorId,
      sessionId,
      referrer: referrer?.slice(0, 500) ?? null,
      source: classifySource(referrer ?? null, host),
      device: deviceBucket(request.device),
      // Vercel and Cloudflare both expose the resolved country, which is
      // coarse enough not to be personal data.
      country:
        req.headers.get("x-vercel-ip-country")?.slice(0, 2) ??
        req.headers.get("cf-ipcountry")?.slice(0, 2) ??
        null,
      meta: (input.meta ?? {}) as object,
    });

    return ok({ recorded: true });
  } catch {
    return ok({ recorded: false });
  }
}
