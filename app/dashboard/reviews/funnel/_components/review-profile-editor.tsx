"use client";

/**
 * Modal editor for a location's AI review profile. Lets the tenant give
 * the AI real context (website link, GMB link, business type, description,
 * highlights, SEO keywords, tone) so generated reviews are specific and
 * on-brand. On save, the AI agent visits the website, gathers business
 * info, saves it as a draft, and re-synthesizes the AI brief via Gemini.
 */

import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, Loader2, Pencil, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { Field, Input, Select, Textarea } from "@/components/dashboard/field";
import { reviewProfileApi, type LocationDto } from "@/lib/api";

const TONES = ["warm", "professional", "casual", "enthusiastic"];

export function ReviewProfileEditor({
  location,
  onClose,
}: {
  location: LocationDto;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [aiContext, setAiContext] = useState<string | null>(null);
  const [briefExpanded, setBriefExpanded] = useState(false);
  const [briefEditing, setBriefEditing] = useState(false);
  const [websiteSummary, setWebsiteSummary] = useState<string | null>(null);

  const [websiteUrl, setWebsiteUrl] = useState("");
  const [gmbUrl, setGmbUrl] = useState("");
  const [businessType, setBusinessType] = useState("");
  const [description, setDescription] = useState("");
  const [highlights, setHighlights] = useState("");
  const [keywords, setKeywords] = useState("");
  const [tone, setTone] = useState("warm");

  useEffect(() => {
    let cancelled = false;
    reviewProfileApi
      .get(location.id)
      .then((res) => {
        if (cancelled) return;
        const p = res.profile;
        if (p) {
          setWebsiteUrl(p.websiteUrl ?? "");
          setGmbUrl(p.gmbProfileUrl ?? "");
          setBusinessType(p.businessType ?? "");
          setDescription(p.description ?? "");
          setHighlights((p.highlights ?? []).join(", "));
          setKeywords((p.keywords ?? []).join(", "));
          setTone(p.tone ?? "warm");
          setAiContext(p.aiContext ?? null);
          setWebsiteSummary(p.websiteSummary ?? null);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [location.id]);

  function toList(s: string): string[] {
    return s
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean)
      .slice(0, 15);
  }

  async function save() {
    setSaving(true);
    try {
      const res = await reviewProfileApi.save(location.id, {
        websiteUrl: websiteUrl.trim() || undefined,
        gmbProfileUrl: gmbUrl.trim() || undefined,
        businessType: businessType.trim() || undefined,
        description: description.trim() || undefined,
        highlights: highlights ? toList(highlights) : undefined,
        keywords: keywords ? toList(keywords) : undefined,
        tone,
        // Send the (possibly hand-edited) brief. Empty string tells the
        // server to regenerate it; non-empty is saved verbatim.
        aiContext: aiContext ?? undefined,
      });
      setAiContext(res.profile?.aiContext ?? null);
      setWebsiteSummary(res.profile?.websiteSummary ?? null);
      // Reflect any AI-enriched fields back into the form.
      if (res.profile) {
        if (res.profile.businessType) setBusinessType(res.profile.businessType);
        if (res.profile.highlights?.length)
          setHighlights(res.profile.highlights.join(", "));
        if (res.profile.keywords?.length)
          setKeywords(res.profile.keywords.join(", "));
      }
      toast.success(
        websiteUrl.trim()
          ? "Saved — AI scanned the website and tailored your reviews"
          : "AI review profile updated — reviews will now be tailored",
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 backdrop-blur-sm sm:items-center">
      <div className="my-4 flex max-h-[90vh] w-full max-w-3xl flex-col rounded-2xl border border-slate-200 bg-white p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-base font-semibold text-slate-900">
              <Sparkles className="h-4.5 w-4.5 text-blue-500" />
              AI reviews for {location.name}
            </div>
            <p className="mt-1 text-[13px] leading-snug text-slate-500">
              Add your website and the AI agent studies your business and tailors
              every review to it.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {loading ? (
          <div className="flex h-40 items-center justify-center">
            <Loader2 className="h-7 w-7 animate-spin text-slate-400" />
          </div>
        ) : (
          <div className="mt-4 flex-1 space-y-4 overflow-y-auto pr-1">
            <div className="grid gap-x-4 gap-y-4 sm:grid-cols-2">
              <Field label="Website link" hint="AI reads this">
                <Input
                  type="url"
                  value={websiteUrl}
                  onChange={(e) => setWebsiteUrl(e.target.value)}
                  placeholder="https://yourbusiness.com"
                  maxLength={1000}
                />
              </Field>
              <Field label="Google Business Profile" hint="optional">
                <Input
                  value={gmbUrl}
                  onChange={(e) => setGmbUrl(e.target.value)}
                  placeholder="https://g.page/... or maps link"
                  maxLength={1000}
                />
              </Field>
              <Field label="Business type" hint="e.g. Hospital">
                <Input
                  value={businessType}
                  onChange={(e) => setBusinessType(e.target.value)}
                  placeholder="Multi-specialty Hospital"
                  maxLength={150}
                />
              </Field>
              <Field label="Tone">
                <Select value={tone} onChange={(e) => setTone(e.target.value)}>
                  {TONES.map((t) => (
                    <option key={t} value={t}>
                      {t[0]!.toUpperCase() + t.slice(1)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Highlights" hint="comma separated">
                <Input
                  value={highlights}
                  onChange={(e) => setHighlights(e.target.value)}
                  placeholder="clean, expert doctors, short waits"
                />
              </Field>
              <Field label="SEO keywords" hint="comma separated">
                <Input
                  value={keywords}
                  onChange={(e) => setKeywords(e.target.value)}
                  placeholder="best hospital in Pune, cardiology"
                />
              </Field>
            </div>

            <Field label="Short description" hint="optional">
              <Textarea
                rows={5}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What the business does, who it serves…"
                maxLength={2000}
              />
            </Field>

            {websiteSummary && (
              <div className="rounded-lg border border-emerald-100 bg-emerald-50/60 p-3 text-xs leading-snug text-slate-600">
                <div className="mb-1 font-semibold text-emerald-700">
                  Draft gathered from your website
                </div>
                {websiteSummary}
              </div>
            )}

            <div>
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-slate-700">
                  AI brief (what reviews will emphasize)
                </span>
                <div className="flex items-center gap-3">
                  {aiContext && !briefEditing && (
                    <button
                      type="button"
                      onClick={() => setBriefExpanded((v) => !v)}
                      className="inline-flex items-center gap-0.5 text-xs font-semibold text-blue-600 hover:text-blue-700"
                    >
                      {briefExpanded ? (
                        <>
                          Show less <ChevronUp className="h-3.5 w-3.5" />
                        </>
                      ) : (
                        <>
                          View complete <ChevronDown className="h-3.5 w-3.5" />
                        </>
                      )}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setBriefEditing((v) => !v);
                      setBriefExpanded(true);
                    }}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-700"
                    aria-label={briefEditing ? "Done editing" : "Edit brief"}
                  >
                    <Pencil className="h-3.5 w-3.5" /> {briefEditing ? "Done" : "Edit"}
                  </button>
                </div>
              </div>

              {briefEditing ? (
                <Textarea
                  rows={7}
                  value={aiContext ?? ""}
                  onChange={(e) => setAiContext(e.target.value)}
                  placeholder="Auto-generated after you save. Edit this to control exactly what the AI emphasizes. Clear it to regenerate."
                  maxLength={4000}
                />
              ) : (
                <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs leading-relaxed text-slate-600">
                  {aiContext ? (
                    <p className={briefExpanded ? "whitespace-pre-wrap" : "line-clamp-4 whitespace-pre-wrap"}>
                      {aiContext}
                    </p>
                  ) : (
                    <span className="text-slate-400">
                      Auto-generated after you save. Click Edit to write your own.
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {!loading && (
          <div className="mt-4 flex justify-end gap-2 border-t border-slate-100 pt-4">
            <button
              onClick={onClose}
              disabled={saving}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Close
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {saving ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving &
                  training…
                </>
              ) : (
                "Save & train AI"
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
