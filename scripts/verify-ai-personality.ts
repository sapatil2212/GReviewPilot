/**
 * Business Personality engine self-check.
 *
 * Verifies the pure logic that the reply engine rests on: sentiment banding,
 * escalation, duplicate detection, humanization rules, and prompt composition.
 * No provider calls, so it runs offline and deterministically.
 *
 * Run with: npx tsx scripts/verify-ai-personality.ts
 */

import {
  WIZARD_STEPS,
  completionPercent,
  isComplete,
  type BusinessKnowledge,
} from "../src/server/ai/personality.types";
import {
  classifyReplySentiment,
  escalationReasons,
  lengthGuidance,
  needsHumanEscalation,
  replyGoals,
  sentimentGroup,
  temperatureFor,
} from "../src/server/ai/replySentiment";
import {
  checkDuplicate,
  fingerprint,
  inspectReply,
  isPublishable,
  openingFingerprint,
  similarity,
  splitSentences,
} from "../src/server/ai/humanize";
import { buildBusinessContext, buildReplyPrompt } from "../src/server/ai/promptBuilder";

let failures = 0;
let checks = 0;
function check(name: string, cond: boolean, detail?: string) {
  checks += 1;
  if (cond) console.log(`  ok   ${name}`);
  else {
    failures += 1;
    console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}
function section(t: string) {
  console.log(`\n${t}`);
}

// ---------------------------------------------------------------------
section("Sentiment banding");

check("5 stars, no text -> VERY_POSITIVE", classifyReplySentiment({ starRating: 5 }) === "VERY_POSITIVE");
check(
  "5 stars with two complaints -> MIXED",
  classifyReplySentiment({
    starRating: 5,
    comment: "Great staff but the waiting was long and reception was rude",
  }) === "MIXED",
);
check(
  "5 stars with pure praise stays VERY_POSITIVE",
  classifyReplySentiment({ starRating: 5, comment: "Amazing, friendly and professional!" }) ===
    "VERY_POSITIVE",
);
check("4 stars -> POSITIVE", classifyReplySentiment({ starRating: 4, comment: "Very good" }) === "POSITIVE");
check("3 stars, neutral text -> NEUTRAL", classifyReplySentiment({ starRating: 3, comment: "It was ok" }) === "NEUTRAL");
check(
  "3 stars, complaint-heavy -> NEGATIVE",
  classifyReplySentiment({
    starRating: 3,
    comment: "Disappointed, we waited too long and it was expensive",
  }) === "NEGATIVE",
);
check("2 stars -> NEGATIVE", classifyReplySentiment({ starRating: 2, comment: "Not good" }) === "NEGATIVE");
check("1 star -> VERY_NEGATIVE", classifyReplySentiment({ starRating: 1, comment: "Terrible" }) === "VERY_NEGATIVE");
check(
  "1 star with real praise softens to NEGATIVE",
  classifyReplySentiment({
    starRating: 1,
    comment: "The dentist was great and friendly but billing was a nightmare",
  }) === "NEGATIVE",
);
check(
  "a 5-star review can never become NEGATIVE",
  ["VERY_POSITIVE", "POSITIVE", "MIXED"].includes(
    classifyReplySentiment({ starRating: 5, comment: "worst terrible awful rude dirty late" }),
  ),
);
check("out-of-range rating does not throw", classifyReplySentiment({ starRating: 0 }) === "NEUTRAL");

section("Escalation");
check(
  "legal threat escalates",
  needsHumanEscalation({ starRating: 1, comment: "I am contacting my lawyer about this negligence" }),
);
check("medical harm escalates", needsHumanEscalation({ starRating: 1, comment: "I got an infection after" }));
check("ordinary complaint does not escalate", !needsHumanEscalation({ starRating: 2, comment: "Parking was hard" }));
check("no comment does not escalate", !needsHumanEscalation({ starRating: 1 }));
check(
  "escalation reports a reason",
  escalationReasons({ starRating: 1, comment: "this is fraud" }).includes("fraud"),
);

section("Goals, length, temperature");
check("every band has goals", (["VERY_POSITIVE","POSITIVE","NEUTRAL","MIXED","NEGATIVE","VERY_NEGATIVE"] as const).every((s) => replyGoals(s).length > 0));
check("grouping collapses correctly", sentimentGroup("VERY_NEGATIVE") === "negative" && sentimentGroup("MIXED") === "neutral" && sentimentGroup("POSITIVE") === "positive");
check("very short is one sentence", lengthGuidance("VERY_SHORT").max === 1);
check("detailed allows more than short", lengthGuidance("DETAILED").max > lengthGuidance("SHORT").max);
check(
  "negative replies are damped below creative",
  temperatureFor("CREATIVE", "VERY_NEGATIVE") < temperatureFor("CREATIVE", "VERY_POSITIVE"),
);
check("conservative < creative", temperatureFor("CONSERVATIVE", "POSITIVE") < temperatureFor("CREATIVE", "POSITIVE"));

// ---------------------------------------------------------------------
section("Duplicate protection");

const priorA = "Thank you so much for the kind words, we are glad you enjoyed your visit.";
check("fingerprint is stable", fingerprint(priorA) === fingerprint(priorA));
check(
  "fingerprint ignores punctuation and case",
  fingerprint("Thanks, Priya!") === fingerprint("thanks priya"),
);
check("different text differs", fingerprint(priorA) !== fingerprint("Something entirely different here"));
check("self-similarity is 1", similarity(priorA, priorA) === 1);
check("unrelated text is not similar", similarity(priorA, "The car needed new brake pads today") < 0.2);

check(
  "exact duplicate is caught",
  checkDuplicate(priorA, [{ text: priorA }]).reason === "exact",
);
check(
  "near duplicate is caught",
  checkDuplicate("Thank you so much for the kind words, we are glad you enjoyed the visit.", [
    { text: priorA },
  ]).isDuplicate,
);
check(
  "repeated opening is caught even when the body differs",
  checkDuplicate(
    "Thank you so much for the lovely feedback about our new hygienist and the late opening hours.",
    [{ text: priorA }],
  ).reason === "opening",
);
check(
  "a genuinely different reply passes",
  !checkDuplicate("We are sorry the wait let us down — please call us so we can fix it.", [
    { text: priorA },
  ]).isDuplicate,
);
check("no history means no duplicate", !checkDuplicate(priorA, []).isDuplicate);
check(
  "stored hashes are used when supplied",
  checkDuplicate(priorA, [
    { text: "irrelevant", fingerprint: fingerprint(priorA), openingHash: openingFingerprint(priorA) },
  ]).reason === "exact",
);

// ---------------------------------------------------------------------
section("Humanization");

const base = { minSentences: 2, maxSentences: 3 };
check(
  "a good reply has no issues",
  inspectReply({ ...base, text: "Thanks for visiting us, Priya. We are glad the new hygienist looked after you well." })
    .length === 0,
);
check(
  "placeholders block publication",
  !isPublishable(inspectReply({ ...base, text: "Hi [Customer Name], thanks so much for coming in to see us." })),
);
check(
  "markdown blocks publication",
  !isPublishable(inspectReply({ ...base, text: "Thanks **so** much for the review. We hope to help again." })),
);
check(
  "AI cliches are warned about",
  inspectReply({ ...base, text: "We value your feedback. Rest assured we will look into this matter." }).some(
    (i) => i.code === "cliche",
  ),
);
check(
  "never-say rules block publication",
  !isPublishable(
    inspectReply({
      ...base,
      text: "Sorry about that. We will issue a full refund to your card today.",
      neverSay: ["Never promise refunds"],
    }),
  ),
);
check(
  "an unrelated reply passes the same never-say rule",
  isPublishable(
    inspectReply({
      ...base,
      text: "Sorry about the wait. Please call us and we will sort it out for you.",
      neverSay: ["Never promise refunds"],
    }),
  ),
);
// Word-form handling: a guardrail defeated by an "s" is not a guardrail.
check(
  "plural rule catches singular use (refunds -> refund)",
  !isPublishable(
    inspectReply({ ...base, text: "We will issue a refund today.", neverSay: ["Never promise refunds"] }),
  ),
);
check(
  "singular rule catches plural use (refund -> refunds)",
  !isPublishable(
    inspectReply({ ...base, text: "We do not give refunds here.", neverSay: ["Never promise a refund"] }),
  ),
);
check(
  "rule catches an inflected verb form (refunds -> refunded)",
  !isPublishable(
    inspectReply({ ...base, text: "You were refunded last week.", neverSay: ["Never promise refunds"] }),
  ),
);
check(
  "discount rule catches discounted",
  !isPublishable(
    inspectReply({ ...base, text: "Your next visit is discounted.", neverSay: ["Never mention discounts"] }),
  ),
);
check(
  "stemming does not over-match unrelated words",
  isPublishable(
    inspectReply({
      ...base,
      text: "Our team competed in a regional dental contest and had a great time.",
      neverSay: ["Never mention competitors"],
    }),
  ),
);
check(
  "pricing rule does not fire on unrelated praise",
  isPublishable(
    inspectReply({
      ...base,
      text: "Thanks for the kind words about our hygienist. See you at your next check-up.",
      neverSay: ["Never discuss pricing"],
    }),
  ),
);
check(
  "pricing rule fires on pricing talk",
  !isPublishable(
    inspectReply({ ...base, text: "Our pricing is the lowest around.", neverSay: ["Never discuss pricing"] }),
  ),
);
check(
  "over-length is flagged",
  inspectReply({ minSentences: 1, maxSentences: 1, text: "One. Two. Three. Four." }).some(
    (i) => i.code === "too_long",
  ),
);
check(
  "repetitive sentence openings are flagged",
  inspectReply({
    minSentences: 1,
    maxSentences: 8,
    text: "We are sorry. We will fix it. We hope you return. We promise better.",
  }).some((i) => i.code === "repetitive_sentences"),
);
check(
  "char cap blocks",
  !isPublishable(inspectReply({ ...base, text: "a ".repeat(50), maxChars: 20 })),
);

// ---------------------------------------------------------------------
section("Wizard progress");

check("steps are declared", WIZARD_STEPS.length === 16, String(WIZARD_STEPS.length));
check("step ids are unique", new Set(WIZARD_STEPS.map((s) => s.id)).size === WIZARD_STEPS.length);
check("no steps completed is 0%", completionPercent([]) === 0);
check("all steps completed is 100%", completionPercent(WIZARD_STEPS.map((s) => s.id)) === 100);
check("unknown step ids are ignored", completionPercent(["not-a-step"]) === 0);
check("incomplete without required steps", !isComplete(["values"]));
check(
  "complete with all required steps",
  isComplete(WIZARD_STEPS.filter((s) => s.required).map((s) => s.id)),
);

// ---------------------------------------------------------------------
section("Prompt composition");

const knowledge: BusinessKnowledge = {
  identity: {
    businessName: "Bright Smile Dental",
    businessType: "Dental clinic",
    industry: "Dental clinic",
    shortDescription: "A family-owned dental clinic focused on gentle, affordable care.",
    uniqueness: "Every dentist has 10+ years of experience.",
    city: "Pune",
  },
  voice: {
    values: ["Honesty", "Personalized Care"],
    communicationStyles: ["Warm", "Professional"],
    greetingStyle: "Hi,",
    signature: "The Bright Smile Team",
    emojiUsage: "NEVER",
    replyLength: "SHORT",
    confidenceLevel: "BALANCED",
  },
  language: { primary: "en", secondary: ["hi"], autoDetect: true, translateBeforeReply: false },
  replyBehaviour: {
    appreciationPolicy: "ALWAYS",
    appreciationMessage: null,
    negativeStrategies: ["APOLOGIZE_FIRST", "SHOW_EMPATHY", "INVITE_OFFLINE", "NEVER_ARGUE"],
    positiveStrategies: ["MENTION_SERVICES", "INVITE_RETURN"],
  },
  offering: {
    services: ["Teeth cleaning", "Root canal", "Braces"],
    products: [],
    pricingPhilosophy: null,
    guarantees: null,
    usp: "Painless treatment",
    experience: "15 years",
    certifications: [],
    awards: [],
    businessStory: null,
  },
  restrictions: {
    neverSay: ["Never discuss pricing", "Never promise refunds"],
    complianceRules: ["Healthcare"],
    complianceNotes: "Never confirm whether a named person was a patient.",
  },
  automation: { approvalMode: "DRAFT_ONLY" },
  meta: { revision: 3, complete: true },
};

const positive = buildReplyPrompt({
  knowledge,
  review: { reviewerName: "Priya Sharma", starRating: 5, comment: "Painless cleaning, lovely staff!" },
  sentiment: "VERY_POSITIVE",
});

check("prompt is non-trivial", positive.prompt.length > 400, String(positive.prompt.length));
check("prompt names the business", positive.prompt.includes("Bright Smile Dental"));
check("prompt uses the first name only", positive.prompt.includes("Priya") && !positive.prompt.includes("Sharma"));
check("prompt carries the signature", positive.prompt.includes("The Bright Smile Team"));
check("prompt forbids emoji", positive.prompt.includes("Do not use emoji"));
check("prompt states the length band", positive.prompt.includes("2 to 3 sentences"));
check("prompt includes never-say rules", positive.prompt.includes("Never discuss pricing"));
check("prompt includes compliance notes", positive.prompt.includes("was a patient"));
check("guardrails are rendered last", positive.sections[positive.sections.length - 1]?.id === "restrictions");
check("positive strategy is included", positive.prompt.includes("Invite them back"));
check("negative strategy is omitted for praise", !positive.sections.some((s) => s.id === "negative_strategy"));
check("no section is empty", positive.sections.every((s) => s.lines.length > 0));
check("system instruction is set", positive.systemInstruction.includes("business owner"));

const negative = buildReplyPrompt({
  knowledge,
  review: { reviewerName: "Tom", starRating: 1, comment: "Rude reception and a long wait." },
  sentiment: "VERY_NEGATIVE",
  avoidOpenings: ["Thank you so much for"],
  regenerateReason: "too similar to a recent reply",
});
check("negative strategy is included", negative.sections.some((s) => s.id === "negative_strategy"));
check("apology-first rule is rendered", negative.prompt.includes("Open with the apology"));
check("never-argue rule is rendered", negative.prompt.includes("Never contradict"));
check("offering is withheld from an apology", !negative.sections.some((s) => s.id === "offering"));
check("openings to avoid are passed through", negative.prompt.includes("Thank you so much for"));
check("regenerate reason is passed through", negative.prompt.includes("too similar"));

// KEEP_SIMPLE must override the other positive strategies.
const simple = buildReplyPrompt({
  knowledge: {
    ...knowledge,
    replyBehaviour: {
      ...knowledge.replyBehaviour,
      positiveStrategies: ["KEEP_SIMPLE", "INVITE_REFERRALS", "RECOMMEND_SERVICE"],
    },
  },
  review: { starRating: 5, comment: "Great!" },
  sentiment: "VERY_POSITIVE",
});
check("KEEP_SIMPLE suppresses upselling", !simple.prompt.includes("suggest one other relevant service"));
check("KEEP_SIMPLE is honoured", simple.prompt.includes("simply say thank you"));

// Language detection should override the business default.
const hindi = buildReplyPrompt({
  knowledge,
  review: { starRating: 5, comment: "Bahut accha", detectedLanguage: "hi" },
  sentiment: "VERY_POSITIVE",
});
check("detected language wins when auto-detect is on", hindi.prompt.includes("Write the reply in hi"));

// No-greeting / no-signature must produce explicit negative instructions.
const bare = buildReplyPrompt({
  knowledge: { ...knowledge, voice: { ...knowledge.voice, greetingStyle: null, signature: null } },
  review: { starRating: 4, comment: "Good" },
  sentiment: "POSITIVE",
});
check("absent greeting is stated explicitly", bare.prompt.includes("Do not use a greeting"));
check("absent signature is stated explicitly", bare.prompt.includes("Do not add a signature"));

// An empty personality must still compose a usable prompt.
const empty: BusinessKnowledge = {
  identity: { businessName: "A Shop", businessType: null, industry: null, shortDescription: null, uniqueness: null, city: null },
  voice: { values: [], communicationStyles: [], greetingStyle: null, signature: null, emojiUsage: "NEVER", replyLength: "SHORT", confidenceLevel: "BALANCED" },
  language: { primary: "en", secondary: [], autoDetect: true, translateBeforeReply: false },
  replyBehaviour: { appreciationPolicy: "ALWAYS", appreciationMessage: null, negativeStrategies: [], positiveStrategies: [] },
  offering: { services: [], products: [], pricingPhilosophy: null, guarantees: null, usp: null, experience: null, certifications: [], awards: [], businessStory: null },
  restrictions: { neverSay: [], complianceRules: [], complianceNotes: null },
  automation: { approvalMode: "DRAFT_ONLY" },
  meta: { revision: 1, complete: false },
};
const emptyPrompt = buildReplyPrompt({ knowledge: empty, review: { starRating: 3 }, sentiment: "NEUTRAL" });
check("an unconfigured personality still yields a prompt", emptyPrompt.prompt.length > 150);
check("default voice is applied when none chosen", emptyPrompt.prompt.includes("warm, professional voice"));
check("baseline guardrails always present", emptyPrompt.prompt.includes("Never invent facts"));

const reusable = buildBusinessContext(knowledge);
check("reusable business context builds", reusable.prompt.includes("Bright Smile Dental"));
check("reusable context omits reply-only sections", !reusable.sections.some((s) => s.id === "goals"));

// ---------------------------------------------------------------------
section("Approval routing");

const { resolveInitialStatus } = await import("../src/server/services/aiReplyEngine.service");

check(
  "auto-send approves routine praise",
  resolveInitialStatus({ approvalMode: "AUTO_SEND", escalated: false, blocked: false }) === "APPROVED",
);
check(
  "draft-only stays a draft",
  resolveInitialStatus({ approvalMode: "DRAFT_ONLY", escalated: false, blocked: false }) === "DRAFT",
);
check(
  "manager approval queues",
  resolveInitialStatus({ approvalMode: "MANAGER_APPROVAL", escalated: false, blocked: false }) ===
    "PENDING_APPROVAL",
);
check(
  "escalation overrides auto-send",
  resolveInitialStatus({ approvalMode: "AUTO_SEND", escalated: true, blocked: false }) ===
    "PENDING_APPROVAL",
);
check(
  "a blocking issue overrides auto-send",
  resolveInitialStatus({ approvalMode: "AUTO_SEND", escalated: false, blocked: true }) ===
    "PENDING_APPROVAL",
);

// ---------------------------------------------------------------------
section("Deterministic composer");

const { composeDeterministicReply } = await import("../src/server/ai/deterministicReply");

const praise = composeDeterministicReply({
  knowledge,
  sentiment: "VERY_POSITIVE",
  review: { reviewerName: "Priya Sharma", starRating: 5, comment: "Painless and quick!" },
});
check("composes a reply", praise.length > 40);
check("uses the greeting with the first name", praise.startsWith("Hi Priya,"));
check("appends the signature", praise.includes("The Bright Smile Team"));
check("respects emojiUsage NEVER", !/\p{Extended_Pictographic}/u.test(praise));
check(
  "praise reply has no apology",
  !praise.toLowerCase().includes("sorry"),
);
check(
  "output passes its own humanization rules",
  isPublishable(
    inspectReply({
      text: praise,
      minSentences: 1,
      maxSentences: 8,
      neverSay: knowledge.restrictions.neverSay,
    }),
  ),
  praise,
);

const rant = composeDeterministicReply({
  knowledge,
  sentiment: "VERY_NEGATIVE",
  review: { reviewerName: "Tom", starRating: 1, comment: "Rude staff, long wait." },
});
check("apology leads a negative reply", /^hi tom, (we're|we owe)/i.test(rant), rant);
check("negative reply offers a route offline", /touch|contact|reach out|right|make it up/i.test(rant));
check("negative reply never invites them back", !/welcome you back|see you again/i.test(rant));

// Variants must differ, or "regenerate" is a no-op.
const v1 = composeDeterministicReply({ knowledge, sentiment: "POSITIVE", review: { starRating: 4, comment: "Good" }, variant: 1 });
const v2 = composeDeterministicReply({ knowledge, sentiment: "POSITIVE", review: { starRating: 4, comment: "Good" }, variant: 2 });
check("regenerating produces different wording", v1 !== v2, `${v1} == ${v2}`);
check(
  "the same input and variant is stable",
  composeDeterministicReply({ knowledge, sentiment: "POSITIVE", review: { starRating: 4, comment: "Good" }, variant: 1 }) === v1,
);
// Different reviews should not collide.
const a = composeDeterministicReply({ knowledge, sentiment: "VERY_POSITIVE", review: { starRating: 5, comment: "Fantastic hygienist" } });
const b = composeDeterministicReply({ knowledge, sentiment: "VERY_POSITIVE", review: { starRating: 5, comment: "Braces went perfectly" } });
check("different reviews get different replies", a !== b);

// Settings must actually take effect.
const noGreeting = composeDeterministicReply({
  knowledge: { ...knowledge, voice: { ...knowledge.voice, greetingStyle: null, signature: null } },
  sentiment: "VERY_POSITIVE",
  review: { reviewerName: "Priya", starRating: 5 },
});
check("no greeting is honoured", !noGreeting.startsWith("Hi"));
// Asserts on the signature block specifically. An em-dash alone is not a
// signal: some clause pools legitimately contain one mid-sentence.
check("no signature is honoured", !noGreeting.includes("Bright Smile Team") && !noGreeting.includes("\n\n—"));

const emoji = composeDeterministicReply({
  knowledge: { ...knowledge, voice: { ...knowledge.voice, emojiUsage: "FREQUENTLY" } },
  sentiment: "VERY_POSITIVE",
  review: { starRating: 5 },
});
check("emoji policy FREQUENTLY adds one", /\p{Extended_Pictographic}/u.test(emoji));
const emojiNegative = composeDeterministicReply({
  knowledge: { ...knowledge, voice: { ...knowledge.voice, emojiUsage: "FREQUENTLY" } },
  sentiment: "VERY_NEGATIVE",
  review: { starRating: 1, comment: "Awful" },
});
check("never emoji in an apology", !/\p{Extended_Pictographic}/u.test(emojiNegative));

const veryShort = composeDeterministicReply({
  knowledge: { ...knowledge, voice: { ...knowledge.voice, replyLength: "VERY_SHORT" } },
  sentiment: "VERY_POSITIVE",
  review: { starRating: 5 },
});
check("VERY_SHORT yields one sentence", splitSentences(veryShort.split("\n")[0]!).length === 1, veryShort);

const noThanks = composeDeterministicReply({
  knowledge: {
    ...knowledge,
    replyBehaviour: { ...knowledge.replyBehaviour, appreciationPolicy: "NEVER" },
  },
  sentiment: "VERY_POSITIVE",
  review: { starRating: 5 },
});
check("appreciation NEVER suppresses thanks", !/thank|thanks|appreciate/i.test(noThanks), noThanks);

// Every band must produce something publishable.
for (const s of ["VERY_POSITIVE", "POSITIVE", "NEUTRAL", "MIXED", "NEGATIVE", "VERY_NEGATIVE"] as const) {
  const out = composeDeterministicReply({ knowledge, sentiment: s, review: { starRating: 3, comment: "Mixed bag" } });
  check(
    `${s} composes publishable text`,
    out.trim().length > 20 &&
      isPublishable(inspectReply({ text: out, minSentences: 1, maxSentences: 10, neverSay: knowledge.restrictions.neverSay })),
    out,
  );
}

// ---------------------------------------------------------------------
console.log(`\n${checks - failures}/${checks} checks passed`);
if (failures > 0) {
  console.error(`${failures} check(s) FAILED`);
  process.exit(1);
}
console.log("Business Personality engine self-check passed.");
