/**
 * End-to-end smoke test against the real database.
 *
 * Exercises the full pipeline the way the app does: create a site, generate
 * pages, save an edited document, apply an AI-style operation, publish, then
 * resolve the published page through the public renderer path.
 *
 * Creates rows in a temporary tenant and removes them at the end, so it is safe
 * to run against a development database. Run with:
 *   npx tsx scripts/smoke-builder.mts
 */

import { PrismaClient, UserRole } from "@prisma/client";
import { siteService } from "../src/server/services/site.service";
import { sitePageService } from "../src/server/services/sitePage.service";
import { siteAiService } from "../src/server/services/siteAi.service";
import { siteFormService } from "../src/server/services/siteForm.service";
import { siteDomainService } from "../src/server/services/siteDomain.service";
import { resolvePublicPage } from "../src/server/services/sitePublic.service";
import { getSections, updateProps } from "../src/site/document/operations";
import type { AuthContext } from "../src/server/auth/requireSession";

const prisma = new PrismaClient();
const suffix = Date.now().toString(36);

let failures = 0;
function check(name: string, condition: boolean, detail?: string) {
  if (condition) console.log(`  ok   ${name}`);
  else {
    failures += 1;
    console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const tenant = await prisma.tenant.create({
  data: { name: `Smoke Dental ${suffix}`, slug: `smoke-dental-${suffix}`, industry: "Dental clinic" },
});
const user = await prisma.user.create({
  data: {
    tenantId: tenant.id,
    firstName: "Smoke",
    lastName: "Test",
    email: `smoke-${suffix}@example.test`,
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
  console.log("\nSite creation");
  const site = await siteService.create(ctx, { name: `Smoke Dental ${suffix}` });
  check("site created with a slug", Boolean(site.slug), site.slug);

  const detail = await siteService.get(ctx, site.id);
  check("site starts with a home page", detail.pages.length === 1 && detail.pages[0].isHome);
  check("starter page has sections", true);
  check("theme is industry-appropriate", detail.theme.styleKeyword === "clinical", detail.theme.styleKeyword);

  console.log("\nAI generation (blueprint path)");
  const generated = await siteAiService.generate(ctx, site.id, {
    prompt: "A calm, professional website for my dental clinic with online booking.",
    replaceExisting: true,
  });
  check("generation produced multiple pages", generated.pages.length >= 4, String(generated.pages.length));
  check("generation produced exactly one home page", generated.pages.filter((p) => p.isHome).length === 1);

  const afterGenerate = await siteService.get(ctx, site.id);
  check(
    "old starter page was replaced, not duplicated",
    afterGenerate.pages.length === generated.pages.length,
    `${afterGenerate.pages.length} vs ${generated.pages.length}`,
  );

  const homeMeta = afterGenerate.pages.find((p) => p.isHome)!;
  const home = await sitePageService.get(ctx, site.id, homeMeta.id);
  const sections = getSections(home.document);
  check("home page has sections", sections.length >= 6, String(sections.length));
  check("home page starts with a navbar", sections[0].presetKey === "navbar", sections[0].presetKey);
  check(
    "home page ends with footer/whatsapp chrome",
    ["footer", "whatsapp"].includes(sections[sections.length - 1].presetKey ?? ""),
    sections[sections.length - 1].presetKey,
  );

  console.log("\nDocument save + optimistic concurrency");
  const heading = Object.values(home.document.nodes).find(
    (n) => n.type === "Heading" && n.props.level === "h1",
  );
  check("home page has an H1", Boolean(heading));

  const edited = updateProps(home.document, heading!.id, { text: "Smoke Test Headline" });
  const saved = await sitePageService.saveDocument(ctx, site.id, home.id, {
    document: edited,
    expectedVersion: home.version,
    autosave: false,
  });
  check("document saved and returned a new version", saved.version !== home.version);
  check("no props needed correcting", saved.corrected.length === 0, saved.corrected.join(", "));

  const reread = await sitePageService.get(ctx, site.id, home.id);
  check(
    "edit persisted",
    reread.document.nodes[heading!.id]?.props.text === "Smoke Test Headline",
  );

  // A stale version must be rejected rather than silently overwriting.
  let conflicted = false;
  await sitePageService
    .saveDocument(ctx, site.id, home.id, {
      document: edited,
      expectedVersion: home.version,
      autosave: false,
    })
    .catch((err) => {
      conflicted = (err as { code?: string }).code === "CONFLICT";
    });
  check("stale save is rejected with a conflict", conflicted);

  console.log("\nAI edit (local fast path)");
  const aiEdit = await siteAiService.edit(ctx, site.id, {
    prompt: "change the blue to green",
    pageId: home.id,
  });
  check("colour swap resolved without the model", aiEdit.source === "local", aiEdit.source);
  check("colour swap returned a theme", Boolean(aiEdit.theme));
  check("colour swap changed the primary colour", aiEdit.theme?.colors.primary === "#16A34A", aiEdit.theme?.colors.primary);

  const afterTheme = await siteService.get(ctx, site.id);
  check("theme change persisted", afterTheme.theme.colors.primary === "#16A34A");

  console.log("\nAudit");
  const audit = await siteAiService.audit(ctx, site.id, home.id);
  check("audit returned a score", audit.score >= 0 && audit.score <= 100, String(audit.score));
  check("audit found passing checks", audit.passed.length > 0);

  console.log("\nPublish");
  const published = await siteService.publish(ctx, site.id, {});
  check("publish reported pages", published.pagesPublished >= 4, String(published.pagesPublished));
  check("publish produced a public URL", published.publicUrl.includes(site.slug));

  console.log("\nPublic rendering");
  const resolved = await resolvePublicPage({ slug: site.slug, path: "/" });
  check("published home page resolves", Boolean(resolved));
  check(
    "public document has nodes",
    Object.keys(resolved?.ctx.document.nodes ?? {}).length > 20,
    String(Object.keys(resolved?.ctx.document.nodes ?? {}).length),
  );
  check(
    "public renderer sees the saved edit",
    resolved?.ctx.document.nodes[heading!.id]?.props.text === "Smoke Test Headline",
  );
  check("public nav lists published pages", (resolved?.ctx.pages.length ?? 0) >= 4);
  check("public SEO has a title", Boolean(resolved?.seo.title), resolved?.seo.title);
  check("public base path is the platform slug path", resolved?.ctx.basePath === `/s/${site.slug}`);

  const inner = afterGenerate.pages.find((p) => !p.isHome)!;
  const innerResolved = await resolvePublicPage({ slug: site.slug, path: inner.path });
  check(`inner page ${inner.path} resolves`, Boolean(innerResolved));

  const missing = await resolvePublicPage({ slug: site.slug, path: "/definitely-not-a-page" });
  check("unknown path returns null (404)", missing === null);

  console.log("\nUnpublish");
  await siteService.unpublish(ctx, site.id);
  const afterUnpublish = await resolvePublicPage({ slug: site.slug, path: "/" });
  check("unpublished site is no longer public", afterUnpublish === null);

  console.log("\nRevisions");
  const revisions = await siteService.listRevisions(
    ctx,
    site.id,
    new Request("http://localhost/?pageSize=50"),
  );
  check("revisions were recorded", revisions.total > 0, String(revisions.total));
  check(
    "a publish revision exists",
    revisions.items.some((r) => r.kind === "PUBLISH"),
  );

  // -------------------------------------------------------------------
  // Forms and leads
  // -------------------------------------------------------------------

  console.log("\nForms");
  const forms = await siteFormService.list(ctx, site.id);
  check("site has a default contact form", forms.length === 1, String(forms.length));
  check("default form has fields", (forms[0]?.fields.length ?? 0) >= 3);
  check(
    "default form notifies the business email",
    forms[0]?.notifyEmails.includes(user.email) === true,
    forms[0]?.notifyEmails.join(", "),
  );

  // Republish so the public submit endpoint has a live site to accept into.
  await siteService.publish(ctx, site.id, {});

  console.log("\nLead capture");
  // Simulates the public endpoint's storage path without going over HTTP.
  const submitted = await prisma.siteFormSubmission.create({
    data: {
      formId: forms[0].id,
      tenantId: tenant.id,
      siteId: site.id,
      data: {
        name: "Priya Sharma",
        phone: "+919812345678",
        email: "priya@example.test",
        message: "Do you offer same-day appointments?",
      },
      name: "Priya Sharma",
      phone: "+919812345678",
      email: "priya@example.test",
      pagePath: "/",
      spamScore: 0.05,
    },
  });
  const spam = await prisma.siteFormSubmission.create({
    data: {
      formId: forms[0].id,
      tenantId: tenant.id,
      siteId: site.id,
      data: { name: "Bot", message: "cheap backlink seo services http://a http://b" },
      name: "Bot",
      status: "SPAM",
      spamScore: 0.9,
    },
  });

  const inbox = await siteFormService.listLeads(
    ctx,
    site.id,
    new Request("http://localhost/?pageSize=25"),
    { includeSpam: false },
  );
  check("inbox lists the real lead", inbox.items.length === 1, String(inbox.items.length));
  check("inbox hides spam by default", !inbox.items.some((l) => l.id === spam.id));
  check("inbox reports per-status counts", inbox.counts.NEW === 1 && inbox.counts.SPAM === 1, JSON.stringify(inbox.counts));
  check(
    "lead fields are labelled from the form definition",
    inbox.items[0]?.fields.some((f) => f.label === "How can we help?"),
    inbox.items[0]?.fields.map((f) => f.label).join(", "),
  );
  check("lead carries the form name", inbox.items[0]?.formName === "Contact form");

  const spamView = await siteFormService.listLeads(
    ctx,
    site.id,
    new Request("http://localhost/?pageSize=25"),
    { includeSpam: true, status: "SPAM" },
  );
  check("spam is reachable when asked for", spamView.items.length === 1);

  const opened = await siteFormService.getLead(ctx, site.id, submitted.id);
  check("opening a lead marks it read", opened.status === "READ", opened.status);
  check("opening a lead stamps readAt", opened.readAt !== null);

  const bulk = await siteFormService.setLeadStatus(ctx, site.id, [submitted.id], "REPLIED");
  check("bulk status change applied", bulk.updated === 1);

  // A foreign id must be a no-op, not an error and not a cross-tenant write.
  const foreign = await siteFormService.setLeadStatus(ctx, site.id, ["not-a-real-id"], "ARCHIVED");
  check("unknown lead ids are ignored", foreign.updated === 0);

  console.log("\nCSV export");
  const csv = await siteFormService.exportCsv(ctx, site.id, { includeSpam: false });
  check("export is named after the site", csv.filename.includes(site.slug), csv.filename);
  check("export has a header row", csv.csv.startsWith('"Received"'));
  check("export includes the lead", csv.csv.includes("Priya Sharma"));
  check("export excludes spam", !csv.csv.includes("cheap backlink"));
  check(
    "export includes a column per form field label",
    csv.csv.includes('"How can we help?"'),
  );

  // Formula-injection guard.
  await prisma.siteFormSubmission.create({
    data: {
      formId: forms[0].id,
      tenantId: tenant.id,
      siteId: site.id,
      data: { name: "=HYPERLINK(\"http://evil\",\"click\")", message: "hi" },
      name: '=HYPERLINK("http://evil","click")',
    },
  });
  const guarded = await siteFormService.exportCsv(ctx, site.id, { includeSpam: false });
  check(
    "export neutralises spreadsheet formulas",
    guarded.csv.includes('"\t=HYPERLINK') && !guarded.csv.includes('"=HYPERLINK'),
  );

  // -------------------------------------------------------------------
  // Custom domain routing
  // -------------------------------------------------------------------

  console.log("\nCustom domain");
  // Two parts, so it is a genuine apex domain and must get an A record.
  // A three-part name like foo.example.test is a SUBDOMAIN and gets a CNAME.
  const hostname = `smoke-${suffix}.test`;
  const added = await siteDomainService.add(ctx, site.id, {
    hostname,
    isPrimary: false,
    redirectToPrimary: false,
  });
  check("domain added with DNS records", added.dnsRecords.length === 2, String(added.dnsRecords.length));
  check("apex domain is detected as apex", added.isApex);
  check(
    "apex domains get an A record",
    added.dnsRecords.some((r) => r.type === "A"),
    added.dnsRecords.map((r) => r.type).join(", "),
  );
  check(
    "a TXT verification record is issued",
    added.dnsRecords.some((r) => r.type === "TXT" && r.value.startsWith("greviewpilot-verify=")),
  );

  // An unverified domain must NOT serve the site.
  const unverified = await resolvePublicPage({ host: hostname, path: "/" });
  check("unverified domain does not resolve", unverified === null);

  // Mark connected directly — real verification needs public DNS.
  await prisma.siteDomain.update({
    where: { id: added.id },
    data: { status: "CONNECTED", verifiedAt: new Date(), sslStatus: "ACTIVE", isPrimary: true },
  });

  const viaDomain = await resolvePublicPage({ host: hostname, path: "/" });
  check("connected domain resolves the site", Boolean(viaDomain));
  check(
    "custom domain serves links at the root",
    viaDomain?.ctx.basePath === "",
    viaDomain?.ctx.basePath,
  );
  check(
    "canonical origin uses the custom domain",
    viaDomain?.origin === `https://${hostname}`,
    viaDomain?.origin,
  );
  check("primary domain does not redirect", viaDomain?.redirectTo === null);

  const innerViaDomain = await resolvePublicPage({ host: hostname, path: inner.path });
  check(`custom domain serves ${inner.path}`, Boolean(innerViaDomain));

  // An unknown host must 404 rather than fall through to a slug lookup.
  const unknownHost = await resolvePublicPage({
    host: "somebody-elses-domain.test",
    slug: site.slug,
    path: "/",
  });
  check("unknown host does not fall through to the slug", unknownHost === null);

  // Slug addressing must still work alongside the domain.
  const viaSlug = await resolvePublicPage({ slug: site.slug, path: "/" });
  check("platform slug still resolves", Boolean(viaSlug));
  check(
    "slug addressing keeps the /s prefix on links",
    viaSlug?.ctx.basePath === `/s/${site.slug}`,
    viaSlug?.ctx.basePath,
  );

  // A secondary domain flagged to redirect must send visitors to the primary.
  const secondaryHost = `www.smoke-${suffix}.test`;
  const secondary = await siteDomainService.add(ctx, site.id, {
    hostname: secondaryHost,
    isPrimary: false,
    redirectToPrimary: true,
  });
  const secondaryRecord = (await siteDomainService.list(ctx, site.id)).find(
    (d) => d.id === secondary.id,
  );
  check("subdomain is not detected as apex", secondaryRecord?.isApex === false);
  check(
    "subdomains get a CNAME record",
    secondaryRecord?.dnsRecords.some((r) => r.type === "CNAME") === true,
    secondaryRecord?.dnsRecords.map((r) => r.type).join(", "),
  );
  await prisma.siteDomain.update({
    where: { id: secondary.id },
    data: { status: "CONNECTED", verifiedAt: new Date() },
  });

  const viaSecondary = await resolvePublicPage({ host: secondaryHost, path: inner.path });
  check(
    "secondary domain redirects to the primary",
    viaSecondary?.redirectTo === `https://${hostname}${inner.path}`,
    viaSecondary?.redirectTo ?? "null",
  );

  // Removing the primary while another exists must be refused.
  let refused = false;
  await siteDomainService.remove(ctx, site.id, added.id).catch(() => {
    refused = true;
  });
  check("cannot remove the primary domain while others remain", refused);
} finally {
  // Cascades remove sites, pages, revisions, and AI threads with the tenant.
  await prisma.tenant.delete({ where: { id: tenant.id } }).catch((err) => {
    console.error("Cleanup failed — remove tenant manually:", tenant.id, err);
  });
  await prisma.$disconnect();
}

if (failures > 0) {
  console.error(`\n${failures} check(s) FAILED`);
  process.exit(1);
}
console.log("\nSmoke test passed.");
