"use client";

/**
 * Reply engine analytics.
 *
 * The most useful number here is the edit rate: if a business rewrites most of
 * what the engine produces, its personality is wrong and the fix is to revisit
 * the setup, not to keep editing. Surfaced with that interpretation attached
 * rather than left as a bare percentage.
 */

import { BarChart3, Clock, PencilLine, Send, TrendingUp } from "lucide-react";
import { useApi } from "@/lib/api/useApi";
import { aiReplyApi } from "@/lib/api/ai";
import { cn } from "@/lib/utils";

export function ReplyAnalytics() {
  const { data, loading, error } = useApi(() => aiReplyApi.analytics(30), []);

  if (loading) {
    return (
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="h-4 w-40 animate-pulse rounded bg-slate-100" />
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-lg bg-slate-50" />
          ))}
        </div>
      </section>
    );
  }

  if (error || !data) return null;

  // Nothing generated yet: a grid of zeroes teaches nothing, so say so plainly.
  if (data.generated === 0) {
    return (
      <section className="rounded-xl border border-slate-200 bg-white px-5 py-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <BarChart3 className="h-4 w-4 text-blue-600" />
          Performance
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          Nothing drafted in the last 30 days yet. Once you start replying, this shows how much the
          AI is getting right first time.
        </p>
      </section>
    );
  }

  const editPercent = data.editRate === null ? null : Math.round(data.editRate * 100);

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
        <BarChart3 className="h-4 w-4 text-blue-600" />
        Performance
        <span className="ml-1 font-normal text-slate-400">last {data.periodDays} days</span>
      </h2>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat icon={Send} label="Replies sent" value={String(data.sent)} sub={`${data.generated} drafted`} />
        <Stat
          icon={PencilLine}
          label="Edited before sending"
          value={editPercent === null ? "—" : `${editPercent}%`}
          sub={`${data.edited} of ${data.sent}`}
          tone={editPercent !== null && editPercent > 60 ? "warn" : "default"}
        />
        <Stat
          icon={Clock}
          label="Average time to send"
          value={data.avgApprovalMs === null ? "—" : formatDuration(data.avgApprovalMs)}
          sub={data.pending > 0 ? `${data.pending} waiting` : "nothing waiting"}
        />
        <Stat
          icon={TrendingUp}
          label="Time saved"
          value={`${formatMinutes(data.estimatedMinutesSaved)}`}
          sub={`estimate · ${data.estimateBasis}`}
        />
      </div>

      {editPercent !== null && editPercent > 60 && (
        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
          You are rewriting most replies before sending. That usually means the voice settings are
          not quite right — revisiting the communication style and reply length steps will save more
          time than editing each one.
        </p>
      )}

      {data.rejected > 0 && (
        <p className="mt-2 text-[11px] text-slate-400">
          {data.rejected} draft{data.rejected === 1 ? "" : "s"} rejected in this period.
        </p>
      )}
    </section>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  sub,
  tone = "default",
}: {
  icon: typeof Send;
  label: string;
  value: string;
  sub?: string;
  tone?: "default" | "warn";
}) {
  return (
    <div
      className={cn(
        "rounded-lg border px-3 py-3",
        tone === "warn" ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-slate-50",
      )}
    >
      <p className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500">
        <Icon className="h-3 w-3" />
        {label}
      </p>
      <p className="mt-1 text-lg font-semibold text-slate-900">{value}</p>
      {sub && <p className="mt-0.5 text-[10px] leading-snug text-slate-400">{sub}</p>}
    </div>
  );
}

function formatDuration(ms: number): string {
  const minutes = Math.round(ms / 60000);
  if (minutes < 1) return "under a minute";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  return hours < 24 ? `${hours} hr` : `${Math.round(hours / 24)} days`;
}

function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round((minutes / 60) * 10) / 10;
  return `${hours} hr`;
}
