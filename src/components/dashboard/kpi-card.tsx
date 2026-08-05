"use client";

import { ArrowDownRight, ArrowUpRight, type LucideIcon } from "lucide-react";

export function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
  delta,
  accent = "blue",
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  sub?: string;
  delta?: number;
  accent?: "blue" | "emerald" | "amber" | "violet" | "rose";
}) {
  const accentMap: Record<string, string> = {
    blue: "bg-blue-100 text-blue-600",
    emerald: "bg-emerald-100 text-emerald-600",
    amber: "bg-amber-100 text-amber-600",
    violet: "bg-violet-100 text-violet-600",
    rose: "bg-rose-100 text-rose-600",
  };
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between">
        <div className={"flex h-9 w-9 items-center justify-center rounded-xl " + accentMap[accent]}>
          <Icon className="h-4 w-4" />
        </div>
        {typeof delta === "number" && (
          <span
            className={
              "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold " +
              (delta >= 0
                ? "bg-emerald-50 text-emerald-700"
                : "bg-rose-50 text-rose-700")
            }
          >
            {delta >= 0 ? (
              <ArrowUpRight className="h-3 w-3" />
            ) : (
              <ArrowDownRight className="h-3 w-3" />
            )}
            {Math.abs(delta)}%
          </span>
        )}
      </div>
      <div className="mt-3 text-2xl font-bold tracking-tight text-slate-900">
        {value}
      </div>
      <div className="text-xs font-medium text-slate-500">{label}</div>
      {sub && <div className="mt-0.5 text-[11px] text-slate-400">{sub}</div>}
    </div>
  );
}
