/**
 * Duplicate protection and humanization checks.
 *
 * Two jobs, both about the same failure: replies that read like a machine.
 *
 *   1. Duplicate protection. A business that sends the same "Thank you for
 *      your kind words!" fifty times looks automated on its public profile,
 *      which costs more trust than not replying at all. Replies are
 *      fingerprinted so the engine can tell it has said this before — and,
 *      separately, that it has *opened* this way before, since repeated
 *      openings are the most visible tell when reviews are read in a list.
 *
 *   2. Humanization. Detects the AI tics that make text obviously generated,
 *      so a draft can be regenerated or flagged rather than published.
 *
 * Pure and provider-free: hashing and inspecting text, no model calls. That
 * makes it directly testable and reusable by any future AI feature.
 */

import { createHash } from "node:crypto";

/**
 * Normalise before hashing so trivial differences do not defeat detection.
 * Names and punctuation are stripped because "Thanks Priya!" and "Thanks,
 * Tom." are the same reply wearing a different hat — which is exactly the
 * repetition we want to catch.
 */
export function normalizeForFingerprint(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Stable hash of a whole reply, for exact/near-duplicate detection. */
export function fingerprint(text: string): string {
  return createHash("sha256").update(normalizeForFingerprint(text), "utf8").digest("hex");
}

/**
 * Hash of the opening clause only.
 *
 * Uses the first six normalised words rather than the first sentence: a
 * one-sentence reply has no second clause, and six words is enough to capture
 * "thank you so much for the" while ignoring what follows.
 */
export function openingFingerprint(text: string): string {
  const words = normalizeForFingerprint(text).split(" ").slice(0, 6).join(" ");
  return createHash("sha256").update(words, "utf8").digest("hex");
}

/**
 * Token-overlap similarity (Jaccard), 0..1.
 *
 * Catches near-duplicates that differ by a word or two, which exact hashing
 * misses. Chosen over edit distance because word-set overlap is what a reader
 * actually notices, and it is cheap on short text.
 */
export function similarity(a: string, b: string): number {
  const setA = new Set(normalizeForFingerprint(a).split(" ").filter(Boolean));
  const setB = new Set(normalizeForFingerprint(b).split(" ").filter(Boolean));
  if (setA.size === 0 || setB.size === 0) return 0;
  let shared = 0;
  for (const token of setA) if (setB.has(token)) shared += 1;
  return shared / (setA.size + setB.size - shared);
}

/** Above this, two replies read as the same reply. */
export const DUPLICATE_THRESHOLD = 0.82;

export interface DuplicateVerdict {
  isDuplicate: boolean;
  /** Highest similarity found against recent replies. */
  score: number;
  /** Why it was rejected, for the regenerate prompt and the UI. */
  reason: "exact" | "near" | "opening" | null;
}

/**
 * Compare a candidate against recent replies.
 *
 * Takes the recent set as an argument rather than querying: this module stays
 * pure and the caller controls the window (how many, how far back), which is a
 * policy decision rather than a detail of duplicate detection.
 */
export function checkDuplicate(
  candidate: string,
  recent: Array<{ text: string; fingerprint?: string | null; openingHash?: string | null }>,
): DuplicateVerdict {
  if (!candidate.trim() || recent.length === 0) {
    return { isDuplicate: false, score: 0, reason: null };
  }

  const candidateFp = fingerprint(candidate);
  const candidateOpening = openingFingerprint(candidate);

  let best = 0;
  for (const prior of recent) {
    const priorFp = prior.fingerprint ?? fingerprint(prior.text);
    if (priorFp === candidateFp) {
      return { isDuplicate: true, score: 1, reason: "exact" };
    }
    const score = similarity(candidate, prior.text);
    if (score > best) best = score;
  }

  if (best >= DUPLICATE_THRESHOLD) {
    return { isDuplicate: true, score: best, reason: "near" };
  }

  // Opening repetition is checked last: it is the mildest problem, so a reply
  // is only rejected for it when the body is otherwise distinct.
  const openingClash = recent.some(
    (p) => (p.openingHash ?? openingFingerprint(p.text)) === candidateOpening,
  );
  if (openingClash) {
    return { isDuplicate: true, score: best, reason: "opening" };
  }

  return { isDuplicate: false, score: best, reason: null };
}

// =====================================================================
// Humanization
// =====================================================================

/**
 * Phrases that mark text as machine-written. Corporate filler ("we value your
 * feedback") and model boilerplate ("as an AI") both belong here: the first
 * sounds like a form letter, the second breaks the illusion entirely.
 */
const AI_CLICHES = [
  "as an ai",
  "as a language model",
  "i'm just an ai",
  "we value your feedback",
  "we appreciate your feedback and",
  "thank you for taking the time to share your valuable",
  "we strive to provide",
  "we are committed to providing",
  "at the end of the day",
  "rest assured",
  "we take all feedback seriously",
  "your satisfaction is our top priority",
  "we apologize for any inconvenience caused",
  "please do not hesitate to",
  "delve into",
  "it is worth noting that",
  "in today's fast-paced world",
  "we hope to see you again soon!",
];

/** Leftover template scaffolding that must never reach a public reply. */
const PLACEHOLDER_PATTERNS = [
  /\[[^\]]{2,40}\]/, // [Customer Name]
  /\{\{?[^}]{2,40}\}?\}/, // {{name}}
  /\bXX+\b/, // XX
  /\byour name here\b/i,
  /\binsert [a-z ]{2,20}\b/i,
];

export interface HumanizationIssue {
  code:
    | "cliche"
    | "placeholder"
    | "markdown"
    | "too_long"
    | "too_short"
    | "repetitive_sentences"
    | "all_caps"
    | "banned_phrase";
  detail: string;
  /** Blocking issues must not be published; warnings are advisory. */
  severity: "block" | "warn";
}

export interface HumanizationInput {
  text: string;
  minSentences: number;
  maxSentences: number;
  /** The tenant's "never say" rules. */
  neverSay?: string[];
  maxChars?: number;
}

/** Split into sentences well enough to count them. */
export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Inspect a candidate reply.
 *
 * Returns findings rather than throwing or rewriting, so the caller decides
 * whether to regenerate, hold for a human, or publish with a warning. A
 * hard rewrite here would silently change wording a human had approved.
 */
export function inspectReply(input: HumanizationInput): HumanizationIssue[] {
  const issues: HumanizationIssue[] = [];
  const text = input.text.trim();
  const lower = text.toLowerCase();

  for (const cliche of AI_CLICHES) {
    if (lower.includes(cliche)) {
      issues.push({
        code: "cliche",
        detail: `Reads as generated: "${cliche}"`,
        severity: "warn",
      });
    }
  }

  for (const pattern of PLACEHOLDER_PATTERNS) {
    const match = pattern.exec(text);
    if (match) {
      issues.push({
        code: "placeholder",
        detail: `Unfilled placeholder: "${match[0]}"`,
        severity: "block",
      });
      break;
    }
  }

  // Markdown is a formatting artefact: Google renders replies as plain text,
  // so asterisks and backticks would be published literally.
  if (/(\*\*|__|^#{1,6}\s|`)/m.test(text)) {
    issues.push({
      code: "markdown",
      detail: "Contains markdown formatting, which would show as raw characters",
      severity: "block",
    });
  }

  const sentences = splitSentences(text);
  if (sentences.length < input.minSentences) {
    issues.push({
      code: "too_short",
      detail: `${sentences.length} sentence(s); expected at least ${input.minSentences}`,
      severity: "warn",
    });
  }
  if (sentences.length > input.maxSentences) {
    issues.push({
      code: "too_long",
      detail: `${sentences.length} sentence(s); expected at most ${input.maxSentences}`,
      severity: "warn",
    });
  }

  if (input.maxChars && text.length > input.maxChars) {
    issues.push({
      code: "too_long",
      detail: `${text.length} characters exceeds the ${input.maxChars} limit`,
      severity: "block",
    });
  }

  // Sentences opening with the same word read as a list, not a person.
  const openers = sentences
    .map((s) => normalizeForFingerprint(s).split(" ")[0])
    .filter((w): w is string => Boolean(w));
  const openerCounts = new Map<string, number>();
  for (const w of openers) openerCounts.set(w, (openerCounts.get(w) ?? 0) + 1);
  for (const [word, count] of openerCounts) {
    if (count >= 3) {
      issues.push({
        code: "repetitive_sentences",
        detail: `${count} sentences start with "${word}"`,
        severity: "warn",
      });
      break;
    }
  }

  // Shouting. Ignores short tokens so acronyms and "I" are not flagged.
  const shouted = text.match(/\b[A-Z]{4,}\b/g);
  if (shouted && shouted.length >= 2) {
    issues.push({
      code: "all_caps",
      detail: `Shouting: ${shouted.slice(0, 3).join(", ")}`,
      severity: "warn",
    });
  }

  /**
   * The tenant's own prohibitions.
   *
   * Blocking, unlike the cliché check: these are explicit business rules
   * ("never discuss pricing") and often legal or regulatory, so a violation
   * must not be publishable with a mere warning.
   *
   * Matching is lexical, not semantic, but it does normalise for word forms —
   * a rule about "refunds" has to catch a reply offering a "refund", or the
   * guardrail is trivially defeated by plurals and verb endings.
   */
  for (const rule of input.neverSay ?? []) {
    const keywords = normalizeForFingerprint(rule)
      .split(" ")
      .filter((w) => w.length > 3 && !STOPWORDS.has(w));
    if (keywords.length === 0) continue;
    const hit = keywords.find((k) => mentionsTerm(lower, k));
    if (hit) {
      issues.push({
        code: "banned_phrase",
        detail: `Mentions "${hit}", which your rule "${rule}" forbids`,
        severity: "block",
      });
    }
  }

  return issues;
}

/**
 * Crude English stem: drop a common inflectional ending.
 *
 * Not a real stemmer, and deliberately conservative — it only strips endings
 * when enough of the word remains, because over-stemming causes false
 * positives, and wrongly blocking a legitimate reply is worse than missing an
 * unusual word form.
 */
function stem(word: string): string {
  for (const suffix of ["ies", "es", "ing", "ed", "s"]) {
    if (word.length - suffix.length >= 4 && word.endsWith(suffix)) {
      return suffix === "ies" ? `${word.slice(0, -3)}y` : word.slice(0, -suffix.length);
    }
  }
  return word;
}

/**
 * Does `text` mention `term`, allowing for word-form differences?
 *
 * Compares stems on a word-boundary basis, so "refunds" matches "refund" and
 * "refunded" but "class" does not match "cla".
 */
function mentionsTerm(text: string, term: string): boolean {
  const target = stem(term);
  if (target.length < 4) {
    // Too short to stem safely; fall back to an exact word match.
    return new RegExp(`\\b${escapeRegex(term)}\\b`).test(text);
  }
  for (const word of text.split(/[^\p{L}\p{N}]+/u)) {
    if (!word) continue;
    if (stem(word) === target) return true;
  }
  return false;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const STOPWORDS = new Set([
  "never",
  "always",
  "must",
  "should",
  "avoid",
  "mention",
  "discuss",
  "about",
  "with",
  "that",
  "this",
  "them",
  "they",
  "your",
  "ours",
  "dont",
  "cant",
  "wont",
  "promise",
  "admit",
  "there",
  "their",
]);

/** True when nothing blocking was found. */
export function isPublishable(issues: HumanizationIssue[]): boolean {
  return !issues.some((i) => i.severity === "block");
}
