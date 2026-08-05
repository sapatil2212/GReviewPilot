/**
 * AI Google Post generator.
 *
 * Drafts "What's New" / Event / Offer / Alert post copy for a business
 * using Gemini, grounded in the tenant's business profile and (when
 * available) the location's AI review brief. Falls back to templates so
 * the composer always returns something usable.
 */

import { PostCtaType, PostType } from "@prisma/client";
import { geminiService } from "@/server/services/ai/gemini.service";
import { logger } from "@/server/utils/logger";

export interface PostGeneratorInput {
  businessName: string;
  category?: string | null;
  city?: string | null;
  type: PostType;
  /** What the owner wants the post to be about. */
  topic?: string | null;
  tone?: string | null;
  /** Business brief synthesized elsewhere (website scrape / review profile). */
  aiContext?: string | null;
  highlights?: string[] | null;
}

export interface GeneratedPost {
  title: string | null;
  body: string;
  ctaType: PostCtaType;
  source: "ai" | "template";
}

/** Google caps local post bodies at 1500 chars; stay well under. */
const MAX_BODY = 1400;

const TYPE_GUIDANCE: Record<PostType, string> = {
  STANDARD:
    'A "What\'s New" update — share news, a tip, or something happening at the business right now.',
  EVENT:
    "An event announcement — make the occasion and why to attend clear and inviting.",
  OFFER:
    "A promotional offer — lead with the value, keep it honest, and make redemption obvious.",
  ALERT:
    "A time-sensitive notice (hours change, closure, urgent update) — clear, calm, and factual.",
};

const DEFAULT_CTA: Record<PostType, PostCtaType> = {
  STANDARD: PostCtaType.LEARN_MORE,
  EVENT: PostCtaType.LEARN_MORE,
  OFFER: PostCtaType.SHOP,
  ALERT: PostCtaType.NONE,
};

export async function generatePost(
  input: PostGeneratorInput,
): Promise<GeneratedPost> {
  if (geminiService.isEnabled()) {
    try {
      const ai = await generateWithGemini(input);
      if (ai) return ai;
    } catch (err) {
      logger.warn("Gemini post generation failed — using template", {
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return { ...templatePost(input), source: "template" };
}

async function generateWithGemini(
  input: PostGeneratorInput,
): Promise<GeneratedPost | null> {
  const highlights = (input.highlights ?? []).filter(Boolean).slice(0, 6);

  const prompt = [
    `Write a Google Business Profile post for "${input.businessName}".`,
    input.category ? `Business category: ${input.category}.` : "",
    input.city ? `City: ${input.city}.` : "",
    `Post type: ${input.type}. ${TYPE_GUIDANCE[input.type]}`,
    input.topic ? `The post should be about: ${input.topic}.` : "",
    input.aiContext ? `Business brief: ${input.aiContext}` : "",
    highlights.length ? `Strengths worth referencing: ${highlights.join(", ")}.` : "",
    `Tone: ${input.tone?.trim() || "warm and professional"}.`,
    "",
    "Rules:",
    "- Write as the business owner addressing customers directly.",
    `- Body must be under ${MAX_BODY} characters, ideally 2-4 short sentences.`,
    "- No hashtags, no markdown, no placeholders or brackets.",
    "- Never invent specific facts (prices, dates, discounts, awards) unless given in the topic.",
    "- At most one tasteful emoji.",
    "",
    "Return a JSON object with exactly these keys:",
    '  "title": a short headline (max 60 chars) or null if not useful,',
    '  "body": the post text,',
    `  "ctaType": one of ${Object.values(PostCtaType).join(", ")} — pick the most fitting call to action.`,
  ]
    .filter(Boolean)
    .join("\n");

  const result = await geminiService.generateJson<{
    title?: string | null;
    body?: string;
    ctaType?: string;
  }>(prompt, {
    systemInstruction:
      "You write concise, authentic Google Business Profile posts for local businesses. Never fabricate specific facts.",
    temperature: 0.85,
    maxOutputTokens: 600,
  });

  const body = (result.body ?? "").trim();
  if (!body) return null;

  const ctaCandidate = (result.ctaType ?? "").toUpperCase();
  const ctaType = (Object.values(PostCtaType) as string[]).includes(ctaCandidate)
    ? (ctaCandidate as PostCtaType)
    : DEFAULT_CTA[input.type];

  return {
    title: result.title?.trim() ? result.title.trim().slice(0, 300) : null,
    body: body.slice(0, MAX_BODY),
    ctaType,
    source: "ai",
  };
}

/** Offline fallback so the composer still works without Gemini. */
function templatePost(input: PostGeneratorInput): Omit<GeneratedPost, "source"> {
  const name = input.businessName;
  const topic = input.topic?.trim();
  const where = input.city ? ` in ${input.city}` : "";

  const bodies: Record<PostType, string> = {
    STANDARD: topic
      ? `${topic} — here's the latest from ${name}. Drop by${where} and see for yourself. We'd love to welcome you.`
      : `There's something new at ${name}${where}. Come see what we've been working on — we'd love to welcome you.`,
    EVENT: topic
      ? `Join us at ${name} for ${topic}. Save the date and bring a friend — everyone's welcome.`
      : `We're hosting an event at ${name}${where}. Save the date and bring a friend — everyone's welcome.`,
    OFFER: topic
      ? `Limited-time offer at ${name}: ${topic}. Mention this post in store to redeem.`
      : `We have a limited-time offer running at ${name}${where}. Mention this post in store to redeem.`,
    ALERT: topic
      ? `Please note: ${topic}. Thanks for your understanding — the team at ${name}.`
      : `An important update from ${name}${where}. Please check with us before your visit. Thanks for your understanding.`,
  };

  const titles: Record<PostType, string | null> = {
    STANDARD: "What's new",
    EVENT: "You're invited",
    OFFER: "Limited-time offer",
    ALERT: "Important update",
  };

  return {
    title: titles[input.type],
    body: bodies[input.type].slice(0, MAX_BODY),
    ctaType: DEFAULT_CTA[input.type],
  };
}
