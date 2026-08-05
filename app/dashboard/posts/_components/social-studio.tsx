"use client";

/**
 * Prompt-driven social media post generator.
 *
 * The user describes what they want in plain language, picks target
 * platforms, and Gemini writes copy tailored to each platform's
 * conventions. Results can be copied or carried into a Google post draft.
 *
 * Generation only — this app has no per-platform OAuth, so nothing is
 * published automatically.
 */

import { useState } from "react";
import {
  Check,
  ClipboardCopy,
  Info,
  Loader2,
  Send,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Field, Input, Select, Textarea } from "@/components/dashboard/field";
import {
  postsApi,
  type GeneratedSocialPostDto,
  type LocationDto,
  type SocialPlatform,
} from "@/lib/api";

const PLATFORMS: Array<{
  value: SocialPlatform;
  label: string;
  hint: string;
}> = [
  { value: "INSTAGRAM", label: "Instagram", hint: "Hook + hashtags" },
  { value: "FACEBOOK", label: "Facebook", hint: "Conversational" },
  { value: "LINKEDIN", label: "LinkedIn", hint: "Professional" },
  { value: "X", label: "X (Twitter)", hint: "280 chars" },
  { value: "WHATSAPP", label: "WhatsApp", hint: "Broadcast" },
];

const TONES = [
  "warm and professional",
  "friendly",
  "energetic",
  "playful",
  "formal",
  "celebratory",
];

const EXAMPLES = [
  "Announce that we now open on Sundays from 9am to 2pm",
  "We just crossed 500 five-star Google reviews — thank the community",
  "Introduce our new senior cardiologist joining this month",
  "Remind people that walk-in health checkups are available all week",
];

export function SocialStudio({
  locations,
  onUseInGooglePost,
}: {
  locations: LocationDto[];
  /** Carry a generated caption into the Google post composer. */
  onUseInGooglePost: (body: string) => void;
}) {
  const [prompt, setPrompt] = useState("");
  const [platforms, setPlatforms] = useState<SocialPlatform[]>([
    "INSTAGRAM",
    "FACEBOOK",
  ]);
  const [locationId, setLocationId] = useState("");
  const [tone, setTone] = useState(TONES[0]!);
  const [callToAction, setCallToAction] = useState("");
  const [includeHashtags, setIncludeHashtags] = useState(true);
  const [includeEmoji, setIncludeEmoji] = useState(true);

  const [generating, setGenerating] = useState(false);
  const [results, setResults] = useState<GeneratedSocialPostDto[] | null>(null);
  const [source, setSource] = useState<"ai" | "template" | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  function togglePlatform(p: SocialPlatform) {
    setPlatforms((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p],
    );
  }

  async function generate() {
    if (prompt.trim().length < 3) {
      toast.error("Describe what the post should be about");
      return;
    }
    if (platforms.length === 0) {
      toast.error("Pick at least one platform");
      return;
    }
    setGenerating(true);
    try {
      const res = await postsApi.socialGenerate({
        prompt: prompt.trim(),
        platforms,
        locationId: locationId || undefined,
        tone,
        callToAction: callToAction.trim() || undefined,
        includeHashtags,
        includeEmoji,
      });
      setResults(res.posts);
      setSource(res.source);
      toast.success(
        res.source === "ai"
          ? `Wrote ${res.posts.length} post${res.posts.length === 1 ? "" : "s"}`
          : "Drafted from templates (AI unavailable)",
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setGenerating(false);
    }
  }

  async function copy(post: GeneratedSocialPostDto) {
    try {
      await navigator.clipboard.writeText(post.caption);
      setCopied(post.platform);
      setTimeout(() => setCopied(null), 2000);
      toast.success(`${post.platformLabel} caption copied`);
    } catch {
      toast.error("Copy failed — select the text manually");
    }
  }

  return (
    <div className="space-y-4">
      {/* Prompt panel */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
        <div className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-slate-900">
          <Sparkles className="h-4 w-4 text-blue-500" />
          Describe your post
        </div>

        <Field
          label="What should this post say?"
          hint={`${prompt.length}/1000`}
          required
        >
          <Textarea
            rows={3}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value.slice(0, 1000))}
            placeholder="e.g. Announce our new weekend OPD hours and encourage people to book ahead"
          />
        </Field>

        <div className="mt-2 flex flex-wrap gap-1.5">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => setPrompt(ex)}
              className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] text-slate-600 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
            >
              {ex}
            </button>
          ))}
        </div>

        {/* Platforms */}
        <div className="mt-4">
          <div className="mb-1.5 text-xs font-semibold text-slate-700">
            Platforms
          </div>
          <div className="flex flex-wrap gap-2">
            {PLATFORMS.map((p) => {
              const on = platforms.includes(p.value);
              return (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => togglePlatform(p.value)}
                  aria-pressed={on}
                  className={
                    "rounded-xl border px-3 py-2 text-left transition " +
                    (on
                      ? "border-blue-500 bg-blue-50 ring-2 ring-blue-500/20"
                      : "border-slate-200 bg-white hover:border-slate-300")
                  }
                >
                  <div
                    className={
                      "text-[12px] font-semibold " +
                      (on ? "text-blue-700" : "text-slate-700")
                    }
                  >
                    {p.label}
                  </div>
                  <div className="text-[10px] text-slate-400">{p.hint}</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Options */}
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <Field label="Tone">
            <Select value={tone} onChange={(e) => setTone(e.target.value)}>
              {TONES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Location" hint="optional">
            <Select
              value={locationId}
              onChange={(e) => setLocationId(e.target.value)}
            >
              <option value="">Whole business</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name} · {l.city}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Call to action" hint="optional">
            <Input
              value={callToAction}
              onChange={(e) => setCallToAction(e.target.value)}
              placeholder="Book on our website"
              maxLength={200}
            />
          </Field>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-4">
            <label className="inline-flex items-center gap-2 text-xs text-slate-700">
              <input
                type="checkbox"
                checked={includeHashtags}
                onChange={(e) => setIncludeHashtags(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              Include hashtags
            </label>
            <label className="inline-flex items-center gap-2 text-xs text-slate-700">
              <input
                type="checkbox"
                checked={includeEmoji}
                onChange={(e) => setIncludeEmoji(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              Allow emoji
            </label>
          </div>
          <button
            onClick={generate}
            disabled={generating || !prompt.trim() || platforms.length === 0}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {generating ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Writing…
              </>
            ) : (
              <>
                <Sparkles className="h-3.5 w-3.5" /> Generate posts
              </>
            )}
          </button>
        </div>
      </section>

      {/* Results */}
      {results === null ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <EmptyState
            icon={Sparkles}
            title="No posts generated yet"
            description="Describe what you want to say, choose your platforms, and the AI will write copy tailored to each one."
          />
        </div>
      ) : (
        <>
          {source === "template" && (
            <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] text-amber-900">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                Generated from templates because the AI service was
                unavailable. Check that <code>GEMINI_API_KEY</code> is set and
                the model in <code>GEMINI_MODEL</code> is still available.
              </span>
            </div>
          )}
          <div className="grid gap-3 lg:grid-cols-2">
            {results.map((post) => (
              <article
                key={post.platform}
                className="flex flex-col rounded-2xl border border-slate-200 bg-white p-4"
              >
                <header className="mb-2 flex items-center justify-between gap-2">
                  <span className="text-[12.5px] font-semibold text-slate-900">
                    {post.platformLabel}
                  </span>
                  <span
                    className={
                      "text-[10px] font-semibold " +
                      (post.truncated ? "text-amber-600" : "text-slate-400")
                    }
                  >
                    {post.charCount} chars
                    {post.truncated ? " · trimmed to fit" : ""}
                  </span>
                </header>

                <pre className="flex-1 whitespace-pre-wrap break-words rounded-lg border border-slate-100 bg-slate-50 p-3 font-sans text-[12px] leading-relaxed text-slate-700">
                  {post.caption}
                </pre>

                <footer className="mt-3 flex gap-2">
                  <button
                    onClick={() => copy(post)}
                    className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    {copied === post.platform ? (
                      <>
                        <Check className="h-3 w-3 text-emerald-600" /> Copied
                      </>
                    ) : (
                      <>
                        <ClipboardCopy className="h-3 w-3" /> Copy
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => onUseInGooglePost(post.caption)}
                    className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-[11px] font-semibold text-blue-700 hover:bg-blue-100"
                    title="Open the Google post composer prefilled with this text"
                  >
                    <Send className="h-3 w-3" /> Use as Google post
                  </button>
                </footer>
              </article>
            ))}
          </div>

          <p className="text-[11px] text-slate-500">
            Copy each caption into the platform you want to post on. Automatic
            publishing to social networks isn&apos;t connected — only Google
            Business Profile posts publish from here.
          </p>
        </>
      )}
    </div>
  );
}
