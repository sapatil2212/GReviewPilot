"use client";

/**
 * Create / edit dialog for a Google post. Supports all four post types
 * (What's New, Event, Offer, Alert), AI-drafted copy, media attachment
 * from the library, CTA config, and optional scheduling.
 */

import { useEffect, useState } from "react";
import Image from "next/image";
import { Loader2, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { Field, Input, Select, Textarea } from "@/components/dashboard/field";
import {
  mediaApi,
  postsApi,
  type GooglePostDto,
  type LocationDto,
  type MediaAssetDto,
  type PostCtaType,
  type PostType,
} from "@/lib/api";

const TYPES: { value: PostType; label: string; hint: string }[] = [
  { value: "STANDARD", label: "What's New", hint: "General update" },
  { value: "EVENT", label: "Event", hint: "Has start/end dates" },
  { value: "OFFER", label: "Offer", hint: "Coupon & terms" },
  { value: "ALERT", label: "Alert", hint: "Time-sensitive notice" },
];

const CTAS: PostCtaType[] = [
  "NONE",
  "BOOK",
  "ORDER",
  "SHOP",
  "LEARN_MORE",
  "SIGN_UP",
  "CALL",
];

const TONES = ["warm and professional", "friendly", "energetic", "formal"];

const MAX_BODY = 1400;

/** datetime-local <-> ISO helpers. */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function toIso(local: string): string | undefined {
  if (!local) return undefined;
  const d = new Date(local);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

export function PostComposer({
  post,
  locations,
  initialBody,
  onClose,
  onSaved,
}: {
  /** Existing post to edit, or null to create a new one. */
  post: GooglePostDto | null;
  locations: LocationDto[];
  /** Prefill for a new post (e.g. carried over from Social Studio). */
  initialBody?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const editing = !!post;

  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);

  const [type, setType] = useState<PostType>(post?.type ?? "STANDARD");
  const [locationId, setLocationId] = useState(post?.locationId ?? "");
  const [title, setTitle] = useState(post?.title ?? "");
  const [body, setBody] = useState(post?.body ?? initialBody ?? "");
  const [ctaType, setCtaType] = useState<PostCtaType>(post?.ctaType ?? "NONE");
  const [ctaUrl, setCtaUrl] = useState(post?.ctaUrl ?? "");
  const [mediaIds, setMediaIds] = useState<string[]>(post?.mediaIds ?? []);

  // Event / offer fields
  const [eventTitle, setEventTitle] = useState(post?.eventTitle ?? "");
  const [startDate, setStartDate] = useState(toLocalInput(post?.startDate ?? null));
  const [endDate, setEndDate] = useState(toLocalInput(post?.endDate ?? null));
  const [couponCode, setCouponCode] = useState(post?.couponCode ?? "");
  const [termsConditions, setTerms] = useState(post?.termsConditions ?? "");
  const [redeemOnlineUrl, setRedeem] = useState(post?.redeemOnlineUrl ?? "");

  const [scheduledAt, setScheduledAt] = useState(
    toLocalInput(post?.scheduledAt ?? null),
  );

  // AI prompt inputs
  const [topic, setTopic] = useState("");
  const [tone, setTone] = useState(TONES[0]!);

  // Media library (images only)
  const [library, setLibrary] = useState<MediaAssetDto[]>([]);
  useEffect(() => {
    mediaApi
      .list({ pageSize: 24, kind: "IMAGE", sortBy: "createdAt", sortDir: "desc" })
      .then((r) => setLibrary(r.items.filter((m) => m.status === "READY")))
      .catch(() => {});
  }, []);

  function toggleMedia(id: string) {
    setMediaIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id].slice(0, 10),
    );
  }

  async function runAi() {
    setGenerating(true);
    try {
      const draft = await postsApi.generate({
        locationId: locationId || undefined,
        type,
        topic: topic.trim() || undefined,
        tone,
      });
      setBody(draft.body);
      if (draft.title) setTitle(draft.title);
      setCtaType(draft.ctaType);
      toast.success(
        draft.source === "ai" ? "AI draft ready — review and edit" : "Draft ready",
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setGenerating(false);
    }
  }

  function buildPayload(): Record<string, unknown> {
    const payload: Record<string, unknown> = {
      type,
      body: body.trim(),
      ctaType,
      locationId: locationId || undefined,
      title: title.trim() || undefined,
      ctaUrl: ctaUrl.trim() || undefined,
      mediaIds: mediaIds.length > 0 ? mediaIds : undefined,
      scheduledAt: toIso(scheduledAt),
    };
    if (type === "EVENT" || type === "OFFER") {
      payload.eventTitle = eventTitle.trim() || undefined;
      payload.startDate = toIso(startDate);
      payload.endDate = toIso(endDate);
    }
    if (type === "OFFER") {
      payload.couponCode = couponCode.trim() || undefined;
      payload.termsConditions = termsConditions.trim() || undefined;
      payload.redeemOnlineUrl = redeemOnlineUrl.trim() || undefined;
    }
    return payload;
  }

  async function save() {
    if (!body.trim()) {
      toast.error("Post body is required");
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await postsApi.update(post!.id, buildPayload());
        toast.success("Post updated");
      } else {
        await postsApi.create(buildPayload());
        toast.success(scheduledAt ? "Post scheduled" : "Draft saved");
      }
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const isEvent = type === "EVENT" || type === "OFFER";

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 backdrop-blur-sm sm:items-center">
      <div className="my-4 flex max-h-[90vh] w-full max-w-3xl flex-col rounded-2xl border border-slate-200 bg-white p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-base font-semibold text-slate-900">
              {editing ? "Edit post" : "New Google post"}
            </div>
            <p className="mt-1 text-[13px] text-slate-500">
              Draft it yourself or let AI write the first version, then publish or
              schedule it.
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

        <div className="mt-4 flex-1 space-y-4 overflow-y-auto pr-1">
          {/* Type + location */}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Post type">
              <Select
                value={type}
                onChange={(e) => setType(e.target.value as PostType)}
              >
                {TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label} — {t.hint}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Location" hint="optional">
              <Select
                value={locationId}
                onChange={(e) => setLocationId(e.target.value)}
              >
                <option value="">All / unassigned</option>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name} · {l.city}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          {/* AI drafting */}
          <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-3">
            <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-blue-800">
              <Sparkles className="h-3.5 w-3.5" />
              Draft with AI
            </div>
            <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
              <Input
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="What's it about? e.g. new weekend hours"
                maxLength={300}
              />
              <Select value={tone} onChange={(e) => setTone(e.target.value)}>
                {TONES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </Select>
              <button
                onClick={runAi}
                disabled={generating}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {generating ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Writing…
                  </>
                ) : (
                  "Generate"
                )}
              </button>
            </div>
          </div>

          <Field label="Title" hint="optional headline">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Short headline"
              maxLength={300}
            />
          </Field>

          <Field
            label="Post body"
            hint={`${body.length}/${MAX_BODY}`}
            required
          >
            <Textarea
              rows={6}
              value={body}
              onChange={(e) => setBody(e.target.value.slice(0, MAX_BODY))}
              placeholder="What do you want customers to know?"
            />
          </Field>

          {/* Event / offer */}
          {isEvent && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Event title" className="sm:col-span-2">
                <Input
                  value={eventTitle}
                  onChange={(e) => setEventTitle(e.target.value)}
                  placeholder="Summer sale, Diwali special…"
                  maxLength={300}
                />
              </Field>
              <Field label="Starts">
                <Input
                  type="datetime-local"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </Field>
              <Field label="Ends">
                <Input
                  type="datetime-local"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </Field>
            </div>
          )}

          {type === "OFFER" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Coupon code" hint="optional">
                <Input
                  value={couponCode}
                  onChange={(e) => setCouponCode(e.target.value)}
                  placeholder="SAVE20"
                  maxLength={100}
                />
              </Field>
              <Field label="Redeem online URL" hint="optional">
                <Input
                  value={redeemOnlineUrl}
                  onChange={(e) => setRedeem(e.target.value)}
                  placeholder="https://…"
                  maxLength={1000}
                />
              </Field>
              <Field label="Terms & conditions" className="sm:col-span-2">
                <Textarea
                  rows={2}
                  value={termsConditions}
                  onChange={(e) => setTerms(e.target.value)}
                  placeholder="Valid until…, one per customer…"
                />
              </Field>
            </div>
          )}

          {/* CTA */}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Call to action">
              <Select
                value={ctaType}
                onChange={(e) => setCtaType(e.target.value as PostCtaType)}
              >
                {CTAS.map((c) => (
                  <option key={c} value={c}>
                    {c.replace(/_/g, " ")}
                  </option>
                ))}
              </Select>
            </Field>
            {ctaType !== "NONE" && (
              <Field label="CTA link">
                <Input
                  value={ctaUrl}
                  onChange={(e) => setCtaUrl(e.target.value)}
                  placeholder="https://…"
                  maxLength={1000}
                />
              </Field>
            )}
          </div>

          {/* Media */}
          <div>
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-700">
                Attach media
              </span>
              <span className="text-[11px] text-slate-400">
                {mediaIds.length} selected · max 10
              </span>
            </div>
            {library.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-200 p-3 text-[11px] text-slate-500">
                No images in your media library yet. Upload some from Media
                Library to attach them here.
              </div>
            ) : (
              <div className="flex gap-2 overflow-x-auto rounded-lg border border-slate-200 p-2">
                {library.map((m) => {
                  const selected = mediaIds.includes(m.id);
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => toggleMedia(m.id)}
                      className={
                        "relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border-2 transition " +
                        (selected
                          ? "border-blue-500 ring-2 ring-blue-500/20"
                          : "border-transparent hover:border-slate-300")
                      }
                      title={m.filename}
                    >
                      <Image
                        src={m.url}
                        alt={m.altText ?? m.filename}
                        fill
                        sizes="64px"
                        className="object-cover"
                        unoptimized
                      />
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Scheduling */}
          <Field
            label="Schedule for later"
            hint="leave empty to keep as draft"
          >
            <Input
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
            />
          </Field>
        </div>

        <div className="mt-4 flex justify-end gap-2 border-t border-slate-100 pt-4">
          <button
            onClick={onClose}
            disabled={saving}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving || !body.trim()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {saving ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…
              </>
            ) : editing ? (
              "Save changes"
            ) : scheduledAt ? (
              "Schedule post"
            ) : (
              "Save draft"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
