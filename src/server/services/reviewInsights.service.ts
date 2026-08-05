/**
 * AI Review Insights.
 *
 * Two-stage design:
 *   1. Deterministic aggregation in SQL/JS — sentiment mix, rating mix,
 *      recurring themes (from Review.sentimentKeywords), trend vs the
 *      previous period, and the most telling recent quotes.
 *   2. A single AI pass that turns those facts into a narrative: summary,
 *      strengths, pain points, and prioritized recommended actions.
 *
 * Stage 1 always works, so the report degrades to a useful (if plainer)
 * heuristic version when Gemini is unavailable. Reports are cached in
 * AiInsight and only regenerated on request.
 */

import { AiInsightKind, Prisma, SentimentType } from "@prisma/client";
import { geminiService } from "@/server/services/ai/gemini.service";
import { prisma } from "@/server/db/prisma";
import { logger } from "@/server/utils/logger";

// ---------- report shape ----------

export interface ThemeStat {
  theme: string;
  count: number;
  /** Average star rating of reviews mentioning this theme. */
  averageRating: number;
  /** Leaning derived from the ratings of mentioning reviews. */
  polarity: "positive" | "negative" | "mixed";
}

export interface InsightAction {
  title: string;
  detail: string;
  priority: "high" | "medium" | "low";
  /** Themes/metrics this action responds to. */
  basis?: string[];
}

export interface ReviewInsightsPayload {
  /** Facts — always computed, never AI-invented. */
  metrics: {
    totalReviews: number;
    analyzedReviews: number;
    averageRating: number;
    ratingDistribution: Array<{ star: number; count: number }>;
    sentimentMix: Array<{ sentiment: string; count: number }>;
    /** Change vs the immediately preceding window of equal length. */
    trend: {
      currentCount: number;
      previousCount: number;
      countChangePct: number;
      currentAvgRating: number;
      previousAvgRating: number;
      ratingChange: number;
    };
    replyRate: number;
    unrepliedNegative: number;
  };
  topPraise: ThemeStat[];
  topComplaints: ThemeStat[];
  /** Short verbatim excerpts that illustrate the themes. */
  quotes: Array<{
    excerpt: string;
    starRating: number;
    sentiment: string | null;
    createdAt: string;
  }>;
  /** AI narrative (or heuristic fallback). */
  summary: string;
  strengths: string[];
  painPoints: string[];
  actions: InsightAction[];
}

const STOP_THEMES = new Set([
  "good", "great", "nice", "best", "well", "okay", "fine", "bad", "poor",
  "place", "thing", "time", "people", "service", "staff", "experience",
]);

// ---------- aggregation ----------

function polarityFor(avgRating: number): ThemeStat["polarity"] {
  if (avgRating >= 4) return "positive";
  if (avgRating <= 2.5) return "negative";
  return "mixed";
}

/**
 * Roll up Review.sentimentKeywords into ranked themes with the average
 * rating of the reviews that mention each one.
 */
function buildThemes(
  rows: Array<{ starRating: number; sentimentKeywords: unknown }>,
): ThemeStat[] {
  const acc = new Map<string, { count: number; ratingSum: number }>();

  for (const row of rows) {
    const kws = Array.isArray(row.sentimentKeywords)
      ? row.sentimentKeywords.filter(
          (k): k is string => typeof k === "string" && k.trim().length > 1,
        )
      : [];
    // De-dupe within a single review so one verbose review can't dominate.
    const unique = new Set(kws.map((k) => k.trim().toLowerCase()));
    for (const theme of unique) {
      if (STOP_THEMES.has(theme)) continue;
      const cur = acc.get(theme) ?? { count: 0, ratingSum: 0 };
      cur.count += 1;
      cur.ratingSum += row.starRating;
      acc.set(theme, cur);
    }
  }

  return [...acc.entries()]
    .map(([theme, v]) => {
      const averageRating = Number((v.ratingSum / v.count).toFixed(2));
      return {
        theme,
        count: v.count,
        averageRating,
        polarity: polarityFor(averageRating),
      };
    })
    // Require at least 2 mentions so one-off words don't surface as themes.
    .filter((t) => t.count >= 2)
    .sort((a, b) => b.count - a.count);
}

function pct(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Number((((current - previous) / previous) * 100).toFixed(1));
}

/** Compute the factual half of the report. */
async function computeMetrics(
  tenantId: string,
  periodDays: number,
  locationId?: string | null,
) {
  const now = Date.now();
  const currentFrom = new Date(now - periodDays * 86_400_000);
  const previousFrom = new Date(now - 2 * periodDays * 86_400_000);
  const locFilter = locationId ? { locationId } : {};
  const base = { tenantId, ...locFilter };

  const [
    totalReviews,
    analyzedReviews,
    avgAgg,
    distribution,
    sentimentMix,
    currentAgg,
    previousAgg,
    repliedCount,
    unrepliedNegative,
    keywordRows,
    quoteRows,
  ] = await Promise.all([
    prisma.review.count({ where: base }),
    prisma.review.count({ where: { ...base, sentiment: { not: null } } }),
    prisma.review.aggregate({ where: base, _avg: { starRating: true } }),
    prisma.review.groupBy({
      by: ["starRating"],
      where: base,
      _count: { _all: true },
    }),
    prisma.review.groupBy({
      by: ["sentiment"],
      where: base,
      _count: { _all: true },
    }),
    prisma.review.aggregate({
      where: { ...base, reviewCreatedAt: { gte: currentFrom } },
      _avg: { starRating: true },
      _count: { _all: true },
    }),
    prisma.review.aggregate({
      where: {
        ...base,
        reviewCreatedAt: { gte: previousFrom, lt: currentFrom },
      },
      _avg: { starRating: true },
      _count: { _all: true },
    }),
    prisma.review.count({
      where: { ...base, replies: { some: { deletedAt: null } } },
    }),
    prisma.review.count({
      where: {
        ...base,
        starRating: { lte: 3 },
        replies: { none: { deletedAt: null } },
        isArchived: false,
      },
    }),
    // Themes come from analyzed reviews only.
    prisma.review.findMany({
      where: { ...base, sentiment: { not: null } },
      select: { starRating: true, sentimentKeywords: true },
      take: 1000,
      orderBy: { reviewCreatedAt: "desc" },
    }),
    // A handful of recent substantive comments to ground the narrative.
    prisma.review.findMany({
      where: { ...base, comment: { not: null } },
      select: {
        comment: true,
        starRating: true,
        sentiment: true,
        reviewCreatedAt: true,
      },
      take: 40,
      orderBy: { reviewCreatedAt: "desc" },
    }),
  ]);

  const themes = buildThemes(keywordRows);

  const metrics: ReviewInsightsPayload["metrics"] = {
    totalReviews,
    analyzedReviews,
    averageRating: avgAgg._avg.starRating
      ? Number(avgAgg._avg.starRating.toFixed(2))
      : 0,
    ratingDistribution: [1, 2, 3, 4, 5].map((star) => ({
      star,
      count: distribution.find((d) => d.starRating === star)?._count._all ?? 0,
    })),
    sentimentMix: sentimentMix.map((s) => ({
      sentiment: s.sentiment ?? "UNANALYZED",
      count: s._count._all,
    })),
    trend: {
      currentCount: currentAgg._count._all,
      previousCount: previousAgg._count._all,
      countChangePct: pct(currentAgg._count._all, previousAgg._count._all),
      currentAvgRating: currentAgg._avg.starRating
        ? Number(currentAgg._avg.starRating.toFixed(2))
        : 0,
      previousAvgRating: previousAgg._avg.starRating
        ? Number(previousAgg._avg.starRating.toFixed(2))
        : 0,
      ratingChange: Number(
        (
          (currentAgg._avg.starRating ?? 0) - (previousAgg._avg.starRating ?? 0)
        ).toFixed(2),
      ),
    },
    replyRate:
      totalReviews > 0
        ? Number(((repliedCount / totalReviews) * 100).toFixed(1))
        : 0,
    unrepliedNegative,
  };

  const quotes = quoteRows
    .filter((q) => (q.comment ?? "").trim().length > 20)
    .slice(0, 12)
    .map((q) => ({
      excerpt: (q.comment ?? "").trim().slice(0, 240),
      starRating: q.starRating,
      sentiment: q.sentiment,
      createdAt: q.reviewCreatedAt.toISOString(),
    }));

  return {
    metrics,
    themes,
    quotes,
    topPraise: themes.filter((t) => t.polarity === "positive").slice(0, 8),
    topComplaints: themes.filter((t) => t.polarity === "negative").slice(0, 8),
  };
}

// ---------- narrative ----------

function heuristicNarrative(
  facts: Awaited<ReturnType<typeof computeMetrics>>,
): Pick<ReviewInsightsPayload, "summary" | "strengths" | "painPoints" | "actions"> {
  const m = facts.metrics;
  const dir =
    m.trend.ratingChange > 0.1
      ? "improving"
      : m.trend.ratingChange < -0.1
        ? "slipping"
        : "holding steady";

  const summary =
    `Across ${m.totalReviews} review${m.totalReviews === 1 ? "" : "s"}, the average rating is ` +
    `${m.averageRating.toFixed(2)}/5 and is ${dir} versus the previous period ` +
    `(${m.trend.previousAvgRating.toFixed(2)} → ${m.trend.currentAvgRating.toFixed(2)}). ` +
    `${m.replyRate.toFixed(0)}% of reviews have a reply` +
    (m.unrepliedNegative > 0
      ? `, and ${m.unrepliedNegative} negative review${m.unrepliedNegative === 1 ? "" : "s"} still need a response.`
      : ".");

  const actions: InsightAction[] = [];
  if (m.unrepliedNegative > 0) {
    actions.push({
      title: `Reply to ${m.unrepliedNegative} unanswered negative review${m.unrepliedNegative === 1 ? "" : "s"}`,
      detail:
        "Responding to criticism publicly is the single highest-impact reputation action. Use the AI draft button to move quickly.",
      priority: "high",
      basis: ["unreplied negative reviews"],
    });
  }
  if (m.replyRate < 80) {
    actions.push({
      title: "Raise your reply rate",
      detail: `You're replying to ${m.replyRate.toFixed(0)}% of reviews. Aim for 90%+ — it signals attentiveness to both customers and Google.`,
      priority: m.replyRate < 50 ? "high" : "medium",
      basis: ["reply rate"],
    });
  }
  for (const c of facts.topComplaints.slice(0, 3)) {
    actions.push({
      title: `Address recurring complaint: ${c.theme}`,
      detail: `Mentioned in ${c.count} reviews averaging ${c.averageRating.toFixed(1)}★. Worth investigating operationally.`,
      priority: c.count >= 5 ? "high" : "medium",
      basis: [c.theme],
    });
  }
  if (m.analyzedReviews < m.totalReviews) {
    actions.push({
      title: "Analyze remaining reviews",
      detail: `${m.totalReviews - m.analyzedReviews} reviews have no sentiment yet. Run "Analyze sentiment" to sharpen these insights.`,
      priority: "low",
      basis: ["unanalyzed reviews"],
    });
  }

  return {
    summary,
    strengths: facts.topPraise.slice(0, 5).map(
      (t) => `${t.theme} — praised in ${t.count} reviews (${t.averageRating.toFixed(1)}★ avg)`,
    ),
    painPoints: facts.topComplaints.slice(0, 5).map(
      (t) => `${t.theme} — raised in ${t.count} reviews (${t.averageRating.toFixed(1)}★ avg)`,
    ),
    actions,
  };
}

async function aiNarrative(
  facts: Awaited<ReturnType<typeof computeMetrics>>,
  businessName: string,
): Promise<Pick<
  ReviewInsightsPayload,
  "summary" | "strengths" | "painPoints" | "actions"
> | null> {
  const m = facts.metrics;

  const prompt = [
    `You are a reputation analyst reviewing customer feedback for "${businessName}".`,
    "Below are PRE-COMPUTED facts. Treat them as ground truth and do not contradict or recalculate them.",
    "",
    "METRICS:",
    `- Total reviews: ${m.totalReviews} (${m.analyzedReviews} sentiment-analyzed)`,
    `- Average rating: ${m.averageRating}/5`,
    `- Rating spread: ${m.ratingDistribution.map((d) => `${d.star}★=${d.count}`).join(", ")}`,
    `- Sentiment mix: ${m.sentimentMix.map((s) => `${s.sentiment}=${s.count}`).join(", ")}`,
    `- This period vs previous: ${m.trend.currentCount} vs ${m.trend.previousCount} reviews (${m.trend.countChangePct}%), avg ${m.trend.currentAvgRating} vs ${m.trend.previousAvgRating}`,
    `- Reply rate: ${m.replyRate}%`,
    `- Unanswered negative reviews: ${m.unrepliedNegative}`,
    "",
    facts.topPraise.length
      ? `PRAISED THEMES: ${facts.topPraise.map((t) => `${t.theme} (${t.count} mentions, ${t.averageRating}★)`).join("; ")}`
      : "PRAISED THEMES: none identified yet.",
    facts.topComplaints.length
      ? `CRITICIZED THEMES: ${facts.topComplaints.map((t) => `${t.theme} (${t.count} mentions, ${t.averageRating}★)`).join("; ")}`
      : "CRITICIZED THEMES: none identified yet.",
    "",
    facts.quotes.length
      ? "SAMPLE REVIEWS:\n" +
        facts.quotes
          .map((q) => `- [${q.starRating}★] ${q.excerpt}`)
          .join("\n")
      : "",
    "",
    "Return a JSON object with exactly these keys:",
    '  "summary": 3-4 sentences on the state of this business\'s reputation, citing the real numbers above,',
    '  "strengths": array of 3-5 specific strengths grounded in the praised themes/quotes,',
    '  "painPoints": array of 2-5 specific problems grounded in the criticized themes/quotes,',
    '  "actions": array of 3-6 objects { "title", "detail", "priority" ("high"|"medium"|"low"), "basis" (array of themes/metrics it responds to) },',
    "",
    "Rules: be concrete and operational, not generic advice. Prioritize by likely reputation impact.",
    "Never invent numbers, themes, or quotes beyond what is given. If evidence is thin, say so plainly.",
  ]
    .filter(Boolean)
    .join("\n");

  const result = await geminiService.generateJson<{
    summary?: string;
    strengths?: string[];
    painPoints?: string[];
    actions?: Array<{
      title?: string;
      detail?: string;
      priority?: string;
      basis?: string[];
    }>;
  }>(prompt, {
    systemInstruction:
      "You are a precise reputation analyst. You only reason from the supplied data and never fabricate statistics or customer quotes.",
    temperature: 0.4,
    maxOutputTokens: 1600,
  });

  if (!result.summary) return null;

  const strings = (v: unknown, cap: number): string[] =>
    Array.isArray(v)
      ? v
          .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
          .map((x) => x.trim())
          .slice(0, cap)
      : [];

  const actions: InsightAction[] = Array.isArray(result.actions)
    ? result.actions
        .filter((a) => a && typeof a.title === "string" && a.title.trim())
        .map((a): InsightAction => {
          const priority: InsightAction["priority"] =
            a.priority === "high"
              ? "high"
              : a.priority === "low"
                ? "low"
                : "medium";
          return {
            title: a.title!.trim(),
            detail: (a.detail ?? "").trim(),
            priority,
            basis: strings(a.basis, 5),
          };
        })
        .slice(0, 6)
    : [];

  return {
    summary: result.summary.trim(),
    strengths: strings(result.strengths, 5),
    painPoints: strings(result.painPoints, 5),
    actions,
  };
}

// ---------- public API ----------

export const reviewInsightsService = {
  /**
   * Return the cached report, or null when none exists.
   *
   * Uses findFirst rather than findUnique because `locationId` is
   * nullable and Prisma's compound-unique input rejects nulls.
   */
  async getCached(
    tenantId: string,
    periodDays: number,
    locationId?: string | null,
  ) {
    return prisma.aiInsight.findFirst({
      where: {
        tenantId,
        kind: AiInsightKind.REVIEW_INSIGHTS,
        locationId: locationId ?? null,
        periodDays,
      },
      // MySQL treats NULLs as distinct in unique indexes, so the
      // workspace-wide row (locationId = NULL) isn't truly deduped by the
      // constraint. Always read the newest so a rare concurrent insert
      // can't surface a stale report.
      orderBy: { generatedAt: "desc" },
    });
  },

  /**
   * Compute a fresh report and cache it.
   */
  async generate(
    tenantId: string,
    userId: string,
    periodDays: number,
    locationId?: string | null,
  ) {
    const facts = await computeMetrics(tenantId, periodDays, locationId);

    let narrative: Awaited<ReturnType<typeof aiNarrative>> = null;
    let source: "ai" | "heuristic" = "heuristic";

    // Only bother the model when there's something to reason about.
    if (geminiService.isEnabled() && facts.metrics.totalReviews > 0) {
      try {
        const businessName = await resolveBusinessName(tenantId, locationId);
        narrative = await aiNarrative(facts, businessName);
        if (narrative) source = "ai";
      } catch (err) {
        logger.warn("Review insights AI narrative failed — using heuristic", {
          err: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const finalNarrative = narrative ?? heuristicNarrative(facts);

    const payload: ReviewInsightsPayload = {
      metrics: facts.metrics,
      topPraise: facts.topPraise,
      topComplaints: facts.topComplaints,
      quotes: facts.quotes.slice(0, 6),
      ...finalNarrative,
    };

    // Nullable locationId keeps us off findUnique/upsert, so do an
    // explicit find-then-write against the cache row.
    const existing = await reviewInsightsService.getCached(
      tenantId,
      periodDays,
      locationId,
    );

    const data = {
      payload: payload as unknown as Prisma.InputJsonValue,
      source,
      sampleSize: facts.metrics.totalReviews,
      generatedById: userId,
      generatedAt: new Date(),
    };

    if (existing) {
      return prisma.aiInsight.update({ where: { id: existing.id }, data });
    }

    return prisma.aiInsight.create({
      data: {
        tenantId,
        kind: AiInsightKind.REVIEW_INSIGHTS,
        locationId: locationId ?? null,
        periodDays,
        ...data,
      },
    });
  },
};

async function resolveBusinessName(
  tenantId: string,
  locationId?: string | null,
): Promise<string> {
  if (locationId) {
    const loc = await prisma.location.findFirst({
      where: { id: locationId, tenantId },
      select: { name: true },
    });
    if (loc) return loc.name;
  }
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { name: true },
  });
  return tenant?.name ?? "this business";
}

/** Re-exported for callers that want the enum without importing Prisma. */
export { SentimentType };
