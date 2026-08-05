"use client";

/**
 * /dashboard/analytics — deeper analytics: review trends, sentiment,
 * funnel time series, and QR performance.
 */

import { useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { PageHeader } from "@/components/dashboard/page-header";
import { useApi } from "@/lib/api/useApi";
import { analyticsApi } from "@/lib/api";

const PERIODS = [
  { value: 7, label: "7d" },
  { value: 30, label: "30d" },
  { value: 90, label: "90d" },
  { value: 365, label: "12m" },
];

const SENTIMENT_COLORS: Record<string, string> = {
  POSITIVE: "#22c55e",
  NEUTRAL: "#94a3b8",
  NEGATIVE: "#ef4444",
  MIXED: "#eab308",
  UNANALYZED: "#cbd5e1",
};

export default function AnalyticsPage() {
  const [period, setPeriod] = useState(30);
  const reviews = useApi(() => analyticsApi.reviews(period), [period]);
  const funnel = useApi(() => analyticsApi.funnel(period), [period]);
  const qr = useApi(() => analyticsApi.qr(period), [period]);

  return (
    <>
      <PageHeader
        title="Analytics"
        description="Trends across reviews, funnel conversion, and QR performance."
        actions={
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
        }
      />

      <div className="space-y-4">
        {/* Rating trend */}
        <Card title="Average rating trend">
          {(reviews.data?.series.length ?? 0) === 0 ? (
            <Empty />
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={reviews.data!.series}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="bucket" tick={{ fontSize: 10 }} stroke="#94a3b8" />
                <YAxis domain={[0, 5]} tick={{ fontSize: 10 }} stroke="#94a3b8" />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Line
                  type="monotone"
                  dataKey="averageRating"
                  name="Avg rating"
                  stroke="#f59e0b"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </Card>

        <div className="grid gap-4 lg:grid-cols-2">
          {/* Sentiment */}
          <Card title="Sentiment breakdown">
            {(reviews.data?.sentiment.length ?? 0) === 0 ? (
              <Empty />
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie
                    data={reviews.data!.sentiment}
                    dataKey="count"
                    nameKey="sentiment"
                    innerRadius={55}
                    outerRadius={90}
                    paddingAngle={2}
                  >
                    {reviews.data!.sentiment.map((s, i) => (
                      <Cell
                        key={i}
                        fill={SENTIMENT_COLORS[s.sentiment] ?? "#cbd5e1"}
                      />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
            <Legend
              items={(reviews.data?.sentiment ?? []).map((s) => ({
                label: s.sentiment,
                color: SENTIMENT_COLORS[s.sentiment] ?? "#cbd5e1",
                value: s.count,
              }))}
            />
          </Card>

          {/* Funnel time series */}
          <Card title="Funnel: views vs sent to Google">
            {(funnel.data?.series.length ?? 0) === 0 ? (
              <Empty />
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={funnel.data!.series}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="bucket" tick={{ fontSize: 10 }} stroke="#94a3b8" />
                  <YAxis tick={{ fontSize: 10 }} stroke="#94a3b8" allowDecimals={false} />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                  <Area type="monotone" dataKey="views" name="Views" stroke="#3b82f6" fill="#3b82f680" />
                  <Area type="monotone" dataKey="redirects" name="To Google" stroke="#22c55e" fill="#22c55e80" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </Card>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          {/* QR scans over time */}
          <Card title="QR scans">
            {(qr.data?.series.length ?? 0) === 0 ? (
              <Empty />
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={qr.data!.series}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="bucket" tick={{ fontSize: 10 }} stroke="#94a3b8" />
                  <YAxis tick={{ fontSize: 10 }} stroke="#94a3b8" allowDecimals={false} />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                  <Bar dataKey="scans" name="Scans" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="unique" name="Unique" fill="#c4b5fd" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Card>

          {/* Top QR codes */}
          <Card title="Top QR codes">
            {(qr.data?.topCodes.length ?? 0) === 0 ? (
              <Empty />
            ) : (
              <ul className="space-y-2 py-1">
                {qr.data!.topCodes.map((c) => (
                  <li key={c.id} className="flex items-center justify-between">
                    <div className="min-w-0">
                      <div className="truncate text-xs font-semibold text-slate-800">
                        {c.label}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {c.type.replaceAll("_", " ")}
                      </div>
                    </div>
                    <div className="flex gap-3 text-xs">
                      <span className="font-semibold text-slate-900">{c.scanCount}</span>
                      <span className="text-slate-400">{c.uniqueScanCount} uniq</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <h3 className="mb-3 text-sm font-semibold text-slate-900">{title}</h3>
      {children}
    </div>
  );
}

function Empty() {
  return (
    <div className="flex h-[240px] items-center justify-center text-xs text-slate-400">
      No data for this period yet
    </div>
  );
}

function Legend({
  items,
}: {
  items: Array<{ label: string; color: string; value: number }>;
}) {
  return (
    <div className="mt-2 flex flex-wrap justify-center gap-3">
      {items.map((it) => (
        <div key={it.label} className="flex items-center gap-1.5 text-[11px] text-slate-600">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: it.color }} />
          {it.label.toLowerCase()} ({it.value})
        </div>
      ))}
    </div>
  );
}
