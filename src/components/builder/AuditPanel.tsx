"use client";

/**
 * Audit panel — SEO, accessibility, conversion, and performance findings.
 *
 * Each issue that can be fixed by the AI carries a one-click button that sends
 * the prepared prompt to the chat. That closes the loop the requirement asks
 * for: detect the problem, then generate the fix, without the user having to
 * work out how to phrase it.
 */

import { useState } from "react";
import {
  AlertTriangle,
  BadgeCheck,
  ChevronDown,
  Crosshair,
  Loader2,
  RefreshCw,
  Sparkles,
  XCircle,
} from "lucide-react";
import type { AuditIssueDto, AuditResultDto } from "@/lib/api/site";
import type { NodeId } from "@/site/document/types";
import { cn } from "@/lib/utils";

export interface AuditPanelProps {
  result: AuditResultDto | null;
  loading: boolean;
  onRefresh: () => void;
  onSelectNode: (id: NodeId) => void;
  onAutoFix: (prompt: string) => void;
}

const CATEGORY_LABELS: Record<string, string> = {
  seo: "SEO",
  accessibility: "Accessibility",
  conversion: "Conversion",
  performance: "Performance",
  content: "Content",
};

export function AuditPanel({
  result,
  loading,
  onRefresh,
  onSelectNode,
  onAutoFix,
}: AuditPanelProps) {
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2.5">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
          <BadgeCheck className="h-3.5 w-3.5 text-blue-600" />
          Optimise
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          aria-label="Re-run audit"
          className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40"
        >
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
        </button>
      </div>

      {!result ? (
        <p className="px-3 py-6 text-center text-[11px] text-slate-500">
          {loading ? "Checking this page…" : "Run an audit to see suggestions."}
        </p>
      ) : (
        <div className="flex-1 overflow-y-auto">
          <ScoreHeader result={result} />

          {result.issues.length === 0 ? (
            <p className="px-3 py-6 text-center text-[11px] text-emerald-700">
              No issues found on this page. Nice work.
            </p>
          ) : (
            <div className="divide-y divide-slate-100">
              {result.issues.map((issue) => (
                <IssueRow
                  key={issue.id}
                  issue={issue}
                  open={expanded === issue.id}
                  onToggle={() => setExpanded(expanded === issue.id ? null : issue.id)}
                  onSelectNode={onSelectNode}
                  onAutoFix={onAutoFix}
                />
              ))}
            </div>
          )}

          {result.passed.length > 0 && (
            <div className="border-t border-slate-200 px-3 py-3">
              <h4 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                Passing ({result.passed.length})
              </h4>
              <ul className="space-y-1">
                {result.passed.map((item) => (
                  <li key={item} className="flex items-start gap-1.5 text-[10px] text-slate-500">
                    <BadgeCheck className="mt-0.5 h-2.5 w-2.5 shrink-0 text-emerald-500" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ScoreHeader({ result }: { result: AuditResultDto }) {
  // Bands chosen to match how Lighthouse presents scores, so the number reads
  // the way users already expect.
  const tone =
    result.score >= 90
      ? { ring: "text-emerald-500", label: "Excellent" }
      : result.score >= 70
        ? { ring: "text-blue-500", label: "Good" }
        : result.score >= 50
          ? { ring: "text-amber-500", label: "Needs work" }
          : { ring: "text-red-500", label: "Poor" };

  return (
    <div className="border-b border-slate-200 px-3 py-3">
      <div className="flex items-center gap-3">
        <div className="relative h-12 w-12 shrink-0">
          <svg viewBox="0 0 36 36" className="h-12 w-12 -rotate-90">
            <circle
              cx="18"
              cy="18"
              r="15.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              className="text-slate-200"
            />
            <circle
              cx="18"
              cy="18"
              r="15.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              // 2πr ≈ 97.4 is the full circumference; the dash offset encodes
              // the remaining fraction.
              strokeDasharray="97.4"
              strokeDashoffset={97.4 * (1 - result.score / 100)}
              className={tone.ring}
            />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-sm font-bold text-slate-800">
            {result.score}
          </span>
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold text-slate-800">{tone.label}</p>
          <p className="text-[10px] text-slate-500">
            {result.counts.critical} critical · {result.counts.warning} warnings ·{" "}
            {result.counts.suggestion} suggestions
          </p>
        </div>
      </div>

      {Object.entries(result.byCategory).filter(([, n]) => n > 0).length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {Object.entries(result.byCategory)
            .filter(([, count]) => count > 0)
            .map(([category, count]) => (
              <span
                key={category}
                className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600"
              >
                {CATEGORY_LABELS[category] ?? category} {count}
              </span>
            ))}
        </div>
      )}
    </div>
  );
}

function IssueRow({
  issue,
  open,
  onToggle,
  onSelectNode,
  onAutoFix,
}: {
  issue: AuditIssueDto;
  open: boolean;
  onToggle: () => void;
  onSelectNode: (id: NodeId) => void;
  onAutoFix: (prompt: string) => void;
}) {
  const Icon =
    issue.severity === "critical"
      ? XCircle
      : issue.severity === "warning"
        ? AlertTriangle
        : Sparkles;
  const tone =
    issue.severity === "critical"
      ? "text-red-500"
      : issue.severity === "warning"
        ? "text-amber-500"
        : "text-blue-500";

  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-start gap-2 px-3 py-2.5 text-left hover:bg-slate-50"
      >
        <Icon className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", tone)} />
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] font-medium text-slate-800">{issue.title}</span>
          <span className="mt-0.5 block text-[10px] uppercase tracking-wide text-slate-400">
            {CATEGORY_LABELS[issue.category] ?? issue.category}
          </span>
        </span>
        <ChevronDown
          className={cn("mt-0.5 h-3 w-3 shrink-0 text-slate-400 transition-transform", !open && "-rotate-90")}
        />
      </button>

      {open && (
        <div className="space-y-2 bg-slate-50 px-3 pb-3 pt-1">
          <p className="text-[11px] leading-relaxed text-slate-600">{issue.detail}</p>
          <p className="text-[11px] leading-relaxed text-slate-800">
            <span className="font-semibold">Fix: </span>
            {issue.fix}
          </p>

          <div className="flex flex-wrap gap-1.5">
            {issue.nodeIds?.length ? (
              <button
                type="button"
                onClick={() => onSelectNode(issue.nodeIds![0])}
                className="flex items-center gap-1 rounded border border-slate-200 bg-white px-2 py-1 text-[10px] font-medium text-slate-700 hover:bg-slate-50"
              >
                <Crosshair className="h-2.5 w-2.5" />
                Show me ({issue.nodeIds.length})
              </button>
            ) : null}

            {issue.autoFixPrompt && (
              <button
                type="button"
                onClick={() => onAutoFix(issue.autoFixPrompt!)}
                className="flex items-center gap-1 rounded bg-blue-600 px-2 py-1 text-[10px] font-medium text-white hover:bg-blue-700"
              >
                <Sparkles className="h-2.5 w-2.5" />
                Fix with AI
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
