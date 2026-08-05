/**
 * Platform-subdomain smoke test.
 *
 * Exercises `resolvePublicPage()` directly rather than over HTTP: the
 * platform subdomain (`<slug>.SITES_ROOT_DOMAIN`) is env-gated, and the dev
 * server used by smoke-domain.mts already booted with whatever
 * SITES_ROOT_DOMAIN was in `.env` at startup — usually unset. Setting the env
 * var before importing anything in *this* process and calling the resolver
 * in-process tests the real routing logic without needing a second server.
 *
 * Run with: npm run smoke:subdomain
 */

process.env.SITES_ROOT_DOMAIN = "sites.smoketest.example";

const { PrismaClient, UserRole } = await import("@prisma/client");
const { siteService } = await import("../src/server/services/site.service");
const { siteAiService } = await import("../src/server/services/siteAi.service");
const { siteDomainService } = await import("../src/server/services/siteDomain.service");
const { resolvePublicPage } = await import("../src/server/services/sitePublic.service");
type AuthContext = import("../src/server/auth/requireSession").AuthContext;

const prisma = new PrismaClient();
const suffix = Date.now().toString(36);
const ROOT = "sites.smoketest.example";

let failures = 0;
function check(name: string, condition: boolean, detail?: string) {
  if (condition) console.log(`  ok   ${name}`);
  else {
    failures += 1;
    console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const tenantA = await prisma.tenant.create({
  data: { name: `Subdomain Smoke A ${suffix}`, slug: `subdomain-smoke-a-${suffix}`, industry: "Dental clinic" },
});
const tenantB = await prisma.tenant.create({
  data: { name: `Subdomain Smoke B ${suffix}`, slug: `subdomain-smoke-b-${suffix}`, industry: "Restaurant" },
});
const userA = await prisma.user.create({
  data: {
    tenantId: tenantA.id,
    firstName: "A",
    lastName: "Smoke",
    email: `subdomain-a-${suffix}@example.test`,
    role: UserRole.TENANT_OWNER,
  },
});
const userB = await prisma.user.create({
  data: {
    tenantId: tenantB.id,
    firstName: "B",
    lastName: "Smoke",
    email: `subdomain-b-${suffix}@example.test`,
    role: UserRole.TENANT_OWNER,
  },
});

const ctxA: AuthContext = {
  userId: userA.id,
  tenantId: tenantA.id,
  role: UserRole.TENANT_OWNER,
  sessionId: "smoke",
  email: userA.email,
  firstName: userA.firstName,
  lastName: userA.lastName,
};
const ctxB: AuthContext = {
  userId: userB.id,
  tenantId: tenantB.id,
  role: UserRole.TENANT_OWNER,
  sessionId: "smoke",
  email: userB.email,
  firstName: userB.firstName,
  lastName: userB.lastName,
};

try {
  console.log("\nSite creation + subdomain URL");
  const siteA = await siteService.create(ctxA, { name: `Subdomain Smoke A ${suffix}`, slug: `subdomain-a-${suffix}` });
  const siteB = await siteService.create(ctxB, { name: `Subdomain Smoke B ${suffix}`, slug: `subdomain-b-${suffix}` });

  const detailA = await siteService.get(ctxA, siteA.id);
  check(
    "site exposes its platform subdomain",
    detailA.subdomain === `subdomain-a-${suffix}.${ROOT}`,
    detailA.subdomain ?? "null",
  );
  check(
    "publicUrl prefers the subdomain over /s/<slug> when no custom domain exists",
    detailA.publicUrl === `https://${detailA.subdomain}`,
    detailA.publicUrl,
  );

  console.log("\nGlobal slug uniqueness");
  let conflicted = false;
  await siteService
    .create(ctxB, { name: "Collision attempt", slug: `subdomain-a-${suffix}` })
    .catch((err) => {
      conflicted = (err as { code?: string }).code === "CONFLICT";
    });
  check("a slug already used by another tenant is rejected", conflicted);

  console.log("\nReserved slugs");
  let reserved = false;
  await siteService.create(ctxA, { name: "www attempt", slug: "www" }).catch((err) => {
    reserved = (err as { code?: string }).code === "CONFLICT";
  });
  check('"www" is rejected as a reserved subdomain label', reserved);

  console.log("\nPublishing + resolution via the subdomain");
  await siteAiService.generate(ctxA, siteA.id, {
    prompt: "A dental clinic website.",
    replaceExisting: true,
  });
  await siteAiService.generate(ctxB, siteB.id, {
    prompt: "A restaurant website.",
    replaceExisting: true,
  });
  await siteService.publish(ctxA, siteA.id, {});
  await siteService.publish(ctxB, siteB.id, {});

  const hostA = `subdomain-a-${suffix}.${ROOT}`;
  const viaSubdomain = await resolvePublicPage({ host: hostA, path: "/" });
  check("platform subdomain resolves to the right site", viaSubdomain?.site.id === siteA.id);
  check(
    "platform subdomain serves links at the root, not /s/<slug>",
    viaSubdomain?.ctx.basePath === "",
    viaSubdomain?.ctx.basePath,
  );
  check(
    "platform subdomain sets the canonical origin to itself",
    viaSubdomain?.origin === `https://${hostA}`,
    viaSubdomain?.origin,
  );
  check("platform subdomain never redirects on its own", viaSubdomain?.redirectTo === null);

  const inner = detailA.pages.find((p) => !p.isHome);
  if (inner) {
    const viaSubdomainInner = await resolvePublicPage({ host: hostA, path: inner.path });
    check(`platform subdomain serves an inner page (${inner.path})`, Boolean(viaSubdomainInner));
  }

  console.log("\nCross-tenant isolation");
  const hostB = `subdomain-b-${suffix}.${ROOT}`;
  const viaSubdomainB = await resolvePublicPage({ host: hostB, path: "/" });
  check("the second tenant's subdomain resolves to ITS OWN site", viaSubdomainB?.site.id === siteB.id);
  check(
    "tenant A's subdomain never resolves to tenant B's site",
    viaSubdomain?.site.id !== viaSubdomainB?.site.id,
  );

  console.log("\nUnknown / malformed subdomains");
  const unknownLabel = await resolvePublicPage({ host: `does-not-exist.${ROOT}`, path: "/" });
  check("an unregistered slug label 404s rather than falling through", unknownLabel === null);

  const bareRoot = await resolvePublicPage({ host: ROOT, path: "/" });
  check("a request for the bare root domain (no label) does not resolve", bareRoot === null);

  const twoLevels = await resolvePublicPage({ host: `a.b.${ROOT}`, path: "/" });
  check("a two-level subdomain label does not resolve (wildcard cert covers one level)", twoLevels === null);

  console.log("\nCoexistence with a real custom domain");
  const customHost = `custom-${suffix}.example`;
  await prisma.siteDomain.create({
    data: {
      siteId: siteA.id,
      tenantId: tenantA.id,
      hostname: customHost,
      isPrimary: true,
      verificationToken: "smoke",
      status: "CONNECTED",
      sslStatus: "ACTIVE",
      verifiedAt: new Date(),
    },
  });

  const viaCustomNow = await resolvePublicPage({ host: customHost, path: "/" });
  check("the custom domain resolves once connected and primary", Boolean(viaCustomNow));
  check(
    "a connected primary custom domain outranks the subdomain for canonical origin",
    viaCustomNow?.origin === `https://${customHost}`,
    viaCustomNow?.origin,
  );

  const viaSubdomainStill = await resolvePublicPage({ host: hostA, path: "/" });
  check(
    "the free subdomain keeps working after a custom domain is connected",
    Boolean(viaSubdomainStill),
  );
  check(
    "the subdomain never gets redirected away just because a primary domain exists elsewhere",
    viaSubdomainStill?.redirectTo === null,
  );

  console.log("\nReserved hostname rejection");
  let rootRejected = false;
  await siteDomainService.add(ctxA, siteA.id, { hostname: ROOT, isPrimary: false, redirectToPrimary: false }).catch((err) => {
    rootRejected = (err as { code?: string }).code === "VALIDATION_ERROR";
  });
  check("SITES_ROOT_DOMAIN itself cannot be added as a custom domain", rootRejected);

  let subdomainOfRootRejected = false;
  await siteDomainService
    .add(ctxA, siteA.id, { hostname: `sneaky.${ROOT}`, isPrimary: false, redirectToPrimary: false })
    .catch((err) => {
      subdomainOfRootRejected = (err as { code?: string }).code === "VALIDATION_ERROR";
    });
  check(
    "a subdomain of SITES_ROOT_DOMAIN cannot be claimed as a custom domain",
    subdomainOfRootRejected,
  );
} finally {
  await prisma.tenant.deleteMany({ where: { id: { in: [tenantA.id, tenantB.id] } } }).catch((err) => {
    console.error("Cleanup failed — remove tenants manually:", tenantA.id, tenantB.id, err);
  });
  await prisma.$disconnect();
}

if (failures > 0) {
  console.error(`\n${failures} check(s) FAILED`);
  process.exit(1);
}
console.log("\nSubdomain routing smoke test passed.");
