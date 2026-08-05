/**
 * The AI's output contract.
 *
 * ---------------------------------------------------------------------
 * Why the model does NOT emit node trees
 * ---------------------------------------------------------------------
 * The obvious design is "ask the LLM for a SiteDocument". It fails badly
 * in practice:
 *
 *   - Size. A 6-page site is 800+ nodes and well over 100k tokens of
 *     JSON. It will not fit, will be slow, and will cost a fortune per
 *     generation.
 *   - Reliability. Models truncate long JSON, invent props, mismatch
 *     parent/children arrays, and produce unbalanced grids. Every one of
 *     those is a broken page.
 *   - Quality. Design consistency (spacing rhythm, type scale, contrast)
 *     comes from applying the same rules everywhere. A model
 *     free-styling inline styles produces something that looks
 *     AI-generated.
 *
 * So the model produces a SiteSpec: pages, and per page an ordered list of
 * section keys plus the *content* for each. That is ~2k tokens for a whole
 * site, is easy for a model to get right, and is validated by Zod here.
 * The preset library then expands it into a professionally laid-out node
 * tree deterministically.
 *
 * Net effect: the AI decides structure, copy, and palette — the things it
 * is genuinely good at. The compiler decides layout, spacing, and markup —
 * the things it is not.
 */

import { z } from "zod";
import { PRESET_KEYS } from "@/site/registry/presets";

/** Item shape shared by services, team, pricing, FAQ, stats, testimonials. */
export const specItemSchema = z
  .object({
    title: z.string().max(200).optional(),
    description: z.string().max(1200).optional(),
    /** Lucide icon name; validated loosely and defaulted at render. */
    icon: z.string().max(60).optional(),
    imageUrl: z.string().max(1000).optional(),
    price: z.string().max(40).optional(),
    priceSuffix: z.string().max(40).optional(),
    role: z.string().max(120).optional(),
    features: z.array(z.string().max(200)).max(12).optional(),
    highlighted: z.boolean().optional(),
    quote: z.string().max(800).optional(),
    author: z.string().max(120).optional(),
    rating: z.number().min(1).max(5).optional(),
    value: z.string().max(40).optional(),
    label: z.string().max(160).optional(),
    question: z.string().max(300).optional(),
    answer: z.string().max(2000).optional(),
  })
  .strip();

export const sectionSpecSchema = z
  .object({
    /**
     * Not a strict enum: models reliably pick from a provided list but
     * occasionally return a near-miss ("hero" for "hero-split"). Accepting
     * a string and resolving through `resolvePresetAlias` recovers those
     * instead of failing the whole generation.
     */
    preset: z.string().min(1).max(60),
    eyebrow: z.string().max(120).optional(),
    title: z.string().max(300).optional(),
    subtitle: z.string().max(600).optional(),
    body: z.string().max(3000).optional(),
    ctaLabel: z.string().max(80).optional(),
    ctaHref: z.string().max(300).optional(),
    secondaryCtaLabel: z.string().max(80).optional(),
    /** Short search phrase used to pick a stock/placeholder image. */
    imageQuery: z.string().max(120).optional(),
    items: z.array(specItemSchema).max(20).optional(),
  })
  .strip();

export const pageSpecSchema = z
  .object({
    title: z.string().min(1).max(120),
    /** Leading-slash route. "/" is the home page. */
    path: z.string().min(1).max(200),
    metaTitle: z.string().max(200).optional(),
    metaDescription: z.string().max(400).optional(),
    sections: z.array(sectionSpecSchema).min(1).max(20),
  })
  .strip();

export const brandSpecSchema = z
  .object({
    businessName: z.string().max(200).optional(),
    tagline: z.string().max(300).optional(),
    industry: z.string().max(120).optional(),
    businessCategory: z.string().max(120).optional(),
    services: z.array(z.string().max(160)).max(20).optional(),
    targetAudience: z.string().max(300).optional(),
    tone: z.string().max(120).optional(),
    highlights: z.array(z.string().max(200)).max(10).optional(),
  })
  .strip();

export const themeSpecSchema = z
  .object({
    /** Hex colors. Foregrounds are derived for contrast, never supplied. */
    primary: z
      .string()
      .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/)
      .optional(),
    secondary: z
      .string()
      .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/)
      .optional(),
    accent: z
      .string()
      .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/)
      .optional(),
    styleKeyword: z
      .enum([
        "modern",
        "minimal",
        "luxurious",
        "playful",
        "corporate",
        "warm",
        "bold",
        "clinical",
      ])
      .optional(),
  })
  .strip();

export const siteSpecSchema = z
  .object({
    siteName: z.string().max(200).optional(),
    brand: brandSpecSchema.optional(),
    theme: themeSpecSchema.optional(),
    pages: z.array(pageSpecSchema).min(1).max(12),
    /** One-paragraph explanation shown in the AI chat transcript. */
    summary: z.string().max(1500).optional(),
  })
  .strip();

export type SpecItem = z.infer<typeof specItemSchema>;
export type SectionSpec = z.infer<typeof sectionSpecSchema>;
export type PageSpec = z.infer<typeof pageSpecSchema>;
export type BrandSpec = z.infer<typeof brandSpecSchema>;
export type ThemeSpec = z.infer<typeof themeSpecSchema>;
export type SiteSpec = z.infer<typeof siteSpecSchema>;

/**
 * The preset list injected into the prompt. Generated from the registry so
 * a newly added section becomes available to the AI with no prompt edit —
 * the usual source of drift between "what the AI offers" and "what the
 * builder supports".
 */
export function presetCatalogForPrompt(): string {
  return PRESET_KEYS.join(", ");
}
