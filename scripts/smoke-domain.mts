/**
 * Custom-domain routing smoke test.
 *
 * Requires the dev server on http://localhost:3000.
 *
 * DNS cannot be controlled from a test, so the domain rows are marked CONNECTED
 * directly in the database and requests are issued to localhost with an
 * overridden Host header. That is exactly what the middleware inspects, so the
 * routing path under test is the real one — only the DNS verification step is
 * bypassed.
 *
 * Run with: npm run smoke:domain
 */

import http from "node:http";
import { PrismaClient, SiteDomainStatus, SiteSslStatus, UserRole } from "@prisma/client";
import { siteService } from "../src/server/services/site.service";
import { siteAiService } from "../src/server/services/siteAi.service";
import type { AuthContext } from "../src/server/auth/requireSession";

const HOST = process.env.SMOKE_HOST ?? "127.0.0.1";
const PORT = Number(process.env.SMOKE_PORT ?? 3000);
const prisma = new PrismaClient();
const suffix = Date.now().toString(36);

const primaryHost = `smoke-${suffix}.example`;
const aliasHost = `www.smoke-${suffix}.example`;

let failures = 0;
function check(name: string, condition: boolean, detail?: string) {
  if (condition) console.log(`  ok   ${name}`);
  else {
    failures += 1;
    console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

interface Result {
  status: number;
  location: string | null;
  body: string;
}

/**
 * Request the dev server while presenting an arbitrary Host header.
 *
 * Uses node:http rather than fetch because undici treats `host` as a forbidden
 * header and silently replaces it with the connection target — which would make
 * every custom-domain assertion here test localhost instead.
 */
function request(
  path: string,
  host?: string,
  method = "GET",
  payload?: string,
): Promise<Result> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: HOST,
        port: PORT,
        path,
        method,
        headers: {
          ...(host ? { Host: host } : {}),
          ...(payload
            ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) }
            : {}),
        },
      },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          body += chunk;
        });
        res.on("end", () =>
          resolve({
            status: res.statusCode ?? 0,
            location: (res.headers.location as string | undefined) ?? null,
            body,
          }),
        );
      },
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

const get = (path: string, host?: string) => request(path, host);

const tenant = await prisma.tenant.create({
  data: { name: `Domain Smoke ${suffix}`, slug: `domain-smoke-${suffix}`, industry: "Dental clinic" },
});
const user = await prisma.user.create({
  data: {
    tenantId: tenant.id,
    firstName: "Domain",
    lastName: "Smoke",
    email: `domain-${suffix}@example.test`,
    role: UserRole.TENANT_OWNER,
  },
});

const ctx: AuthContext = {
  userId: user.id,
  tenantId: tenant.id,
  role: UserRole.TENANT_OWNER,
  sessionId: "smoke",
  email: user.email,
  firstName: user.firstName,
  lastName: user.lastName,
};

try {
  // Confirm the dev server is up before asserting anything about routing.
  const ping = await get("/s/definitely-not-a-site").catch(() => null);
  if (!ping) {
    console.error(
      `Dev server not reachable at http://${HOST}:${PORT}. Start it with: npm run dev`,
    );
    process.exit(1);
  }
  check("dev server reachable", ping.status === 404, String(ping.status));

  console.log("\nSetup");
  const site = await siteService.create(ctx, { name: `Domain Smoke ${suffix}` });
  await siteAiService.generate(ctx, site.id, {
    prompt: "A dental clinic website.",
    replaceExisting: true,
  });
  await siteService.publish(ctx, site.id, {});
  check("site published", true);

  // Two domains: a primary, and an alias set to redirect to it.
  const primary = await prisma.siteDomain.create({
    data: {
      siteId: site.id,
      tenantId: tenant.id,
      hostname: primaryHost,
      isPrimary: true,
      verificationToken: "smoke",
      status: SiteDomainStatus.CONNECTED,
      sslStatus: SiteSslStatus.ACTIVE,
      verifiedAt: new Date(),
    },
  });
  await prisma.siteDomain.create({
    data: {
      siteId: site.id,
      tenantId: tenant.id,
      hostname: aliasHost,
      isPrimary: false,
      redirectToPrimary: true,
      verificationToken: "smoke",
      status: SiteDomainStatus.CONNECTED,
      sslStatus: SiteSslStatus.ACTIVE,
      verifiedAt: new Date(),
    },
  });
  check("domains connected", Boolean(primary.id));

  console.log("\nPlatform host still works");
  const viaSlug = await get(`/s/${site.slug}`);
  check("/s/<slug> serves the site", viaSlug.status === 200, String(viaSlug.status));
  check(
    "/s/<slug> emits slug-prefixed internal links",
    viaSlug.body.includes(`/s/${site.slug}`),
  );
  const dashboard = await get("/dashboard/website");
  check("dashboard still gated on the platform host", dashboard.status === 307, String(dashboard.status));

  console.log("\nCustom domain routing");
  const viaDomain = await get("/", primaryHost);
  check("custom domain serves the home page", viaDomain.status === 200, String(viaDomain.status));
  check(
    "custom domain renders real content",
    viaDomain.body.includes("<h1") && viaDomain.body.length > 2000,
    `${viaDomain.body.length} bytes`,
  );
  check(
    "custom domain does NOT emit /s/<slug> links",
    !viaDomain.body.includes(`/s/${site.slug}`),
  );
  check(
    "custom domain sets a canonical on its own host",
    viaDomain.body.includes(`https://${primaryHost}`),
  );

  // Derived from the site rather than hardcoded. A literal "/services" quietly
  // encoded a bug: the tenant industry is "Dental clinic", which used to resolve
  // to the *clinic* blueprint, and clinic happens to have a /services page.
  // Once industry resolution was fixed to pick the dental blueprint the path
  // became /treatments and this assertion failed — testing the blueprint's page
  // names rather than the routing it is meant to cover.
  const innerPage = (await prisma.sitePage.findFirst({
    where: { siteId: site.id, isHome: false, deletedAt: null, publishedAt: { not: null } },
    orderBy: { sortOrder: "asc" },
    select: { path: true },
  }))?.path;
  check("site has a published inner page to test", Boolean(innerPage), String(innerPage));

  const inner = await get(innerPage ?? "/", primaryHost);
  check(
    `custom domain serves an inner page (${innerPage})`,
    inner.status === 200,
    String(inner.status),
  );

  const missing = await get("/nope-not-here", primaryHost);
  check("custom domain 404s an unknown path", missing.status === 404, String(missing.status));

  console.log("\nDashboard is not reachable on a custom domain");
  const leaked = await get("/dashboard/website", primaryHost);
  check(
    "dashboard is rewritten away (404, not the app)",
    leaked.status === 404,
    String(leaked.status),
  );

  console.log("\nCanonical redirect");
  const alias = await get("/", aliasHost);
  check("alias domain 301s to primary", alias.status === 308 || alias.status === 301, String(alias.status));
  check(
    "alias redirect targets the primary host",
    Boolean(alias.location?.includes(primaryHost)),
    alias.location ?? "(none)",
  );

  console.log("\nSEO files");
  const sitemapDomain = await get("/sitemap.xml", primaryHost);
  check("custom domain serves sitemap.xml", sitemapDomain.status === 200, String(sitemapDomain.status));
  check(
    "sitemap uses the custom domain",
    sitemapDomain.body.includes(`https://${primaryHost}/`),
  );
  check(
    "sitemap does not leak /s/<slug>",
    !sitemapDomain.body.includes(`/s/${site.slug}`),
  );
  check("sitemap lists several pages", (sitemapDomain.body.match(/<loc>/g) ?? []).length >= 4);

  const robots = await get("/robots.txt", primaryHost);
  check("custom domain serves robots.txt", robots.status === 200, String(robots.status));
  check("robots points at the sitemap", robots.body.includes(`https://${primaryHost}/sitemap.xml`));

  const sitemapSlug = await get(`/s/${site.slug}/sitemap.xml`);
  check("platform sitemap works too", sitemapSlug.status === 200, String(sitemapSlug.status));
  check(
    "platform sitemap uses the primary domain as origin",
    sitemapSlug.body.includes(primaryHost),
  );

  console.log("\nUnverified domains are not served");
  await prisma.siteDomain.update({
    where: { id: primary.id },
    data: { status: SiteDomainStatus.PENDING },
  });
  const unverified = await get("/", primaryHost);
  check(
    "a PENDING domain is not served",
    unverified.status === 404,
    String(unverified.status),
  );

  console.log("\nPlatform API still reachable on a custom domain");
  const track = await request(
    `/api/site/${site.slug}/track`,
    primaryHost,
    "POST",
    JSON.stringify({ type: "PAGE_VIEW", path: "/" }),
  );
  check("analytics endpoint is not rewritten away", track.status === 200, String(track.status));

  // ACME HTTP-01 validation fetches this path over plain HTTP on the tenant's
  // own hostname. It used to be rewritten into the site renderer, which served
  // the tenant's 404 page and made certificate issuance fail for every custom
  // domain whenever this app is the origin behind the TLS terminator.
  console.log("\nACME challenge path is not swallowed by site routing");
  const acme = await get("/.well-known/acme-challenge/smoke-token", primaryHost);
  check(
    "challenge path is not rewritten into the site renderer",
    // 404 from Next's own router is fine — the point is that it must not be
    // handled by /s/<slug>, which would render the site's HTML instead.
    !acme.body.includes("<html") || !acme.body.includes(site.name),
    `status=${acme.status} servedSiteHtml=${acme.body.includes(site.name)}`,
  );

  console.log("\nSSL reconciliation");
  await prisma.siteDomain.update({
    where: { id: primary.id },
    data: {
      status: SiteDomainStatus.CONNECTED,
      sslStatus: SiteSslStatus.PENDING,
      sslExpiresAt: null,
      sslIssuedAt: null,
    },
  });

  const { reconcileCertificate } = await import("../src/server/services/siteDomain.service");
  const row = await prisma.siteDomain.findUniqueOrThrow({ where: { id: primary.id } });
  const reconciled = await reconcileCertificate(row);

  // *.example is reserved by RFC 2606 and resolves nowhere, so this exercises
  // the "connected but nothing serving HTTPS yet" path — the state a real domain
  // sits in for the first few minutes.
  check(
    "an unreachable host stays PENDING rather than being marked FAILED",
    reconciled.summary.sslStatus === SiteSslStatus.PENDING,
    reconciled.summary.sslStatus,
  );
  check(
    "the reason is recorded for the tenant",
    reconciled.summary.summary.length > 0 && !reconciled.summary.valid,
    reconciled.summary.summary,
  );
  const afterReconcile = await prisma.siteDomain.findUniqueOrThrow({ where: { id: primary.id } });
  check(
    "lastCheckedAt is stamped so staleness is visible",
    afterReconcile.lastCheckedAt !== null,
  );
  check(
    "sslIssuedAt is NOT set when no certificate exists",
    afterReconcile.sslIssuedAt === null,
  );

  // A domain that was never routed must not be reported as pending issuance.
  // Addressed by hostname because the alias row is created without being bound
  // to a variable, and `alias` above is an HTTP response, not the DB row.
  await prisma.siteDomain.update({
    where: { hostname: aliasHost },
    data: { status: SiteDomainStatus.PENDING, sslStatus: SiteSslStatus.NONE },
  });
  const aliasRow = await prisma.siteDomain.findUniqueOrThrow({
    where: { hostname: aliasHost },
  });
  const aliasResult = await reconcileCertificate(aliasRow);
  check(
    "an unrouted domain stays NONE rather than claiming issuance is in progress",
    aliasResult.summary.sslStatus === SiteSslStatus.NONE,
    aliasResult.summary.sslStatus,
  );

  console.log("\nSSL monitor job");
  const { runSslMonitor: runSslMonitorFn } = await import(
    "../src/server/services/sslMonitor.service"
  );
  const report = await runSslMonitorFn({ hostname: primaryHost });
  check("monitor checked the domain", report.checked === 1, String(report.checked));
  check("monitor completed without per-domain errors", report.errors === 0, String(report.errors));
  check(
    "an unreachable connected domain counts as pending, not failed",
    report.pending === 1 && report.failed === 0,
    `pending=${report.pending} failed=${report.failed}`,
  );

  console.log("\nSSL monitor cron endpoint is protected");
  const unauth = await request("/api/cron/ssl-monitor", undefined, "POST");
  check(
    "rejects a call with no cron credentials",
    unauth.status === 401 || unauth.status === 503,
    String(unauth.status),
  );

  // -------------------------------------------------------------------
  // Routing proof via HTTP, for tenants behind a proxy whose address can
  // never equal SITE_APEX_IP.
  // -------------------------------------------------------------------
  console.log("\nRouting proof endpoint");
  await prisma.siteDomain.update({
    where: { id: primary.id },
    data: { status: SiteDomainStatus.CONNECTED },
  });
  const proofRow = await prisma.siteDomain.findUniqueOrThrow({ where: { id: primary.id } });

  const proof = await get("/.well-known/greviewpilot-domain-check", primaryHost);
  check(
    "returns the domain's verification token for its own Host",
    proof.status === 200 && proof.body.trim() === proofRow.verificationToken,
    `status=${proof.status} body=${proof.body.trim().slice(0, 40)}`,
  );

  const proofUnknown = await get("/.well-known/greviewpilot-domain-check", "not-our-domain.example");
  check("404s for a hostname we have no record of", proofUnknown.status === 404, String(proofUnknown.status));

  // The platform's own host must not leak a token either.
  const proofPlatform = await get("/.well-known/greviewpilot-domain-check");
  check("404s on the platform host", proofPlatform.status === 404, String(proofPlatform.status));

  // -------------------------------------------------------------------
  // Automatic re-verification. Previously nothing advanced a domain unless a
  // user pressed Verify, so DNS that went live later was never noticed.
  // -------------------------------------------------------------------
  console.log("\nAutomatic re-verification");
  const { evaluateDomain, reverifyDomain } = await import(
    "../src/server/services/siteDomain.service"
  );

  await prisma.siteDomain.update({
    where: { id: primary.id },
    data: { status: SiteDomainStatus.PENDING, verifiedAt: null, lastError: null },
  });
  const pendingRow = await prisma.siteDomain.findUniqueOrThrow({ where: { id: primary.id } });

  // *.example resolves nowhere, so neither proof can succeed. The domain must
  // stay pending with an explanation rather than being marked connected or failed.
  const evaluation = await evaluateDomain(pendingRow);
  check(
    "an unresolvable domain is not considered connected",
    evaluation.connected === false,
    JSON.stringify({ routingOk: evaluation.routingOk, ownershipOk: evaluation.ownershipOk }),
  );
  check(
    "neither DNS nor the HTTP probe reports success",
    evaluation.recordMatches === false && evaluation.reachability.reached === false,
  );
  check("a reason is produced for the tenant", Boolean(evaluation.lastError), evaluation.lastError ?? "");

  const reverified = await reverifyDomain(pendingRow);
  const afterReverify = await prisma.siteDomain.findUniqueOrThrow({ where: { id: primary.id } });
  check(
    "re-verification persists the outcome without a user session",
    afterReverify.lastCheckedAt !== null && afterReverify.status === reverified.status,
    `status=${afterReverify.status}`,
  );
  check(
    "an unresolvable domain is not silently marked verified",
    afterReverify.verifiedAt === null,
  );

  // The sweep must pick up PENDING domains at all — the gap that made the whole
  // flow depend on a user clicking a button.
  const sweep = await runSslMonitorFn({ hostname: primaryHost });
  check(
    "the scheduled sweep processes PENDING domains",
    sweep.checked === 1,
    `checked=${sweep.checked}`,
  );
  check(
    "an unresolvable PENDING domain counts as pending, not failed",
    sweep.pending === 1 && sweep.failed === 0,
    `pending=${sweep.pending} failed=${sweep.failed}`,
  );

  // -------------------------------------------------------------------
  // Concurrent provisioning must not start two ACME orders.
  // -------------------------------------------------------------------
  // -------------------------------------------------------------------
  // DNS instructions handed to the tenant. These are the values a customer
  // types into GoDaddy/Hostinger, so a wrong one is invisible here and breaks
  // every domain.
  // -------------------------------------------------------------------
  console.log("\nDNS instructions");
  const { buildDnsRecords } = await import("../src/server/services/siteDomain.service");

  const apexRecords = buildDnsRecords({
    hostname: "restaurant.in",
    verificationToken: "greviewpilot-verify=test",
  } as never);
  const subRecords = buildDnsRecords({
    hostname: "www.restaurant.in",
    verificationToken: "greviewpilot-verify=test",
  } as never);

  const apexRouting = apexRecords.find((r) => r.purpose === "routing");
  const subRouting = subRecords.find((r) => r.purpose === "routing");

  check("apex gets an A record at @", apexRouting?.type === "A" && apexRouting?.name === "@");
  check("subdomain gets a CNAME at the leftmost label", subRouting?.type === "CNAME" && subRouting?.name === "www");

  // A CNAME value is a bare DNS name. This previously rendered "localhost:3000"
  // because the platform host was read with .host instead of .hostname.
  check(
    "CNAME value has no port",
    !subRouting?.value.includes(":"),
    subRouting?.value,
  );
  check(
    "CNAME value is not an IP address",
    !/^\d{1,3}(\.\d{1,3}){3}$/.test(subRouting?.value ?? ""),
    subRouting?.value,
  );
  check(
    "A record value is an IP address",
    /^\d{1,3}(\.\d{1,3}){3}$/.test(apexRouting?.value ?? ""),
    apexRouting?.value,
  );

  // Exactly one record must be mandatory: pointing it at us already proves zone
  // control, so demanding a TXT as well was a step that bought nothing.
  check(
    "apex requires exactly one record",
    apexRecords.filter((r) => !r.optional).length === 1,
    String(apexRecords.filter((r) => !r.optional).length),
  );
  check(
    "subdomain requires exactly one record",
    subRecords.filter((r) => !r.optional).length === 1,
    String(subRecords.filter((r) => !r.optional).length),
  );
  check(
    "the TXT record is marked optional",
    apexRecords.find((r) => r.purpose === "verification")?.optional === true,
  );

  // -------------------------------------------------------------------
  // Observations must survive a reload, or the table reads "Not checked"
  // immediately after a check that did run.
  // -------------------------------------------------------------------
  console.log("\nCheck results persist");
  // Imported here and reused by the www-alias section below. Declaring it there
  // instead put this reference in the temporal dead zone of the same scope.
  const { siteDomainService } = await import("../src/server/services/siteDomain.service");
  const listed = await siteDomainService.list(ctx, site.id);
  const listedPrimary = listed.find((d) => d.hostname === primaryHost);
  check("domain is listed", Boolean(listedPrimary));
  const listedRouting = listedPrimary?.dnsRecords.find((r) => r.purpose === "routing");
  check(
    "a previously-checked record reports a matched verdict, not null",
    listedRouting !== undefined && listedRouting.matched !== null,
    `matched=${String(listedRouting?.matched)}`,
  );
  check(
    "observed values are carried through",
    Array.isArray(listedRouting?.found),
    JSON.stringify(listedRouting?.found),
  );

  // -------------------------------------------------------------------
  // www alias created alongside an apex domain.
  // -------------------------------------------------------------------
  console.log("\nwww alias");
  const aliasApex = `alias-${suffix}.example`;

  const added = await siteDomainService.add(ctx, site.id, {
    hostname: aliasApex,
    isPrimary: false,
    redirectToPrimary: false,
    addWwwAlias: true,
  });
  check("apex domain created", added.hostname === aliasApex, added.hostname);
  check("www alias reported back", added.alias?.hostname === `www.${aliasApex}`, String(added.alias?.hostname));

  const wwwAliasRow = await prisma.siteDomain.findUnique({
    where: { hostname: `www.${aliasApex}` },
  });
  check("alias row exists", wwwAliasRow !== null);
  check("alias redirects to the primary", wwwAliasRow?.redirectToPrimary === true);
  check("alias is not itself primary", wwwAliasRow?.isPrimary === false);
  check(
    "alias gets its own verification token",
    Boolean(wwwAliasRow?.verificationToken) &&
      wwwAliasRow?.verificationToken !== added.verificationToken,
  );
  // A www hostname must not spawn www.www.
  const noDouble = await siteDomainService.add(ctx, site.id, {
    hostname: `www2.${suffix}.example`,
    isPrimary: false,
    redirectToPrimary: false,
    addWwwAlias: true,
  });
  check("alias created for a non-www subdomain too", noDouble.alias !== null);
  const wwwInput = await siteDomainService.add(ctx, site.id, {
    hostname: `www.direct-${suffix}.example`,
    isPrimary: false,
    redirectToPrimary: false,
    addWwwAlias: true,
  });
  check(
    "a www.* hostname does not get a www.www.* alias",
    wwwInput.alias === null,
    String(wwwInput.alias),
  );

  // The generated vhost for the alias must redirect rather than proxy.
  const { nginxManager } = await import("../src/server/services/nginx/nginxManager.service");
  const aliasVhost = nginxManager.preview({
    hostname: `www.${aliasApex}`,
    certPath: "/tmp/fullchain.pem",
    keyPath: "/tmp/privkey.pem",
    redirectTo: aliasApex,
  });
  check(
    "alias vhost redirects to the apex",
    aliasVhost.includes(`return 308 https://${aliasApex}$request_uri;`),
  );

  console.log("\nProvisioning concurrency");
  const { provisionCertificate, provisioningEnabled } = await import(
    "../src/server/services/sslProvisioning.service"
  );
  const [a, b] = await Promise.all([
    provisionCertificate(afterReverify),
    provisionCertificate(afterReverify),
  ]);
  check(
    "two simultaneous requests produce one identical result",
    a.action === b.action && a.reason === b.reason,
    `${a.action} / ${b.action}`,
  );
  check(
    "provisioning is skipped when disabled or DNS is unverified",
    a.action === "skipped",
    `${a.action}: ${a.reason} (provisioning ${provisioningEnabled() ? "on" : "off"})`,
  );
} finally {
  await prisma.tenant.delete({ where: { id: tenant.id } }).catch((err) => {
    console.error("Cleanup failed — remove tenant manually:", tenant.id, err);
  });
  await prisma.$disconnect();
}

if (failures > 0) {
  console.error(`\n${failures} check(s) FAILED`);
  process.exit(1);
}
console.log("\nDomain routing smoke test passed.");
