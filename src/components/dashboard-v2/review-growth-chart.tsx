"use client";

import { useState } from "react";
import { Info, ChevronDown } from "lucide-react";

const TIME_FILTERS = ["Last 30 Days", "Last 60 Days", "Last 90 Days"];

const CHART_DATA = [
  { date: "May 20", count: 20 },
  { date: "May 22", count: 28 },
  { date: "May 24", count: 26 },
  { date: "May 27", count: 42 },
  { date: "May 29", count: 32 },
  { date: "Jun 1", count: 56 },
  { date: "Jun 3", count: 38 },
  { date: "Jun 5", count: 52 },
  { date: "Jun 8", count: 70 },
  { date: "Jun 10", count: 72, highlight: true },
  { date: "Jun 12", count: 64 },
  { date: "Jun 15", count: 76 },
  { date: "Jun 17", count: 84 },
];

export function ReviewGrowthChart() {
  const [selectedFilter, setSelectedFilter] = useState(TIME_FILTERS[0]);
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [hoveredPoint, setHoveredPoint] = useState<typeof CHART_DATA[number] | null>(
    CHART_DATA.find((d) => d.highlight) || null
  );

  const maxVal = 100;
  const width = 600;
  const height = 170;

  const points = CHART_DATA.map((d, i) => {
    const x = (i / (CHART_DATA.length - 1)) * width;
    const y = height - (d.count / maxVal) * height;
    return { x, y, ...d };
  });

  const pathD = points.reduce((acc, point, i, arr) => {
    if (i === 0) return `M ${point.x} ${point.y}`;
    const prev = arr[i - 1];
    const cx = (prev.x + point.x) / 2;
    return `${acc} C ${cx} ${prev.y}, ${cx} ${point.y}, ${point.x} ${point.y}`;
  }, "");

  const areaD = `${pathD} L ${width} ${height} L 0 ${height} Z`;

  return (
    <div className="rounded-xl border border-slate-200/80 bg-white p-3.5 shadow-xs">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <h2 className="text-xs font-bold tracking-tight text-slate-900">
            Review Growth
          </h2>
          <Info className="h-3.5 w-3.5 cursor-pointer text-slate-400 hover:text-slate-600" />
        </div>

        {/* Filter Dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowFilterDropdown((v) => !v)}
            className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 shadow-2xs transition hover:bg-slate-50"
          >
            {selectedFilter}
            <ChevronDown className="h-3 w-3 text-slate-400" />
          </button>

          {showFilterDropdown && (
            <div className="absolute right-0 top-full z-20 mt-1 w-32 rounded-lg border border-slate-200 bg-white p-1 shadow-lg animate-in fade-in zoom-in-95">
              {TIME_FILTERS.map((f) => (
                <button
                  key={f}
                  onClick={() => {
                    setSelectedFilter(f);
                    setShowFilterDropdown(false);
                  }}
                  className={
                    "w-full rounded-md px-2 py-1 text-left text-[11px] transition " +
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

      {/* Main Area Chart */}
      <div className="relative mt-3">
        {/* Y Axis Grid lines */}
        <div className="pointer-events-none absolute inset-0 flex flex-col justify-between text-[10px] font-medium text-slate-400">
          {[100, 75, 50, 25, 0].map((val) => (
            <div key={val} className="flex items-center gap-2">
              <span className="w-5 text-right">{val}</span>
              <div className="h-px w-full bg-slate-100" />
            </div>
          ))}
        </div>

        {/* Chart SVG */}
        <div className="pl-7 pt-1 pb-4">
          <svg
            className="h-44 w-full overflow-visible"
            viewBox={`0 0 ${width} ${height}`}
            preserveAspectRatio="none"
          >
            <defs>
              <linearGradient id="growthGradCompact" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#3B82F6" stopOpacity="0.2" />
                <stop offset="100%" stopColor="#3B82F6" stopOpacity="0.0" />
              </linearGradient>
            </defs>

            <path d={areaD} fill="url(#growthGradCompact)" />
            <path
              d={pathD}
              fill="none"
              stroke="#3B82F6"
              strokeWidth="2.5"
              strokeLinecap="round"
            />

            {points.map((pt) => {
              const isHovered = hoveredPoint?.date === pt.date;
              return (
                <circle
                  key={pt.date}
                  cx={pt.x}
                  cy={pt.y}
                  r={isHovered ? "4" : "2.5"}
                  fill="#ffffff"
                  stroke="#3B82F6"
                  strokeWidth={isHovered ? "2.5" : "1.5"}
                  className="cursor-pointer transition-all duration-200"
                  onMouseEnter={() => setHoveredPoint(pt)}
                />
              );
            })}
          </svg>
        </div>

        {/* Hover Tooltip */}
        {hoveredPoint && (
          <div
            className="pointer-events-none absolute z-10 rounded-lg border border-slate-200 bg-white px-2 py-1 text-center shadow-md transition-all duration-200 animate-in fade-in zoom-in-95"
            style={{
              left: `${(CHART_DATA.findIndex((d) => d.date === hoveredPoint.date) / (CHART_DATA.length - 1)) * 88 + 5}%`,
              top: `${130 - (hoveredPoint.count / maxVal) * 130 - 35}px`,
              transform: "translateX(-50%)",
            }}
          >
            <div className="text-[9.5px] font-medium text-slate-400">
              {hoveredPoint.date}
            </div>
            <div className="text-[11px] font-bold text-slate-900">
              Reviews: {hoveredPoint.count}
            </div>
          </div>
        )}

        {/* X Axis Dates */}
        <div className="flex justify-between pl-7 pr-1 text-[10.5px] font-medium text-slate-400">
          <span>May 20</span>
          <span>May 27</span>
          <span>Jun 3</span>
          <span>Jun 10</span>
          <span>Jun 17</span>
        </div>
      </div>
    </div>
  );
}
