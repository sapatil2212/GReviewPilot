/**
 * Renders every section preset and a full compiled site to HTML, then asserts
 * the output is actually visible and correctly aligned.
 *
 * These are the checks that catch the class of bug users report as "some areas
 * are blank" and "sections don't line up" — failures that no type or lint check
 * can see, because the markup is valid and the CSS is well-formed. The only way
 * to find them is to render and look at what comes out.
 *
 * Three real defects this locks down:
 *
 *   1. Animated nodes rendering permanently invisible. NodeRenderer marks any
 *      animated node `data-sb-anim`, and the stylesheet hid those until
 *      `data-sb-in="1"` appeared — which only four of thirty-one renderers ever
 *      set. Presets animate `Box`, so service, team, pricing and testimonial
 *      cards plus every section header were stuck at opacity 0.
 *   2. Width-capped blocks sitting flush left. `marginLeft: "none"` compiles to
 *      `margin-left: 0`, so an 820px hero inside a 1200px container was
 *      left-aligned while its text was centred.
 *   3. Empty sections keeping their 3xl padding, leaving a ~200px blank band.
 *
 * Uses react-dom/server, so it needs no browser and no database.
 *
 * Run with: npm run verify:site-render
 */

import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";

try {
  process.loadEnvFile(".env");
} catch {
  // Already-populated environments are fine.
}

const { SECTION_PRESETS, buildSection } = await import("../src/site/registry/presets");
const { createEmptyDocument, insertSubtree, normalizeDocument } = await import(
  "../src/site/document/operations"
);
const { createTheme, DEFAULT_THEME } = await import("../src/site/document/theme");
const { baseCss, documentCss, animationCss } = await import("../src/site/render/styles");
const { SiteRenderer } = await import("../src/site/render/SiteRenderer");
const { blueprintSpec, compileSite, serviceIcons } = await import("../src/site/ai/compile");
const { listBlueprints } = await import("../src/site/ai/blueprints");
const { SITE_ICONS } = await import("../src/site/render/icons");
const { findNodesByType } = await import("../src/site/document/operations");
import type { RenderContext, SiteDocument } from "../src/site/document/types";

let failures = 0;
function check(name: string, condition: boolean, detail?: string) {
  if (condition) console.log(`  + ${name}`);
  else {
    failures += 1;
    console.error(`  x ${name}${detail ? ` — ${detail}` : ""}`);
  }
}
function heading(text: string) {
  console.log(`\n${text}\n${"-".repeat(text.length)}`);
}

/** Demo data so business components render their populated state. */
function renderData() {
  return {
    reviews: [
      { id: "r1", authorName: "Priya S.", rating: 5, comment: "Excellent.", createdAt: new Date().toISOString() },
      { id: "r2", authorName: "Daniel M.", rating: 5, comment: "Great service.", createdAt: new Date().toISOString() },
    ],
    ratingSummary: { average: 4.9, total: 120 },
    location: {
      id: "loc",
      name: "Demo Business",
      phone: "+1 555 0100",
      addressLine1: "12 Example Street",
      city: "Sample City",
      latitude: null,
      longitude: null,
      googlePlaceId: null,
      workingHours: { "1": [{ open: "09:00", close: "18:00" }] },
    },
    collections: {},
    forms: {},
    socialLinks: { facebook: "https://facebook.com/demo" },
    mapsApiKey: null,
  };
}

function contextFor(document: SiteDocument, editor = false): RenderContext {
  return {
    document,
    theme: createTheme({ industry: "Dental clinic" }),
    brand: { businessName: "Demo Business", phone: "+1 555 0100", whatsapp: "+15550100" },
    pages: [
      { id: "1", title: "Home", path: "/", hiddenInNav: false },
      { id: "2", title: "Contact", path: "/contact", hiddenInNav: false },
    ],
    basePath: "",
    data: renderData(),
    editor,
  } as RenderContext;
}

/** Wrap a preset subtree in a document so it can be rendered standalone. */
function documentForPreset(key: string, input: Record<string, unknown>): SiteDocument | null {
  const subtree = buildSection(key, input);
  if (!subtree) return null;
  let doc = createEmptyDocument();
  doc = insertSubtree(doc, doc.root, subtree.nodes, subtree.rootId, -1);
  return normalizeDocument(doc);
}

function html(document: SiteDocument, editor = false): string {
  return renderToStaticMarkup(createElement(SiteRenderer, { ctx: contextFor(document, editor) }));
}

// =====================================================================
heading("Animation reveal cannot hide content");

// The gate: content is hidden ONLY when the reveal script has run and set
// data-sb-reveal. Without JS, or if the effect never runs, nothing is hidden.
{
  const css = baseCss(".sb-root");
  check(
    "the opacity:0 rule is gated on data-sb-reveal",
    /\.sb-root\[data-sb-reveal="on"\] \[data-sb-anim\] \{ opacity: 0; \}/.test(css),
    "an ungated rule hides animated content whenever the observer does not run",
  );
  check(
    "no ungated rule hides animated nodes",
    !/(^|\n)\.sb-root \[data-sb-anim\] \{ opacity: 0/.test(css),
  );
  check(
    "reduced motion still forces content visible",
    /prefers-reduced-motion[\s\S]*opacity: 1 !important/.test(css),
  );

  // The transform half must be gated too, or un-revealed nodes stay shifted
  // 24px down the page even once they are opaque.
  const doc = documentForPreset("services", {})!;
  const anim = animationCss(doc, ".sb-root");
  check("animated nodes exist in a preset (guards the assertion below)", anim.length > 0);
  const ungatedTransform = anim
    .split("\n")
    .filter((line) => line.length > 0 && !line.includes('[data-sb-reveal="on"]'));
  check(
    "every transform rule is gated on data-sb-reveal",
    ungatedTransform.length === 0,
    ungatedTransform[0],
  );
}

// =====================================================================
heading("Every preset renders visible content");

for (const preset of SECTION_PRESETS) {
  const doc = documentForPreset(preset.key, {
    businessName: "Demo Business",
    phone: "+1 555 0100",
    imageUrl: "https://images.unsplash.com/photo-1",
    imageUrls: ["https://images.unsplash.com/photo-1", "https://images.unsplash.com/photo-2"],
  });
  if (!doc) {
    check(`${preset.key}: builds`, false, "buildSection returned null");
    continue;
  }

  const markup = html(doc);
  const nodeCount = Object.keys(doc.nodes).length;

  // Text content, ignoring tags. A preset that emits only empty containers is
  // the "blank area" symptom.
  const text = markup
    .replace(/<style[\s\S]*?<\/style>/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const hasVisual =
    text.length > 0 ||
    /<img|<iframe|<svg/.test(markup.replace(/<style[\s\S]*?<\/style>/g, ""));

  check(
    `${preset.key}: produces text or media (${nodeCount} nodes)`,
    hasVisual,
    hasVisual ? undefined : "renders only empty containers",
  );

  // Nothing may carry data-sb-in from a renderer any more; the page observer
  // owns it. A renderer setting data-sb-in="0" would re-hide its own content.
  check(
    `${preset.key}: no renderer hardcodes data-sb-in="0"`,
    !markup.includes('data-sb-in="0"'),
    'a renderer is managing reveal state itself — that is what left 27 components invisible',
  );
}

// =====================================================================
heading("Width-capped blocks are centred, not flush left");

{
  /**
   * Scoped to blocks sitting directly inside a Section.
   *
   * Those are the ones laid out against the full container width, so a
   * `maxWidth` with no auto margin leaves them hard against the left edge. A
   * measure-capped paragraph nested inside a stack is a different thing
   * entirely — `maxWidth: 65ch` on left-aligned body copy is correct
   * typography, and flagging it would push toward centring text that should
   * not be centred.
   */
  const offenders: string[] = [];
  for (const preset of SECTION_PRESETS) {
    const doc = documentForPreset(preset.key, { businessName: "Demo Business", phone: "+1 555 0100" });
    if (!doc) continue;
    for (const node of Object.values(doc.nodes)) {
      const s = node.style;
      if (!s?.maxWidth) continue;
      const parent = node.parent ? doc.nodes[node.parent] : null;
      if (parent?.type !== "Section") continue;
      const centredBySelf = s.marginLeft === "auto" && s.marginRight === "auto";
      if (!centredBySelf) {
        offenders.push(`${preset.key}/${node.name ?? node.type} (maxWidth ${s.maxWidth})`);
      }
    }
  }
  check(
    "no max-width block is left uncentred",
    offenders.length === 0,
    offenders.join("; "),
  );

  // And the compiler must actually emit `auto` rather than a spacing variable.
  const doc = documentForPreset("faq", {})!;
  const css = documentCss(doc, DEFAULT_THEME, ".sb-root");
  check("margin auto compiles to `auto`", /margin-left: auto/.test(css), css.slice(0, 200));
  check(
    "margin auto never compiles to a spacing variable",
    !/var\(--sb-space-auto\)/.test(css),
    "var(--sb-space-auto) is undefined, so the declaration is dropped silently",
  );
}

// =====================================================================
heading("Empty containers do not leave blank bands");

{
  // A Section whose children were deleted keeps 3xl padding top and bottom.
  let doc = createEmptyDocument();
  const subtree = buildSection("services", {})!;
  doc = insertSubtree(doc, doc.root, subtree.nodes, subtree.rootId, -1);
  doc = normalizeDocument(doc);

  // findNodesByType returns nodes, not ids.
  const section = findNodesByType(doc, "Section")[0];
  // Strip the section's children to simulate an emptied section.
  const emptied: SiteDocument = {
    ...doc,
    nodes: { ...doc.nodes, [section.id]: { ...section, children: [] } },
  };

  const published = html(normalizeDocument(emptied));
  check(
    "an empty section renders nothing on a published page",
    !published.includes('data-sb-type="Section"'),
    "an empty section keeps its padding and shows as a blank band",
  );

  const editing = html(normalizeDocument(emptied), true);
  check(
    "the same empty section still renders in the editor",
    editing.includes('data-sb-type="Section"'),
    "an author needs the empty section to drop content into",
  );
}

{
  // An Image with no src was a 220px grey box with no text on published pages.
  const doc = documentForPreset("team", {})!;
  const published = html(doc);
  check(
    "an image with no src renders nothing on a published page",
    !published.includes("Click to add an image"),
  );
  const editing = html(doc, true);
  check(
    "the same image shows an actionable placeholder in the editor",
    editing.includes("Click to add an image"),
  );
}

// =====================================================================
heading("Responsive layout has no overflow traps");

{
  const doc = documentForPreset("blog", {})!;
  const markup = html(doc);
  check(
    "CollectionList grid tracks can shrink to the container",
    !/minmax\(\s*1100px/.test(markup) && !/minmax\(\s*[0-9]{4,}px/.test(markup),
    "a fixed pixel minimum wider than the parent forces horizontal scroll",
  );

  const nav = html(documentForPreset("navbar", { businessName: "Demo" })!);
  check(
    "the navbar collapses at the tablet breakpoint, not an off-system width",
    nav.includes("max-width: 1024px") && !nav.includes("max-width: 860px"),
    "at 860px the nav changed mid-way through the tablet range",
  );
}

// =====================================================================
heading("Service icons are varied and all resolve");

{
  const names = new Set<string>();
  const unresolved: string[] = [];
  for (const blueprint of listBlueprints()) {
    const icons = serviceIcons(blueprint.defaultServices);
    for (const icon of icons) {
      names.add(icon);
      if (!SITE_ICONS[icon]) unresolved.push(`${blueprint.key}: ${icon}`);
    }
    // Adjacent duplicates are the visible problem, not duplicates overall.
    const adjacentRepeat = icons.some((icon, i) => i > 0 && icon === icons[i - 1]);
    check(`${blueprint.key}: no two adjacent cards share an icon`, !adjacentRepeat, icons.join(","));
  }
  check(
    "every chosen icon exists in the curated allowlist",
    unresolved.length === 0,
    `${unresolved.join("; ")} — these silently fall back to Sparkles`,
  );
  check(
    "icons vary across the library",
    names.size >= 12,
    `${names.size} distinct icons`,
  );
}

// =====================================================================
heading("Stats read as real numbers");

{
  const doc = documentForPreset("stats", {
    items: [
      { value: "4.8", label: "Average rating" },
      { value: "24", label: "Hour response time" },
      { value: "2000", label: "Customers served", suffix: "+" },
    ],
  })!;

  // Asserted on the node props, not the markup: StatCounter counts up from 0, so
  // the server-rendered value is "0.0" regardless of the target.
  const counters = findNodesByType(doc, "StatCounter");
  const suffixFor = (label: string) =>
    counters.find((n) => n.props.label === label)?.props.suffix;

  check(
    "a rating carries no suffix",
    suffixFor("Average rating") === "",
    `got ${JSON.stringify(suffixFor("Average rating"))} — a hardcoded + made this "4.8+"`,
  );
  check("a response time carries no suffix", suffixFor("Hour response time") === "");
  check("an explicit suffix is honoured", suffixFor("Customers served") === "+");

  // And the blueprint must not silently reintroduce one.
  const spec = blueprintSpec(
    { businessName: "Demo", industry: "Dental clinic", city: "Sample City", country: null },
    { demoContent: true },
  );
  const statsSection = spec.pages
    .flatMap((p) => p.sections)
    .find((s) => s.preset === "stats");
  check(
    "blueprint stats do not assume a + suffix",
    !statsSection?.items?.some((i) => i.suffix === "+" && !/^\d+$/.test(i.value ?? "")),
    JSON.stringify(statsSection?.items),
  );
}

// =====================================================================
heading("Full compiled sites render for every industry");

for (const blueprint of listBlueprints()) {
  const ctx = {
    businessName: `${blueprint.label} Demo`,
    industry: blueprint.label,
    city: "Sample City",
    country: null,
    phone: "+1 555 0100",
  };
  const compiled = compileSite(blueprintSpec(ctx, { demoContent: true }), ctx);

  let emptySections = 0;
  let totalNodes = 0;
  let pagesWithoutH1 = 0;

  for (const page of compiled.pages) {
    totalNodes += Object.keys(page.document.nodes).length;
    const markup = html(page.document);
    const body = markup.replace(/<style[\s\S]*?<\/style>/g, "");
    if (!/<h1[\s>]/.test(body)) pagesWithoutH1 += 1;

    // A rendered section with no text and no media between its tags is a band
    // of nothing. Counted rather than asserted per-section so the message names
    // the page.
    for (const node of findNodesByType(page.document, "Section")) {
      if (node.children.length === 0) emptySections += 1;
    }
  }

  check(
    `${blueprint.key}: ${compiled.pages.length} pages, ${totalNodes} nodes, no empty sections`,
    emptySections === 0,
    `${emptySections} empty section(s)`,
  );
  check(`${blueprint.key}: every page has an h1`, pagesWithoutH1 === 0, `${pagesWithoutH1} without`);
}

// =====================================================================
console.log(
  failures === 0
    ? "\nAll site render checks passed."
    : `\n${failures} check(s) failed.`,
);
process.exitCode = failures === 0 ? 0 : 1;
