/**
 * GET /.well-known/greviewpilot-domain-check
 *
 * Routing proof for custom domains. Returns the verification token of the
 * SiteDomain matching the request's Host header, so a fetch to
 * `http://clinic.com/.well-known/greviewpilot-domain-check` returning the
 * expected token proves the hostname reaches this deployment.
 *
 * Why this exists alongside the DNS record check: comparing the domain's A record
 * against SITE_APEX_IP only works when traffic comes straight to our IP. Any
 * tenant behind Cloudflare, a load balancer, or a provider that flattens CNAMEs
 * resolves to somebody else's address, so the record check reports "not pointing
 * here" for a domain that is in fact working. An end-to-end request is both more
 * permissive for those setups and a stronger proof for everyone else — it
 * confirms traffic actually arrives rather than that a record looks right.
 *
 * Public by necessity: it is probed before any certificate exists, over plain
 * HTTP, and by us rather than by an authenticated client. It discloses only the
 * token of a domain someone already controls enough to point at us, and the token
 * is meaningless without also owning the DNS zone.
 */

import { headers } from "next/headers";
import { siteDomainRepository } from "@/server/repositories/siteDomain.repository";
import { logger } from "@/server/utils/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const headerList = await headers();
  // The Host header is what nginx forwards and what middleware routes on, so it
  // is the same value the rest of the custom-domain path keys off.
  const host = (headerList.get("host") ?? "").split(":")[0].toLowerCase();

  if (!host) {
    return new Response("no host", { status: 400, headers: { "Content-Type": "text/plain" } });
  }

  const domain = await siteDomainRepository.findByHostname(host).catch((err) => {
    logger.error("Domain check lookup failed", { host, err: String(err) });
    return null;
  });

  if (!domain) {
    // A hostname we have no record of. 404 rather than an error: this is the
    // expected answer for the platform's own host and for probes.
    return new Response("unknown host", {
      status: 404,
      headers: { "Content-Type": "text/plain", "Cache-Control": "no-store" },
    });
  }

  return new Response(domain.verificationToken, {
    status: 200,
    headers: {
      "Content-Type": "text/plain",
      // Must never be cached: a stale answer would let a domain appear routed
      // after it had been repointed away.
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  });
}
