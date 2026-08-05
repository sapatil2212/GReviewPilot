/**
 * AI reply generator (owner-side).
 *
 * Drafts a reply the business owner can send to a customer review.
 * Distinct from reviewGenerator.service.ts, which drafts customer-facing
 * review text for the funnel. Falls back to rating-appropriate templates
 * so the reply box always gets a starting point.
 */

import { geminiService } from "@/server/services/ai/gemini.service";
import { logger } from "@/server/utils/logger";

export interface ReplyGeneratorInput {
  businessName: string;
  reviewerName?: string | null;
  starRating: number;
  reviewComment?: string | null;
  category?: string | null;
  /** warm | professional | apologetic | friendly */
  tone?: string | null;
  /** Business brief for extra grounding, when available. */
  aiContext?: string | null;
}

export interface GeneratedReply {
  text: string;
  source: "ai" | "template";
}

const MAX_REPLY = 1200;

export async function generateReply(
  input: ReplyGeneratorInput,
): Promise<GeneratedReply> {
  if (geminiService.isEnabled()) {
    try {
      const text = await withGemini(input);
      if (text) return { text, source: "ai" };
    } catch (err) {
      logger.warn("Gemini reply generation failed — using template", {
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return { text: templateReply(input), source: "template" };
}

async function withGemini(input: ReplyGeneratorInput): Promise<string | null> {
  const positive = input.starRating >= 4;
  const neutral = input.starRating === 3;

  const intent = positive
    ? "Thank them warmly, acknowledge something specific they mentioned, and invite them back."
    : neutral
      ? "Thank them for the honest feedback, acknowledge the mixed experience, and offer to make it better."
      : "Apologize sincerely without being defensive, take responsibility, and offer a concrete way to make it right (invite them to contact the business directly).";

  const firstName = input.reviewerName?.trim().split(/\s+/)[0];

  const prompt = [
    `You are the owner of "${input.businessName}" replying publicly to a Google review.`,
    input.category ? `Business category: ${input.category}.` : "",
    `The review is ${input.starRating} out of 5 stars.`,
    firstName ? `Reviewer's first name: ${firstName}.` : "",
    input.reviewComment
      ? `Review text: """${input.reviewComment}"""`
      : "The reviewer left a rating with no written comment.",
    input.aiContext ? `Business context: ${input.aiContext}` : "",
    "",
    `Goal: ${intent}`,
    `Tone: ${input.tone?.trim() || (positive ? "warm and appreciative" : "empathetic and professional")}.`,
    "",
    "Rules:",
    "- 2-4 sentences. Public-facing, so keep it gracious even if the review is unfair.",
    firstName ? `- Address them by first name (${firstName}) once, naturally.` : "",
    "- Reference what they actually said; do not invent details, offers, or compensation amounts.",
    "- Never argue, blame the customer, or mention internal processes.",
    "- No markdown, no hashtags, no placeholders or brackets. Plain text only.",
    "- Sign off naturally as the team/owner without inventing a personal name.",
    "Return only the reply text.",
  ]
    .filter(Boolean)
    .join("\n");

  const text = await geminiService.generateText(prompt, {
    systemInstruction:
      "You write professional, human public replies to customer reviews on behalf of local business owners. Never fabricate specifics or promise compensation.",
    temperature: 0.8,
    maxOutputTokens: 400,
  });

  const cleaned = text.replace(/^["'\s]+|["'\s]+$/g, "").trim();
  return cleaned ? cleaned.slice(0, MAX_REPLY) : null;
}

function templateReply(input: ReplyGeneratorInput): string {
  const name = input.reviewerName?.trim().split(/\s+/)[0];
  const hi = name ? `Hi ${name}, ` : "";
  const biz = input.businessName;

  if (input.starRating >= 4) {
    return `${hi}thank you so much for the kind words and for taking the time to leave a review. We're really glad you had a good experience with us. We look forward to welcoming you back to ${biz} soon!`;
  }
  if (input.starRating === 3) {
    return `${hi}thank you for the honest feedback — we appreciate you sharing it. We're sorry your visit wasn't better than just okay, and we'd genuinely like to understand what we could improve. Please reach out to us directly so we can make your next visit a better one.`;
  }
  return `${hi}we're sorry your experience with us fell short, and we sincerely apologize. This isn't the standard we hold ourselves to at ${biz}. We'd really like to put things right — please contact us directly so we can look into what happened and make it up to you.`;
}
