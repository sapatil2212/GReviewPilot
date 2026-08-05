"use client";

/**
 * /dashboard — Overview with real analytics KPIs + charts.
 */

import { useState } from "react";
import {
  Star,
  MessageSquare,
  TrendingUp,
  MapPin,
  QrCode,
  Users,
  Reply,
  Filter,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { useApi } from "@/lib/api/useApi";
import { analyticsApi } from "@/lib/api";

const PERIODS = [
  { value: 7, label: "7 days" },
  { value: 30, label: "30 days" },
  { value: 90, label: "90 days" },
  { value: 365, label: "12 months" },
];

const RATING_COLORS = ["#ef4444", "#f97316", "#eab308", "#84cc16", "#22c55e"];

export default function DashboardOverviewPage() {
  const [period, setPeriod] = useState(30);

  const overview = useApi(() => analyticsApi.overview(period), [period]);
  const reviews = useApi(() => analyticsApi.reviews(period), [period]);
  const funnel = useApi(() => analyticsApi.funnel(period), [period]);

  const o = overview.data;

  return (
    <div className="space-y-4">
      {/* Period selector */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Overview</h2>
          <p className="text-xs text-slate-500">
            Your reputation at a glance
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1">
          {PERIODS.map((p) => (
            <button
              key={p.value}
              onClick={() => setPeriod(p.value)}
              className={
                "rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition " +
                (period === p.value
                  ? "bg-slate-900 text-white"
                  : "text-slate-600 hover:bg-slate-50")
              }
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          icon={Star}
          label="Average rating"
          value={o ? o.averageRating.toFixed(1) : "—"}
          accent="amber"
        />
        <KpiCard
          icon={MessageSquare}
          label="Total reviews"
          value={o?.totalReviews ?? "—"}
          delta={o?.reviewGrowth.pct}
          sub={o ? `${o.reviewGrowth.current} in period` : undefined}
          accent="blue"
        />
        <KpiCard
          icon={Reply}
          label="Reply rate"
          value={o ? `${o.replyRate}%` : "—"}
          sub={o ? `${o.pendingReplies} pending` : undefined}
          accent="emerald"
        />
        <KpiCard
          icon={TrendingUp}
          label="Funnel conversion"
          value={o ? `${o.funnel.conversionPct}%` : "—"}
          sub={o ? `${o.funnel.views} views` : undefined}
          accent="violet"
        />
        <KpiCard
          icon={MapPin}
          label="Active locations"
          value={o?.activeLocations ?? "—"}
          accent="blue"
        />
        <KpiCard
          icon={Users}
          label="Team members"
          value={o?.activeMembers ?? "—"}
          accent="emerald"
        />
        <KpiCard
          icon={QrCode}
          label="QR scans"
          value={o?.qrScans ?? "—"}
          accent="violet"
        />
        <KpiCard
          icon={MessageSquare}
          label="New feedback"
          value={o?.newPrivateFeedback ?? "—"}
          sub="private, unresolved"
          accent="rose"
        />
      </div>

      {/* Charts row */}
      <div className="grid gap-3 lg:grid-cols-[1.6fr_1fr]">
        {/* Review growth */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-900">
            Review volume
          </h3>
          <div className="h-64">
            {reviews.loading ? (
              <ChartSkeleton />
            ) : (reviews.data?.series.length ?? 0) === 0 ? (
              <ChartEmpty />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={reviews.data!.series}>
                  <defs>
                    <linearGradient id="rv" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="bucket" tick={{ fontSize: 10 }} stroke="#94a3b8" />
                  <YAxis tick={{ fontSize: 10 }} stroke="#94a3b8" allowDecimals={false} />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                  <Area
                    type="monotone"
                    dataKey="count"
                    name="Reviews"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    fill="url(#rv)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Rating distribution */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-900">
            Rating distribution
          </h3>
          <div className="h-64">
            {reviews.loading ? (
              <ChartSkeleton />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={reviews.data?.distribution ?? []} layout="vertical">
                  <XAxis type="number" hide allowDecimals={false} />
                  <YAxis
                    type="category"
                    dataKey="star"
                    tickFormatter={(v) => `${v}★`}
                    tick={{ fontSize: 11 }}
                    stroke="#94a3b8"
                    width={30}
                  />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                  <Bar dataKey="count" radius={[0, 6, 6, 0]}>
                    {(reviews.data?.distribution ?? []).map((d, i) => (
                      <Cell key={i} fill={RATING_COLORS[d.star - 1]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* Funnel + top locations */}
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-900">
            Review funnel
          </h3>
          {funnel.loading ? (
            <ChartSkeleton />
          ) : (
            <div className="space-y-2">
              {(funnel.data?.steps ?? []).map((s, i) => {
                const max = funnel.data?.steps[0]?.value || 1;
                const pct = Math.round((s.value / max) * 100);
                return (
                  <div key={s.step}>
                    <div className="mb-0.5 flex justify-between text-[11px]">
                      <span className="font-medium text-slate-600">{s.step}</span>
                      <span className="font-semibold text-slate-900">{s.value}</span>
                    </div>
                    <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-blue-500 to-indigo-500"
                        style={{ width: `${pct}%`, opacity: 1 - i * 0.12 }}
                      />
                    </div>
                  </div>
                );
              })}
              <div className="pt-1 text-[11px] text-slate-500">
                Conversion: <b className="text-slate-800">{funnel.data?.conversionPct}%</b>
                {" · "}
                {funnel.data?.privateFeedback} private feedback captured
              </div>
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-900">
            Top locations
          </h3>
          {reviews.loading ? (
            <ChartSkeleton />
          ) : (reviews.data?.byLocation.length ?? 0) === 0 ? (
            <ChartEmpty />
          ) : (
            <ul className="space-y-2">
              {reviews.data!.byLocation.slice(0, 6).map((l) => (
                <li key={l.locationId} className="flex items-center justify-between">
                  <div className="min-w-0">
                    <div className="truncate text-xs font-semibold text-slate-800">
                      {l.name}
                    </div>
                    <div className="text-[11px] text-slate-500">{l.city}</div>
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    <span className="inline-flex items-center gap-0.5 text-amber-600">
                      <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                      {l.averageRating}
                    </span>
                    <span className="font-semibold text-slate-900">{l.count}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function ChartSkeleton() {
  return <div className="h-full w-full animate-pulse rounded-xl bg-slate-100" />;
}
function ChartEmpty() {
  return (
    <div className="flex h-full items-center justify-center text-xs text-slate-400">
      No data for this period yet
    </div>
  );
}
