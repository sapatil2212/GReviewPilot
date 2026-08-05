/**
 * StyleProps -> CSS.
 *
 * Two output modes, because the editor and the published page have
 * genuinely different needs:
 *
 *   inlineStyle(node, bp)   Inline React style object for ONE breakpoint.
 *                           Used by the canvas, which simulates a device
 *                           width rather than actually being that width —
 *                           media queries would key off the browser
 *                           window, not the canvas frame, so the canvas
 *                           must resolve breakpoints in JS.
 *
 *   documentCss(doc, theme) A real stylesheet with @media blocks, keyed by
 *                           `[data-sb-id]`. Used by the public renderer so
 *                           published pages are genuinely responsive,
 *                           cacheable, and free of inline-style bloat.
 *
 * Both compile from the same StyleProps, so what you see on the canvas is
 * what ships.
 */

import type { CSSProperties } from "react";
import {
  BREAKPOINT_MAX_WIDTH,
  type Breakpoint,
  type HoverStyleProps,
  type SiteDocument,
  type SiteNode,
  type StyleProps,
  type ThemeTokens,
} from "@/site/document/types";
import { resolveStyle } from "@/site/document/operations";
import {
  LETTER_SPACING_SCALE,
  LINE_HEIGHT_SCALE,
  resolveColor,
} from "@/site/document/theme";

/**
 * Map a StyleProps bag to CSS declarations.
 *
 * Tokens become `var(--sb-*)` references rather than resolved values so
 * the output stays theme-reactive: change the theme block and every rule
 * updates without recompiling any node.
 */
function declarations(style: StyleProps): Record<string, string> {
  const d: Record<string, string> = {};
  const space = (t?: string) => (t ? `var(--sb-space-${t})` : undefined);

  const put = (prop: string, value?: string | number) => {
    if (value === undefined || value === null || value === "") return;
    d[prop] = String(value);
  };

  // Layout
  put("display", style.display);
  put("flex-direction", style.flexDirection);
  put("flex-wrap", style.flexWrap);
  put("justify-content", style.justifyContent);
  put("align-items", style.alignItems);
  put("gap", space(style.gap));
  if (style.gridColumns && style.gridColumns > 0) {
    put("grid-template-columns", `repeat(${style.gridColumns}, minmax(0, 1fr))`);
  }

  // Box
  put("padding-top", space(style.paddingTop));
  put("padding-right", space(style.paddingRight));
  put("padding-bottom", space(style.paddingBottom));
  put("padding-left", space(style.paddingLeft));
  put("margin-top", space(style.marginTop));
  put("margin-right", space(style.marginRight));
  put("margin-bottom", space(style.marginBottom));
  put("margin-left", space(style.marginLeft));
  put("width", style.width);
  put("max-width", style.maxWidth);
  put("min-height", style.minHeight);
  put("height", style.height);

  // Typography
  if (style.fontFamily) put("font-family", `var(--sb-font-${style.fontFamily})`);
  if (style.fontSize) put("font-size", `var(--sb-text-${style.fontSize})`);
  if (style.fontWeight) put("font-weight", `var(--sb-weight-${style.fontWeight})`);
  if (style.lineHeight) put("line-height", LINE_HEIGHT_SCALE[style.lineHeight]);
  if (style.letterSpacing) {
    put("letter-spacing", LETTER_SPACING_SCALE[style.letterSpacing]);
  }
  put("text-align", style.textAlign);
  put("text-transform", style.textTransform);
  put("color", resolveColor(style.color));

  // Background
  put("background-color", resolveColor(style.backgroundColor));
  if (style.backgroundImage) {
    // An overlay is composited as a gradient layer above the image rather
    // than as an extra DOM node, so text contrast is fixable without
    // changing the document structure.
    const overlay = style.backgroundOverlay;
    const layers =
      overlay && overlay > 0
        ? `linear-gradient(rgb(0 0 0 / ${overlay}), rgb(0 0 0 / ${overlay})), url("${escapeUrl(style.backgroundImage)}")`
        : `url("${escapeUrl(style.backgroundImage)}")`;
    put("background-image", layers);
    put("background-size", style.backgroundSize ?? "cover");
    put("background-position", style.backgroundPosition ?? "center");
    put("background-repeat", "no-repeat");
  }

  // Border
  if (style.borderWidth !== undefined) {
    put("border-width", `${style.borderWidth}px`);
    put("border-style", style.borderStyle ?? "solid");
    put("border-color", resolveColor(style.borderColor) ?? "var(--sb-color-border)");
  }
  if (style.borderRadius) put("border-radius", `var(--sb-radius-${style.borderRadius})`);

  // Effects
  if (style.boxShadow) put("box-shadow", `var(--sb-shadow-${style.boxShadow})`);
  if (style.opacity !== undefined) put("opacity", String(style.opacity));
  put("overflow", style.overflow);

  // Position
  put("position", style.position);
  put("top", style.top);
  put("right", style.right);
  put("bottom", style.bottom);
  put("left", style.left);
  if (style.zIndex !== undefined) put("z-index", String(style.zIndex));

  return d;
}

function escapeUrl(url: string): string {
  return url.replace(/["\\]/g, "");
}

function toCssText(d: Record<string, string>): string {
  return Object.entries(d)
    .map(([k, v]) => `${k}: ${v};`)
    .join(" ");
}

/** camelCase React style object, for the canvas. */
function toReactStyle(d: Record<string, string>): CSSProperties {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(d)) {
    out[k.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())] = v;
  }
  return out as CSSProperties;
}

/**
 * Resolved inline style for a single breakpoint. `customCss` is dropped
 * here because raw CSS text can't be expressed in a style object; the
 * canvas surfaces it through documentCss instead.
 */
export function inlineStyle(node: SiteNode, breakpoint: Breakpoint): CSSProperties {
  return toReactStyle(declarations(resolveStyle(node, breakpoint)));
}

function hoverDeclarations(hover: HoverStyleProps): Record<string, string> {
  return declarations(hover as StyleProps);
}

/**
 * Full stylesheet for a document.
 *
 * Rules are emitted per node id in three passes (base, tablet, mobile) so
 * the media queries nest correctly, plus a hover pass. Only nodes that
 * actually declare styles produce rules, which keeps the payload
 * proportional to how much the user customized rather than to page size.
 */
export function documentCss(
  doc: SiteDocument,
  theme: ThemeTokens,
  scope = ".sb-root",
): string {
  void theme; // tokens are emitted separately by themeToCss
  const base: string[] = [];
  const tablet: string[] = [];
  const mobile: string[] = [];
  const hover: string[] = [];

  for (const node of Object.values(doc.nodes)) {
    const sel = `${scope} [data-sb-id="${node.id}"]`;

    if (node.style) {
      const text = toCssText(declarations(node.style));
      if (text) base.push(`${sel} { ${text} }`);
      if (node.style.customCss) base.push(`${sel} { ${node.style.customCss} }`);
    }

    if (node.responsive?.tablet) {
      const text = toCssText(declarations(node.responsive.tablet));
      if (text) tablet.push(`${sel} { ${text} }`);
    }
    if (node.responsive?.mobile) {
      const text = toCssText(declarations(node.responsive.mobile));
      if (text) mobile.push(`${sel} { ${text} }`);
    }

    if (node.hover) {
      const text = toCssText(hoverDeclarations(node.hover));
      if (text) {
        hover.push(
          `${sel}:hover { ${text} transition: all 180ms ease-out; }`,
        );
      }
    }

    // Per-breakpoint visibility is a style concern, not a render concern:
    // keeping the node in the DOM means a desktop-only decoration doesn't
    // cause a layout shift when the viewport crosses a breakpoint.
    for (const bp of node.hiddenOn ?? []) {
      const rule = `${sel} { display: none !important; }`;
      if (bp === "tablet") tablet.push(rule);
      if (bp === "mobile") mobile.push(rule);
    }
  }

  const parts = [base.join("\n"), hover.join("\n")];
  if (tablet.length) {
    parts.push(
      `@media (max-width: ${BREAKPOINT_MAX_WIDTH.tablet}px) {\n${tablet.join("\n")}\n}`,
    );
  }
  if (mobile.length) {
    parts.push(
      `@media (max-width: ${BREAKPOINT_MAX_WIDTH.mobile}px) {\n${mobile.join("\n")}\n}`,
    );
  }
  return parts.filter(Boolean).join("\n");
}

/**
 * Baseline reset + primitives for rendered sites.
 *
 * Published pages must not inherit the dashboard's Tailwind preflight, and
 * the canvas must not inherit it either, or a Section would pick up the
 * app's margins. Everything here is scoped under `.sb-root`.
 */
export function baseCss(scope = ".sb-root"): string {
  return `
${scope} { font-family: var(--sb-font-body); color: var(--sb-color-foreground); background: var(--sb-color-background); font-weight: var(--sb-weight-body); line-height: 1.5; -webkit-font-smoothing: antialiased; }
${scope} *, ${scope} *::before, ${scope} *::after { box-sizing: border-box; }
${scope} h1, ${scope} h2, ${scope} h3, ${scope} h4, ${scope} h5, ${scope} h6 { font-family: var(--sb-font-heading); font-weight: var(--sb-weight-heading); line-height: 1.15; margin: 0; letter-spacing: -0.02em; }
${scope} p { margin: 0; }
${scope} img, ${scope} svg, ${scope} video { display: block; max-width: 100%; }
${scope} a { color: inherit; text-decoration: none; }
${scope} button { font: inherit; cursor: pointer; border: none; background: none; }
${scope} ul, ${scope} ol { margin: 0; padding: 0; list-style: none; }
${scope} .sb-container { width: 100%; max-width: var(--sb-container); margin-inline: auto; padding-inline: var(--sb-space-lg); }
${scope} .sb-rich :is(h1,h2,h3,h4) { margin-block: 0.8em 0.4em; }
${scope} .sb-rich p { margin-block: 0.75em; }
${scope} .sb-rich ul { list-style: disc; padding-left: 1.4em; margin-block: 0.75em; }
${scope} .sb-rich ol { list-style: decimal; padding-left: 1.4em; margin-block: 0.75em; }
${scope} .sb-rich a { color: var(--sb-color-primary); text-decoration: underline; }
${scope} [data-sb-anim] { opacity: 0; }
${scope} [data-sb-anim][data-sb-in="1"] { opacity: 1; }
@media (prefers-reduced-motion: reduce) {
  ${scope} [data-sb-anim] { opacity: 1 !important; transform: none !important; transition: none !important; }
}
`.trim();
}

/**
 * Entrance animation CSS.
 *
 * Kept separate from documentCss because animations are opt-in per node
 * and the reduced-motion override above must be able to defeat them.
 */
export function animationCss(doc: SiteDocument, scope = ".sb-root"): string {
  const rules: string[] = [];
  const transforms: Record<string, string> = {
    "fade-in": "none",
    "fade-up": "translateY(24px)",
    "fade-down": "translateY(-24px)",
    "slide-left": "translateX(32px)",
    "slide-right": "translateX(-32px)",
    "zoom-in": "scale(0.94)",
    "zoom-out": "scale(1.06)",
    "blur-in": "none",
  };

  for (const node of Object.values(doc.nodes)) {
    const anim = node.animation;
    if (!anim || anim.kind === "none") continue;
    const sel = `${scope} [data-sb-id="${node.id}"]`;
    const duration = anim.duration ?? 600;
    const delay = anim.delay ?? 0;
    const easing = anim.easing ?? "ease-out";
    const from = transforms[anim.kind] ?? "none";
    const blur = anim.kind === "blur-in" ? " filter: blur(10px);" : "";

    rules.push(
      `${sel}[data-sb-anim] { transform: ${from};${blur} transition: opacity ${duration}ms ${easing} ${delay}ms, transform ${duration}ms ${easing} ${delay}ms, filter ${duration}ms ${easing} ${delay}ms; }`,
    );
    rules.push(
      `${sel}[data-sb-anim][data-sb-in="1"] { transform: none; filter: none; }`,
    );
  }
  return rules.join("\n");
}
