/**
 * Sentiment analysis for reviews.
 *
 * Populates Review.sentiment / sentimentScore / sentimentKeywords.
 * Uses Gemini for nuanced classification (it can spot a 5-star rating
 * with a complaint buried in the text) and falls back to a rating-based
 * heuristic when AI is unavailable, so the fields are never left empty.
 */

import { SentimentType } from "@prisma/client";
import { geminiService } from "@/server/services/ai/gemini.service";
import { prisma } from "@/server/db/prisma";
import { logger } from "@/server/utils/logger";

export interface SentimentResult {
  sentiment: SentimentType;
  /** -1.0 (very negative) .. 1.0 (very positive) */
  score: number;
  keywords: string[];
  source: "ai" | "heuristic";
}

/** Rating-only fallback — coarse but always available. */
export function heuristicSentiment(
  starRating: number,
  comment?: string | null,
): SentimentResult {
  const score =
    starRating >= 5 ? 0.9 : starRating === 4 ? 0.5 : starRating === 3 ? 0 : starRating === 2 ? -0.5 : -0.9;
  const sentiment =
    starRating >= 4
      ? SentimentType.POSITIVE
      : starRating === 3
        ? SentimentType.NEUTRAL
        : SentimentType.NEGATIVE;

  // Cheap keyword extraction: longest meaningful words, deduped.
  const stop = new Set([
    "the", "and", "was", "were", "this", "that", "with", "very", "have",
    "they", "there", "here", "from", "just", "your", "you", "for", "not",
    "but", "all", "our", "their", "would", "could", "really", "about",
  ]);
  const keywords = comment
    ? [
        ...new Set(
          comment
            .toLowerCase()
            .replace(/[^\p{L}\s]/gu, " ")
            .split(/\s+/)
            .filter((w) => w.length > 3 && !stop.has(w)),
        ),
      ].slice(0, 6)
    : [];

  return { sentiment, score, keywords, source: "heuristic" };
}

/**
 * Analyze one review. Returns a result even on AI failure.
 */
export async function analyzeSentiment(
  starRating: number,
  comment?: string | null,
): Promise<SentimentResult> {
  // No text to analyze — rating is all we have.
  if (!comment || comment.trim().length < 3) {
    return heuristicSentiment(starRating, comment);
  }

  if (geminiService.isEnabled()) {
    try {
      const ai = await withGemini(starRating, comment);
      if (ai) return ai;
    } catch (err) {
      logger.warn("Gemini sentiment analysis failed — using heuristic", {
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return heuristicSentiment(starRating, comment);
}

async function withGemini(
  starRating: number,
  comment: string,
): Promise<SentimentResult | null> {
  const prompt = [
    "Analyze the sentiment of this customer review.",
    `Star rating given: ${starRating}/5.`,
    `Review text: """${comment.slice(0, 4000)}"""`,
    "",
    "Judge sentiment from the TEXT primarily — a high rating can still contain",
    "complaints, and a low rating can contain praise. Use MIXED when the review",
    "contains both clear praise and clear criticism.",
    "",
    "Return a JSON object with exactly these keys:",
    '  "sentiment": one of POSITIVE, NEUTRAL, NEGATIVE, MIXED,',
    '  "score": a number from -1 (very negative) to 1 (very positive),',
    '  "keywords": array of 3-6 short topic phrases actually mentioned (e.g. "wait time", "friendly staff").',
  ].join("\n");

  const result = await geminiService.generateJson<{
    sentiment?: string;
    score?: number;
    keywords?: string[];
  }>(prompt, { temperature: 0.2, maxOutputTokens: 300 });

  const raw = (result.sentiment ?? "").toUpperCase();
  if (!(Object.values(SentimentType) as string[]).includes(raw)) return null;

  const score =
    typeof result.score === "number" && Number.isFinite(result.score)
      ? Math.max(-1, Math.min(1, result.score))
      : heuristicSentiment(starRating, comment).score;

  const keywords = Array.isArray(result.keywords)
    ? result.keywords
        .filter((k): k is string => typeof k === "string" && k.trim().length > 0)
        .map((k) => k.trim().slice(0, 60))
        .slice(0, 6)
    : [];

  return {
    sentiment: raw as SentimentType,
    score,
    keywords,
    source: "ai",
  };
}

/**
 * Analyze a single review by id and persist the result.
 * Safe to call fire-and-forget — never throws.
 */
export async function analyzeAndSaveReview(reviewId: string): Promise<void> {
  try {
    const review = await prisma.review.findUnique({
      where: { id: reviewId },
      select: { id: true, starRating: true, comment: true },
    });
    if (!review) return;

    const result = await analyzeSentiment(review.starRating, review.comment);
    await prisma.review.update({
      where: { id: review.id },
      data: {
        sentiment: result.sentiment,
        sentimentScore: result.score,
        sentimentKeywords: result.keywords,
      },
    });
  } catch (err) {
    logger.warn("Sentiment persistence failed", {
      reviewId,
      err: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Backfill sentiment for a tenant's un-analyzed reviews.
 * Processed sequentially with a cap to stay within request timeouts and
 * avoid hammering the AI quota.
 */
export async function backfillSentiment(
  tenantId: string,
  limit = 25,
): Promise<{ analyzed: number; remaining: number }> {
  const pending = await prisma.review.findMany({
    where: { tenantId, sentiment: null },
    orderBy: { reviewCreatedAt: "desc" },
    take: limit,
    select: { id: true, starRating: true, comment: true },
  });

  let analyzed = 0;
  for (const r of pending) {
    try {
      const result = await analyzeSentiment(r.starRating, r.comment);
      await prisma.review.update({
        where: { id: r.id },
        data: {
          sentiment: result.sentiment,
          sentimentScore: result.score,
          sentimentKeywords: result.keywords,
        },
      });
      analyzed += 1;
    } catch (err) {
      logger.warn("Sentiment backfill item failed", {
        reviewId: r.id,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const remaining = await prisma.review.count({
    where: { tenantId, sentiment: null },
  });

  return { analyzed, remaining };
}
