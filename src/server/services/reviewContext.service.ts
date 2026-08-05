/**
 * Review context service.
 *
 * Turns a tenant's raw inputs (business type, description, highlights,
 * SEO keywords, GMB link) into a compact AI "brief" that the review
 * generator injects into every prompt — so reviews become specific and
 * on-brand (a hospital gets "spotless wards / expert doctors / short
 * wait times", a restaurant gets "authentic flavors / quick service").
 *
 * NOTE on the GMB link: we cannot scrape Google Business Profile pages
 * (against Google's ToS and unreliable). Instead we (a) enrich from the
 * Places API when available, and (b) use Gemini's domain knowledge of
 * the business category to infer realistic, relevant themes. The link
 * is stored for the tenant's reference and future official-API sync.
 */

import { geminiService } from "@/server/services/ai/gemini.service";
import { reviewProfileRepository } from "@/server/repositories/reviewProfile.repository";
import { verifyPlaceId } from "@/server/services/google/placeId.service";
import { extractBusinessBriefFromWebsite } from "@/server/services/websiteScraper.service";
import { logger } from "@/server/utils/logger";

export interface ReviewProfileInput {
  gmbProfileUrl?: string | null;
  websiteUrl?: string | null;
  businessType?: string | null;
  description?: string | null;
  highlights?: string[] | null;
  keywords?: string[] | null;
  tone?: string;
  /**
   * Manual override of the AI brief. When non-empty it's persisted as-is
   * and used verbatim; when empty/undefined the brief is auto-synthesized.
   */
  aiContext?: string | null;
}

/** Merge two string lists case-insensitively, preserving order, capped. */
function mergeUnique(a: string[], b: string[], cap = 15): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const v of [...a, ...b]) {
    const t = v.trim();
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
    if (out.length >= cap) break;
  }
  return out;
}

export interface SynthesizedContext {
  aiContext: string;
  highlights: string[];
  keywords: string[];
  businessType: string | null;
}

/**
 * Category-aware default highlight themes — used as a starting point and
 * as a fallback when Gemini is unavailable.
 */
const CATEGORY_HIGHLIGHTS: Record<string, string[]> = {
  hospital: [
    "cleanliness and hygiene",
    "expert doctors",
    "caring nursing staff",
    "short wait times",
    "modern equipment",
    "clear communication",
  ],
  clinic: [
    "attentive doctors",
    "clean facilities",
    "minimal waiting",
    "accurate diagnosis",
    "friendly staff",
  ],
  dental: [
    "painless treatment",
    "gentle dentist",
    "hygienic clinic",
    "clear explanations",
    "modern equipment",
  ],
  restaurant: [
    "delicious food",
    "great flavors",
    "quick service",
    "clean ambience",
    "value for money",
    "friendly staff",
  ],
  cafe: ["great coffee", "cozy ambience", "friendly baristas", "fresh food"],
  hotel: [
    "clean rooms",
    "courteous staff",
    "great location",
    "comfortable stay",
    "good amenities",
  ],
  salon: [
    "skilled stylists",
    "hygienic salon",
    "great results",
    "relaxing experience",
    "friendly staff",
  ],
  spa: ["relaxing treatments", "professional therapists", "clean facilities", "great ambience"],
  gym: ["modern equipment", "knowledgeable trainers", "clean facilities", "motivating environment"],
  salon_default: ["professional service", "great results", "friendly staff"],
  default: [
    "professional service",
    "friendly staff",
    "great quality",
    "value for money",
    "clean and welcoming",
  ],
};

function defaultHighlightsFor(businessType: string | null | undefined): string[] {
  if (!businessType) return CATEGORY_HIGHLIGHTS.default!;
  const lower = businessType.toLowerCase();
  for (const [key, arr] of Object.entries(CATEGORY_HIGHLIGHTS)) {
    if (key !== "default" && lower.includes(key)) return arr;
  }
  return CATEGORY_HIGHLIGHTS.default!;
}

export const reviewContextService = {
  /**
   * Synthesize (or refresh) the AI brief for a location and persist it.
   */
  async synthesizeAndSave(
    locationId: string,
    tenantId: string,
    businessName: string,
    city: string | null,
    placeId: string | null,
    input: ReviewProfileInput,
  ) {
    // The AI agent visits the business website (if provided), gathers
    // info, and folds it into the inputs before synthesis. The extracted
    // draft is persisted so it can be reused for future review generation.
    let websiteSummary: string | null = null;
    let websiteFetchedAt: Date | null = null;
    const enriched: ReviewProfileInput = { ...input };

    if (input.websiteUrl) {
      const brief = await extractBusinessBriefFromWebsite(
        input.websiteUrl,
        businessName,
      );
      if (brief) {
        websiteSummary = brief.summary || null;
        websiteFetchedAt = new Date();
        enriched.businessType = input.businessType?.trim() || brief.businessType;
        enriched.description = input.description?.trim() || brief.description;
        enriched.highlights = mergeUnique(input.highlights ?? [], brief.highlights);
        enriched.keywords = mergeUnique(input.keywords ?? [], brief.keywords);
      }
    }

    const synth = await reviewContextService.synthesize(
      businessName,
      city,
      placeId,
      enriched,
      websiteSummary,
    );

    // A non-empty manual brief always wins over the auto-synthesized one.
    const manualBrief = input.aiContext?.trim();
    const finalAiContext = manualBrief ? manualBrief : synth.aiContext;

    await reviewProfileRepository.upsert(locationId, tenantId, {
      gmbProfileUrl: input.gmbProfileUrl ?? null,
      websiteUrl: input.websiteUrl ?? null,
      websiteSummary,
      websiteFetchedAt,
      businessType: synth.businessType,
      description: enriched.description ?? null,
      highlights: synth.highlights,
      keywords: synth.keywords,
      tone: input.tone ?? "warm",
      aiContext: finalAiContext,
      synthesizedAt: new Date(),
    });

    return { ...synth, aiContext: finalAiContext, websiteSummary };
  },

  /**
   * Build the AI brief without persisting. Uses Places enrichment +
   * Gemini synthesis, with a robust template fallback.
   */
  async synthesize(
    businessName: string,
    city: string | null,
    placeId: string | null,
    input: ReviewProfileInput,
    websiteSummary?: string | null,
  ): Promise<SynthesizedContext> {
    // Optional Places enrichment (only if a Maps key + billing exist).
    let placeSummary = "";
    if (placeId) {
      try {
        const place = await verifyPlaceId(placeId);
        if (place.verified) {
          placeSummary = [
            place.name ? `Google name: ${place.name}.` : "",
            place.formattedAddress ? `Address: ${place.formattedAddress}.` : "",
            place.rating != null
              ? `Current Google rating: ${place.rating} from ${place.userRatingsTotal ?? 0} reviews.`
              : "",
          ]
            .filter(Boolean)
            .join(" ");
        }
      } catch {
        /* non-fatal */
      }
    }

    const businessType = input.businessType?.trim() || null;
    const providedHighlights = (input.highlights ?? []).filter(Boolean);
    const providedKeywords = (input.keywords ?? []).filter(Boolean);

    // Website-derived draft is a strong, factual signal — append to the
    // Places summary so Gemini grounds the brief in the real business.
    const groundingSummary = [placeSummary, websiteSummary ? `Website info: ${websiteSummary}` : ""]
      .filter(Boolean)
      .join(" ");

    if (geminiService.isEnabled()) {
      try {
        const brief = await synthesizeWithGemini(
          businessName,
          city,
          businessType,
          input.description ?? null,
          providedHighlights,
          providedKeywords,
          groundingSummary,
        );
        if (brief) return brief;
      } catch (err) {
        logger.warn("Context synthesis via Gemini failed — using defaults", {
          err: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // Fallback: merge provided inputs with category defaults.
    const highlights =
      providedHighlights.length > 0
        ? providedHighlights
        : defaultHighlightsFor(businessType);
    const aiContext = [
      `${businessName}${businessType ? ` is a ${businessType}` : ""}${city ? ` in ${city}` : ""}.`,
      input.description ? input.description : "",
      websiteSummary ? websiteSummary : "",
      `Emphasize: ${highlights.join(", ")}.`,
      providedKeywords.length
        ? `Naturally include keywords: ${providedKeywords.join(", ")}.`
        : "",
    ]
      .filter(Boolean)
      .join(" ");

    return {
      aiContext,
      highlights,
      keywords: providedKeywords,
      businessType,
    };
  },

  getForLocation(locationId: string) {
    return reviewProfileRepository.findByLocationId(locationId);
  },
};

async function synthesizeWithGemini(
  businessName: string,
  city: string | null,
  businessType: string | null,
  description: string | null,
  highlights: string[],
  keywords: string[],
  groundingSummary: string,
): Promise<SynthesizedContext | null> {
  const prompt = [
    "You are building a concise brief that will guide generation of authentic customer reviews for a local business.",
    `Business name: ${businessName}.`,
    businessType ? `Type: ${businessType}.` : "",
    city ? `City: ${city}.` : "",
    description ? `Owner description: ${description}.` : "",
    highlights.length ? `Owner-provided highlights: ${highlights.join(", ")}.` : "",
    keywords.length ? `Target SEO keywords: ${keywords.join(", ")}.` : "",
    groundingSummary ? `Known info: ${groundingSummary}` : "",
    "",
    "Produce a JSON object with exactly these keys:",
    '  "businessType": a short normalized type (e.g. "Multi-specialty Hospital"),',
    '  "highlights": an array of 6-8 specific, realistic themes customers praise for THIS kind of business (merge the owner-provided ones; add relevant ones you infer from the category),',
    '  "keywords": an array of 4-8 natural SEO keyword phrases (include owner-provided ones),',
    '  "aiContext": a 2-3 sentence brief describing the business and what reviews should emphasize.',
    "Keep it truthful and category-appropriate. Do not invent specific facts like awards, names, or numbers.",
  ]
    .filter(Boolean)
    .join("\n");

  const result = await geminiService.generateJson<{
    businessType?: string;
    highlights?: string[];
    keywords?: string[];
    aiContext?: string;
  }>(prompt, { temperature: 0.5, maxOutputTokens: 500 });

  const outHighlights = Array.isArray(result.highlights)
    ? result.highlights.filter((x): x is string => typeof x === "string")
    : [];
  const outKeywords = Array.isArray(result.keywords)
    ? result.keywords.filter((x): x is string => typeof x === "string")
    : [];

  if (!result.aiContext && outHighlights.length === 0) return null;

  return {
    aiContext: result.aiContext ?? "",
    highlights: outHighlights.length ? outHighlights : highlights,
    keywords: outKeywords.length ? outKeywords : keywords,
    businessType: result.businessType ?? businessType,
  };
}
