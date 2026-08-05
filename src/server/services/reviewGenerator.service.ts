/**
 * AI Review Generator.
 *
 * Generates a realistic, human-sounding review based on the star
 * rating, business name, and category. Uses template-based generation
 * now — drop-in replaceable with OpenAI/Gemini by implementing the
 * same interface.
 *
 * Guidelines for generated reviews:
 *   - Sound natural, varied, and authentic (not robotic)
 *   - Match the sentiment to the star rating
 *   - Reference the business type/category naturally
 *   - Vary length (2-4 sentences for 4-5 stars, 1-3 for 1-3 stars)
 *   - Never include anything harmful, fake, or misleading
 */

import { geminiService } from "@/server/services/ai/gemini.service";
import { logger } from "@/server/utils/logger";

export interface ReviewGeneratorInput {
  businessName: string;
  category?: string | null;
  starRating: number; // 1–5
  locationCity?: string | null;
  customerHint?: string; // optional one-word hint like "food", "service", "ambience"
  /** AI brief synthesized from the location's review profile. */
  aiContext?: string | null;
  /** Themes to weave in (e.g. "cleanliness", "expert doctors"). */
  highlights?: string[] | null;
  /** SEO keyword phrases to include naturally. */
  keywords?: string[] | null;
  /**
   * Previously generated reviews to steer clear of, so no two customers
   * ever receive the same or a near-duplicate review.
   */
  avoidTexts?: string[] | null;
}

/**
 * Normalize a review to a comparable form (lowercase, collapse
 * whitespace, strip punctuation/emoji) — used to fingerprint reviews
 * and detect near-duplicates.
 */
export function normalizeReviewText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

export interface GeneratedReview {
  text: string;
  starRating: number;
}

// Template pools indexed by star rating range.
const TEMPLATES_5: string[] = [
  "Absolutely outstanding experience at {business}! The {aspect} exceeded all expectations. Highly recommend to anyone looking for quality {category} services.",
  "Had an amazing visit to {business}. Everything was perfect from start to finish. Will definitely be coming back! 🙌",
  "Cannot say enough good things about {business}. The team is professional, friendly, and truly cares about their customers. 5 stars well deserved!",
  "{business} is hands down the best {category} in {city}. Exceptional quality and attention to detail. Thank you for the wonderful experience!",
  "What a gem! {business} provides top-notch {aspect}. The entire experience was smooth and enjoyable. Already recommended to friends and family.",
  "Incredible service at {business}! They went above and beyond. Truly a world-class experience that I'd give 10 stars if I could!",
  "First time at {business} and I'm blown away. Professional staff, clean environment, and outstanding results. Will be a regular from now on.",
];

const TEMPLATES_4: string[] = [
  "Really good experience at {business}. The {aspect} was great and the staff was friendly. Would recommend!",
  "Visited {business} and had a very positive experience. Good {aspect}, reasonable pricing, and efficient service. Will return.",
  "{business} delivers quality {category} services. Minor wait time but everything else was spot on. Happy customer here.",
  "Enjoyed my visit to {business}. The {aspect} was impressive and the team was welcoming. Solid 4-star experience.",
  "Great {aspect} at {business}. Staff knows what they're doing. Only minor thing — could improve the waiting area. Otherwise excellent!",
];

const TEMPLATES_3: string[] = [
  "Decent experience at {business}. The {aspect} was okay but nothing extraordinary. Average for the area.",
  "{business} is alright. Service was standard, nothing to complain about but nothing to rave about either.",
  "Mixed feelings about {business}. The {aspect} was good but the wait time was longer than expected.",
  "Fair experience at {business}. Some things were great, others could use improvement. Middle of the road.",
];

const TEMPLATES_2: string[] = [
  "Below average experience at {business}. The {aspect} didn't meet expectations. Room for improvement.",
  "Not the best visit to {business}. Service felt rushed and impersonal. Hope they can improve.",
  "Disappointing experience at {business}. Expected better based on reviews. The {aspect} was mediocre.",
];

const TEMPLATES_1: string[] = [
  "Very poor experience at {business}. The {aspect} was well below standard. Would not recommend currently.",
  "Unfortunately {business} did not deliver. Long wait, poor {aspect}, and unresponsive staff. Needs significant improvement.",
  "Terrible experience. I expected much better from {business}. Will not be returning unless things change drastically.",
];

const ASPECT_MAP: Record<string, string[]> = {
  restaurant: ["food quality", "dining experience", "flavors", "menu selection"],
  cafe: ["coffee", "atmosphere", "beverages", "pastries"],
  salon: ["service", "styling", "attention to detail", "results"],
  hotel: ["hospitality", "room quality", "amenities", "comfort"],
  hospital: ["medical care", "staff professionalism", "facilities"],
  clinic: ["treatment", "consultation", "doctor's expertise"],
  gym: ["equipment", "training facilities", "workout environment"],
  spa: ["treatments", "relaxation experience", "ambience"],
  dental: ["dental care", "treatment", "pain management"],
  default: ["service", "quality", "experience", "professionalism", "attention to detail"],
};

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function guessAspectPool(category: string | null | undefined): string[] {
  if (!category) return ASPECT_MAP.default!;
  const lower = category.toLowerCase();
  for (const [key, pool] of Object.entries(ASPECT_MAP)) {
    if (lower.includes(key)) return pool;
  }
  return ASPECT_MAP.default!;
}

/**
 * Template-based generation (offline fallback, always available).
 */
export function generateReviewFromTemplate(
  input: ReviewGeneratorInput,
): GeneratedReview {
  const templates =
    input.starRating >= 5
      ? TEMPLATES_5
      : input.starRating === 4
        ? TEMPLATES_4
        : input.starRating === 3
          ? TEMPLATES_3
          : input.starRating === 2
            ? TEMPLATES_2
            : TEMPLATES_1;

  const aspectPool = guessAspectPool(input.category);
  const aspect = input.customerHint || pickRandom(aspectPool);
  const city = input.locationCity || "the area";
  const category = input.category?.toLowerCase() || "services";

  let text = pickRandom(templates);
  text = text
    .replace(/\{business\}/g, input.businessName)
    .replace(/\{aspect\}/g, aspect)
    .replace(/\{category\}/g, category)
    .replace(/\{city\}/g, city);

  return { text, starRating: input.starRating };
}

/**
 * Primary entry point. Tries Gemini first for a natural, unique review;
 * falls back to templates on any failure so the funnel never breaks.
 */
export async function generateReview(
  input: ReviewGeneratorInput,
): Promise<GeneratedReview & { source: "ai" | "template" }> {
  if (geminiService.isEnabled()) {
    try {
      const text = await generateWithGemini(input);
      if (text) return { text, starRating: input.starRating, source: "ai" };
    } catch (err) {
      logger.warn("Gemini review generation failed — using template", {
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }
  const fallback = generateReviewFromTemplate(input);
  return { ...fallback, source: "template" };
}

/**
 * Generate several distinct review options in a single call. The
 * customer picks one — this keeps a human in the loop while removing
 * all typing. Uses one Gemini call (token-efficient) that returns a
 * JSON array; falls back to distinct templates on failure.
 */
export async function generateReviewOptions(
  input: ReviewGeneratorInput,
  count = 3,
): Promise<{ options: string[]; source: "ai" | "template" }> {
  const n = Math.min(Math.max(count, 1), 5);

  // Seed the "seen" set with normalized forms of previously generated
  // reviews so we never re-serve one — not even a single duplicate.
  const seen = new Set<string>(
    (input.avoidTexts ?? []).map((t) => normalizeReviewText(t)).filter(Boolean),
  );
  const dedupe = (candidates: string[]): string[] => {
    const out: string[] = [];
    for (const c of candidates) {
      const key = normalizeReviewText(c);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(c);
      if (out.length >= n) break;
    }
    return out;
  };

  if (geminiService.isEnabled()) {
    try {
      // Over-generate so that after removing duplicates we still have
      // enough fresh options to return.
      const raw = await generateOptionsWithGemini(input, Math.min(n + 2, 5));
      const options = dedupe(raw);
      if (options.length > 0) {
        return { options, source: "ai" };
      }
    } catch (err) {
      logger.warn("Gemini multi-option generation failed — using templates", {
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Template fallback: pull distinct templates that aren't in the avoid set.
  const options: string[] = [];
  let guard = 0;
  while (options.length < n && guard < 60) {
    const t = generateReviewFromTemplate(input).text;
    const key = normalizeReviewText(t);
    if (key && !seen.has(key)) {
      seen.add(key);
      options.push(t);
    }
    guard += 1;
  }
  return { options, source: "template" };
}

async function generateOptionsWithGemini(
  input: ReviewGeneratorInput,
  count: number,
): Promise<string[]> {
  const sentiment =
    input.starRating >= 5
      ? "extremely positive and enthusiastic"
      : input.starRating === 4
        ? "positive with mild notes"
        : input.starRating === 3
          ? "neutral and balanced"
          : input.starRating === 2
            ? "disappointed but fair"
            : "clearly dissatisfied but not abusive";

  const highlights = (input.highlights ?? []).filter(Boolean);
  const keywords = (input.keywords ?? []).filter(Boolean);
  // Show the model a sample of previously generated reviews so it writes
  // something genuinely different every time.
  const avoid = (input.avoidTexts ?? []).filter(Boolean).slice(0, 12);

  const prompt = [
    `Write ${count} DISTINCT ${input.starRating}-star Google review options for a customer to choose from.`,
    `Business name: ${input.businessName}.`,
    input.category ? `Category: ${input.category}.` : "",
    input.locationCity ? `City: ${input.locationCity}.` : "",
    input.aiContext ? `Business brief: ${input.aiContext}` : "",
    highlights.length
      ? `Across the ${count} options, vary which of these strengths each one focuses on (don't cram them all into one): ${highlights.join(", ")}.`
      : "",
    keywords.length
      ? `Where it reads naturally, work in some of these phrases (spread across options, never forced): ${keywords.join(", ")}.`
      : "",
    input.customerHint ? `Customer specifically mentioned: "${input.customerHint}".` : "",
    `Tone: ${sentiment}.`,
    "Make the reviews SPECIFIC to this business's category — not generic filler.",
    "Each option: 1-3 sentences, first person, natural and human, varied in wording and focus. Each option should feel like a different real customer wrote it.",
    "No placeholders, no brackets, no star count in text. At most one emoji per option. Never fabricate specific facts (staff names, prices, dates, awards).",
    avoid.length
      ? `IMPORTANT: These reviews were already generated before — do NOT repeat, copy, or closely paraphrase any of them. Write something clearly different in wording, structure, and focus:\n- ${avoid.join("\n- ")}`
      : "",
    'Return a JSON array of strings only, e.g. ["review one", "review two"].',
  ]
    .filter(Boolean)
    .join(" ");

  const arr = await geminiService.generateJson<string[]>(prompt, {
    systemInstruction:
      "You draft authentic-sounding customer reviews that a real customer will pick from, edit if desired, and submit themselves. Never fabricate specific false facts (names, dates, prices).",
    temperature: 0.95,
    maxOutputTokens: 700,
  });

  if (!Array.isArray(arr)) return [];
  return arr
    .filter((x): x is string => typeof x === "string")
    .map((s) => s.replace(/^["'\s]+|["'\s]+$/g, "").trim())
    .filter((s) => s.length > 0);
}

async function generateWithGemini(
  input: ReviewGeneratorInput,
): Promise<string | null> {
  const sentiment =
    input.starRating >= 5
      ? "extremely positive and enthusiastic"
      : input.starRating === 4
        ? "positive with mild constructive notes"
        : input.starRating === 3
          ? "neutral and balanced"
          : input.starRating === 2
            ? "disappointed but fair"
            : "clearly dissatisfied but not abusive";

  const lengthHint =
    input.starRating >= 4
      ? "2 to 4 sentences"
      : "1 to 3 sentences";

  const prompt = [
    `Write a ${input.starRating}-star Google review for a business.`,
    `Business name: ${input.businessName}.`,
    input.category ? `Business type/category: ${input.category}.` : "",
    input.locationCity ? `City: ${input.locationCity}.` : "",
    input.customerHint
      ? `The customer specifically mentioned: "${input.customerHint}".`
      : "",
    `Tone: ${sentiment}.`,
    `Length: ${lengthHint}.`,
    "Write in first person as a real customer. Sound natural and human — vary sentence structure, avoid clichés and marketing speak.",
    "Do not use placeholders or brackets. Do not include the star count in the text.",
    "You may include at most one relevant emoji if it fits the tone. Return only the review text.",
  ]
    .filter(Boolean)
    .join(" ");

  const text = await geminiService.generateText(prompt, {
    systemInstruction:
      "You are a helpful assistant that drafts authentic-sounding customer reviews the customer can edit before posting. Never fabricate specific false facts (names, dates, prices); keep it general enough to be truthful.",
    temperature: 0.95,
    maxOutputTokens: 300,
  });

  // Strip surrounding quotes the model sometimes adds.
  return text.replace(/^["'\s]+|["'\s]+$/g, "").trim() || null;
}

/**
 * Build the official Google review URL from a Place ID.
 * This opens Google Maps with the review form pre-focused.
 */
export function buildGoogleReviewUrl(placeId: string): string {
  return `https://search.google.com/local/writereview?placeid=${encodeURIComponent(placeId)}`;
}
