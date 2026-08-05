/**
 * Conversational editing.
 *
 * "Make my hero more modern", "change blue to green", "add a pricing
 * section" all resolve to the same thing: a short list of typed operations
 * that this module validates and applies.
 *
 * ---------------------------------------------------------------------
 * Why operations instead of "return the updated document"
 * ---------------------------------------------------------------------
 *   - Scope. "Update only the hero" must not touch anything else. An op
 *     list makes that structurally guaranteed; a whole-document rewrite
 *     silently loses unrelated edits the user made five minutes ago.
 *   - Cost and latency. Ops are tens of tokens. Documents are hundreds of
 *     thousands.
 *   - Explainability and undo. Each op has a human description, so the
 *     chat can show exactly what changed and offer a one-click revert.
 *   - Safety. An op that fails validation is dropped; the rest still
 *     apply. A malformed document rewrite loses the page.
 *
 * The model is given a compact page OUTLINE (node ids + section keys + the
 * current text) so it can target nodes precisely without ever seeing the
 * full tree.
 */

import { z } from "zod";
import {
  duplicateNode,
  getSections,
  insertSubtree,
  moveNode,
  normalizeDocument,
  removeNode,
  updateProps,
  updateStyle,
} from "@/site/document/operations";
import { applyStyleKeyword, createTheme, readableOn } from "@/site/document/theme";
import { buildSection } from "@/site/registry/presets";
import { getDefinition } from "@/site/registry/definitions";
import type {
  SiteDocument,
  SiteNode,
  StyleProps,
  ThemeTokens,
} from "@/site/document/types";
import type { PresetInput } from "@/site/registry/presets";
import { specItemSchema } from "./spec";

// =====================================================================
// Operation schema
// =====================================================================

const hexColor = z.string().regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);

const styleKeyword = z.enum([
  "modern",
  "minimal",
  "luxurious",
  "playful",
  "corporate",
  "warm",
  "bold",
  "clinical",
]);

/**
 * Style patch the AI is allowed to write.
 *
 * A deliberately narrow subset of StyleProps: the model may adjust rhythm,
 * emphasis, and color roles, but cannot set positions, widths, or raw CSS.
 * Letting an LLM write `position: absolute` or `width: 1337px` is how
 * AI-edited layouts break.
 */
const aiStyleSchema = z
  .object({
    textAlign: z.enum(["left", "center", "right"]).optional(),
    fontSize: z
      .enum(["xs", "sm", "base", "lg", "xl", "2xl", "3xl", "4xl", "5xl", "6xl"])
      .optional(),
    fontWeight: z
      .enum(["light", "normal", "medium", "semibold", "bold", "extrabold"])
      .optional(),
    letterSpacing: z.enum(["tighter", "tight", "normal", "wide", "wider"]).optional(),
    lineHeight: z.enum(["tight", "snug", "normal", "relaxed", "loose"]).optional(),
    textTransform: z.enum(["none", "uppercase", "lowercase", "capitalize"]).optional(),
    borderRadius: z.enum(["none", "sm", "md", "lg", "xl", "full"]).optional(),
    boxShadow: z.enum(["none", "sm", "md", "lg", "xl"]).optional(),
    paddingTop: z.enum(["none", "xs", "sm", "md", "lg", "xl", "2xl", "3xl", "4xl"]).optional(),
    paddingBottom: z.enum(["none", "xs", "sm", "md", "lg", "xl", "2xl", "3xl", "4xl"]).optional(),
    gap: z.enum(["none", "xs", "sm", "md", "lg", "xl", "2xl", "3xl", "4xl"]).optional(),
    /** Color roles only — the AI names a token, the theme supplies the hex. */
    colorToken: z
      .enum(["primary", "secondary", "accent", "foreground", "mutedForeground", "primaryForeground"])
      .optional(),
    backgroundColorToken: z
      .enum(["primary", "secondary", "accent", "background", "muted", "card"])
      .optional(),
  })
  .strip();

export const aiOperationSchema = z.discriminatedUnion("op", [
  z
    .object({
      op: z.literal("setTheme"),
      primary: hexColor.optional(),
      secondary: hexColor.optional(),
      accent: hexColor.optional(),
      styleKeyword: styleKeyword.optional(),
      headingFont: z.string().max(60).optional(),
      bodyFont: z.string().max(60).optional(),
      reason: z.string().max(300).optional(),
    })
    .strip(),

  z
    .object({
      op: z.literal("addSection"),
      preset: z.string().min(1).max(60),
      /** Insert index among top-level sections. Omit to append before the footer. */
      index: z.number().int().min(0).max(60).optional(),
      afterSection: z.string().max(60).optional(),
      beforeSection: z.string().max(60).optional(),
      eyebrow: z.string().max(120).optional(),
      title: z.string().max(300).optional(),
      subtitle: z.string().max(600).optional(),
      body: z.string().max(3000).optional(),
      ctaLabel: z.string().max(80).optional(),
      items: z.array(specItemSchema).max(20).optional(),
      reason: z.string().max(300).optional(),
    })
    .strip(),

  z
    .object({
      op: z.literal("removeSection"),
      /** Either the preset key ("pricing") or an exact node id. */
      target: z.string().min(1).max(60),
      reason: z.string().max(300).optional(),
    })
    .strip(),

  z
    .object({
      op: z.literal("moveSection"),
      target: z.string().min(1).max(60),
      toIndex: z.number().int().min(0).max(60),
      reason: z.string().max(300).optional(),
    })
    .strip(),

  z
    .object({
      op: z.literal("duplicateSection"),
      target: z.string().min(1).max(60),
      reason: z.string().max(300).optional(),
    })
    .strip(),

  z
    .object({
      op: z.literal("replaceSection"),
      target: z.string().min(1).max(60),
      preset: z.string().min(1).max(60),
      title: z.string().max(300).optional(),
      subtitle: z.string().max(600).optional(),
      items: z.array(specItemSchema).max(20).optional(),
      reason: z.string().max(300).optional(),
    })
    .strip(),

  z
    .object({
      op: z.literal("setProps"),
      nodeId: z.string().min(1).max(40),
      /** Validated against the node's own registry schema before applying. */
      props: z.record(z.unknown()),
      reason: z.string().max(300).optional(),
    })
    .strip(),

  z
    .object({
      op: z.literal("setStyle"),
      nodeId: z.string().min(1).max(40),
      style: aiStyleSchema,
      breakpoint: z.enum(["base", "tablet", "mobile"]).default("base"),
      reason: z.string().max(300).optional(),
    })
    .strip(),

  z
    .object({
      op: z.literal("setSeo"),
      title: z.string().max(200).optional(),
      description: z.string().max(400).optional(),
      keywords: z.array(z.string().max(60)).max(20).optional(),
      reason: z.string().max(300).optional(),
    })
    .strip(),
]);

export const aiEditResponseSchema = z.object({
  /** Conversational reply shown in the chat transcript. */
  message: z.string().max(2000),
  operations: z.array(aiOperationSchema).max(30).default([]),
});

export type AiOperation = z.infer<typeof aiOperationSchema>;
export type AiEditResponse = z.infer<typeof aiEditResponseSchema>;

// =====================================================================
// Page outline (what the model sees)
// =====================================================================

export interface OutlineNode {
  nodeId: string;
  type: string;
  text?: string;
}

export interface SectionOutline {
  index: number;
  nodeId: string;
  section: string;
  name?: string;
  /** Editable text nodes inside, so the model can target copy precisely. */
  nodes: OutlineNode[];
}

/**
 * Compact, token-cheap description of a page.
 *
 * Only text-bearing nodes are listed, capped per section. A full tree dump
 * would be 50x larger and mostly layout Boxes the model has no reason to
 * touch — and a bigger outline measurably degrades targeting accuracy.
 */
export function buildOutline(doc: SiteDocument, maxNodesPerSection = 8): SectionOutline[] {
  return getSections(doc).map((section, index) => {
    const nodes: OutlineNode[] = [];

    const walk = (node: SiteNode) => {
      if (nodes.length >= maxNodesPerSection) return;
      const definition = getDefinition(node.type);
      const textProp = definition?.inlineTextProp;
      if (textProp && typeof node.props[textProp] === "string") {
        nodes.push({
          nodeId: node.id,
          type: node.type,
          text: String(node.props[textProp]).slice(0, 160),
        });
      } else if (definition && !definition.isContainer && definition.category !== "layout") {
        nodes.push({ nodeId: node.id, type: node.type });
      }
      for (const childId of node.children) {
        const child = doc.nodes[childId];
        if (child) walk(child);
      }
    };
    walk(section);

    return {
      index,
      nodeId: section.id,
      section: section.presetKey ?? section.type,
      name: section.name,
      nodes,
    };
  });
}

// =====================================================================
// Target resolution
// =====================================================================

/**
 * Resolve an op `target` to a top-level section node id.
 *
 * Accepts an exact node id, a preset key ("pricing"), or a fuzzy name
 * ("the pricing bit") because models are inconsistent about which they
 * return even when told. Failing to resolve returns null and the op is
 * skipped rather than applied to the wrong section.
 */
function resolveSectionId(doc: SiteDocument, target: string): string | null {
  if (doc.nodes[target]) {
    // Walk up to the top-level section so "remove the hero" cannot delete
    // just a heading inside it.
    let node = doc.nodes[target];
    while (node.parent && node.parent !== doc.root) {
      node = doc.nodes[node.parent];
    }
    return node.id;
  }

  const key = target.toLowerCase().replace(/[^a-z]/g, "");
  const sections = getSections(doc);

  const exact = sections.find((s) => (s.presetKey ?? "").toLowerCase() === key);
  if (exact) return exact.id;

  const partial = sections.find((s) => {
    const pk = (s.presetKey ?? "").toLowerCase().replace(/[^a-z]/g, "");
    const nm = (s.name ?? "").toLowerCase().replace(/[^a-z]/g, "");
    return (pk && (key.includes(pk) || pk.includes(key))) || (nm && (key.includes(nm) || nm.includes(key)));
  });
  return partial?.id ?? null;
}

function aiStyleToStyleProps(style: z.infer<typeof aiStyleSchema>): StyleProps {
  const { colorToken, backgroundColorToken, ...rest } = style;
  return {
    ...(rest as StyleProps),
    ...(colorToken ? { color: { token: colorToken } } : {}),
    ...(backgroundColorToken ? { backgroundColor: { token: backgroundColorToken } } : {}),
  };
}

// =====================================================================
// Application
// =====================================================================

export interface ApplyResult {
  document: SiteDocument;
  theme: ThemeTokens;
  seo: { title?: string; description?: string; keywords?: string[] };
  /** Human-readable log of what actually happened, for the chat + audit. */
  applied: string[];
  skipped: string[];
}

/**
 * Apply operations in order.
 *
 * Every op is independently guarded: an unresolvable target or an invalid
 * prop is recorded in `skipped` and the remaining ops still run. Partial
 * success is the right behavior here — if the model gets 4 of 5 edits
 * right, the user should get those 4, not an error.
 */
export function applyOperations(
  input: {
    document: SiteDocument;
    theme: ThemeTokens;
    seo?: { title?: string; description?: string; keywords?: string[] };
    presetInput?: PresetInput;
  },
  operations: AiOperation[],
): ApplyResult {
  let document = input.document;
  let theme = input.theme;
  const seo = { ...(input.seo ?? {}) };
  const applied: string[] = [];
  const skipped: string[] = [];
  const presetInput = input.presetInput ?? {};

  for (const operation of operations) {
    try {
      switch (operation.op) {
        case "setTheme": {
          if (operation.styleKeyword) {
            theme = applyStyleKeyword(theme, operation.styleKeyword);
          }
          if (operation.primary || operation.secondary || operation.accent) {
            const primary = operation.primary ?? theme.colors.primary;
            const secondary = operation.secondary ?? theme.colors.secondary;
            const accent = operation.accent ?? theme.colors.accent;
            theme = {
              ...theme,
              colors: {
                ...theme.colors,
                primary,
                // Foregrounds are always re-derived, never taken from the
                // model, so a light brand color can't ship white-on-white.
                primaryForeground: readableOn(primary),
                secondary,
                secondaryForeground: readableOn(secondary),
                accent,
                accentForeground: readableOn(accent),
              },
            };
          }
          if (operation.headingFont || operation.bodyFont) {
            theme = {
              ...theme,
              typography: {
                ...theme.typography,
                headingFont: operation.headingFont ?? theme.typography.headingFont,
                bodyFont: operation.bodyFont ?? theme.typography.bodyFont,
              },
            };
          }
          applied.push(operation.reason ?? "Updated the site theme");
          break;
        }

        case "addSection": {
          const subtree = buildSection(operation.preset, {
            ...presetInput,
            eyebrow: operation.eyebrow,
            title: operation.title,
            subtitle: operation.subtitle,
            body: operation.body,
            ctaLabel: operation.ctaLabel,
            items: operation.items,
          });
          if (!subtree) {
            skipped.push(`Unknown section type "${operation.preset}"`);
            break;
          }

          const sections = getSections(document);
          let index = operation.index;
          if (index === undefined && operation.afterSection) {
            const id = resolveSectionId(document, operation.afterSection);
            const at = sections.findIndex((s) => s.id === id);
            if (at >= 0) index = at + 1;
          }
          if (index === undefined && operation.beforeSection) {
            const id = resolveSectionId(document, operation.beforeSection);
            const at = sections.findIndex((s) => s.id === id);
            if (at >= 0) index = at;
          }
          if (index === undefined) {
            // Default to just before the footer / floating widgets, which is
            // almost always what "add a pricing section" means.
            const tailIndex = sections.findIndex((s) =>
              ["footer", "whatsapp"].includes(s.presetKey ?? ""),
            );
            index = tailIndex >= 0 ? tailIndex : sections.length;
          }

          document = insertSubtree(document, document.root, subtree.nodes, subtree.rootId, index);
          applied.push(operation.reason ?? `Added a ${operation.preset} section`);
          break;
        }

        case "removeSection": {
          const id = resolveSectionId(document, operation.target);
          if (!id) {
            skipped.push(`Could not find a section matching "${operation.target}"`);
            break;
          }
          document = removeNode(document, id);
          applied.push(operation.reason ?? `Removed the ${operation.target} section`);
          break;
        }

        case "moveSection": {
          const id = resolveSectionId(document, operation.target);
          if (!id) {
            skipped.push(`Could not find a section matching "${operation.target}"`);
            break;
          }
          document = moveNode(document, id, document.root, operation.toIndex);
          applied.push(operation.reason ?? `Moved the ${operation.target} section`);
          break;
        }

        case "duplicateSection": {
          const id = resolveSectionId(document, operation.target);
          if (!id) {
            skipped.push(`Could not find a section matching "${operation.target}"`);
            break;
          }
          document = duplicateNode(document, id);
          applied.push(operation.reason ?? `Duplicated the ${operation.target} section`);
          break;
        }

        case "replaceSection": {
          const id = resolveSectionId(document, operation.target);
          if (!id) {
            skipped.push(`Could not find a section matching "${operation.target}"`);
            break;
          }
          const sections = getSections(document);
          const index = sections.findIndex((s) => s.id === id);
          const subtree = buildSection(operation.preset, {
            ...presetInput,
            title: operation.title,
            subtitle: operation.subtitle,
            items: operation.items,
          });
          if (!subtree) {
            skipped.push(`Unknown section type "${operation.preset}"`);
            break;
          }
          document = removeNode(document, id);
          document = insertSubtree(
            document,
            document.root,
            subtree.nodes,
            subtree.rootId,
            index < 0 ? -1 : index,
          );
          applied.push(operation.reason ?? `Redesigned the ${operation.target} section`);
          break;
        }

        case "setProps": {
          const node = document.nodes[operation.nodeId];
          if (!node) {
            skipped.push(`Node ${operation.nodeId} no longer exists`);
            break;
          }
          const definition = getDefinition(node.type);
          if (!definition) {
            skipped.push(`Unknown component type ${node.type}`);
            break;
          }
          // Validate the MERGED props, not the patch: a partial patch is
          // usually invalid on its own against a schema with required keys.
          const merged = { ...node.props, ...operation.props };
          const parsed = definition.schema.safeParse(merged);
          if (!parsed.success) {
            skipped.push(`Invalid properties for ${node.type}`);
            break;
          }
          document = updateProps(document, operation.nodeId, parsed.data as Record<string, unknown>);
          applied.push(operation.reason ?? `Updated the ${node.type.toLowerCase()} content`);
          break;
        }

        case "setStyle": {
          if (!document.nodes[operation.nodeId]) {
            skipped.push(`Node ${operation.nodeId} no longer exists`);
            break;
          }
          document = updateStyle(
            document,
            operation.nodeId,
            aiStyleToStyleProps(operation.style),
            operation.breakpoint,
          );
          applied.push(operation.reason ?? "Restyled an element");
          break;
        }

        case "setSeo": {
          if (operation.title) seo.title = operation.title;
          if (operation.description) seo.description = operation.description;
          if (operation.keywords) seo.keywords = operation.keywords;
          applied.push(operation.reason ?? "Updated the page SEO");
          break;
        }
      }
    } catch (err) {
      skipped.push(
        `Operation ${operation.op} failed: ${err instanceof Error ? err.message : "unknown error"}`,
      );
    }
  }

  return { document: normalizeDocument(document), theme, seo, applied, skipped };
}

/**
 * Recolor a theme from a plain-language request like "change blue to
 * green" without involving the model at all.
 *
 * Runs as a fast path before calling Gemini: color swaps are the single
 * most common edit request, and resolving them locally makes them instant
 * and free instead of a 3-second round trip.
 */
const COLOR_WORDS: Record<string, string> = {
  red: "#DC2626",
  orange: "#EA580C",
  amber: "#D97706",
  yellow: "#CA8A04",
  lime: "#65A30D",
  green: "#16A34A",
  emerald: "#059669",
  teal: "#0D9488",
  cyan: "#0891B2",
  sky: "#0284C7",
  blue: "#2563EB",
  indigo: "#4F46E5",
  violet: "#7C3AED",
  purple: "#9333EA",
  fuchsia: "#C026D3",
  pink: "#DB2777",
  rose: "#E11D48",
  brown: "#78350F",
  gold: "#B08D57",
  black: "#111827",
  grey: "#4B5563",
  gray: "#4B5563",
  navy: "#1E3A8A",
  maroon: "#7F1D1D",
};

export function tryLocalColorEdit(
  prompt: string,
  theme: ThemeTokens,
): { theme: ThemeTokens; message: string } | null {
  const text = prompt.toLowerCase();
  const names = Object.keys(COLOR_WORDS);

  // "change X to Y" / "make it Y instead of X" / "X -> Y"
  const swap = new RegExp(
    `\\b(${names.join("|")})\\b[^a-z]{1,20}?\\b(?:to|into|with|instead of|for)\\b[^a-z]{0,6}\\b(${names.join("|")})\\b`,
  ).exec(text);
  if (swap) {
    const target = COLOR_WORDS[swap[2]];
    return {
      theme: {
        ...theme,
        colors: {
          ...theme.colors,
          primary: target,
          primaryForeground: readableOn(target),
        },
      },
      message: `Changed the ${swap[1]} in your theme to ${swap[2]}. Every button, link, and accent updated at once.`,
    };
  }

  // "make the primary colour green" / "use a green theme"
  const single = new RegExp(
    `\\b(?:primary|brand|main|theme|colour|color)\\b[^a-z]{1,20}?\\b(${names.join("|")})\\b|\\b(${names.join("|")})\\b\\s+(?:theme|colour|color|palette)\\b`,
  ).exec(text);
  if (single) {
    const word = single[1] ?? single[2];
    const target = COLOR_WORDS[word];
    return {
      theme: {
        ...theme,
        colors: { ...theme.colors, primary: target, primaryForeground: readableOn(target) },
      },
      message: `Set your primary colour to ${word}. The whole site picked it up.`,
    };
  }

  return null;
}

/** Same fast path for "make it more luxurious / minimal / bold". */
export function tryLocalStyleEdit(
  prompt: string,
  theme: ThemeTokens,
): { theme: ThemeTokens; message: string } | null {
  const text = prompt.toLowerCase();
  const keywords: Array<[RegExp, NonNullable<ThemeTokens["styleKeyword"]>]> = [
    [/luxur|premium|elegant|upmarket|sophisticat/, "luxurious"],
    [/minimal|clean|simple|understated/, "minimal"],
    [/playful|fun|friendly|vibrant|cheerful/, "playful"],
    [/corporate|professional|formal|business-?like/, "corporate"],
    [/warm|cosy|cozy|inviting|homely/, "warm"],
    [/bold|striking|loud|punchy|dramatic/, "bold"],
    [/clinical|medical|sterile|calm/, "clinical"],
    [/modern|contemporary|sleek/, "modern"],
  ];

  // Only treat it as a restyle when the user is clearly asking for one.
  if (!/\b(make|look|feel|more|style|redesign|restyle|vibe)\b/.test(text)) return null;

  for (const [pattern, keyword] of keywords) {
    if (pattern.test(text)) {
      return {
        theme: applyStyleKeyword(theme, keyword),
        message: `Restyled the site to feel more ${keyword}. I updated the fonts, corner radius, shadows, and spacing rhythm while keeping your brand colours.`,
      };
    }
  }
  return null;
}

/** Rebuild a theme for a new industry, keeping any explicit brand colors. */
export function themeForIndustry(industry: string, current?: ThemeTokens): ThemeTokens {
  return createTheme({
    industry,
    primary: current?.colors.primary,
    secondary: current?.colors.secondary,
    accent: current?.colors.accent,
    styleKeyword: current?.styleKeyword,
  });
}
