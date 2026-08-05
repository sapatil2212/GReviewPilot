/**
 * Analytics service.
 *
 * Read-only aggregation across reviews, funnel events, QR scans,
 * locations, and team. All queries are tenant-scoped. Time series use
 * MySQL date grouping via $queryRaw; distributions use Prisma groupBy.
 *
 * Everything is batched with Promise.all so a dashboard load is one
 * round of parallel queries.
 */

import { ReviewStatus, UserStatus } from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import {
  pctChange,
  resolveRange,
  type DateRange,
} from "@/server/validators/analytics.schema";
import type { AuthContext } from "@/server/auth/requireSession";

// MySQL date-format token per grain (for time-series bucket labels).
function grainExpr(grain: DateRange["grain"], col: string): string {
  switch (grain) {
    case "day":
      return `DATE(${col})`;
    case "week":
      return `DATE(DATE_SUB(${col}, INTERVAL WEEKDAY(${col}) DAY))`;
    case "month":
      return `DATE_FORMAT(${col}, '%Y-%m-01')`;
  }
}

export const analyticsService = {
  // ============================================================
  // OVERVIEW — dashboard KPIs
  // ============================================================
  async overview(ctx: AuthContext, periodDays: number) {
    const r = resolveRange(periodDays);
    const tenantId = ctx.tenantId;

    const [
      totalReviews,
      avgAgg,
      pending,
      replied,
      reviewsThisPeriod,
      reviewsPrevPeriod,
      activeLocations,
      activeMembers,
      funnelViews,
      funnelRedirects,
      qrAgg,
      newFeedback,
    ] = await Promise.all([
      prisma.review.count({ where: { tenantId } }),
      prisma.review.aggregate({ where: { tenantId }, _avg: { starRating: true } }),
      prisma.review.count({ where: { tenantId, status: ReviewStatus.NEW } }),
      prisma.review.count({ where: { tenantId, status: ReviewStatus.REPLIED } }),
      prisma.review.count({
        where: { tenantId, reviewCreatedAt: { gte: r.from, lte: r.to } },
      }),
      prisma.review.count({
        where: {
          tenantId,
          reviewCreatedAt: { gte: r.prevFrom, lt: r.prevTo },
        },
      }),
      prisma.location.count({
        where: { tenantId, status: "ACTIVE", deletedAt: null },
      }),
      prisma.user.count({ where: { tenantId, status: UserStatus.ACTIVE } }),
      prisma.reviewFunnelEvent.count({
        where: { tenantId, step: "PAGE_VIEW", createdAt: { gte: r.from, lte: r.to } },
      }),
      prisma.reviewFunnelEvent.count({
        where: {
          tenantId,
          step: "REDIRECTED_TO_GOOGLE",
          createdAt: { gte: r.from, lte: r.to },
        },
      }),
      prisma.qrCode.aggregate({
        where: { tenantId },
        _sum: { scanCount: true },
      }),
      prisma.privateFeedback.count({ where: { tenantId, status: "NEW" } }),
    ]);

    const replyRate =
      totalReviews > 0 ? Math.round((replied / totalReviews) * 100) : 0;
    const funnelConversion =
      funnelViews > 0 ? Math.round((funnelRedirects / funnelViews) * 100) : 0;

    return {
      totalReviews,
      averageRating: avgAgg._avg.starRating
        ? Number(avgAgg._avg.starRating.toFixed(2))
        : 0,
      pendingReplies: pending,
      repliedReviews: replied,
      replyRate,
      reviewGrowth: {
        current: reviewsThisPeriod,
        previous: reviewsPrevPeriod,
        pct: pctChange(reviewsThisPeriod, reviewsPrevPeriod),
      },
      activeLocations,
      activeMembers,
      funnel: {
        views: funnelViews,
        redirects: funnelRedirects,
        conversionPct: funnelConversion,
      },
      qrScans: qrAgg._sum.scanCount ?? 0,
      newPrivateFeedback: newFeedback,
      periodDays,
    };
  },

  // ============================================================
  // REVIEW ANALYTICS
  // ============================================================
  async reviews(ctx: AuthContext, periodDays: number, locationId?: string) {
    const r = resolveRange(periodDays);
    const tenantId = ctx.tenantId;
    const locFilter = locationId ? { locationId } : {};

    const [distribution, sentiment, byLocation, series] = await Promise.all([
      prisma.review.groupBy({
        by: ["starRating"],
        where: { tenantId, ...locFilter },
        _count: { _all: true },
      }),
      prisma.review.groupBy({
        by: ["sentiment"],
        where: { tenantId, ...locFilter },
        _count: { _all: true },
      }),
      prisma.review.groupBy({
        by: ["locationId"],
        where: { tenantId },
        _count: { _all: true },
        _avg: { starRating: true },
      }),
      this.reviewTimeSeries(tenantId, r, locationId),
    ]);

    // Hydrate location names.
    const locIds = byLocation
      .map((b) => b.locationId)
      .filter((x): x is string => !!x);
    const locations = locIds.length
      ? await prisma.location.findMany({
          where: { id: { in: locIds } },
          select: { id: true, name: true, city: true },
        })
      : [];
    const locMap = new Map(locations.map((l) => [l.id, l]));

    const dist = [1, 2, 3, 4, 5].map((star) => ({
      star,
      count: distribution.find((d) => d.starRating === star)?._count._all ?? 0,
    }));

    return {
      distribution: dist,
      sentiment: sentiment.map((s) => ({
        sentiment: s.sentiment ?? "UNANALYZED",
        count: s._count._all,
      })),
      byLocation: byLocation
        .filter((b) => b.locationId)
        .map((b) => ({
          locationId: b.locationId!,
          name: locMap.get(b.locationId!)?.name ?? "Unknown",
          city: locMap.get(b.locationId!)?.city ?? "",
          count: b._count._all,
          averageRating: b._avg.starRating
            ? Number(b._avg.starRating.toFixed(2))
            : 0,
        }))
        .sort((a, b) => b.count - a.count),
      series,
    };
  },

  async reviewTimeSeries(tenantId: string, r: DateRange, locationId?: string) {
    const bucket = grainExpr(r.grain, "reviewCreatedAt");
    const rows = locationId
      ? await prisma.$queryRawUnsafe<Array<{ bucket: Date; count: bigint; avg: number }>>(
          `SELECT ${bucket} AS bucket, COUNT(*) AS count, AVG(starRating) AS avg
           FROM Review
           WHERE tenantId = ? AND locationId = ? AND reviewCreatedAt >= ? AND reviewCreatedAt <= ?
           GROUP BY bucket ORDER BY bucket ASC`,
          tenantId,
          locationId,
          r.from,
          r.to,
        )
      : await prisma.$queryRawUnsafe<Array<{ bucket: Date; count: bigint; avg: number }>>(
          `SELECT ${bucket} AS bucket, COUNT(*) AS count, AVG(starRating) AS avg
           FROM Review
           WHERE tenantId = ? AND reviewCreatedAt >= ? AND reviewCreatedAt <= ?
           GROUP BY bucket ORDER BY bucket ASC`,
          tenantId,
          r.from,
          r.to,
        );
    return rows.map((row) => ({
      bucket: toISODate(row.bucket),
      count: Number(row.count),
      averageRating: row.avg ? Number(Number(row.avg).toFixed(2)) : 0,
    }));
  },

  // ============================================================
  // FUNNEL ANALYTICS
  // ============================================================
  async funnel(ctx: AuthContext, periodDays: number, locationId?: string) {
    const r = resolveRange(periodDays);
    const tenantId = ctx.tenantId;
    const locFilter = locationId ? { locationId } : {};

    const [steps, ratingSel, series, feedbackCount] = await Promise.all([
      prisma.reviewFunnelEvent.groupBy({
        by: ["step"],
        where: { tenantId, ...locFilter, createdAt: { gte: r.from, lte: r.to } },
        _count: { _all: true },
      }),
      prisma.reviewFunnelEvent.groupBy({
        by: ["starRating"],
        where: {
          tenantId,
          ...locFilter,
          step: "STAR_SELECTED",
          createdAt: { gte: r.from, lte: r.to },
        },
        _count: { _all: true },
      }),
      this.funnelTimeSeries(tenantId, r, locationId),
      prisma.privateFeedback.count({
        where: { tenantId, ...locFilter, createdAt: { gte: r.from, lte: r.to } },
      }),
    ]);

    const stepMap: Record<string, number> = {};
    for (const s of steps) stepMap[s.step] = s._count._all;

    const views = stepMap.PAGE_VIEW ?? 0;
    const starSel = stepMap.STAR_SELECTED ?? 0;
    const generated = stepMap.REVIEW_GENERATED ?? 0;
    const copied = stepMap.REVIEW_COPIED ?? 0;
    const redirected = stepMap.REDIRECTED_TO_GOOGLE ?? 0;

    return {
      steps: [
        { step: "Page views", value: views },
        { step: "Rated", value: starSel },
        { step: "Review generated", value: generated },
        { step: "Copied", value: copied },
        { step: "Sent to Google", value: redirected },
      ],
      conversionPct: views > 0 ? Math.round((redirected / views) * 100) : 0,
      privateFeedback: feedbackCount,
      ratingSelections: [1, 2, 3, 4, 5].map((star) => ({
        star,
        count: ratingSel.find((s) => s.starRating === star)?._count._all ?? 0,
      })),
      series,
    };
  },

  async funnelTimeSeries(tenantId: string, r: DateRange, locationId?: string) {
    const bucket = grainExpr(r.grain, "createdAt");
    const rows = locationId
      ? await prisma.$queryRawUnsafe<
          Array<{ bucket: Date; views: bigint; redirects: bigint }>
        >(
          `SELECT ${bucket} AS bucket,
             SUM(step = 'PAGE_VIEW') AS views,
             SUM(step = 'REDIRECTED_TO_GOOGLE') AS redirects
           FROM ReviewFunnelEvent
           WHERE tenantId = ? AND locationId = ? AND createdAt >= ? AND createdAt <= ?
           GROUP BY bucket ORDER BY bucket ASC`,
          tenantId,
          locationId,
          r.from,
          r.to,
        )
      : await prisma.$queryRawUnsafe<
          Array<{ bucket: Date; views: bigint; redirects: bigint }>
        >(
          `SELECT ${bucket} AS bucket,
             SUM(step = 'PAGE_VIEW') AS views,
             SUM(step = 'REDIRECTED_TO_GOOGLE') AS redirects
           FROM ReviewFunnelEvent
           WHERE tenantId = ? AND createdAt >= ? AND createdAt <= ?
           GROUP BY bucket ORDER BY bucket ASC`,
          tenantId,
          r.from,
          r.to,
        );
    return rows.map((row) => ({
      bucket: toISODate(row.bucket),
      views: Number(row.views),
      redirects: Number(row.redirects),
    }));
  },

  // ============================================================
  // QR ANALYTICS
  // ============================================================
  async qr(ctx: AuthContext, periodDays: number) {
    const r = resolveRange(periodDays);
    const tenantId = ctx.tenantId;

    const [byType, topCodes, series, totals] = await Promise.all([
      prisma.qrCode.groupBy({
        by: ["type"],
        where: { tenantId },
        _sum: { scanCount: true },
        _count: { _all: true },
      }),
      prisma.qrCode.findMany({
        where: { tenantId },
        orderBy: { scanCount: "desc" },
        take: 5,
        select: { id: true, label: true, type: true, scanCount: true, uniqueScanCount: true },
      }),
      this.qrTimeSeries(tenantId, r),
      prisma.qrScan.count({
        where: { tenantId, createdAt: { gte: r.from, lte: r.to } },
      }),
    ]);

    return {
      byType: byType.map((t) => ({
        type: t.type,
        codes: t._count._all,
        scans: t._sum.scanCount ?? 0,
      })),
      topCodes,
      scansThisPeriod: totals,
      series,
    };
  },

  async qrTimeSeries(tenantId: string, r: DateRange) {
    const bucket = grainExpr(r.grain, "createdAt");
    const rows = await prisma.$queryRawUnsafe<
      Array<{ bucket: Date; scans: bigint; unique_scans: bigint }>
    >(
      `SELECT ${bucket} AS bucket, COUNT(*) AS scans, SUM(isUnique) AS unique_scans
       FROM QrScan
       WHERE tenantId = ? AND createdAt >= ? AND createdAt <= ?
       GROUP BY bucket ORDER BY bucket ASC`,
      tenantId,
      r.from,
      r.to,
    );
    return rows.map((row) => ({
      bucket: toISODate(row.bucket),
      scans: Number(row.scans),
      unique: Number(row.unique_scans),
    }));
  },
};

function toISODate(d: Date | string): string {
  if (typeof d === "string") return d.slice(0, 10);
  return d.toISOString().slice(0, 10);
}
