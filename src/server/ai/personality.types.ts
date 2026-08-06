/**
 * Business Personality — structured knowledge base contract.
 *
 * This module is the single source of truth for the personality shape and for
 * every option the onboarding wizard offers. The Zod validators, the wizard UI,
 * and the prompt builder all derive from here, so a new communication style or
 * negative-review strategy is added in exactly one place and cannot drift
 * between the form, the API, and the prompt.
 *
 * Deliberately free of Prisma and React imports: it is shared by server
 * services, route validators, and client components alike.
 *
 * The guiding rule of this whole subsystem: the user never writes a prompt.
 * They answer plain questions, and those answers are stored as discrete
 * sections. Prompt text is composed on demand (see promptBuilder.ts) and never
 * persisted, because a stored prompt string cannot be validated, partially
 * edited, versioned, or reused by a feature that only needs the tone rules.
 */

// =====================================================================
// Option catalogs
//
// `label` is what the user reads; `value` is what is stored and what reaches
// the prompt. `hint` explains the consequence of a choice, since a business
// owner should not have to guess what "Conservative" does.
// =====================================================================

export interface Option<T extends string = string> {
  value: T;
  label: string;
  hint?: string;
}

/** Step 2 — values. Custom entries are allowed alongside these. */
export const BUSINESS_VALUES = [
  "Honesty",
  "Professionalism",
  "Fast Service",
  "Friendly Staff",
  "Premium Quality",
  "Affordable Pricing",
  "Personalized Care",
  "Customer First",
] as const;

/** Step 3 — communication style. Multiple allowed: real voice is a blend. */
export const COMMUNICATION_STYLES = [
  "Professional",
  "Friendly",
  "Warm",
  "Luxury",
  "Casual",
  "Formal",
  "Confident",
  "Empathetic",
  "Playful",
  "Minimal",
] as const;

/** Step 4 — greeting. Empty string means "no greeting". */
export const GREETING_STYLES: Option[] = [
  { value: "Hello,", label: "Hello," },
  { value: "Hi,", label: "Hi," },
  { value: "Dear,", label: "Dear," },
  { value: "Hi there,", label: "Hi there," },
  { value: "Good Morning,", label: "Good Morning,", hint: "Only used when the local time fits" },
  { value: "Good Evening,", label: "Good Evening,", hint: "Only used when the local time fits" },
  { value: "", label: "No greeting", hint: "Replies open straight into the message" },
];

export const EMOJI_USAGE_OPTIONS: Option<EmojiUsage>[] = [
  { value: "NEVER", label: "Never", hint: "Safest for clinics, law firms, finance" },
  { value: "RARELY", label: "Rarely", hint: "At most one, only in very positive replies" },
  { value: "SOMETIMES", label: "Sometimes", hint: "One emoji when the mood fits" },
  { value: "FREQUENTLY", label: "Frequently", hint: "Warm and expressive" },
];

export const REPLY_LENGTH_OPTIONS: Option<ReplyLength>[] = [
  { value: "VERY_SHORT", label: "Very short", hint: "One sentence" },
  { value: "SHORT", label: "Short", hint: "Two to three sentences" },
  { value: "MEDIUM", label: "Medium", hint: "Three to four sentences" },
  { value: "DETAILED", label: "Detailed", hint: "Four to six sentences" },
];

export const APPRECIATION_OPTIONS: Option<AppreciationPolicy>[] = [
  { value: "ALWAYS", label: "Thank every customer" },
  { value: "POSITIVE_ONLY", label: "Thank only positive reviews" },
  { value: "NEVER", label: "No thank you" },
];

export const APPROVAL_OPTIONS: Option<ReplyApprovalMode>[] = [
  {
    value: "AUTO_SEND",
    label: "Reply automatically",
    hint: "Send without review. Fastest, but nothing is checked first.",
  },
  {
    value: "DRAFT_ONLY",
    label: "Generate a draft only",
    hint: "You read and send each reply yourself. Recommended.",
  },
  {
    value: "MANAGER_APPROVAL",
    label: "Require manager approval",
    hint: "Drafts queue for someone with approval rights.",
  },
];

export const CONFIDENCE_OPTIONS: Option<AiConfidenceLevel>[] = [
  {
    value: "CONSERVATIVE",
    label: "Conservative",
    hint: "Sticks closely to safe, predictable wording",
  },
  { value: "BALANCED", label: "Balanced", hint: "Natural variety, low risk" },
  { value: "CREATIVE", label: "Creative", hint: "More personality, more variation" },
];

/**
 * Step 10 — negative review strategy. Keys, not sentences, so the prompt
 * builder controls the exact phrasing and it stays consistent.
 */
export const NEGATIVE_STRATEGIES = [
  "APOLOGIZE_FIRST",
  "SHOW_EMPATHY",
  "OFFER_RESOLUTION",
  "INVITE_OFFLINE",
  "REQUEST_CONTACT",
  "NEVER_ARGUE",
  "ESCALATE_SERIOUS",
] as const;

export const NEGATIVE_STRATEGY_OPTIONS: Option<NegativeStrategy>[] = [
  { value: "APOLOGIZE_FIRST", label: "Apologize first" },
  { value: "SHOW_EMPATHY", label: "Show empathy" },
  { value: "OFFER_RESOLUTION", label: "Offer a resolution" },
  { value: "INVITE_OFFLINE", label: "Invite an offline conversation" },
  { value: "REQUEST_CONTACT", label: "Ask them to get in touch" },
  { value: "NEVER_ARGUE", label: "Never argue", hint: "Stay gracious even if the review is unfair" },
  {
    value: "ESCALATE_SERIOUS",
    label: "Flag serious issues",
    hint: "Safety, legal, or medical claims are held for a human",
  },
];

/** Step 11 — positive review strategy. */
export const POSITIVE_STRATEGIES = [
  "MENTION_SERVICES",
  "INVITE_RETURN",
  "RECOMMEND_SERVICE",
  "MENTION_STAFF",
  "INVITE_REFERRALS",
  "KEEP_SIMPLE",
] as const;

export const POSITIVE_STRATEGY_OPTIONS: Option<PositiveStrategy>[] = [
  { value: "MENTION_SERVICES", label: "Mention the service they used" },
  { value: "INVITE_RETURN", label: "Invite them back" },
  { value: "RECOMMEND_SERVICE", label: "Suggest another service" },
  { value: "MENTION_STAFF", label: "Mention the staff member by name" },
  { value: "INVITE_REFERRALS", label: "Invite referrals" },
  {
    value: "KEEP_SIMPLE",
    label: "Keep it simple",
    hint: "Just say thank you. Overrides the options above.",
  },
];

/** Step 13 — common "never say" rules, offered as starting points. */
export const COMMON_NEVER_SAY = [
  "Never mention discounts",
  "Never promise refunds",
  "Never admit legal responsibility",
  "Never discuss pricing",
  "Never mention competitors",
  "Never use slang",
] as const;

/** Step 14 — regulated sectors with extra reply constraints. */
export const COMPLIANCE_SECTORS = [
  "Healthcare",
  "Financial",
  "Education",
  "Hospitality",
  "Government",
  "Legal",
  "Other",
] as const;

// =====================================================================
// Enum mirrors
//
// Declared as string unions rather than imported from @prisma/client so this
// module stays usable in client components, where importing the Prisma client
// would pull server code into the browser bundle. `personality.guard.ts`
// asserts these stay in step with the Prisma enums.
// =====================================================================

export type EmojiUsage = "NEVER" | "RARELY" | "SOMETIMES" | "FREQUENTLY";
export type ReplyLength = "VERY_SHORT" | "SHORT" | "MEDIUM" | "DETAILED";
export type ReplyApprovalMode = "AUTO_SEND" | "DRAFT_ONLY" | "MANAGER_APPROVAL";
export type AiConfidenceLevel = "CONSERVATIVE" | "BALANCED" | "CREATIVE";
export type AppreciationPolicy = "ALWAYS" | "POSITIVE_ONLY" | "NEVER";
export type ReplySentiment =
  | "VERY_POSITIVE"
  | "POSITIVE"
  | "NEUTRAL"
  | "MIXED"
  | "NEGATIVE"
  | "VERY_NEGATIVE";

export type NegativeStrategy = (typeof NEGATIVE_STRATEGIES)[number];
export type PositiveStrategy = (typeof POSITIVE_STRATEGIES)[number];

// =====================================================================
// The knowledge base
// =====================================================================

/**
 * Structured business knowledge, grouped by concern rather than by wizard
 * step. Grouping by concern is what makes it reusable: a Google Post generator
 * needs `identity` + `voice` + `restrictions` but has no use for
 * `replyBehaviour`, and it can take exactly those sections.
 */
export interface BusinessKnowledge {
  identity: {
    businessName: string;
    businessType: string | null;
    industry: string | null;
    shortDescription: string | null;
    uniqueness: string | null;
    city: string | null;
  };
  voice: {
    values: string[];
    communicationStyles: string[];
    greetingStyle: string | null;
    signature: string | null;
    emojiUsage: EmojiUsage;
    replyLength: ReplyLength;
    confidenceLevel: AiConfidenceLevel;
  };
  language: {
    primary: string;
    secondary: string[];
    autoDetect: boolean;
    translateBeforeReply: boolean;
  };
  replyBehaviour: {
    appreciationPolicy: AppreciationPolicy;
    appreciationMessage: string | null;
    negativeStrategies: NegativeStrategy[];
    positiveStrategies: PositiveStrategy[];
  };
  offering: {
    services: string[];
    products: string[];
    pricingPhilosophy: string | null;
    guarantees: string | null;
    usp: string | null;
    experience: string | null;
    certifications: string[];
    awards: string[];
    businessStory: string | null;
  };
  restrictions: {
    neverSay: string[];
    complianceRules: string[];
    complianceNotes: string | null;
  };
  automation: {
    approvalMode: ReplyApprovalMode;
  };
  meta: {
    /** Personality revision that produced this snapshot. */
    revision: number;
    /** True once the wizard's required steps are done. */
    complete: boolean;
  };
}

// =====================================================================
// Wizard steps
//
// Declared as data so the wizard renders from it and progress/completeness is
// computed from one list rather than duplicated in the UI and the service.
// =====================================================================

export interface WizardStep {
  id: string;
  title: string;
  /** Question shown as the step's subtitle. */
  question: string;
  /** Required steps gate `meta.complete`; everything else is skippable. */
  required: boolean;
}

export const WIZARD_STEPS: WizardStep[] = [
  { id: "introduction", title: "Your business", question: "Tell us who you are", required: true },
  { id: "values", title: "Values", question: "What values define your business?", required: false },
  { id: "style", title: "Communication style", question: "How should your business sound?", required: true },
  { id: "greeting", title: "Greeting", question: "How should replies open?", required: false },
  { id: "signature", title: "Signature", question: "How should replies sign off?", required: false },
  { id: "emoji", title: "Emoji", question: "Should replies use emoji?", required: false },
  { id: "length", title: "Reply length", question: "How long should replies be?", required: false },
  { id: "language", title: "Language", question: "Which languages do you reply in?", required: false },
  { id: "appreciation", title: "Appreciation", question: "Who should be thanked?", required: false },
  { id: "negative", title: "Negative reviews", question: "How should we handle criticism?", required: true },
  { id: "positive", title: "Positive reviews", question: "What should praise replies do?", required: false },
  { id: "services", title: "What you offer", question: "What should the AI know about your services?", required: false },
  { id: "never", title: "Never say", question: "What must never appear in a reply?", required: false },
  { id: "compliance", title: "Compliance", question: "Any regulatory constraints?", required: false },
  { id: "approval", title: "Approval", question: "Who signs off on replies?", required: true },
  { id: "confidence", title: "Creativity", question: "How much variation should we use?", required: false },
];

export const REQUIRED_STEP_IDS = WIZARD_STEPS.filter((s) => s.required).map((s) => s.id);

/** Progress as a 0-100 percentage, for the wizard header. */
export function completionPercent(completedSteps: string[]): number {
  if (WIZARD_STEPS.length === 0) return 0;
  const known = new Set(WIZARD_STEPS.map((s) => s.id));
  const done = new Set(completedSteps.filter((id) => known.has(id)));
  return Math.round((done.size / WIZARD_STEPS.length) * 100);
}

/** A personality is usable once every required step is answered. */
export function isComplete(completedSteps: string[]): boolean {
  const done = new Set(completedSteps);
  return REQUIRED_STEP_IDS.every((id) => done.has(id));
}
