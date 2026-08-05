"use client";

import { ThumbsUp, Meh, ThumbsDown } from "lucide-react";

export function AnalyticsTab() {
  const keywords = [
    { text: "Friendly Staff", count: 412, sentiment: "positive" },
    { text: "Clean Office", count: 320, sentiment: "positive" },
    { text: "Short Wait Time", count: 285, sentiment: "positive" },
    { text: "Gentle Care", count: 198, sentiment: "positive" },
    { text: "Parking Space", count: 42, sentiment: "neutral" },
    { text: "Phone Hold Time", count: 18, sentiment: "negative" },
  ];

  return (
    <div className="space-y-6">
      {/* Top Title */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-bold text-slate-900">Reputation & Sentiment Analytics</h2>
        <p className="text-xs text-slate-500">
          AI-extracted insights from customer review sentiment, topics, and local SEO rank.
        </p>
      </div>

      {/* Grid KPI Row */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>Positive Sentiment</span>
            <ThumbsUp className="h-4 w-4 text-emerald-500" />
          </div>
          <div className="mt-2 text-3xl font-extrabold text-slate-900">84%</div>
          <div className="mt-1 text-xs text-emerald-600 font-semibold">↑ 3.2% vs last month</div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>Neutral Sentiment</span>
            <Meh className="h-4 w-4 text-amber-500" />
          </div>
          <div className="mt-2 text-3xl font-extrabold text-slate-900">11%</div>
          <div className="mt-1 text-xs text-slate-400">Stable</div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>Negative Sentiment</span>
            <ThumbsDown className="h-4 w-4 text-red-500" />
          </div>
          <div className="mt-2 text-3xl font-extrabold text-slate-900">5%</div>
          <div className="mt-1 text-xs text-emerald-600 font-semibold">↓ 1.4% improvement</div>
        </div>
      </div>

      {/* Keyword Cloud Card */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="text-base font-bold text-slate-900 mb-1">Customer Sentiment Topic Cloud</h3>
        <p className="text-xs text-slate-500 mb-4">Most frequently mentioned phrases in your 1,248 Google reviews</p>

        <div className="flex flex-wrap gap-2.5">
          {keywords.map((k) => (
            <div
              key={k.text}
              className={
                "flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-bold transition border " +
                (k.sentiment === "positive"
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                  : k.sentiment === "neutral"
                  ? "bg-amber-50 text-amber-700 border-amber-200"
                  : "bg-red-50 text-red-700 border-red-200")
              }
            >
              <span>{k.text}</span>
              <span className="rounded-full bg-white/80 px-2 py-0.5 text-[10px] shadow-2xs">
                {k.count} mentions
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
