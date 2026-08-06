"use client";

/**
 * Business Personality onboarding wizard.
 *
 * Sixteen questions, one screen at a time, most of them skippable. Deliberately
 * not one long form: a long form gets abandoned, and the point of this module is
 * that a business answers these once instead of writing a prompt every time it
 * wants AI output.
 *
 * Three things make it safe to leave half-finished:
 *   - each step saves on its own, so nothing is lost by closing the tab
 *   - a step is a patch, never a full replace, so answers from other steps
 *     cannot be clobbered
 *   - progress lives on the server (`completedSteps`), so resuming works on a
 *     different device
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  Loader2,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { Field, Input, Textarea } from "@/components/dashboard/field";
import {
  aiPersonalityApi,
  type ApprovalModeDto,
  type AppreciationPolicyDto,
  type ConfidenceLevelDto,
  type EmojiUsageDto,
  type PersonalityDto,
  type PersonalityOptionsDto,
  type PersonalityPatch,
  type ReplyLengthDto,
} from "@/lib/api/ai";
import { ApiClientError } from "@/lib/fetcher";
import { cn } from "@/lib/utils";
import { ChipMultiSelect, OptionCards, TagListInput } from "./inputs";

export function PersonalityWizard({
  personality,
  options,
  onSaved,
  onFinished,
}: {
  personality: PersonalityDto;
  options: PersonalityOptionsDto;
  onSaved: (next: PersonalityDto) => void;
  onFinished: () => void;
}) {
  /**
   * Local working copy. Edits are immediate and local; the save happens on
   * "Continue" so typing does not fire a request per keystroke.
   */
  const [draft, setDraft] = useState<PersonalityDto>(personality);
  const [saving, setSaving] = useState(false);

  // Resume where they left off: the first unanswered step.
  const [index, setIndex] = useState(() => {
    const done = new Set(personality.completedSteps);
    const next = options.steps.findIndex((s) => !done.has(s.id));
    return next === -1 ? 0 : next;
  });

  const step = options.steps[index];
  const isLast = index === options.steps.length - 1;
  const answered = useMemo(() => new Set(draft.completedSteps), [draft.completedSteps]);
  const percent = Math.round((answered.size / options.steps.length) * 100);

  const set = useCallback(<K extends keyof PersonalityDto>(key: K, value: PersonalityDto[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }, []);

  /**
   * Persist the fields this step owns.
   *
   * Only the current step's fields are sent, not the whole draft — that is what
   * makes each save a genuine patch and keeps a stale local copy from
   * overwriting an answer changed elsewhere.
   */
  const saveStep = useCallback(
    async (markComplete: boolean): Promise<boolean> => {
      if (!step) return false;
      const patch = patchForStep(step.id, draft);
      setSaving(true);
      try {
        const next = await aiPersonalityApi.save({
          ...patch,
          ...(markComplete ? { completedStep: step.id } : {}),
        });
        setDraft(next);
        onSaved(next);
        return true;
      } catch (err) {
        toast.error(err instanceof ApiClientError ? err.message : "Could not save");
        return false;
      } finally {
        setSaving(false);
      }
    },
    [draft, step, onSaved],
  );

  const goNext = async () => {
    const ok = await saveStep(true);
    if (!ok) return;
    if (isLast) onFinished();
    else setIndex((i) => Math.min(i + 1, options.steps.length - 1));
  };

  const goBack = () => setIndex((i) => Math.max(i - 1, 0));

  /** Skip without marking answered, so progress stays honest. */
  const goSkip = () => {
    if (isLast) onFinished();
    else setIndex((i) => Math.min(i + 1, options.steps.length - 1));
  };

  // Warn before losing unsaved edits on this step.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (saving) e.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [saving]);

  if (!step) return null;

  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      {/* Progress */}
      <header className="border-b border-slate-100 px-5 py-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
              Step {index + 1} of {options.steps.length}
              {!step.required && " · optional"}
            </p>
            <h2 className="mt-0.5 truncate text-sm font-semibold text-slate-900">{step.title}</h2>
            <p className="mt-0.5 text-xs text-slate-500">{step.question}</p>
          </div>
          <span className="shrink-0 text-xs font-semibold text-slate-400">{percent}%</span>
        </div>
        <div
          className="mt-3 h-1 w-full overflow-hidden rounded-full bg-slate-100"
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Setup progress"
        >
          <div
            className="h-full rounded-full bg-blue-600 transition-all duration-300"
            style={{ width: `${percent}%` }}
          />
        </div>
        {/* Step dots double as navigation to anything already answered. */}
        <div className="mt-2 flex flex-wrap gap-1">
          {options.steps.map((s, i) => {
            const done = answered.has(s.id);
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setIndex(i)}
                title={s.title}
                aria-label={`Go to step ${i + 1}: ${s.title}`}
                aria-current={i === index}
                className={cn(
                  "h-1.5 rounded-full transition-all",
                  i === index ? "w-5 bg-blue-600" : done ? "w-2.5 bg-blue-300" : "w-2.5 bg-slate-200",
                )}
              />
            );
          })}
        </div>
      </header>

      {/* Question */}
      <div className="px-5 py-5">
        <StepBody step={step.id} draft={draft} options={options} set={set} />
      </div>

      {/* Actions */}
      <footer className="flex items-center justify-between gap-2 border-t border-slate-100 px-5 py-3">
        <button
          type="button"
          onClick={goBack}
          disabled={index === 0 || saving}
          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-40"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back
        </button>

        <div className="flex items-center gap-2">
          {!step.required && (
            <button
              type="button"
              onClick={goSkip}
              disabled={saving}
              className="rounded-lg px-3 py-2 text-xs font-medium text-slate-500 hover:bg-slate-100 disabled:opacity-40"
            >
              Skip
            </button>
          )}
          <button
            type="button"
            onClick={() => void goNext()}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
          >
            {saving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : isLast ? (
              <Check className="h-3.5 w-3.5" />
            ) : (
              <ArrowRight className="h-3.5 w-3.5" />
            )}
            {saving ? "Saving…" : isLast ? "Finish" : "Continue"}
          </button>
        </div>
      </footer>
    </div>
  );
}

// =====================================================================
// Which fields each step owns
// =====================================================================

/**
 * Maps a step to the fields it saves.
 *
 * Declared as data so the wizard sends exactly one step's answers per request.
 * Sending the whole draft would look simpler but would let a stale local copy
 * silently overwrite fields the user changed on another device.
 */
function patchForStep(step: string, d: PersonalityDto): PersonalityPatch {
  switch (step) {
    case "introduction":
      return {
        businessName: d.businessName ?? undefined,
        businessType: d.businessType ?? undefined,
        industry: d.industry ?? undefined,
        shortDescription: d.shortDescription ?? undefined,
        uniqueness: d.uniqueness ?? undefined,
      };
    case "values":
      return { values: d.values };
    case "style":
      return { communicationStyles: d.communicationStyles };
    case "greeting":
      // Empty string is meaningful here: it means "no greeting".
      return { greetingStyle: d.greetingStyle ?? "" };
    case "signature":
      return { signature: d.signature ?? "" };
    case "emoji":
      return { emojiUsage: d.emojiUsage };
    case "length":
      return { replyLength: d.replyLength };
    case "language":
      return {
        primaryLanguage: d.primaryLanguage,
        secondaryLanguages: d.secondaryLanguages,
        autoDetectLanguage: d.autoDetectLanguage,
        translateBeforeReply: d.translateBeforeReply,
      };
    case "appreciation":
      return {
        appreciationPolicy: d.appreciationPolicy,
        appreciationMessage: d.appreciationMessage ?? undefined,
      };
    case "negative":
      return { negativeStrategies: d.negativeStrategies };
    case "positive":
      return { positiveStrategies: d.positiveStrategies };
    case "services":
      return {
        services: d.services,
        products: d.products,
        pricingPhilosophy: d.pricingPhilosophy ?? undefined,
        guarantees: d.guarantees ?? undefined,
        usp: d.usp ?? undefined,
        experience: d.experience ?? undefined,
        certifications: d.certifications,
        awards: d.awards,
        businessStory: d.businessStory ?? undefined,
      };
    case "never":
      return { neverSay: d.neverSay };
    case "compliance":
      return { complianceRules: d.complianceRules, complianceNotes: d.complianceNotes ?? undefined };
    case "approval":
      return { approvalMode: d.approvalMode };
    case "confidence":
      return { confidenceLevel: d.confidenceLevel };
    default:
      return {};
  }
}

// =====================================================================
// Step bodies
// =====================================================================

function StepBody({
  step,
  draft,
  options,
  set,
}: {
  step: string;
  draft: PersonalityDto;
  options: PersonalityOptionsDto;
  set: <K extends keyof PersonalityDto>(key: K, value: PersonalityDto[K]) => void;
}) {
  switch (step) {
    case "introduction":
      return (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Business name" htmlFor="bn" required>
              <Input
                id="bn"
                value={draft.businessName ?? ""}
                onChange={(e) => set("businessName", e.target.value)}
                placeholder={draft.suggestions.businessName ?? "Bright Smile Dental"}
              />
            </Field>
            <Field label="Business type" htmlFor="bt">
              <Input
                id="bt"
                value={draft.businessType ?? ""}
                onChange={(e) => set("businessType", e.target.value)}
                placeholder={draft.suggestions.industry ?? "Dental clinic"}
              />
            </Field>
          </div>
          <Field
            label="Short description"
            htmlFor="sd"
            hint="one or two sentences"
          >
            <Textarea
              id="sd"
              rows={2}
              value={draft.shortDescription ?? ""}
              onChange={(e) => set("shortDescription", e.target.value)}
              placeholder={
                draft.suggestions.shortDescription ??
                "We are a family-owned dental clinic focusing on gentle and affordable dental care."
              }
            />
          </Field>
          <Field label="What makes your business different?" htmlFor="uq">
            <Textarea
              id="uq"
              rows={2}
              value={draft.uniqueness ?? ""}
              onChange={(e) => set("uniqueness", e.target.value)}
              placeholder="Every dentist here has more than ten years of experience."
            />
          </Field>
          {draft.suggestions.businessName && (
            <p className="text-[11px] text-slate-400">
              Placeholders come from your workspace details — replace them with how you would
              describe the business to a customer.
            </p>
          )}
        </div>
      );

    case "values":
      return (
        <ChipMultiSelect
          options={options.values}
          selected={draft.values}
          onChange={(next) => set("values", next)}
          allowCustom
          customPlaceholder="Add your own value…"
        />
      );

    case "style":
      return (
        <div>
          <ChipMultiSelect
            options={options.communicationStyles}
            selected={draft.communicationStyles}
            onChange={(next) => set("communicationStyles", next)}
          />
          <p className="mt-2 text-[11px] text-slate-400">
            Pick two or three. Most businesses are a blend rather than one adjective.
          </p>
        </div>
      );

    case "greeting":
      return (
        <OptionCards
          columns={2}
          options={options.greetings.map((g) => ({ value: g.value, label: g.label, hint: g.hint }))}
          value={draft.greetingStyle ?? ""}
          onChange={(next) => set("greetingStyle", next)}
        />
      );

    case "signature":
      return (
        <div className="space-y-2">
          <Field label="Sign replies as" htmlFor="sig" hint="leave blank for none">
            <Input
              id="sig"
              value={draft.signature ?? ""}
              onChange={(e) => set("signature", e.target.value)}
              placeholder={`The ${draft.businessName ?? "Bright Smile"} Team`}
            />
          </Field>
          <div className="flex flex-wrap gap-1">
            {[
              `The ${draft.businessName ?? "Business"} Team`,
              "Customer Success Team",
              draft.businessName ?? "Business name",
            ]
              .filter((s, i, arr) => s && arr.indexOf(s) === i)
              .map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => set("signature", s)}
                  className="rounded-full border border-dashed border-slate-300 px-2 py-0.5 text-[11px] text-slate-600 hover:border-blue-300 hover:bg-blue-50"
                >
                  {s}
                </button>
              ))}
          </div>
        </div>
      );

    case "emoji":
      return (
        <OptionCards
          options={options.emojiUsage.map((o) => ({
            value: o.value as EmojiUsageDto,
            label: o.label,
            hint: o.hint,
          }))}
          value={draft.emojiUsage}
          onChange={(next) => set("emojiUsage", next)}
        />
      );

    case "length":
      return (
        <OptionCards
          options={options.replyLength.map((o) => ({
            value: o.value as ReplyLengthDto,
            label: o.label,
            hint: o.hint,
          }))}
          value={draft.replyLength}
          onChange={(next) => set("replyLength", next)}
        />
      );

    case "language":
      return (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Primary language" htmlFor="pl" hint="code like en or pt-BR">
              <Input
                id="pl"
                value={draft.primaryLanguage}
                onChange={(e) => set("primaryLanguage", e.target.value)}
                placeholder="en"
              />
            </Field>
            <Field label="Also reply in" htmlFor="sl">
              <TagListInput
                value={draft.secondaryLanguages}
                onChange={(next) => set("secondaryLanguages", next)}
                placeholder="hi, mr, ta…"
                max={10}
              />
            </Field>
          </div>
          <label className="flex items-start gap-2 text-xs text-slate-700">
            <input
              type="checkbox"
              checked={draft.autoDetectLanguage}
              onChange={(e) => set("autoDetectLanguage", e.target.checked)}
              className="mt-0.5 h-3.5 w-3.5"
            />
            <span>
              Reply in the language the customer wrote in
              <span className="mt-0.5 block text-[11px] text-slate-500">
                Recommended. Without this, every reply uses your primary language.
              </span>
            </span>
          </label>
          <label className="flex items-start gap-2 text-xs text-slate-700">
            <input
              type="checkbox"
              checked={draft.translateBeforeReply}
              onChange={(e) => set("translateBeforeReply", e.target.checked)}
              className="mt-0.5 h-3.5 w-3.5"
            />
            <span>Translate the review for me before drafting</span>
          </label>
        </div>
      );

    case "appreciation":
      return (
        <div className="space-y-3">
          <OptionCards
            options={options.appreciation.map((o) => ({
              value: o.value as AppreciationPolicyDto,
              label: o.label,
              hint: o.hint,
            }))}
            value={draft.appreciationPolicy}
            onChange={(next) => set("appreciationPolicy", next)}
          />
          {draft.appreciationPolicy !== "NEVER" && (
            <Field
              label="Anything you always like to say?"
              htmlFor="am"
              hint="optional"
            >
              <Input
                id="am"
                value={draft.appreciationMessage ?? ""}
                onChange={(e) => set("appreciationMessage", e.target.value)}
                placeholder="Thanks for trusting us with your family's care."
              />
            </Field>
          )}
        </div>
      );

    case "negative":
      return (
        <div>
          <ChipMultiSelect
            options={options.negativeStrategies.map((o) => o.label)}
            selected={labelsFor(options.negativeStrategies, draft.negativeStrategies)}
            onChange={(labels) =>
              set("negativeStrategies", valuesFor(options.negativeStrategies, labels))
            }
            hints={hintsByLabel(options.negativeStrategies)}
          />
          <p className="mt-2 text-[11px] text-slate-400">
            Pick everything that applies. Serious safety, medical, or legal claims are always held
            for a person to handle, whatever you choose here.
          </p>
        </div>
      );

    case "positive":
      return (
        <ChipMultiSelect
          options={options.positiveStrategies.map((o) => o.label)}
          selected={labelsFor(options.positiveStrategies, draft.positiveStrategies)}
          onChange={(labels) =>
            set("positiveStrategies", valuesFor(options.positiveStrategies, labels))
          }
          hints={hintsByLabel(options.positiveStrategies)}
        />
      );

    case "services":
      return (
        <div className="space-y-3">
          <Field label="Services you offer" htmlFor="svc">
            <TagListInput
              value={draft.services}
              onChange={(next) => set("services", next)}
              placeholder="Teeth cleaning"
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Main selling point" htmlFor="usp">
              <Input
                id="usp"
                value={draft.usp ?? ""}
                onChange={(e) => set("usp", e.target.value)}
                placeholder="Painless treatment"
              />
            </Field>
            <Field label="Years of experience" htmlFor="exp">
              <Input
                id="exp"
                value={draft.experience ?? ""}
                onChange={(e) => set("experience", e.target.value)}
                placeholder="15 years"
              />
            </Field>
          </div>
          <Field label="Guarantees" htmlFor="gtee" hint="optional">
            <Input
              id="gtee"
              value={draft.guarantees ?? ""}
              onChange={(e) => set("guarantees", e.target.value)}
              placeholder="Free follow-up within 30 days"
            />
          </Field>
          <Field label="Your story" htmlFor="story" hint="optional">
            <Textarea
              id="story"
              rows={2}
              value={draft.businessStory ?? ""}
              onChange={(e) => set("businessStory", e.target.value)}
              placeholder="Started as a single chair in 2009, now a three-dentist practice."
            />
          </Field>
        </div>
      );

    case "never":
      return (
        <div>
          <TagListInput
            value={draft.neverSay}
            onChange={(next) => set("neverSay", next)}
            placeholder="Never mention discounts"
            suggestions={options.commonNeverSay}
          />
          <p className="mt-2 text-[11px] text-slate-400">
            These are enforced, not suggested. A reply that breaks one of these rules is blocked
            rather than published.
          </p>
        </div>
      );

    case "compliance":
      return (
        <div className="space-y-3">
          <ChipMultiSelect
            options={options.complianceSectors}
            selected={draft.complianceRules}
            onChange={(next) => set("complianceRules", next)}
          />
          <Field
            label="Anything specific we must respect?"
            htmlFor="cn"
            hint="optional"
          >
            <Textarea
              id="cn"
              rows={2}
              value={draft.complianceNotes ?? ""}
              onChange={(e) => set("complianceNotes", e.target.value)}
              placeholder="Never confirm whether a named person was treated here."
            />
          </Field>
        </div>
      );

    case "approval":
      return (
        <OptionCards
          options={options.approvalModes.map((o) => ({
            value: o.value as ApprovalModeDto,
            label: o.label,
            hint: o.hint,
          }))}
          value={draft.approvalMode}
          onChange={(next) => set("approvalMode", next)}
        />
      );

    case "confidence":
      return (
        <OptionCards
          options={options.confidenceLevels.map((o) => ({
            value: o.value as ConfidenceLevelDto,
            label: o.label,
            hint: o.hint,
          }))}
          value={draft.confidenceLevel}
          onChange={(next) => set("confidenceLevel", next)}
        />
      );

    default:
      return null;
  }
}

// =====================================================================
// Strategy chips work in labels; the API works in keys.
// =====================================================================

function labelsFor(options: Array<{ value: string; label: string }>, values: string[]): string[] {
  return values
    .map((v) => options.find((o) => o.value === v)?.label)
    .filter((l): l is string => Boolean(l));
}

function valuesFor(options: Array<{ value: string; label: string }>, labels: string[]): string[] {
  return labels
    .map((l) => options.find((o) => o.label === l)?.value)
    .filter((v): v is string => Boolean(v));
}

function hintsByLabel(
  options: Array<{ label: string; hint?: string }>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const o of options) if (o.hint) out[o.label] = o.hint;
  return out;
}

/** Small banner shown once onboarding is complete. */
export function CompleteBanner({ onReset }: { onReset: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
      <Sparkles className="h-4 w-4 shrink-0 text-emerald-600" />
      <p className="min-w-0 flex-1 text-xs text-emerald-900">
        <span className="font-semibold">Your AI knows your business.</span> Every reply, post, and
        description will now use this personality.
      </p>
      <button
        type="button"
        onClick={onReset}
        className="inline-flex items-center gap-1 rounded-md border border-emerald-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-emerald-800 hover:bg-emerald-100"
      >
        <RotateCcw className="h-3 w-3" />
        Start over
      </button>
    </div>
  );
}

/** Shown when required steps are still outstanding. */
export function IncompleteNotice({ missing }: { missing: string[] }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
      <p className="text-xs text-amber-900">
        <span className="font-semibold">Almost there.</span> Finish{" "}
        {missing.join(", ")} and the AI can start drafting in your voice.
      </p>
    </div>
  );
}
