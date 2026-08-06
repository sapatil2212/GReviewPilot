/**
 * Reply sentiment classification and reply goals.
 *
 * The existing `SentimentType` (POSITIVE/NEUTRAL/NEGATIVE/MIXED) is the right
 * granularity for analytics and filtering, but too coarse to target a reply:
 * a 1-star "they lost my records" and a 3-star "parking was awkward" are both
 * "NEGATIVE" and need completely different replies. `ReplySentiment` is the
 * six-level scale used for reply strategy only; it is derived, never stored as
 * the review's own sentiment, so the two never contradict each other.
 *
 * Deliberately rule-based. Star rating is a strong, honest signal that costs
 * nothing and cannot hallucinate, and the AI-derived `SentimentType` is folded
 * in when present to catch the cases rating alone misses — a 5-star with a
 * complaint in the text, or a 2-star that is actually praise with one gripe.
 */

import type { ReplySentiment } from "./personality.types";

/** Review facts the classifier needs. Shaped to match the Review model. */
export interface ClassifyInput {
  starRating: number;
  comment?: string | null;
  /** AI/heuristic sentiment already stored on the review, when available. */
  sentiment?: "POSITIVE" | "NEUTRAL" | "NEGATIVE" | "MIXED" | null;
}

/**
 * Words that signal a complaint even inside a high rating. Kept short and
 * unambiguous on purpose: a long fuzzy list produces false positives, and
 * wrongly treating praise as a complaint is the worse failure — it makes the
 * business apologise to a happy customer.
 */
const COMPLAINT_MARKERS = [
  "but ",
  "however",
  "although",
  "disappointed",
  "rude",
  "dirty",
  "late",
  "waiting",
  "waited",
  "expensive",
  "overpriced",
  "unprofessional",
  "never again",
  "worst",
  "terrible",
  "awful",
  "refund",
  "complaint",
];

/** Signals that a low rating still contains genuine praise. */
const PRAISE_MARKERS = [
  "great",
  "excellent",
  "friendly",
  "helpful",
  "professional",
  "recommend",
  "love",
  "amazing",
  "wonderful",
  "kind",
];

/**
 * Claims that must never be auto-answered. Safety, legal, and medical
 * allegations carry real liability, so they are escalated to a human
 * regardless of the tenant's approval mode.
 */
const SERIOUS_MARKERS = [
  "lawyer",
  "solicitor",
  "attorney",
  "sue",
  "lawsuit",
  "legal action",
  "negligence",
  "malpractice",
  "infection",
  "injury",
  "injured",
  "hospitalized",
  "hospitalised",
  "discrimination",
  "racist",
  "assault",
  "harassment",
  "police",
  "food poisoning",
  "fraud",
  "scam",
  "stolen",
  "data breach",
];

function countMarkers(text: string, markers: readonly string[]): number {
  let hits = 0;
  for (const m of markers) if (text.includes(m)) hits += 1;
  return hits;
}

/**
 * Map a review to the six-level reply scale.
 *
 * Rating sets the base band; text and stored sentiment can pull it one step
 * toward MIXED, never further. Bounding the adjustment keeps the result
 * predictable: a 5-star review can become MIXED but never NEGATIVE, so an
 * unlucky keyword match cannot turn a compliment into an apology.
 */
export function classifyReplySentiment(input: ClassifyInput): ReplySentiment {
  const text = (input.comment ?? "").toLowerCase();
  const hasText = text.trim().length > 0;
  const complaints = hasText ? countMarkers(text, COMPLAINT_MARKERS) : 0;
  const praise = hasText ? countMarkers(text, PRAISE_MARKERS) : 0;

  switch (input.starRating) {
    case 5:
      // A complaint inside five stars is usually "loved it, but…".
      if (complaints >= 2 || (complaints >= 1 && input.sentiment === "MIXED")) return "MIXED";
      return "VERY_POSITIVE";
    case 4:
      if (complaints >= 2) return "MIXED";
      return "POSITIVE";
    case 3:
      // Three stars is the genuinely ambiguous band, so the text decides.
      if (complaints > praise && complaints >= 2) return "NEGATIVE";
      if (praise > complaints && praise >= 2) return "MIXED";
      return "NEUTRAL";
    case 2:
      if (praise >= 2) return "MIXED";
      return "NEGATIVE";
    case 1:
      if (praise >= 2) return "NEGATIVE";
      return "VERY_NEGATIVE";
    default:
      // Ratings outside 1-5 should be impossible, but a bad sync must not
      // crash reply generation. Fall back to the stored sentiment.
      if (input.sentiment === "POSITIVE") return "POSITIVE";
      if (input.sentiment === "NEGATIVE") return "NEGATIVE";
      if (input.sentiment === "MIXED") return "MIXED";
      return "NEUTRAL";
  }
}

/** True when a review makes a claim that a human must answer. */
export function needsHumanEscalation(input: ClassifyInput): boolean {
  const text = (input.comment ?? "").toLowerCase();
  if (!text.trim()) return false;
  return SERIOUS_MARKERS.some((m) => text.includes(m));
}

/** The serious claims found, so the UI can explain why a draft was held. */
export function escalationReasons(input: ClassifyInput): string[] {
  const text = (input.comment ?? "").toLowerCase();
  if (!text.trim()) return [];
  return SERIOUS_MARKERS.filter((m) => text.includes(m));
}

export type SentimentGroup = "positive" | "neutral" | "negative";

/** Collapse the six-level scale for anything that only needs three buckets. */
export function sentimentGroup(sentiment: ReplySentiment): SentimentGroup {
  switch (sentiment) {
    case "VERY_POSITIVE":
    case "POSITIVE":
      return "positive";
    case "NEUTRAL":
    case "MIXED":
      return "neutral";
    default:
      return "negative";
  }
}

/**
 * What a reply in this band is trying to achieve.
 *
 * Expressed as goals rather than sentences so the prompt builder renders them
 * and the wording stays consistent across every band.
 */
export function replyGoals(sentiment: ReplySentiment): string[] {
  switch (sentiment) {
    case "VERY_POSITIVE":
      return [
        "Thank them genuinely and specifically",
        "Reinforce what they praised",
        "Build loyalty and invite them back",
      ];
    case "POSITIVE":
      return ["Thank them warmly", "Acknowledge a specific detail", "Encourage a return visit"];
    case "NEUTRAL":
      return [
        "Thank them for taking the time",
        "Acknowledge the experience was only adequate",
        "Offer to clarify or help further",
      ];
    case "MIXED":
      return [
        "Thank them for the balanced feedback",
        "Acknowledge the positive first",
        "Address the concern without excuses",
        "Offer a way to resolve it",
      ];
    case "NEGATIVE":
      return [
        "Apologize sincerely without being defensive",
        "Show you understand the specific problem",
        "Take responsibility where it is fair to",
        "Move the conversation offline",
      ];
    case "VERY_NEGATIVE":
      return [
        "Lead with a genuine, unqualified apology",
        "Show empathy for the impact on them",
        "Avoid any hint of argument or blame",
        "Give a direct route to a real person",
        "Protect the business's reputation by staying gracious",
      ];
  }
}

/** Sentence-count band for the target reply length. */
export function lengthGuidance(
  length: "VERY_SHORT" | "SHORT" | "MEDIUM" | "DETAILED",
): { min: number; max: number; label: string } {
  switch (length) {
    case "VERY_SHORT":
      return { min: 1, max: 1, label: "exactly 1 sentence" };
    case "SHORT":
      return { min: 2, max: 3, label: "2 to 3 sentences" };
    case "MEDIUM":
      return { min: 3, max: 4, label: "3 to 4 sentences" };
    case "DETAILED":
      return { min: 4, max: 6, label: "4 to 6 sentences" };
  }
}

/**
 * Provider temperature for a confidence level.
 *
 * Stored as intent (CONSERVATIVE/BALANCED/CREATIVE) rather than a raw number so
 * the mapping can be retuned centrally, and so the setting still makes sense if
 * the provider changes. Negative reviews are additionally damped by the caller —
 * an apology is the wrong place for creative variation.
 */
export function temperatureFor(
  level: "CONSERVATIVE" | "BALANCED" | "CREATIVE",
  sentiment: ReplySentiment,
): number {
  const base = level === "CONSERVATIVE" ? 0.4 : level === "BALANCED" ? 0.7 : 0.95;
  const group = sentimentGroup(sentiment);
  if (group === "negative") return Math.max(0.3, base - 0.2);
  return base;
}
