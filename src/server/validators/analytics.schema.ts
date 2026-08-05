/**
 * Zod schemas + helpers for the Analytics module.
 */

import { z } from "zod";

export const analyticsQuerySchema = z.object({
  // Rolling window in days. 7 | 30 | 90 | 365.
  period: z.coerce.number().int().refine((n) => [7, 30, 90, 365].includes(n), {
    message: "period must be 7, 30, 90, or 365",
  }).default(30),
  locationId: z.string().cuid().optional(),
});
export type AnalyticsQuery = z.infer<typeof analyticsQuerySchema>;

export interface DateRange {
  from: Date;
  to: Date;
  /** Previous window of equal length, for growth comparisons. */
  prevFrom: Date;
  prevTo: Date;
  days: number;
  /** Grouping granularity for time series. */
  grain: "day" | "week" | "month";
}

export function resolveRange(periodDays: number): DateRange {
  const to = new Date();
  const from = new Date(to.getTime() - periodDays * 24 * 60 * 60 * 1000);
  const prevTo = from;
  const prevFrom = new Date(from.getTime() - periodDays * 24 * 60 * 60 * 1000);
  const grain: DateRange["grain"] =
    periodDays <= 31 ? "day" : periodDays <= 120 ? "week" : "month";
  return { from, to, prevFrom, prevTo, days: periodDays, grain };
}

export function pctChange(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}
