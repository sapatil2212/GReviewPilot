"use client";

const DISTRIBUTION = [
  { label: "5 Stars", count: 789, percentage: 63, color: "#10B981" },
  { label: "4 Stars", count: 312, percentage: 25, color: "#3B82F6" },
  { label: "3 Stars", count: 89, percentage: 7, color: "#F59E0B" },
  { label: "2 Stars", count: 32, percentage: 3, color: "#F97316" },
  { label: "1 Star", count: 26, percentage: 2, color: "#EF4444" },
];

export function ReviewDistribution() {
  const total = 1248;
  let cumulativeAngle = 0;
  const radius = 55;
  const cx = 70;
  const cy = 70;
  const strokeWidth = 18;

  const slices = DISTRIBUTION.map((item) => {
    const angle = (item.percentage / 100) * 360;
    const startAngle = cumulativeAngle;
    const endAngle = cumulativeAngle + angle;
    cumulativeAngle += angle;

    const x1 = cx + radius * Math.cos((Math.PI * (startAngle - 90)) / 180);
    const y1 = cy + radius * Math.sin((Math.PI * (startAngle - 90)) / 180);
    const x2 = cx + radius * Math.cos((Math.PI * (endAngle - 90)) / 180);
    const y2 = cy + radius * Math.sin((Math.PI * (endAngle - 90)) / 180);

    const largeArcFlag = angle > 180 ? 1 : 0;
    const pathData = [`M ${x1} ${y1}`, `A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2}`].join(" ");
    return { ...item, pathData };
  });

  return (
    <div className="flex h-full flex-col justify-between rounded-xl border border-slate-200/80 bg-white p-3.5 shadow-xs">
      <h2 className="text-xs font-bold tracking-tight text-slate-900">
        Review Distribution
      </h2>

      <div className="my-2 flex flex-col items-center justify-between gap-4 sm:flex-row">
        {/* Donut Chart */}
        <div className="relative flex items-center justify-center">
          <svg className="h-36 w-36 overflow-visible" viewBox="0 0 140 140">
            {slices.map((slice) => (
              <path
                key={slice.label}
                d={slice.pathData}
                fill="none"
                stroke={slice.color}
                strokeWidth={strokeWidth}
              />
            ))}
          </svg>

          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
            <div className="text-base font-extrabold text-slate-900">
              {total.toLocaleString()}
            </div>
            <div className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">
              Total Reviews
            </div>
          </div>
        </div>

        {/* Legend */}
        <div className="w-full max-w-xs space-y-1.5 text-[11px]">
          {DISTRIBUTION.map((item) => (
            <div
              key={item.label}
              className="flex items-center justify-between rounded-md px-1.5 py-0.5"
            >
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />
                <span className="font-semibold text-slate-700">{item.label}</span>
              </div>
              <div className="flex items-center gap-1 font-mono">
                <span className="font-bold text-slate-900">{item.count}</span>
                <span className="text-[10px] text-slate-400">({item.percentage}%)</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
