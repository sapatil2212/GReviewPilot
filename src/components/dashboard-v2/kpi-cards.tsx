"use client";

import { Star, TrendingUp } from "lucide-react";
import { KPIItem } from "./types";

const KPIS: KPIItem[] = [
  {
    id: "rating",
    label: "Average Rating",
    value: "4.7",
    change: "0.3",
    changeType: "up",
    period: "vs last 30d",
    sparklineData: [4.2, 4.3, 4.3, 4.4, 4.6, 4.5, 4.7],
    color: "emerald",
  },
  {
    id: "total",
    label: "Total Reviews",
    value: "1,248",
    change: "18.6%",
    changeType: "up",
    period: "vs last 30d",
    sparklineData: [920, 960, 1020, 1080, 1150, 1200, 1248],
    color: "blue",
  },
  {
    id: "new",
    label: "New Reviews",
    value: "128",
    change: "12.4%",
    changeType: "up",
    period: "vs last 30d",
    sparklineData: [95, 102, 110, 108, 118, 122, 128],
    color: "purple",
  },
  {
    id: "response",
    label: "Response Rate",
    value: "92%",
    change: "8.7%",
    changeType: "up",
    period: "vs last 30d",
    sparklineData: [82, 85, 84, 88, 90, 89, 92],
    color: "orange",
  },
];

export function KPICards() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {KPIS.map((kpi) => (
        <div
          key={kpi.id}
          className="group relative flex flex-col justify-between overflow-hidden rounded-xl border border-slate-200/80 bg-white p-3.5 shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
        >
          <div>
            <div className="text-[11px] font-semibold text-slate-500">
              {kpi.label}
            </div>

            <div className="mt-1 flex items-baseline justify-between">
              <div className="text-2xl font-bold tracking-tight text-slate-900">
                {kpi.value}
              </div>

              {/* Compact Sparkline Graph */}
              <div className="h-8 w-20">
                <Sparkline data={kpi.sparklineData} color={kpi.color} />
              </div>
            </div>

            {/* Rating Stars */}
            {kpi.id === "rating" && (
              <div className="mt-0.5 flex items-center gap-0.5">
                {[1, 2, 3, 4, 5].map((star) => (
                  <Star
                    key={star}
                    className="h-3 w-3 fill-amber-400 text-amber-400"
                  />
                ))}
              </div>
            )}
          </div>

          {/* Change Badge */}
          <div className="mt-2.5 flex items-center gap-1.5 text-[11px] font-medium">
            <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-50 px-2 py-0.2 font-semibold text-emerald-600 border border-emerald-100">
              <TrendingUp className="h-2.5 w-2.5" />
              ↑ {kpi.change}
            </span>
            <span className="text-slate-400 text-[10px]">{kpi.period}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function Sparkline({
  data,
  color,
}: {
  data: number[];
  color: "emerald" | "blue" | "purple" | "orange";
}) {
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const width = 80;
  const height = 32;

  const points = data
    .map((val, idx) => {
      const x = (idx / (data.length - 1)) * width;
      const y = height - ((val - min) / range) * (height - 6) - 3;
      return `${x},${y}`;
    })
    .join(" ");

  const colorMap = {
    emerald: "#10B981",
    blue: "#3B82F6",
    purple: "#8B5CF6",
    orange: "#F97316",
  };

  const stroke = colorMap[color];

  return (
    <svg className="h-full w-full overflow-visible" viewBox={`0 0 ${width} ${height}`}>
      <polyline
        fill="none"
        stroke={stroke}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  );
}
