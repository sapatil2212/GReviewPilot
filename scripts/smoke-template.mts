/**
 * Template gallery + "start from template" smoke test.
 *
 * Requires templates to be seeded (`npm run db:seed:templates`) before
 * running. Exercises the real create() path with a templateSlug, including
 * the contact-detail rebinding that stops a new site publishing with the
 * sample business's placeholder phone number.
 *
 * Run with: npm run smoke:template
 */

import { PrismaClient, UserRole } from "@prisma/client";
import { siteService } from "../src/server/services/site.service";
import { sitePageService } from "../src/server/services/sitePage.service";
import { siteTemplateRepository } from "../src/server/repositories/siteTemplate.repository";
import { getSections } from "../src/site/document/operations";
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
  data: {
    name: `Template Smoke ${suffix}`,
    slug: `template-smoke-${suffix}`,
    industry: "Dental clinic",
    phone: "+1 234 555 0199",
    businessEmail: `template-${suffix}@example.test`,
  },
});
const user = await prisma.user.create({
  data: {
    tenantId: tenant.id,
    firstName: "Template",
    lastName: "Smoke",
    email: `template-${suffix}@example.test`,
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
  console.log("\nTemplate catalog");
  const templates = await siteTemplateRepository.list({ tenantId: tenant.id });
  check("global templates are visible to any tenant", templates.length >= 15, String(templates.length));

  const dentalTemplate = await siteTemplateRepository.findBySlug("dental");
  check("the dental template exists and is global", dentalTemplate?.isGlobal === true);

  console.log("\nCreate from template");
  const site = await siteService.create(ctx, {
    name: `Template Smoke ${suffix}`,
    templateSlug: "dental",
  });
  const detail = await siteService.get(ctx, site.id);

  check(
    "site created from a template has multiple pages, not just a starter home page",
    detail.pages.length >= 4,
    String(detail.pages.length),
  );
  check("exactly one home page", detail.pages.filter((p) => p.isHome).length === 1);
  check(
    "the template's theme (clinical style) was applied, not the generic default",
    detail.theme.styleKeyword === "clinical",
    detail.theme.styleKeyword,
  );

  const home = detail.pages.find((p) => p.isHome)!;
  const homeDoc = await sitePageService.get(ctx, site.id, home.id);
  const sections = getSections(homeDoc.document);
  check("home page has real sections", sections.length >= 6, String(sections.length));
  check(
    "home page starts with a navbar like a normal generated page",
    sections[0]?.presetKey === "navbar",
  );

  console.log("\nContact rebinding");
  const telAction = Object.values(homeDoc.document.nodes)
    .map((n) => n.action)
    .find((a) => a?.kind === "tel");
  check(
    "tel: actions were rebound to the tenant's real phone number",
    telAction?.kind === "tel" && telAction.phone === tenant.phone,
    JSON.stringify(telAction),
  );

  console.log("\nDefault contact form still created");
  const forms = await prisma.siteForm.findMany({ where: { siteId: site.id } });
  check("a default form exists even when starting from a template", forms.length >= 1);

  console.log("\nUnknown template falls back gracefully");
  const fallbackSite = await siteService.create(ctx, {
    name: `Fallback ${suffix}`,
    templateSlug: "not-a-real-template-slug",
  });
  const fallbackDetail = await siteService.get(ctx, fallbackSite.id);
  check(
    "an unknown templateSlug still produces a usable site (generic starter)",
    fallbackDetail.pages.length === 1 && fallbackDetail.pages[0].isHome,
    String(fallbackDetail.pages.length),
  );

  console.log("\nNo template = generic starter, unchanged behaviour");
  const plainSite = await siteService.create(ctx, { name: `Plain ${suffix}` });
  const plainDetail = await siteService.get(ctx, plainSite.id);
  check(
    "creating without a template still works exactly as before",
    plainDetail.pages.length === 1 && plainDetail.pages[0].isHome,
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
console.log("\nTemplate smoke test passed.");
