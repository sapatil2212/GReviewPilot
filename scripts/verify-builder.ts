/**
 * Builder self-check.
 *
 * Verifies the invariants that hold the website builder together and that
 * TypeScript alone cannot prove:
 *
 *   1. every registered component type has a React renderer (and vice versa)
 *   2. every section preset builds into a structurally valid document
 *   3. every node a preset produces passes its own registry prop schema
 *   4. document operations preserve integrity (no orphans, no cycles)
 *   5. the AI edit pipeline applies operations without corrupting a document
 *
 * Run with: npx tsx scripts/verify-builder.ts
 *
 * Kept as a script rather than a test suite because this project has no test
 * runner configured; it exits non-zero on failure so it can be wired into CI
 * as-is.
 */

import { COMPONENTS, COMPONENT_TYPES, coerceProps, getDefinition } from "../src/site/registry/definitions";
import { PRESET_KEYS, SECTION_PRESETS, buildSection, resolvePresetAlias } from "../src/site/registry/presets";
import {
  countNodes,
  createEmptyDocument,
  duplicateNode,
  getSections,
  insertSubtree,
  moveNode,
  normalizeDocument,
  removeNode,
} from "../src/site/document/operations";
import { applyOperations, buildOutline } from "../src/site/ai/operations";
import { blueprintSpec, compileSite } from "../src/site/ai/compile";
import { listBlueprints, listBlueprintVariants } from "../src/site/ai/blueprints";
import { createTheme, contrastRatio } from "../src/site/document/theme";
import { auditPage } from "../src/site/ai/audit";
import { siteDocumentSchema } from "../src/server/validators/site.schema";
import type { SiteDocument } from "../src/site/document/types";

let failures = 0;
let checks = 0;

function check(name: string, condition: boolean, detail?: string) {
  checks += 1;
  if (condition) {
    console.log(`  ok   ${name}`);
  } else {
    failures += 1;
    console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function section(title: string) {
  console.log(`\n${title}`);
}

// ---------------------------------------------------------------------
// 1. Registry <-> renderer parity
// ---------------------------------------------------------------------

section("Registry parity");

// Imported dynamically: registry.tsx is a client module that pulls in React
// components, which must not be evaluated at the top of a node script.
const { RENDERERS } = (await import("../src/site/render/registry")) as {
  RENDERERS: Record<string, unknown>;
};

const missing = COMPONENT_TYPES.filter((type) => !RENDERERS[type]);
check(
  "every component definition has a renderer",
  missing.length === 0,
  missing.join(", "),
);

const orphans = Object.keys(RENDERERS).filter((type) => !COMPONENT_TYPES.includes(type));
check("every renderer has a definition", orphans.length === 0, orphans.join(", "));

check(
  "every definition has a unique type",
  new Set(COMPONENT_TYPES).size === COMPONENT_TYPES.length,
);

const badDefaults = COMPONENTS.filter((definition) => {
  const parsed = definition.schema.safeParse(definition.defaultProps);
  return !parsed.success;
});
check(
  "every component's defaultProps satisfy its own schema",
  badDefaults.length === 0,
  badDefaults.map((d) => d.type).join(", "),
);

const badPropFields = COMPONENTS.flatMap((definition) =>
  definition.propFields
    .filter((field) => field.kind === "select" && (!field.options || field.options.length === 0))
    .map((field) => `${definition.type}.${field.key}`),
);
check(
  "every select prop field declares options",
  badPropFields.length === 0,
  badPropFields.join(", "),
);

// ---------------------------------------------------------------------
// 2 + 3. Presets build valid, schema-conformant documents
// ---------------------------------------------------------------------

section("Section presets");

const presetInput = {
  businessName: "Bright Smile Dental",
  phone: "+911234567890",
  whatsapp: "+911234567890",
  email: "hello@brightsmile.test",
  address: "12 Main Street, Pune",
};

for (const preset of SECTION_PRESETS) {
  const subtree = buildSection(preset.key, presetInput);
  if (!subtree) {
    check(`preset "${preset.key}" builds`, false, "returned null");
    continue;
  }

  // Insert into a real document so parent links and root reachability are
  // exercised the same way the editor exercises them.
  let doc = createEmptyDocument();
  doc = insertSubtree(doc, doc.root, subtree.nodes, subtree.rootId, -1);
  const normalized = normalizeDocument(doc);

  const sameSize = countNodes(normalized) === countNodes(doc);
  const unknownTypes = Object.values(normalized.nodes)
    .map((n) => n.type)
    .filter((type) => !getDefinition(type));
  const invalidProps = Object.values(normalized.nodes).filter(
    (n) => !coerceProps(n.type, n.props).valid,
  );
  const schemaResult = siteDocumentSchema.safeParse(normalized);

  const problems = [
    !sameSize ? "normalize dropped nodes" : "",
    unknownTypes.length ? `unknown types: ${[...new Set(unknownTypes)].join(", ")}` : "",
    invalidProps.length
      ? `invalid props: ${invalidProps.map((n) => n.type).join(", ")}`
      : "",
    !schemaResult.success
      ? `schema: ${schemaResult.error.issues[0]?.path.join(".")} ${schemaResult.error.issues[0]?.message}`
      : "",
  ].filter(Boolean);

  check(`preset "${preset.key}" is valid`, problems.length === 0, problems.join("; "));
}

check(
  "every preset key resolves through the alias table",
  PRESET_KEYS.every((key) => resolvePresetAlias(key) === key),
);

const aliasSamples = ["hero", "faqs", "doctors", "googlereviews", "our-services", "booking"];
const unresolved = aliasSamples.filter((alias) => !resolvePresetAlias(alias));
check(
  "common AI aliases resolve to a preset",
  unresolved.length === 0,
  unresolved.join(", "),
);

// ---------------------------------------------------------------------
// 4. Document operations preserve integrity
// ---------------------------------------------------------------------

section("Document operations");

function integrity(doc: SiteDocument): string[] {
  const problems: string[] = [];

  for (const [id, node] of Object.entries(doc.nodes)) {
    if (node.id !== id) problems.push(`${id}: id mismatch`);
    for (const childId of node.children) {
      if (!doc.nodes[childId]) problems.push(`${id}: dangling child ${childId}`);
      else if (doc.nodes[childId].parent !== id) {
        problems.push(`${childId}: parent should be ${id}, is ${doc.nodes[childId].parent}`);
      }
    }
    if (id !== doc.root && !node.parent) problems.push(`${id}: orphan`);
  }

  // Reachability from the root also proves acyclicity, since a cycle would
  // either be unreachable or revisit a node already marked.
  const seen = new Set<string>([doc.root]);
  const stack = [doc.root];
  while (stack.length) {
    const current = stack.pop()!;
    for (const childId of doc.nodes[current]?.children ?? []) {
      if (seen.has(childId)) {
        problems.push(`${childId}: reachable twice (cycle or duplicate)`);
        continue;
      }
      seen.add(childId);
      stack.push(childId);
    }
  }
  if (seen.size !== Object.keys(doc.nodes).length) {
    problems.push(`unreachable nodes: ${Object.keys(doc.nodes).length - seen.size}`);
  }

  return problems;
}

// Build a realistic multi-section page.
let page = createEmptyDocument();
for (const key of ["navbar", "hero-split", "services", "reviews", "contact", "footer"]) {
  const subtree = buildSection(key, presetInput)!;
  page = insertSubtree(page, page.root, subtree.nodes, subtree.rootId, -1);
}
check("multi-section page has integrity", integrity(page).length === 0, integrity(page).join("; "));

const sections = getSections(page);
check("page has the expected section count", sections.length === 6, String(sections.length));

const moved = moveNode(page, sections[4].id, page.root, 1);
check("move preserves integrity", integrity(moved).length === 0, integrity(moved).join("; "));
check(
  "move reorders as requested",
  getSections(moved)[1].presetKey === sections[4].presetKey,
  getSections(moved)[1].presetKey,
);
check(
  "move does not change node count",
  countNodes(moved) === countNodes(page),
);

const duplicated = duplicateNode(page, sections[2].id);
check(
  "duplicate preserves integrity",
  integrity(duplicated).length === 0,
  integrity(duplicated).join("; "),
);
check("duplicate adds a section", getSections(duplicated).length === 7);
check(
  "duplicate re-ids its subtree",
  Object.keys(duplicated.nodes).length > Object.keys(page.nodes).length,
);

const removed = removeNode(page, sections[2].id);
check("remove preserves integrity", integrity(removed).length === 0, integrity(removed).join("; "));
check("remove drops the subtree", countNodes(removed) < countNodes(page));
check("root cannot be removed", removeNode(page, page.root) === page);

// A self-drop must be refused rather than orphaning the subtree.
const heroId = sections[1].id;
const heroChild = page.nodes[heroId].children[0];
check("cannot move a node into its own subtree", moveNode(page, heroId, heroChild, 0) === page);

// Corrupt document repair.
const corrupt: SiteDocument = {
  version: 1,
  root: page.root,
  nodes: {
    ...page.nodes,
    [page.root]: {
      ...page.nodes[page.root],
      children: [...page.nodes[page.root].children, "does-not-exist"],
    },
    stranded: {
      id: "stranded",
      type: "Text",
      props: { text: "orphan" },
      children: [],
      parent: "also-missing",
    },
  },
};
const repaired = normalizeDocument(corrupt);
check("normalize repairs a corrupt document", integrity(repaired).length === 0, integrity(repaired).join("; "));
check("normalize drops orphans", !repaired.nodes.stranded);
check(
  "normalize drops dangling child references",
  !repaired.nodes[repaired.root].children.includes("does-not-exist"),
);

// ---------------------------------------------------------------------
// 5. AI pipeline
// ---------------------------------------------------------------------

section("AI pipeline");

const theme = createTheme({ industry: "Dental clinic" });
check("generated theme has readable button text", (contrastRatio(theme.colors.primary, theme.colors.primaryForeground) ?? 0) >= 4.5);

const outline = buildOutline(page);
check("outline lists every section", outline.length === getSections(page).length);
check(
  "outline includes targetable text nodes",
  outline.some((s) => s.nodes.some((n) => typeof n.text === "string" && n.text.length > 0)),
);

const applied = applyOperations(
  { document: page, theme, presetInput },
  [
    { op: "setTheme", primary: "#16A34A", reason: "test" },
    { op: "addSection", preset: "pricing", afterSection: "services", reason: "test" },
    { op: "removeSection", target: "reviews", reason: "test" },
    { op: "moveSection", target: "contact", toIndex: 1, reason: "test" },
    // Deliberately invalid: must be skipped, not applied or thrown.
    { op: "removeSection", target: "does-not-exist", reason: "test" },
    { op: "setProps", nodeId: "not-a-real-node", props: { text: "x" }, reason: "test" },
  ],
);

check("AI operations keep integrity", integrity(applied.document).length === 0, integrity(applied.document).join("; "));
check("AI applied the valid operations", applied.applied.length === 4, String(applied.applied.length));
check("AI skipped the invalid operations", applied.skipped.length === 2, String(applied.skipped.length));
check("AI theme change took effect", applied.theme.colors.primary === "#16A34A");
check(
  "AI-set colour keeps readable contrast",
  (contrastRatio(applied.theme.colors.primary, applied.theme.colors.primaryForeground) ?? 0) >= 4.5,
);
check(
  "AI added the pricing section",
  getSections(applied.document).some((s) => s.presetKey === "pricing"),
);
check(
  "AI removed the reviews section",
  !getSections(applied.document).some((s) => s.presetKey === "reviews"),
);
check(
  "AI-edited document still passes the API schema",
  siteDocumentSchema.safeParse(applied.document).success,
);

// ---------------------------------------------------------------------
// 6. Blueprint compilation for every industry
// ---------------------------------------------------------------------

section("Industry blueprints");

// Primary blueprints resolve through getBlueprint(industry); variants are
// unreachable that way (resolveIndustryKey is many-to-one) and must be handed
// to blueprintSpec directly, exactly as the template seeder does.
const allBlueprints = [
  ...listBlueprints().map((b) => ({ blueprint: b, override: false })),
  ...listBlueprintVariants().map((b) => ({ blueprint: b, override: true })),
];

for (const { blueprint, override } of allBlueprints) {
  const spec = blueprintSpec(
    { businessName: "Test Business", industry: blueprint.label },
    override ? { blueprintOverride: blueprint } : {},
  );
  const compiled = compileSite(spec, {
    businessName: "Test Business",
    industry: blueprint.label,
    city: "Pune",
    phone: "+911234567890",
  });

  const homePages = compiled.pages.filter((p) => p.isHome);
  const problems: string[] = [];

  if (homePages.length !== 1) problems.push(`${homePages.length} home pages`);
  for (const compiledPage of compiled.pages) {
    if (integrity(compiledPage.document).length > 0) {
      problems.push(`${compiledPage.path}: ${integrity(compiledPage.document)[0]}`);
    }
    if (!siteDocumentSchema.safeParse(compiledPage.document).success) {
      problems.push(`${compiledPage.path}: fails schema`);
    }
    if ((compiledPage.seo.title?.length ?? 0) > 60) {
      problems.push(`${compiledPage.path}: meta title too long`);
    }
    if ((compiledPage.seo.description?.length ?? 0) > 160) {
      problems.push(`${compiledPage.path}: meta description too long`);
    }
  }

  // Unique paths, or routing breaks.
  const paths = compiled.pages.map((p) => p.path);
  if (new Set(paths).size !== paths.length) problems.push("duplicate paths");

  check(
    `blueprint "${blueprint.key}" compiles (${compiled.pages.length} pages)`,
    problems.length === 0,
    problems.slice(0, 3).join("; "),
  );
}

// ---------------------------------------------------------------------
// 7. Audit engine
// ---------------------------------------------------------------------

section("Audit engine");

const goodSpec = blueprintSpec({ businessName: "Bright Smile Dental", industry: "Dental clinic" });
const goodSite = compileSite(goodSpec, {
  businessName: "Bright Smile Dental",
  industry: "Dental clinic",
  city: "Pune",
  phone: "+911234567890",
  email: "hello@brightsmile.test",
  whatsapp: "+911234567890",
});
const home = goodSite.pages.find((p) => p.isHome)!;

const goodAudit = auditPage({
  document: home.document,
  theme: goodSite.theme,
  seo: home.seo,
  brand: goodSite.brand,
  path: "/",
});

check("audit produces a score in range", goodAudit.score >= 0 && goodAudit.score <= 100, String(goodAudit.score));
check("audit finds passing checks on a generated page", goodAudit.passed.length > 0);
check(
  "audit does not report a missing CTA on a generated page",
  !goodAudit.issues.some((i) => i.id === "conv-no-cta"),
  goodAudit.issues.map((i) => i.id).join(", "),
);
check(
  "audit does not report a missing contact path on a generated page",
  !goodAudit.issues.some((i) => i.id === "conv-no-contact"),
);

// An empty page should trigger the critical findings.
const emptyAudit = auditPage({
  document: createEmptyDocument(),
  theme,
  seo: {},
  brand: {},
  path: "/",
});
check("audit flags a missing title on an empty page", emptyAudit.issues.some((i) => i.id === "seo-title-missing"));
check("audit flags a missing H1 on an empty page", emptyAudit.issues.some((i) => i.id === "seo-h1-missing"));
check("audit flags a missing CTA on an empty page", emptyAudit.issues.some((i) => i.id === "conv-no-cta"));
check("audit scores an empty page below a generated one", emptyAudit.score < goodAudit.score);

// Low-contrast theme must be caught.
const badTheme = { ...theme, colors: { ...theme.colors, primary: "#FFFF00", primaryForeground: "#FFFFFF" } };
const contrastAudit = auditPage({
  document: home.document,
  theme: badTheme,
  seo: home.seo,
  brand: goodSite.brand,
  path: "/",
});
check(
  "audit catches unreadable button text",
  contrastAudit.issues.some((i) => i.id === "a11y-contrast-primary"),
);

// ---------------------------------------------------------------------

console.log(`\n${checks - failures}/${checks} checks passed`);
if (failures > 0) {
  console.error(`${failures} check(s) FAILED`);
  process.exit(1);
}
console.log("Builder self-check passed.");
