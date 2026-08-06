"use client";

/**
 * AI Reply Assistant — business personality setup, testing, and performance.
 *
 * The organising idea: a business answers questions about itself once, and every
 * AI feature reuses those answers. So this page leads with setup, then proves it
 * works with a live preview, rather than presenting a prompt box and hoping the
 * user knows what to type into it.
 *
 * Once setup is complete the wizard collapses to a summary, because the common
 * case after onboarding is "check something and tweak one answer", not "walk all
 * sixteen steps again".
 */

import { useCallback, useEffect, useState } from "react";
import { Loader2, Pencil, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/dashboard/page-header";
import {
  aiPersonalityApi,
  type PersonalityDto,
  type PersonalityOptionsDto,
} from "@/lib/api/ai";
import { ApiClientError } from "@/lib/fetcher";
import {
  CompleteBanner,
  IncompleteNotice,
  PersonalityWizard,
} from "./_components/personality-wizard";
import { ReplyPreview } from "./_components/reply-preview";
import { ReplyAnalytics } from "./_components/reply-analytics";
import { PersonalitySummary } from "./_components/personality-summary";

export default function AiAssistantPage() {
  const [personality, setPersonality] = useState<PersonalityDto | null>(null);
  const [options, setOptions] = useState<PersonalityOptionsDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** Forces the wizard open on a finished personality, for editing. */
  const [editing, setEditing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [p, o] = await Promise.all([aiPersonalityApi.get(), aiPersonalityApi.options()]);
      setPersonality(p);
      setOptions(o);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not load your AI settings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const reset = async () => {
    if (
      !window.confirm(
        "Start over? This clears everything the AI knows about your business, and replies will fall back to generic defaults until you set it up again.",
      )
    ) {
      return;
    }
    try {
      const next = await aiPersonalityApi.reset();
      setPersonality(next);
      setEditing(true);
      toast.success("Personality cleared");
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : "Could not reset");
    }
  };

  const missingRequired =
    personality && options
      ? options.steps
          .filter((s) => s.required && !personality.completedSteps.includes(s.id))
          .map((s) => s.title.toLowerCase())
      : [];

  const showWizard = Boolean(personality && options && (!personality.complete || editing));

  return (
    <>
      <PageHeader
        title="AI Reply Assistant"
        description="Teach the AI how your business speaks, once. Every reply, post, and description will use it."
        actions={
          personality?.complete && !editing ? (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              <Pencil className="h-3.5 w-3.5" />
              Edit answers
            </button>
          ) : null
        }
      />

      {loading && (
        <div className="flex items-center justify-center py-12 text-sm text-slate-500">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Loading your AI settings…
        </div>
      )}

      {error && !loading && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {personality && options && !loading && (
        <div className="space-y-5">
          {personality.complete ? (
            <CompleteBanner onReset={() => void reset()} />
          ) : (
            missingRequired.length > 0 && <IncompleteNotice missing={missingRequired} />
          )}

          {showWizard ? (
            <PersonalityWizard
              personality={personality}
              options={options}
              onSaved={setPersonality}
              onFinished={() => {
                setEditing(false);
                toast.success("Setup saved — try it out below");
              }}
            />
          ) : (
            <PersonalitySummary
              personality={personality}
              options={options}
              onEdit={() => setEditing(true)}
            />
          )}

          {/*
            Preview sits below setup rather than behind a tab: seeing the effect
            of an answer immediately is what makes the settings understandable
            without ever exposing a prompt.
          */}
          <ReplyPreview ready={personality.complete} />

          <ReplyAnalytics />

          {!personality.complete && (
            <p className="flex items-center gap-1.5 text-[11px] text-slate-400">
              <Sparkles className="h-3 w-3" />
              You can leave at any point — each step saves as you go.
            </p>
          )}
        </div>
      )}
    </>
  );
}
