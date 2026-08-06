/**
 * Prompt composition from structured business knowledge.
 *
 * The one place prompt text is assembled. Everywhere else in the product deals
 * in structured `BusinessKnowledge`, and the user never sees or edits a prompt
 * at all — they answer onboarding questions, and this module turns those
 * answers into instructions.
 *
 * Why a dedicated module rather than an inline template per feature (which is
 * what the existing generator services do): once several features share one
 * personality, the rules that must never diverge — the "never say" list,
 * compliance notes, signature, emoji policy — would otherwise be re-expressed
 * slightly differently in each prompt, and a guardrail that holds in review
 * replies but not in Google Posts is not a guardrail. Composing centrally also
 * makes the output inspectable: `buildReplyPrompt` returns the sections it
 * used, so the preview screen can show a business exactly which of its answers
 * shaped a reply.
 *
 * Provider-free by design. This returns strings; calling a model is the
 * caller's job. That keeps it synchronous, pure, and unit-testable, and honours
 * the constraint that no AI provider is wired up in this phase.
 */

import type {
  AiConfidenceLevel,
  BusinessKnowledge,
  EmojiUsage,
  NegativeStrategy,
  PositiveStrategy,
  ReplySentiment,
} from "./personality.types";
import { lengthGuidance, replyGoals, sentimentGroup } from "./replySentiment";

// =====================================================================
// Section rendering
// =====================================================================

/**
 * A labelled block of prompt text.
 *
 * Kept as discrete sections rather than one string so callers can drop what
 * they do not need — a social caption generator wants identity and voice but
 * not reply strategy — and so the preview UI can attribute each instruction
 * back to the onboarding answer that produced it.
 */
export interface PromptSection {
  id: string;
  label: string;
  lines: string[];
}

/**
 * Build a section, dropping blank lines.
 *
 * Accepts falsy entries so callers can write `cond && "text"` inline and let
 * absent data disappear, rather than each one assembling an array conditionally.
 */
function section(
  id: string,
  label: string,
  lines: Array<string | null | undefined | false>,
): PromptSection | null {
  const kept = lines.filter((l): l is string => Boolean(l && l.trim()));
  return kept.length > 0 ? { id, label, lines: kept } : null;
}

function list(items: string[], max = 12): string {
  return items.slice(0, max).join(", ");
}

// =====================================================================
// Reusable sections (shared by every AI feature)
// =====================================================================

export function identitySection(k: BusinessKnowledge): PromptSection | null {
  const { identity } = k;
  return section("identity", "Business", [
    `Name: ${identity.businessName}`,
    identity.businessType && `Type: ${identity.businessType}`,
    identity.industry && identity.industry !== identity.businessType && `Industry: ${identity.industry}`,
    identity.city && `City: ${identity.city}`,
    identity.shortDescription && `About: ${identity.shortDescription}`,
    identity.uniqueness && `What sets them apart: ${identity.uniqueness}`,
  ]);
}

export function voiceSection(k: BusinessKnowledge): PromptSection | null {
  const { voice } = k;
  return section("voice", "Voice", [
    voice.communicationStyles.length > 0
      ? `Write in a ${list(voice.communicationStyles, 4).toLowerCase()} voice.`
      : "Write in a warm, professional voice.",
    voice.values.length > 0 && `The business is defined by: ${list(voice.values, 6)}.`,
    emojiRule(voice.emojiUsage),
    `Confidence: ${confidenceRule(voice.confidenceLevel)}`,
  ]);
}

function emojiRule(usage: EmojiUsage): string {
  switch (usage) {
    case "NEVER":
      return "Do not use emoji at all.";
    case "RARELY":
      return "Emoji are almost never appropriate; at most one, and only for genuine praise.";
    case "SOMETIMES":
      return "A single emoji is fine when the mood clearly fits. Never more than one.";
    case "FREQUENTLY":
      return "Emoji are welcome, but keep it to one or two and never in an apology.";
  }
}

function confidenceRule(level: AiConfidenceLevel): string {
  switch (level) {
    case "CONSERVATIVE":
      return "stay close to safe, conventional phrasing.";
    case "BALANCED":
      return "sound natural and varied without taking risks.";
    case "CREATIVE":
      return "let personality show; vary sentence shape and wording freely.";
  }
}

export function offeringSection(k: BusinessKnowledge): PromptSection | null {
  const { offering } = k;
  return section("offering", "What they offer", [
    offering.services.length > 0 && `Services: ${list(offering.services)}`,
    offering.products.length > 0 && `Products: ${list(offering.products)}`,
    offering.usp && `Main selling point: ${offering.usp}`,
    offering.experience && `Experience: ${offering.experience}`,
    offering.guarantees && `Guarantees: ${offering.guarantees}`,
    offering.pricingPhilosophy && `Pricing approach: ${offering.pricingPhilosophy}`,
    offering.certifications.length > 0 && `Certifications: ${list(offering.certifications, 6)}`,
    offering.awards.length > 0 && `Awards: ${list(offering.awards, 6)}`,
    offering.businessStory && `Background: ${offering.businessStory}`,
  ]);
}

/**
 * Guardrails.
 *
 * Rendered last in every prompt. Models weight late instructions more heavily,
 * and these are the rules whose violation actually costs the business
 * something.
 */
export function restrictionSection(k: BusinessKnowledge): PromptSection | null {
  const { restrictions } = k;
  return section("restrictions", "Hard rules", [
    ...restrictions.neverSay.map((r) => `- ${r}`),
    restrictions.complianceRules.length > 0 &&
      `- Regulated sector (${list(restrictions.complianceRules, 6)}): keep claims conservative and verifiable.`,
    restrictions.complianceNotes && `- ${restrictions.complianceNotes}`,
    "- Never invent facts, offers, discounts, or compensation.",
    "- Never state or imply anything you were not told here.",
  ]);
}

export function languageSection(k: BusinessKnowledge, detected?: string | null): PromptSection | null {
  const { language } = k;
  const target = language.autoDetect && detected ? detected : language.primary;
  return section("language", "Language", [
    `Write the reply in ${target}.`,
    language.autoDetect && detected && detected !== language.primary
      ? `The customer wrote in ${detected}; reply in their language, not the business default.`
      : null,
    language.secondary.length > 0 && `The business also operates in: ${list(language.secondary, 5)}.`,
  ]);
}

// =====================================================================
// Review reply prompt
// =====================================================================

export interface ReplyPromptInput {
  knowledge: BusinessKnowledge;
  review: {
    reviewerName?: string | null;
    starRating: number;
    comment?: string | null;
    /** BCP-47 detected from the review text, when known. */
    detectedLanguage?: string | null;
  };
  sentiment: ReplySentiment;
  /**
   * Openings already used recently. Passed in so the model is told what to
   * avoid up front, rather than only being caught afterwards by
   * checkDuplicate — cheaper than regenerating.
   */
  avoidOpenings?: string[];
  /** Set when a previous attempt was rejected as a duplicate. */
  regenerateReason?: string | null;
}

export interface BuiltPrompt {
  /** The composed user prompt. */
  prompt: string;
  /** Provider system instruction. */
  systemInstruction: string;
  /** Sections used, so the UI can explain the output. */
  sections: PromptSection[];
}

export function buildReplyPrompt(input: ReplyPromptInput): BuiltPrompt {
  const { knowledge: k, review, sentiment } = input;
  const group = sentimentGroup(sentiment);
  const length = lengthGuidance(k.voice.replyLength);
  const firstName = review.reviewerName?.trim().split(/\s+/)[0] || null;

  const sections: PromptSection[] = [];
  const push = (s: PromptSection | null) => {
    if (s) sections.push(s);
  };

  push(identitySection(k));
  push(voiceSection(k));

  // The review itself.
  push(
    section("review", "The review", [
      `Rating: ${review.starRating} out of 5.`,
      firstName && `Reviewer's first name: ${firstName}.`,
      review.comment
        ? `What they wrote: """${review.comment}"""`
        : "They left a rating with no written comment.",
      `Assessment: ${sentiment.replace(/_/g, " ").toLowerCase()}.`,
    ]),
  );

  // Goals for this band.
  push(section("goals", "What this reply must achieve", replyGoals(sentiment).map((g) => `- ${g}`)));

  // Strategy chosen during onboarding.
  if (group === "negative" || sentiment === "MIXED") {
    push(
      section(
        "negative_strategy",
        "How this business handles criticism",
        k.replyBehaviour.negativeStrategies.map((s) => `- ${negativeStrategyRule(s)}`),
      ),
    );
  }
  if (group === "positive") {
    push(
      section(
        "positive_strategy",
        "How this business handles praise",
        positiveStrategyRules(k.replyBehaviour.positiveStrategies, k),
      ),
    );
  }

  push(appreciationSection(k, group));
  // Only mention the offering where it could legitimately be referenced.
  if (group === "positive" || sentiment === "MIXED") push(offeringSection(k));
  push(languageSection(k, review.detectedLanguage));
  push(structureSection(k, firstName, length.label));
  push(
    section("avoid", "Do not repeat yourself", [
      ...(input.avoidOpenings ?? []).slice(0, 8).map((o) => `- Do not open with: "${o}"`),
      input.regenerateReason && `- A previous attempt was rejected: ${input.regenerateReason}`,
    ]),
  );
  push(restrictionSection(k));

  const prompt = [
    `You are the owner of "${k.identity.businessName}" writing a public reply to a customer review.`,
    "",
    ...sections.map((s) => [`${s.label}:`, ...s.lines, ""].join("\n")),
    "Return only the reply text, with no preamble, quotes, or explanation.",
  ].join("\n");

  return { prompt, systemInstruction: SYSTEM_INSTRUCTION, sections };
}

const SYSTEM_INSTRUCTION = [
  "You write public replies to customer reviews as the business owner, in their voice.",
  "You sound like a real person who works there: specific, plain-spoken, never corporate.",
  "You never fabricate details, promise compensation, or reveal private customer information.",
  "You never mention being an AI, and you never use markdown or placeholders.",
].join(" ");

function negativeStrategyRule(strategy: NegativeStrategy): string {
  switch (strategy) {
    case "APOLOGIZE_FIRST":
      return "Open with the apology, before any explanation.";
    case "SHOW_EMPATHY":
      return "Name the impact on them, not just the fact of the problem.";
    case "OFFER_RESOLUTION":
      return "Offer a concrete next step, without inventing a specific refund or discount.";
    case "INVITE_OFFLINE":
      return "Move the detail off the public thread and into a direct conversation.";
    case "REQUEST_CONTACT":
      return "Ask them to get in touch using the contact details they already have.";
    case "NEVER_ARGUE":
      return "Never contradict, correct, or defend, even if the review is unfair.";
    case "ESCALATE_SERIOUS":
      return "Do not attempt to resolve safety, medical, or legal claims in public.";
  }
}

function positiveStrategyRules(strategies: PositiveStrategy[], k: BusinessKnowledge): string[] {
  // KEEP_SIMPLE is a deliberate override: someone who picked it and also
  // ticked other boxes wants brevity, and honouring both would contradict.
  if (strategies.includes("KEEP_SIMPLE")) {
    return ["- Keep it short and simply say thank you. Do not upsell or add invitations."];
  }
  return strategies.map((s) => {
    switch (s) {
      case "MENTION_SERVICES":
        return k.offering.services.length > 0
          ? "- Reference the service they used, if it is clear which one."
          : "- Reference what they came in for, if it is clear.";
      case "INVITE_RETURN":
        return "- Invite them back, naturally rather than as a slogan.";
      case "RECOMMEND_SERVICE":
        return "- You may suggest one other relevant service, only if it fits.";
      case "MENTION_STAFF":
        return "- If they named a staff member, mention that person by name.";
      case "INVITE_REFERRALS":
        return "- A light mention of recommending the business to others is fine.";
      case "KEEP_SIMPLE":
        return "";
    }
  }).filter(Boolean);
}

function appreciationSection(
  k: BusinessKnowledge,
  group: "positive" | "neutral" | "negative",
): PromptSection | null {
  const { appreciationPolicy, appreciationMessage } = k.replyBehaviour;
  if (appreciationPolicy === "NEVER") {
    return section("appreciation", "Appreciation", ["Do not open with a thank-you."]);
  }
  if (appreciationPolicy === "POSITIVE_ONLY" && group !== "positive") {
    return section("appreciation", "Appreciation", [
      "Do not thank them for the review itself; acknowledge the experience instead.",
    ]);
  }
  return section("appreciation", "Appreciation", [
    "Thank them genuinely, in your own words rather than a set phrase.",
    appreciationMessage && `The business likes to say: "${appreciationMessage}" — convey this, do not quote it verbatim.`,
  ]);
}

function structureSection(
  k: BusinessKnowledge,
  firstName: string | null,
  lengthLabel: string,
): PromptSection | null {
  const { greetingStyle, signature } = k.voice;
  return section("structure", "Shape of the reply", [
    `Length: ${lengthLabel}.`,
    greetingStyle
      ? firstName
        ? `Open with "${greetingStyle.replace(/,\s*$/, "")} ${firstName}," — their name, once.`
        : `Open with "${greetingStyle}".`
      : "Do not use a greeting line; start with the message.",
    signature ? `Sign off as "${signature}".` : "Do not add a signature or sign-off line.",
    "Plain text only. No markdown, no bullet points, no hashtags, no placeholders.",
    "Vary sentence length. Do not start consecutive sentences with the same word.",
  ]);
}

/**
 * Business context for any non-reply feature (posts, descriptions, FAQs,
 * captions). Exists so future features reuse this personality instead of
 * growing their own prompt system — the whole point of building it once.
 */
export function buildBusinessContext(k: BusinessKnowledge): BuiltPrompt {
  const sections = [
    identitySection(k),
    voiceSection(k),
    offeringSection(k),
    languageSection(k),
    restrictionSection(k),
  ].filter((s): s is PromptSection => s !== null);

  return {
    prompt: sections.map((s) => [`${s.label}:`, ...s.lines].join("\n")).join("\n\n"),
    systemInstruction: SYSTEM_INSTRUCTION,
    sections,
  };
}
