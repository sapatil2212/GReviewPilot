"use client";

/**
 * /dashboard/insights — AI Review Insights.
 *
 * Facts (sentiment mix, recurring themes, trend) are computed from the
 * database; the narrative and recommended actions come from an AI pass
 * over those facts. Reports are cached server-side, so this page shows
 * the last report until the user regenerates.
 */

import { useState } from "react";
import {
  Lightbulb,
  Loader2,
  MessageSquareQuote,
  RefreshCw,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  TrendingDown,
  TrendingUp,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmptyState } from "@/components/dashboard/empty-state";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { Field, Select } from "@/components/dashboard/field";
import { useApi } from "@/lib/api/useApi";
import {
  insightsApi,
  locationsApi,
  type InsightActionDto,
  type ThemeStatDto,
} from "@/lib/api";

const PERIODS = [
  { value: 30, label: "Last 30 days" },
  { value: 90, label: "Last 90 days" },
  { value: 365, label: "Last 12 months" },
];

export default function InsightsPage() {
  const [periodDays, setPeriodDays] = useState(90);
  const [locationId, setLocationId] = useState("");
  const [generating, setGenerating] = useState(false);

  const locations = useApi(
    () => locationsApi.list({ pageSize: 100, status: "ACTIVE", sortBy: "name" }),
    [],
  );

  const report = useApi(
    () =>
      insightsApi.get({
        periodDays,
        locationId: locationId || undefined,
      }),
    [periodDays, locationId],
  );

  async function generate() {
    setGenerating(true);
    try {
      await insightsApi.generate({
        periodDays,
        locationId: locationId || undefined,
      });
      await report.refresh();
      toast.success("Insights updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setGenerating(false);
    }
  }

  const r = report.data?.report ?? null;
  const p = r?.payload;

  return (
    <>
      <PageHeader
        title="AI Review Insights"
        description="What your customers keep praising, what keeps going wrong, and what to do about it — derived from your review data."
        breadcrumbs={[{ label: "AI Review Insights" }]}
        actions={
          <button
            onClick={generate}
            disabled={generating}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {generating ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Analyzing…
              </>
            ) : (
              <>
                <RefreshCw className="h-3.5 w-3.5" />
                {r ? "Regenerate" : "Generate insights"}
              </>
            )}
          </button>
        }
      />

      {/* Scope */}
      <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-3 sm:p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Period">
            <Select
              value={String(periodDays)}
              onChange={(e) => setPeriodDays(Number(e.target.value))}
            >
              {PERIODS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Location">
            <Select
              value={locationId}
              onChange={(e) => setLocationId(e.target.value)}
            >
              <option value="">All locations</option>
              {locations.data?.items.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name} · {l.city}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </div>

      {report.loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
          Loading insights…
        </div>
      ) : !r || !p ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <EmptyState
            icon={Sparkles}
            title="No insights for this scope yet"
            description="Generate a report to see recurring themes, sentiment trends, and prioritized actions based on your reviews."
            action={
              <button
                onClick={generate}
                disabled={generating}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {generating ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Analyzing…
                  </>
                ) : (
                  "Generate insights"
                )}
              </button>
            }
          />
        </div>
      ) : (
        <div className="space-y-4">
          {/* Provenance */}
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
            <span>
              Generated {new Date(r.generatedAt).toLocaleString()} from{" "}
              {r.sampleSize} review{r.sampleSize === 1 ? "" : "s"}
            </span>
            <span
              className={
                "rounded-full px-2 py-0.5 font-semibold " +
                (r.source === "ai"
                  ? "bg-blue-100 text-blue-700"
                  : "bg-slate-200 text-slate-600")
              }
            >
              {r.source === "ai" ? "AI narrative" : "Computed (AI unavailable)"}
            </span>
          </div>

          {/* KPIs */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard
              icon={MessageSquareQuote}
              label="Total reviews"
              value={p.metrics.totalReviews}
              sub={`${p.metrics.analyzedReviews} analyzed`}
              accent="blue"
            />
            <KpiCard
              icon={p.metrics.trend.ratingChange >= 0 ? TrendingUp : TrendingDown}
              label="Average rating"
              value={p.metrics.averageRating.toFixed(2)}
              sub={`${p.metrics.trend.previousAvgRating.toFixed(2)} → ${p.metrics.trend.currentAvgRating.toFixed(2)} this period`}
              accent={p.metrics.trend.ratingChange >= 0 ? "emerald" : "rose"}
            />
            <KpiCard
              icon={MessageSquareQuote}
              label="Reply rate"
              value={`${p.metrics.replyRate.toFixed(0)}%`}
              accent={p.metrics.replyRate >= 80 ? "emerald" : "amber"}
            />
            <KpiCard
              icon={TriangleAlert}
              label="Negative, unanswered"
              value={p.metrics.unrepliedNegative}
              sub={p.metrics.unrepliedNegative > 0 ? "Needs attention" : "All handled"}
              accent={p.metrics.unrepliedNegative > 0 ? "rose" : "emerald"}
            />
          </div>

          {/* Summary */}
          <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
            <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-900">
              <Sparkles className="h-4 w-4 text-blue-500" />
              Summary
            </h3>
            <p className="text-[13px] leading-relaxed text-slate-700">
              {p.summary}
            </p>
          </section>

          {/* Strengths / pain points */}
          <div className="grid gap-4 lg:grid-cols-2">
            <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
              <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-900">
                <ThumbsUp className="h-4 w-4 text-emerald-500" />
                What&apos;s working
              </h3>
              {p.strengths.length === 0 ? (
                <p className="text-xs text-slate-500">
                  Not enough positive signal yet.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {p.strengths.map((s, i) => (
                    <li
                      key={i}
                      className="flex gap-2 text-[12px] leading-snug text-slate-700"
                    >
                      <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />
                      {s}
                    </li>
                  ))}
                </ul>
              )}
              <ThemeList themes={p.topPraise} tone="positive" />
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
              <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-900">
                <ThumbsDown className="h-4 w-4 text-rose-500" />
                What needs work
              </h3>
              {p.painPoints.length === 0 ? (
                <p className="text-xs text-slate-500">
                  No recurring complaints detected.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {p.painPoints.map((s, i) => (
                    <li
                      key={i}
                      className="flex gap-2 text-[12px] leading-snug text-slate-700"
                    >
                      <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-rose-400" />
                      {s}
                    </li>
                  ))}
                </ul>
              )}
              <ThemeList themes={p.topComplaints} tone="negative" />
            </section>
          </div>

          {/* Actions */}
          <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
            <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-slate-900">
              <Lightbulb className="h-4 w-4 text-amber-500" />
              Recommended actions
            </h3>
            {p.actions.length === 0 ? (
              <p className="text-xs text-slate-500">
                Nothing urgent — keep doing what you&apos;re doing.
              </p>
            ) : (
              <ul className="space-y-2">
                {p.actions.map((a, i) => (
                  <ActionRow key={i} action={a} />
                ))}
              </ul>
            )}
          </section>

          {/* Sentiment mix */}
          <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
            <h3 className="mb-3 text-sm font-semibold text-slate-900">
              Sentiment mix
            </h3>
            <div className="flex flex-wrap gap-2">
              {p.metrics.sentimentMix.map((s) => (
                <span
                  key={s.sentiment}
                  className={
                    "rounded-full px-2.5 py-1 text-[11px] font-semibold " +
                    sentimentClass(s.sentiment)
                  }
                >
                  {s.sentiment}: {s.count}
                </span>
              ))}
            </div>
            {p.metrics.analyzedReviews < p.metrics.totalReviews && (
              <p className="mt-2 text-[11px] text-slate-500">
                {p.metrics.totalReviews - p.metrics.analyzedReviews} review
                {p.metrics.totalReviews - p.metrics.analyzedReviews === 1
                  ? ""
                  : "s"}{" "}
                not yet analyzed — run &ldquo;Analyze sentiment&rdquo; on the
                Reviews page to sharpen these insights.
              </p>
            )}
          </section>

          {/* Quotes */}
          {p.quotes.length > 0 && (
            <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
              <h3 className="mb-3 text-sm font-semibold text-slate-900">
                Representative feedback
              </h3>
              <ul className="space-y-2">
                {p.quotes.map((q, i) => (
                  <li
                    key={i}
                    className="rounded-lg border border-slate-100 bg-slate-50 p-3"
                  >
                    <div className="mb-1 flex items-center gap-2">
                      <span className="text-[11px] text-amber-500">
                        {"★".repeat(q.starRating)}
                        {"☆".repeat(5 - q.starRating)}
                      </span>
                      <span className="text-[10px] text-slate-400">
                        {new Date(q.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                    <p className="text-[12px] leading-snug text-slate-700">
                      {q.excerpt}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </>
  );
}

function ThemeList({
  themes,
  tone,
}: {
  themes: ThemeStatDto[];
  tone: "positive" | "negative";
}) {
  if (themes.length === 0) return null;
  return (
    <div className="mt-3 border-t border-slate-100 pt-3">
      <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
        Recurring themes
      </div>
      <div className="flex flex-wrap gap-1.5">
        {themes.map((t) => (
          <span
            key={t.theme}
            title={`${t.count} mentions · ${t.averageRating.toFixed(1)}★ average`}
            className={
              "rounded-full border px-2 py-0.5 text-[10px] font-semibold " +
              (tone === "positive"
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-rose-200 bg-rose-50 text-rose-700")
            }
          >
            {t.theme} · {t.count}
          </span>
        ))}
      </div>
    </div>
  );
}

function ActionRow({ action }: { action: InsightActionDto }) {
  const map: Record<string, string> = {
    high: "bg-rose-100 text-rose-700",
    medium: "bg-amber-100 text-amber-700",
    low: "bg-slate-200 text-slate-600",
  };
  return (
    <li className="rounded-lg border border-slate-200 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="text-[12.5px] font-semibold text-slate-900">
          {action.title}
        </div>
        <span
          className={
            "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold " +
            (map[action.priority] ?? map.medium)
          }
        >
          {action.priority}
        </span>
      </div>
      {action.detail && (
        <p className="mt-1 text-[11.5px] leading-snug text-slate-600">
          {action.detail}
        </p>
      )}
      {action.basis && action.basis.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {action.basis.map((b) => (
            <span
              key={b}
              className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500"
            >
              {b}
            </span>
          ))}
        </div>
      )}
    </li>
  );
}

function sentimentClass(s: string): string {
  const map: Record<string, string> = {
    POSITIVE: "bg-emerald-100 text-emerald-700",
    NEUTRAL: "bg-slate-100 text-slate-600",
    NEGATIVE: "bg-rose-100 text-rose-700",
    MIXED: "bg-amber-100 text-amber-700",
    UNANALYZED: "bg-slate-200 text-slate-500",
  };
  return map[s] ?? "bg-slate-100 text-slate-600";
}
