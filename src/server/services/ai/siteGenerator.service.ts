/**
 * AI website generation and conversational editing.
 *
 * Follows the same "AI with a deterministic floor" pattern as
 * postGenerator.service.ts, which matters more here: a failed post generation
 * is an inconvenience, a failed site generation is an empty product.
 *
 * Generation pipeline:
 *   prompt + tenant data -> Gemini -> SiteSpec (Zod-validated)
 *                                  -> compiler -> node trees
 *   on any failure       -> blueprint spec  -> compiler -> node trees
 *
 * Editing pipeline:
 *   prompt -> local fast path (colour / restyle) if it matches
 *          -> otherwise Gemini -> operations (Zod-validated) -> applied
 */

import { geminiService } from "@/server/services/ai/gemini.service";
import { logger } from "@/server/utils/logger";
import { blueprintSpec, compileSite, type CompileContext, type CompiledSite } from "@/site/ai/compile";
import { getBlueprint } from "@/site/ai/blueprints";
import { presetCatalogForPrompt, siteSpecSchema, type SiteSpec } from "@/site/ai/spec";
import {
  aiEditResponseSchema,
  aiOperationSchema,
  applyOperations,
  buildOutline,
  tryLocalColorEdit,
  tryLocalStyleEdit,
  type AiEditResponse,
  type AiOperation,
} from "@/site/ai/operations";
import type { BrandContext, SiteDocument, ThemeTokens } from "@/site/document/types";
import type { PresetInput } from "@/site/registry/presets";

const SYSTEM_INSTRUCTION = `You are a senior web designer and copywriter who builds websites for local businesses.
You write specific, concrete, human copy — never marketing filler, never lorem ipsum, never square-bracket placeholders.
You never invent verifiable facts such as prices, awards, years in business, staff names, or certifications unless they are given to you.
You always respond with valid JSON matching the requested shape exactly.`;

// =====================================================================
// Generation
// =====================================================================

export interface GenerateResult {
  site: CompiledSite;
  source: "ai" | "blueprint";
  /** Message shown in the chat transcript. */
  message: string;
}

/**
 * Generate a whole site from a natural-language brief.
 *
 * `maxOutputTokens` is set high because a 5-page spec with real copy is
 * genuinely large, and gemini.service.ts already documents that thinking
 * tokens share this budget — under-budgeting silently returns empty text and
 * degrades every generation to the blueprint.
 */
export async function generateSite(
  prompt: string,
  ctx: CompileContext & { description?: string | null },
): Promise<GenerateResult> {
  const blueprint = getBlueprint(ctx.industry);

  if (geminiService.isEnabled()) {
    try {
      const spec = await requestSpec(prompt, ctx);
      if (spec) {
        return {
          site: compileSite(spec, ctx),
          source: "ai",
          message:
            spec.summary ??
            `I built a ${spec.pages.length}-page website for ${ctx.businessName}. Every section is editable — tell me what to change.`,
        };
      }
    } catch (err) {
      logger.warn("Gemini site generation failed — using the industry blueprint", {
        err: err instanceof Error ? err.message : String(err),
        industry: ctx.industry,
      });
    }
  }

  const spec = blueprintSpec(ctx);
  return {
    site: compileSite(spec, ctx),
    source: "blueprint",
    message:
      spec.summary ??
      `I built a ${blueprint.pages.length}-page ${blueprint.label.toLowerCase()} website for ${ctx.businessName}.`,
  };
}

async function requestSpec(
  prompt: string,
  ctx: CompileContext & { description?: string | null },
): Promise<SiteSpec | null> {
  const blueprint = getBlueprint(ctx.industry);

  const instructions = [
    `Design a website for a local business based on this request: "${prompt}"`,
    "",
    "Business facts you must use (do not invent alternatives):",
    `- Name: ${ctx.businessName}`,
    ctx.industry ? `- Industry: ${ctx.industry}` : "",
    ctx.city ? `- City: ${ctx.city}` : "",
    ctx.description ? `- Existing description: ${ctx.description}` : "",
    ctx.phone ? `- Phone: ${ctx.phone}` : "",
    "",
    `Available section presets (use ONLY these keys): ${presetCatalogForPrompt()}`,
    "",
    "Recommended structure for this industry — follow it closely unless the request says otherwise:",
    ...blueprint.pages.map((p) => `- ${p.title} (${p.path}): ${p.sections.join(", ")}`),
    "",
    "Rules:",
    "- Every page must start with the `navbar` preset and end with `footer`, then `whatsapp`.",
    "- Exactly one page must have path \"/\".",
    "- Write real, specific copy in the business's voice. Reference the city and industry naturally.",
    "- For `services`, `team`, `faq`, `pricing`, `testimonials`, and `stats`, fill the `items` array.",
    "- Never write placeholder text, square brackets, or 'Lorem ipsum'.",
    "- Never invent prices, awards, years, or staff names. For `team`, use generic role titles and leave `title` as a role-appropriate placeholder like \"Senior Dentist\".",
    "- `imageQuery` should be 2-3 words describing the photo needed, e.g. \"dental clinic interior\".",
    "- Pick a `theme.primary` hex colour that suits the industry, plus a `styleKeyword`.",
    "- Keep meta titles under 60 characters and meta descriptions under 155.",
    "",
    "Return JSON with this exact shape:",
    `{
  "siteName": string,
  "brand": { "businessName": string, "industry": string, "services": string[], "tone": string, "highlights": string[] },
  "theme": { "primary": "#RRGGBB", "secondary": "#RRGGBB", "accent": "#RRGGBB", "styleKeyword": "modern|minimal|luxurious|playful|corporate|warm|bold|clinical" },
  "pages": [
    {
      "title": string,
      "path": "/",
      "metaTitle": string,
      "metaDescription": string,
      "sections": [
        { "preset": string, "eyebrow": string, "title": string, "subtitle": string, "body": string, "ctaLabel": string, "imageQuery": string,
          "items": [{ "title": string, "description": string, "icon": string, "role": string, "price": string, "features": string[], "question": string, "answer": string, "quote": string, "author": string, "rating": number, "value": string, "label": string }] }
      ]
    }
  ],
  "summary": string
}`,
    "Omit any key that does not apply to a given section.",
  ]
    .filter(Boolean)
    .join("\n");

  const raw = await geminiService.generateJson<unknown>(instructions, {
    systemInstruction: SYSTEM_INSTRUCTION,
    temperature: 0.75,
    // A 5-page spec with full copy runs 4-6k visible tokens.
    maxOutputTokens: 8192,
  });

  const parsed = siteSpecSchema.safeParse(raw);
  if (!parsed.success) {
    logger.warn("Gemini site spec failed validation", {
      issues: parsed.error.issues.slice(0, 5).map((i) => `${i.path.join(".")}: ${i.message}`),
    });
    return null;
  }
  return parsed.data;
}

// =====================================================================
// Conversational editing
// =====================================================================

export interface EditResult {
  document: SiteDocument;
  theme: ThemeTokens;
  seo: { title?: string; description?: string; keywords?: string[] };
  message: string;
  operations: AiOperation[];
  applied: string[];
  skipped: string[];
  source: "ai" | "local";
  themeChanged: boolean;
  documentChanged: boolean;
}

/**
 * Apply a natural-language edit request.
 *
 * Colour swaps and restyle requests are resolved locally first. They are by
 * far the most common requests, and handling them without a model round trip
 * makes them instant, free, and immune to a model outage.
 */
export async function editSite(
  prompt: string,
  input: {
    document: SiteDocument;
    theme: ThemeTokens;
    brand: BrandContext;
    seo?: { title?: string; description?: string; keywords?: string[] };
    presetInput?: PresetInput;
    /** Recent turns, so follow-ups like "make it bigger" have a referent. */
    history?: Array<{ role: "USER" | "ASSISTANT"; content: string }>;
  },
): Promise<EditResult> {
  const base = {
    document: input.document,
    theme: input.theme,
    seo: input.seo ?? {},
    operations: [] as AiOperation[],
    applied: [] as string[],
    skipped: [] as string[],
  };

  const local = tryLocalColorEdit(prompt, input.theme) ?? tryLocalStyleEdit(prompt, input.theme);
  if (local) {
    return {
      ...base,
      theme: local.theme,
      message: local.message,
      applied: [local.message],
      source: "local",
      themeChanged: true,
      documentChanged: false,
    };
  }

  if (!geminiService.isEnabled()) {
    return {
      ...base,
      message:
        "AI editing needs a Gemini API key configured on the server. You can still make any change directly in the editor — the panels on the right control every property.",
      source: "local",
      themeChanged: false,
      documentChanged: false,
    };
  }

  let response: AiEditResponse;
  try {
    response = await requestEdit(prompt, input);
  } catch (err) {
    logger.warn("Gemini site edit failed", {
      err: err instanceof Error ? err.message : String(err),
    });
    return {
      ...base,
      message:
        "I could not process that just now. Try rephrasing, or make the change directly in the editor.",
      source: "ai",
      themeChanged: false,
      documentChanged: false,
    };
  }

  const result = applyOperations(
    {
      document: input.document,
      theme: input.theme,
      seo: input.seo,
      presetInput: input.presetInput,
    },
    response.operations,
  );

  const themeChanged = result.theme !== input.theme;
  const documentChanged = result.document !== input.document;

  return {
    document: result.document,
    theme: result.theme,
    seo: result.seo,
    message: composeMessage(response.message, result.applied, result.skipped),
    operations: response.operations,
    applied: result.applied,
    skipped: result.skipped,
    source: "ai",
    themeChanged,
    documentChanged,
  };
}

/**
 * Be honest in the transcript about partial success.
 *
 * If two of three requested edits landed, saying so is far better than a
 * confident "Done!" that leaves the user hunting for a change that never
 * happened.
 */
function composeMessage(message: string, applied: string[], skipped: string[]): string {
  const parts = [message.trim()];
  if (applied.length === 0 && skipped.length > 0) {
    parts.push("I could not apply that — try being more specific about which section you mean.");
  } else if (skipped.length > 0) {
    parts.push(`Some parts did not apply: ${skipped.slice(0, 3).join("; ")}.`);
  }
  return parts.filter(Boolean).join("\n\n");
}

async function requestEdit(
  prompt: string,
  input: {
    document: SiteDocument;
    theme: ThemeTokens;
    brand: BrandContext;
    history?: Array<{ role: "USER" | "ASSISTANT"; content: string }>;
  },
): Promise<AiEditResponse> {
  const outline = buildOutline(input.document);

  const instructions = [
    "You are editing an existing website. Apply the user's request as a list of operations.",
    "",
    "Business context (already known — never ask for it):",
    `- Name: ${input.brand.businessName ?? "Unknown"}`,
    input.brand.industry ? `- Industry: ${input.brand.industry}` : "",
    input.brand.city ? `- City: ${input.brand.city}` : "",
    input.brand.tone ? `- Tone: ${input.brand.tone}` : "",
    "",
    "Current theme:",
    `- primary ${input.theme.colors.primary}, secondary ${input.theme.colors.secondary}, accent ${input.theme.colors.accent}`,
    `- style: ${input.theme.styleKeyword ?? "modern"}, radius: ${input.theme.radius}, heading font: ${input.theme.typography.headingFont}`,
    "",
    "Current page outline (index | section | nodeId : text):",
    ...outline.map(
      (section) =>
        `${section.index} | ${section.section} | ${section.nodeId}\n` +
        section.nodes
          .map((n) => `    ${n.type} | ${n.nodeId}${n.text ? ` : "${n.text}"` : ""}`)
          .join("\n"),
    ),
    "",
    ...(input.history?.length
      ? [
          "Recent conversation:",
          ...input.history.slice(-6).map((m) => `${m.role === "USER" ? "User" : "You"}: ${m.content.slice(0, 300)}`),
          "",
        ]
      : []),
    `Available section presets: ${presetCatalogForPrompt()}`,
    "",
    "Available operations:",
    '- { "op": "setTheme", "primary": "#RRGGBB", "secondary": "#RRGGBB", "accent": "#RRGGBB", "styleKeyword": "...", "headingFont": "...", "bodyFont": "...", "reason": "..." }',
    '- { "op": "addSection", "preset": "pricing", "afterSection": "services", "title": "...", "subtitle": "...", "items": [...], "reason": "..." }',
    '- { "op": "removeSection", "target": "pricing", "reason": "..." }',
    '- { "op": "moveSection", "target": "testimonials", "toIndex": 3, "reason": "..." }',
    '- { "op": "duplicateSection", "target": "services", "reason": "..." }',
    '- { "op": "replaceSection", "target": "hero-split", "preset": "hero-centered", "title": "...", "reason": "..." }',
    '- { "op": "setProps", "nodeId": "ab12cd34", "props": { "text": "New heading" }, "reason": "..." }',
    '- { "op": "setStyle", "nodeId": "ab12cd34", "style": { "fontSize": "5xl", "textAlign": "center", "colorToken": "primary" }, "breakpoint": "base", "reason": "..." }',
    '- { "op": "setSeo", "title": "...", "description": "...", "reason": "..." }',
    "",
    "Rules:",
    "- Change ONLY what the user asked for. Do not touch unrelated sections.",
    "- Use setProps to rewrite copy, referencing the exact nodeId from the outline.",
    "- Use setStyle only for the listed style keys. Never emit raw CSS, widths, or positions.",
    "- For colours, always give hex values on setTheme rather than styling nodes individually.",
    '- "Make it more modern/luxurious/minimal" means a setTheme with a styleKeyword.',
    "- Write real copy, never placeholders. Never invent prices, awards, or names.",
    "- Keep the operations list minimal — usually 1 to 5 operations.",
    "",
    `User request: "${prompt}"`,
    "",
    'Return JSON: { "message": "a short, friendly explanation of what you changed", "operations": [ ... ] }',
  ]
    .filter(Boolean)
    .join("\n");

  const raw = await geminiService.generateJson<unknown>(instructions, {
    systemInstruction: SYSTEM_INSTRUCTION,
    temperature: 0.5,
    maxOutputTokens: 3000,
  });

  const parsed = aiEditResponseSchema.safeParse(raw);
  if (!parsed.success) {
    // Salvage the message and any individually-valid operations rather than
    // discarding a response that is 90% correct.
    const partial = raw as { message?: unknown; operations?: unknown };
    const operations: AiOperation[] = [];
    if (Array.isArray(partial.operations)) {
      for (const candidate of partial.operations) {
        const op = aiOperationSchema.safeParse(candidate);
        if (op.success) operations.push(op.data);
      }
    }
    return {
      message: typeof partial.message === "string" ? partial.message : "Here is what I changed.",
      operations,
    };
  }
  return parsed.data;
}

// =====================================================================
// Content generation
// =====================================================================

export interface GeneratedContent {
  items: Array<Record<string, string>>;
  source: "ai" | "template";
}

/**
 * Generate a block of content (FAQ answers, service descriptions, policy
 * text) for the user to insert. Kept separate from `editSite` because here the
 * user wants to review the output before it touches the page.
 */
export async function generateContent(
  kind: string,
  input: { brand: BrandContext; topic?: string; count: number },
): Promise<GeneratedContent> {
  const blueprint = getBlueprint(input.brand.industry);
  const name = input.brand.businessName ?? "the business";

  if (geminiService.isEnabled()) {
    try {
      const shapes: Record<string, string> = {
        faq: '[{ "question": "...", "answer": "..." }]',
        services: '[{ "title": "...", "description": "...", "icon": "LucideIconName" }]',
        testimonials: '[{ "quote": "...", "author": "...", "rating": 5 }]',
        about: '[{ "title": "About us", "body": "..." }]',
        meta: '[{ "title": "...", "description": "..." }]',
        cta: '[{ "title": "...", "subtitle": "...", "ctaLabel": "..." }]',
        privacy: '[{ "title": "Privacy Policy", "body": "..." }]',
        terms: '[{ "title": "Terms of Service", "body": "..." }]',
        blog: '[{ "title": "...", "excerpt": "...", "body": "..." }]',
      };

      const result = await geminiService.generateJson<{ items?: Array<Record<string, unknown>> }>(
        [
          `Write ${kind} content for "${name}", a ${input.brand.industry ?? blueprint.label}${input.brand.city ? ` in ${input.brand.city}` : ""}.`,
          input.topic ? `Focus on: ${input.topic}.` : "",
          input.brand.services?.length ? `Services offered: ${input.brand.services.join(", ")}.` : "",
          `Tone: ${input.brand.tone ?? "warm and professional"}.`,
          `Produce ${input.count} item(s).`,
          "Never invent prices, awards, years in business, or staff names.",
          kind === "privacy" || kind === "terms"
            ? "Write a clear, general-purpose policy suitable for a small local business. Note in the text that it should be reviewed by a legal professional."
            : "",
          `Return JSON: { "items": ${shapes[kind] ?? '[{ "title": "...", "body": "..." }]'} }`,
        ]
          .filter(Boolean)
          .join("\n"),
        {
          systemInstruction: SYSTEM_INSTRUCTION,
          temperature: 0.8,
          maxOutputTokens: kind === "privacy" || kind === "terms" ? 4000 : 2000,
        },
      );

      const items = (result.items ?? [])
        .filter((i) => i && typeof i === "object")
        .slice(0, input.count)
        .map((i) =>
          Object.fromEntries(
            Object.entries(i).map(([k, v]) => [k, typeof v === "string" ? v : String(v ?? "")]),
          ),
        );

      if (items.length > 0) return { items, source: "ai" };
    } catch (err) {
      logger.warn("Gemini content generation failed — using templates", {
        kind,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Template floor, matching the blueprint copy.
  const spec = blueprintSpec({ businessName: name, industry: input.brand.industry ?? null });
  const section = spec.pages
    .flatMap((p) => p.sections)
    .find((s) => s.preset.includes(kind) || kind.includes(s.preset));

  return {
    items: (section?.items ?? []).slice(0, input.count).map((i) =>
      Object.fromEntries(
        Object.entries(i).filter(([, v]) => typeof v === "string") as Array<[string, string]>,
      ),
    ),
    source: "template",
  };
}
