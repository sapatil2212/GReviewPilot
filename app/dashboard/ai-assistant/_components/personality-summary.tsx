"use client";

/**
 * Read-only summary of a completed personality.
 *
 * Shown instead of the wizard once onboarding is done, because the common case
 * afterwards is "check what it knows and change one thing", not walking sixteen
 * steps again. Every group links back into editing.
 */

import { Pencil } from "lucide-react";
import type { PersonalityDto, PersonalityOptionsDto } from "@/lib/api/ai";

export function PersonalitySummary({
  personality: p,
  options,
  onEdit,
}: {
  personality: PersonalityDto;
  options: PersonalityOptionsDto;
  onEdit: () => void;
}) {
  /** Strategy keys are stored; labels are what a human reads. */
  const label = (opts: Array<{ value: string; label: string }>, values: string[]) =>
    values.map((v) => opts.find((o) => o.value === v)?.label ?? v);

  const groups: Array<{ title: string; rows: Array<[string, string]> }> = [
    {
      title: "Business",
      rows: [
        ["Name", p.businessName ?? "—"],
        ["Type", p.businessType ?? "—"],
        ["Description", p.shortDescription ?? "—"],
        ["What sets you apart", p.uniqueness ?? "—"],
      ],
    },
    {
      title: "Voice",
      rows: [
        ["Style", p.communicationStyles.join(", ") || "—"],
        ["Values", p.values.join(", ") || "—"],
        ["Greeting", p.greetingStyle || "none"],
        ["Signature", p.signature || "none"],
        [
          "Emoji",
          options.emojiUsage.find((o) => o.value === p.emojiUsage)?.label ?? p.emojiUsage,
        ],
        [
          "Length",
          options.replyLength.find((o) => o.value === p.replyLength)?.label ?? p.replyLength,
        ],
        [
          "Creativity",
          options.confidenceLevels.find((o) => o.value === p.confidenceLevel)?.label ??
            p.confidenceLevel,
        ],
      ],
    },
    {
      title: "Replies",
      rows: [
        [
          "Thank customers",
          options.appreciation.find((o) => o.value === p.appreciationPolicy)?.label ??
            p.appreciationPolicy,
        ],
        [
          "Negative reviews",
          label(options.negativeStrategies, p.negativeStrategies).join(", ") || "—",
        ],
        [
          "Positive reviews",
          label(options.positiveStrategies, p.positiveStrategies).join(", ") || "—",
        ],
        [
          "Approval",
          options.approvalModes.find((o) => o.value === p.approvalMode)?.label ?? p.approvalMode,
        ],
      ],
    },
    {
      title: "Language",
      rows: [
        ["Primary", p.primaryLanguage],
        ["Also", p.secondaryLanguages.join(", ") || "—"],
        ["Match the customer's language", p.autoDetectLanguage ? "Yes" : "No"],
      ],
    },
    {
      title: "What you offer",
      rows: [
        ["Services", p.services.join(", ") || "—"],
        ["Main selling point", p.usp ?? "—"],
        ["Experience", p.experience ?? "—"],
        ["Guarantees", p.guarantees ?? "—"],
      ],
    },
    {
      title: "Guardrails",
      rows: [
        ["Never say", p.neverSay.join(" · ") || "—"],
        ["Regulated sectors", p.complianceRules.join(", ") || "—"],
        ["Compliance notes", p.complianceNotes ?? "—"],
      ],
    },
  ];

  return (
    <section className="rounded-xl border border-slate-200 bg-white">
      <header className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">What the AI knows about you</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Revision {p.revision}
            {p.completedAt
              ? ` · set up ${new Date(p.completedAt).toLocaleDateString()}`
              : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={onEdit}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          <Pencil className="h-3 w-3" />
          Edit
        </button>
      </header>

      <div className="grid gap-x-6 gap-y-4 p-5 sm:grid-cols-2">
        {groups.map((group) => (
          <div key={group.title}>
            <h3 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              {group.title}
            </h3>
            <dl className="space-y-1">
              {group.rows.map(([key, value]) => (
                <div key={key} className="flex gap-2 text-xs">
                  <dt className="w-32 shrink-0 text-slate-500">{key}</dt>
                  <dd className="min-w-0 flex-1 break-words text-slate-800">{value}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
    </section>
  );
}
