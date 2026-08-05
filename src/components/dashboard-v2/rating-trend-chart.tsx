"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

const MONTHLY_DATA = [
  { month: "Jan", rating: 4.2 },
  { month: "Feb", rating: 4.4 },
  { month: "Mar", rating: 4.3 },
  { month: "Apr", rating: 4.5 },
  { month: "May", rating: 4.7, highlight: true },
  { month: "Jun", rating: 4.7 },
];

const FILTERS = ["Last 6 Months", "Last 12 Months"];

export function RatingTrendChart() {
  const [selectedFilter, setSelectedFilter] = useState(FILTERS[0]);
  const [showFilter, setShowFilter] = useState(false);
  const [hoveredNode, setHoveredNode] = useState<typeof MONTHLY_DATA[number] | null>(
    MONTHLY_DATA.find((d) => d.highlight) || null
  );

  const minRating = 3.5;
  const maxRating = 5.0;
  const range = maxRating - minRating;
  const width = 400;
  const height = 130;

  const points = MONTHLY_DATA.map((d, i) => {
    const x = (i / (MONTHLY_DATA.length - 1)) * width;
    const y = height - ((d.rating - minRating) / range) * height;
    return { x, y, ...d };
  });

  const pathD = points.reduce((acc, pt, i, arr) => {
    if (i === 0) return `M ${pt.x} ${pt.y}`;
    const prev = arr[i - 1];
    const cx = (prev.x + pt.x) / 2;
    return `${acc} C ${cx} ${prev.y}, ${cx} ${pt.y}, ${pt.x} ${pt.y}`;
  }, "");

  return (
    <div className="flex h-full flex-col justify-between rounded-xl border border-slate-200/80 bg-white p-3.5 shadow-xs">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-bold tracking-tight text-slate-900">
          Rating Trend
        </h2>

        <div className="relative">
          <button
            onClick={() => setShowFilter((v) => !v)}
            className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-700 shadow-2xs"
          >
            {selectedFilter}
            <ChevronDown className="h-3 w-3 text-slate-400" />
          </button>

          {showFilter && (
            <div className="absolute right-0 top-full z-20 mt-1 w-32 rounded-lg border border-slate-200 bg-white p-1 shadow-md">
              {FILTERS.map((f) => (
                <button
                  key={f}
                  onClick={() => {
                    setSelectedFilter(f);
                    setShowFilter(false);
                  }}
                  className={
                    "w-full rounded-md px-2 py-1 text-left text-[11px] " +
                    (selectedFilter === f
                      ? "bg-blue-50 font-semibold text-blue-600"
                      : "text-slate-700 hover:bg-slate-100")
                  }
                >
                  {f}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="relative mt-3">
        <div className="pointer-events-none absolute inset-0 flex flex-col justify-between text-[10px] font-medium text-slate-400">
          {[5.0, 4.5, 4.0, 3.5].map((val) => (
            <div key={val} className="flex items-center gap-2">
              <span className="w-4 text-right">{val.toFixed(1)}</span>
              <div className="h-px w-full bg-slate-100" />
            </div>
          ))}
        </div>

        <div className="pl-6 pt-1 pb-4">
          <svg
            className="h-36 w-full overflow-visible"
            viewBox={`0 0 ${width} ${height}`}
            preserveAspectRatio="none"
          >
            <path
              d={pathD}
              fill="none"
              stroke="#3B82F6"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
            {points.map((pt) => (
              <circle
                key={pt.month}
                cx={pt.x}
                cy={pt.y}
                r={hoveredNode?.month === pt.month ? "4" : "2.5"}
                fill="#ffffff"
                stroke="#3B82F6"
                strokeWidth="2"
                className="cursor-pointer"
                onMouseEnter={() => setHoveredNode(pt)}
              />
            ))}
          </svg>
        </div>

        {hoveredNode && (
          <div
            className="pointer-events-none absolute z-10 rounded-md border border-slate-200 bg-slate-900 px-2 py-0.5 text-center text-[10px] font-semibold text-white shadow-sm"
            style={{
              left: `${(MONTHLY_DATA.findIndex((m) => m.month === hoveredNode.month) / (MONTHLY_DATA.length - 1)) * 82 + 9}%`,
              top: `${100 - ((hoveredNode.rating - minRating) / range) * 100 - 30}px`,
              transform: "translateX(-50%)",
            }}
          >
            {hoveredNode.month}: {hoveredNode.rating}
          </div>
        )}

        <div className="flex justify-between pl-6 text-[10.5px] font-medium text-slate-400">
          {MONTHLY_DATA.map((d) => (
            <span key={d.month}>{d.month}</span>
          ))}
        </div>
      </div>
    </div>
  );
}
