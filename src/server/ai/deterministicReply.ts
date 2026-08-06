/**
 * Deterministic reply composer.
 *
 * Fills the provider seam while no AI is wired up, and remains the fallback
 * afterwards for when the provider is unavailable, rate-limited, or returns
 * something unusable.
 *
 * This is not a stub. It reads the same `BusinessKnowledge` the prompt builder
 * reads and honours the same settings — greeting, signature, length, emoji
 * policy, appreciation policy, negative and positive strategies — so the full
 * pipeline (classification, duplicate protection, humanization, approval
 * routing) is exercisable end to end without a network call. It is also what
 * makes the engine testable offline and deterministic in CI.
 *
 * Composed from clause pools rather than fixed templates. Fixed templates are
 * what make automated replies obvious: with pools, a business sending fifty
 * replies gets fifty different combinations, which is the same
 * "never repeat yourself" requirement the AI path has to meet.
 */

import type { BusinessKnowledge, ReplySentiment } from "./personality.types";
import { lengthGuidance } from "./replySentiment";

export interface ComposeInput {
  knowledge: BusinessKnowledge;
  sentiment: ReplySentiment;
  review: { reviewerName?: string | null; starRating: number; comment?: string | null };
  /**
   * Nudges clause selection so a regenerate produces a different combination
   * rather than the same sentence again.
   */
  variant?: number;
}

/**
 * Deterministic pseudo-random index.
 *
 * Seeded from the review text plus the variant so the same review always yields
 * the same reply (important: a preview must not change under the user while they
 * read it) while different reviews yield different ones.
 */
function seededIndex(seed: string, variant: number, length: number): number {
  if (length <= 0) return 0;
  let hash = 2166136261 ^ variant;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash) % length;
}

function pick(pool: string[], seed: string, variant: number, salt: number): string {
  return pool[seededIndex(`${seed}:${salt}`, variant, pool.length)] ?? pool[0] ?? "";
}

// =====================================================================
// Clause pools
// =====================================================================

const THANKS_POSITIVE = [
  "thank you for taking the time to write this",
  "thanks so much for the kind words",
  "we really appreciate you sharing this",
  "thank you — this made our day",
  "thanks for the lovely feedback",
];

const THANKS_NEUTRAL = [
  "thank you for the honest feedback",
  "thanks for taking the time to tell us",
  "we appreciate you being straight with us",
];

const APOLOGY = [
  "we're genuinely sorry about this",
  "we're sorry — this isn't the experience we want anyone to have",
  "we owe you an apology",
  "we're sorry we let you down",
];

const EMPATHY = [
  "that must have been frustrating",
  "we understand why you'd be disappointed",
  "we'd feel the same in your position",
];

const GLAD_POSITIVE = [
  "we're really glad it went well",
  "it's great to hear the visit went smoothly",
  "we're pleased it was a good experience",
];

const ADEQUATE = [
  "we'd rather it had been better than just okay",
  "we know there was room to do better",
  "we'd like your next visit to be a clear improvement",
];

const RESOLUTION = [
  "we'd like to put it right",
  "we want to fix this properly",
  "we'd like the chance to make it up to you",
];

const OFFLINE = [
  "please get in touch with us directly and we'll look into it",
  "do reach out to us directly so we can go through what happened",
  "please contact us and we'll take it from there",
];

const RETURN_INVITE = [
  "we hope to see you again",
  "we'd love to welcome you back",
  "come and see us again soon",
];

const REFERRAL = [
  "and do tell your friends about us",
  "recommendations mean a lot to a small team like ours",
];

const CLARIFY = [
  "if there's anything you'd like us to explain, just ask",
  "happy to answer any questions you still have",
];

// =====================================================================
// Composition
// =====================================================================

export function composeDeterministicReply(input: ComposeInput): string {
  const { knowledge: k, sentiment, review } = input;
  const variant = input.variant ?? 0;
  const seed = `${review.starRating}:${review.comment ?? ""}:${review.reviewerName ?? ""}`;
  const firstName = review.reviewerName?.trim().split(/\s+/)[0] || null;
  const { max } = lengthGuidance(k.voice.replyLength);
  const negative = new Set(k.replyBehaviour.negativeStrategies);
  const positive = new Set(k.replyBehaviour.positiveStrategies);

  const clauses: string[] = [];

  const wantsThanks =
    k.replyBehaviour.appreciationPolicy === "ALWAYS" ||
    (k.replyBehaviour.appreciationPolicy === "POSITIVE_ONLY" &&
      (sentiment === "VERY_POSITIVE" || sentiment === "POSITIVE"));

  switch (sentiment) {
    case "VERY_POSITIVE":
    case "POSITIVE":
      if (wantsThanks) clauses.push(pick(THANKS_POSITIVE, seed, variant, 1));
      clauses.push(pick(GLAD_POSITIVE, seed, variant, 2));
      if (positive.has("MENTION_SERVICES") && k.offering.services.length > 0 && !positive.has("KEEP_SIMPLE")) {
        clauses.push(`our team takes real care over ${k.offering.services[0]!.toLowerCase()}`);
      }
      if (positive.has("INVITE_RETURN") && !positive.has("KEEP_SIMPLE")) {
        clauses.push(pick(RETURN_INVITE, seed, variant, 3));
      }
      if (positive.has("INVITE_REFERRALS") && !positive.has("KEEP_SIMPLE")) {
        clauses.push(pick(REFERRAL, seed, variant, 4));
      }
      break;

    case "NEUTRAL":
      if (wantsThanks) clauses.push(pick(THANKS_NEUTRAL, seed, variant, 1));
      clauses.push(pick(ADEQUATE, seed, variant, 2));
      clauses.push(pick(CLARIFY, seed, variant, 3));
      break;

    case "MIXED":
      if (wantsThanks) clauses.push(pick(THANKS_NEUTRAL, seed, variant, 1));
      clauses.push(pick(GLAD_POSITIVE, seed, variant, 2));
      if (negative.has("APOLOGIZE_FIRST") || negative.has("SHOW_EMPATHY")) {
        clauses.push(pick(APOLOGY, seed, variant, 3));
      }
      if (negative.has("OFFER_RESOLUTION")) clauses.push(pick(RESOLUTION, seed, variant, 4));
      if (negative.has("INVITE_OFFLINE") || negative.has("REQUEST_CONTACT")) {
        clauses.push(pick(OFFLINE, seed, variant, 5));
      }
      break;

    case "NEGATIVE":
    case "VERY_NEGATIVE":
      // Apology leads regardless of ordering preference: opening an apology
      // reply with anything else reads as deflection.
      clauses.push(pick(APOLOGY, seed, variant, 1));
      if (negative.has("SHOW_EMPATHY")) clauses.push(pick(EMPATHY, seed, variant, 2));
      if (negative.has("OFFER_RESOLUTION")) clauses.push(pick(RESOLUTION, seed, variant, 3));
      if (negative.has("INVITE_OFFLINE") || negative.has("REQUEST_CONTACT")) {
        clauses.push(pick(OFFLINE, seed, variant, 4));
      } else {
        clauses.push(pick(RESOLUTION, seed, variant, 5));
      }
      break;
  }

  // Respect the configured length band.
  const kept = clauses.filter(Boolean).slice(0, Math.max(1, max));
  let body = kept
    .map((clause, i) => (i === 0 ? capitalize(clause) : capitalize(clause)))
    .map((clause) => (clause.endsWith(".") ? clause : `${clause}.`))
    .join(" ");

  // Greeting.
  const greeting = k.voice.greetingStyle?.trim();
  if (greeting) {
    const opener = firstName
      ? `${greeting.replace(/,\s*$/, "")} ${firstName},`
      : greeting;
    body = `${opener} ${lowerFirst(body)}`;
  }

  // A single emoji, only where the policy and the mood both allow it.
  const positiveMood = sentiment === "VERY_POSITIVE" || sentiment === "POSITIVE";
  if (positiveMood && (k.voice.emojiUsage === "SOMETIMES" || k.voice.emojiUsage === "FREQUENTLY")) {
    body = `${body.replace(/\.$/, "")} 🙏`;
  }

  const signature = k.voice.signature?.trim();
  return signature ? `${body}\n\n— ${signature}` : body;
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}
