"use client";

/**
 * Quick Connect tab — attach a Google Place ID (via Maps URL or raw ID)
 * without OAuth. Enables the AI review funnel for any business.
 */

import { useState } from "react";
import { toast } from "sonner";
import {
  CheckCircle2,
  ExternalLink,
  Loader2,
  MapPin,
  Search,
  Sparkles,
  Star,
} from "lucide-react";
import { Field, Input, Select, Textarea } from "@/components/dashboard/field";
import { useApi } from "@/lib/api/useApi";
import {
  googleApi,
  locationsApi,
  type ResolvedPlaceDto,
} from "@/lib/api";

export function QuickConnectTab() {
  const [input, setInput] = useState("");
  const [preview, setPreview] = useState<ResolvedPlaceDto | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [mode, setMode] = useState<"new" | "existing">("new");
  const [locationId, setLocationId] = useState("");
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("IN");

  // AI review context
  const [gmbUrl, setGmbUrl] = useState("");
  const [businessType, setBusinessType] = useState("");
  const [description, setDescription] = useState("");
  const [highlightsText, setHighlightsText] = useState("");
  const [keywordsText, setKeywordsText] = useState("");
  const [tone, setTone] = useState("warm");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<{ locationSlug: string } | null>(null);

  const locations = useApi(
    () => locationsApi.list({ pageSize: 100, status: "ACTIVE", sortBy: "name", sortDir: "asc" }),
    [],
  );
  const session = useApi(async () => {
    const { apiFetch } = await import("@/lib/fetcher");
    const r = await apiFetch<{ tenant: { slug: string } | null }>("/api/auth/me");
    return r.data;
  }, []);

  async function handlePreview() {
    if (!input.trim()) return;
    setPreviewing(true);
    setPreview(null);
    try {
      const resolved = await googleApi.previewPlace(input.trim());
      setPreview(resolved);
      if (resolved.name) setName(resolved.name);
      if (resolved.city) setCity(resolved.city);
      toast.success(
        resolved.verified
          ? "Place verified"
          : "Place ID extracted (not verified — no Places API key)",
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not resolve");
    } finally {
      setPreviewing(false);
    }
  }

  async function handleConnect() {
    if (!preview) return;
    setSaving(true);
    try {
      const toList = (s: string) =>
        s
          .split(/[,\n]/)
          .map((x) => x.trim())
          .filter(Boolean)
          .slice(0, 15);

      const result = await googleApi.quickConnect({
        input: input.trim(),
        mode,
        locationId: mode === "existing" ? locationId || undefined : undefined,
        name: name || undefined,
        city: city || undefined,
        country: country || undefined,
        gmbProfileUrl: gmbUrl || undefined,
        businessType: businessType || undefined,
        description: description || undefined,
        highlights: highlightsText ? toList(highlightsText) : undefined,
        keywords: keywordsText ? toList(keywordsText) : undefined,
        tone,
      });
      toast.success("Connected — review funnel is live for this location");
      setDone({ locationSlug: result.location.slug });
      await locations.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Connect failed");
    } finally {
      setSaving(false);
    }
  }

  const tenantSlug = session.data?.tenant?.slug;
  const funnelLink =
    done && tenantSlug
      ? `${window.location.origin}/review/${tenantSlug}/${done.locationSlug}`
      : null;

  return (
    <div className="space-y-4">
      {/* Step 1 — input */}
      <div className="rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-50/60 to-white p-5">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-[11px] font-bold text-white">
            1
          </span>
          <h3 className="text-sm font-bold text-slate-900">
            Paste a Google Maps link or Place ID
          </h3>
        </div>
        <p className="mt-1.5 pl-8 text-xs text-slate-500">
          No Google account access needed. We&apos;ll resolve the business and
          wire up your AI review funnel instantly.
        </p>

        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handlePreview();
              }}
              placeholder="https://maps.app.goo.gl/…  or  ChIJ…"
              className="pl-9 py-2.5"
            />
          </div>
          <button
            onClick={handlePreview}
            disabled={previewing || !input.trim()}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-5 py-2.5 text-xs font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60"
          >
            {previewing ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Resolving…
              </>
            ) : (
              <>
                <Search className="h-3.5 w-3.5" /> Resolve
              </>
            )}
          </button>
        </div>

        <div className="mt-3 flex items-start gap-2 rounded-lg border border-slate-200 bg-white p-2.5 text-[11px] text-slate-600">
          <span className="text-base leading-none">💡</span>
          <span>
            Don&apos;t have the Place ID? Open the{" "}
            <a
              href="https://developers.google.com/maps/documentation/places/web-service/place-id"
              target="_blank"
              rel="noopener"
              className="font-semibold text-blue-600 underline"
            >
              Google Place ID Finder
            </a>
            , search the business on the map, then copy the Place ID it shows
            and paste it above.
          </span>
        </div>
      </div>

      {/* Step 2 — Resolved preview + confirm */}
      {preview && !done && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="mb-3 flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-[11px] font-bold text-white">
              2
            </span>
            <h3 className="text-sm font-bold text-slate-900">
              Confirm the business
            </h3>
          </div>
          <div className="mb-3 flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 text-blue-700">
              <MapPin className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-slate-900">
                  {preview.name ?? (name || "Place ID captured")}
                </span>
                {preview.verified ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                    <CheckCircle2 className="h-3 w-3" /> Verified
                  </span>
                ) : (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                    Manual entry
                  </span>
                )}
              </div>
              {preview.formattedAddress && (
                <div className="text-xs text-slate-500">
                  {preview.formattedAddress}
                </div>
              )}
              {preview.rating != null && (
                <div className="mt-0.5 flex items-center gap-1 text-xs text-amber-600">
                  <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                  {preview.rating} ({preview.userRatingsTotal ?? 0} reviews)
                </div>
              )}
              <div className="mt-1 break-all font-mono text-[10px] text-slate-400">
                {preview.placeId}
              </div>
            </div>
          </div>

          {!preview.verified && (
            <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-[11px] text-amber-800">
              <span className="text-sm leading-none">ℹ️</span>
              <span>
                We captured the Place ID but couldn&apos;t auto-fetch the
                business name (Places API not configured). Just type the
                business name below and you&apos;re good to go — the review
                funnel works exactly the same. To auto-fill details, add{" "}
                <code className="rounded bg-amber-100 px-1">
                  GOOGLE_MAPS_API_KEY
                </code>{" "}
                and enable the Places API.
              </span>
            </div>
          )}

          {/* Attach options */}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Attach to">
              <Select value={mode} onChange={(e) => setMode(e.target.value as "new" | "existing")}>
                <option value="new">Create a new location</option>
                <option value="existing">An existing location</option>
              </Select>
            </Field>
            {mode === "existing" ? (
              <Field label="Location">
                <Select
                  value={locationId}
                  onChange={(e) => setLocationId(e.target.value)}
                >
                  <option value="">Choose…</option>
                  {locations.data?.items.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name} · {l.city}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : (
              <Field
                label="Business / location name"
                required
                error={
                  !name.trim() ? "Required to create the location" : undefined
                }
              >
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Sharma Sweets, Andheri"
                  maxLength={150}
                  invalid={!name.trim()}
                />
              </Field>
            )}
            {mode === "new" && (
              <>
                <Field label="City">
                  <Input
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="e.g. Mumbai"
                    maxLength={100}
                  />
                </Field>
                <Field label="Country" hint="ISO-2">
                  <Input
                    value={country}
                    onChange={(e) => setCountry(e.target.value.toUpperCase())}
                    maxLength={2}
                    placeholder="IN"
                  />
                </Field>
              </>
            )}
          </div>

          {/* AI review context */}
          <div className="mt-5 rounded-xl border border-blue-100 bg-blue-50/40 p-4">
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900">
              <Sparkles className="h-3.5 w-3.5 text-blue-600" />
              Teach the AI about this business
            </div>
            <p className="mt-1 text-[11px] text-slate-500">
              The more you add, the more specific and SEO-rich the generated
              reviews become. All optional — our AI fills gaps based on the
              business type.
            </p>

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Field label="Business type" hint="e.g. Multi-specialty Hospital">
                <Input
                  value={businessType}
                  onChange={(e) => setBusinessType(e.target.value)}
                  placeholder="Multi-specialty Hospital"
                  maxLength={150}
                />
              </Field>
              <Field label="Review tone">
                <Select value={tone} onChange={(e) => setTone(e.target.value)}>
                  <option value="warm">Warm</option>
                  <option value="professional">Professional</option>
                  <option value="casual">Casual</option>
                  <option value="enthusiastic">Enthusiastic</option>
                </Select>
              </Field>
              <Field
                className="sm:col-span-2"
                label="GMB / Google Maps profile link"
                hint="for your reference"
              >
                <Input
                  value={gmbUrl}
                  onChange={(e) => setGmbUrl(e.target.value)}
                  placeholder="https://maps.app.goo.gl/…"
                  maxLength={1000}
                />
              </Field>
              <Field className="sm:col-span-2" label="Short description">
                <Textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="e.g. 24x7 multi-specialty hospital in Pune known for cardiology and emergency care."
                  maxLength={2000}
                />
              </Field>
              <Field
                className="sm:col-span-2"
                label="Highlights"
                hint="comma separated"
              >
                <Input
                  value={highlightsText}
                  onChange={(e) => setHighlightsText(e.target.value)}
                  placeholder="cleanliness, expert doctors, short wait times, caring staff"
                />
              </Field>
              <Field
                className="sm:col-span-2"
                label="SEO keywords"
                hint="comma separated"
              >
                <Input
                  value={keywordsText}
                  onChange={(e) => setKeywordsText(e.target.value)}
                  placeholder="best hospital in Pune, emergency care, cardiology"
                />
              </Field>
            </div>
          </div>

          <button
            onClick={handleConnect}
            disabled={
              saving ||
              (mode === "existing" && !locationId) ||
              (mode === "new" && !name.trim())
            }
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {saving ? "Connecting…" : "Connect & enable review funnel"}
          </button>
        </div>
      )}

      {/* Success */}
      {done && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
          <div className="flex items-center gap-2 text-sm font-semibold text-emerald-800">
            <CheckCircle2 className="h-5 w-5" />
            Connected! Your AI review funnel is live.
          </div>
          {funnelLink && (
            <div className="mt-3">
              <div className="text-xs font-semibold text-slate-700">
                Share this link with customers:
              </div>
              <div className="mt-1 flex items-center gap-2">
                <code className="flex-1 break-all rounded-lg border border-emerald-200 bg-white px-3 py-2 text-[11px] text-slate-700">
                  {funnelLink}
                </code>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(funnelLink);
                    toast.success("Copied");
                  }}
                  className="rounded-lg border border-emerald-200 bg-white px-3 py-2 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-100"
                >
                  Copy
                </button>
                <a
                  href={funnelLink}
                  target="_blank"
                  rel="noopener"
                  className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-white px-3 py-2 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-100"
                >
                  <ExternalLink className="h-3 w-3" /> Preview
                </a>
              </div>
            </div>
          )}
          <button
            onClick={() => {
              setDone(null);
              setPreview(null);
              setInput("");
            }}
            className="mt-3 text-xs font-semibold text-emerald-700 underline"
          >
            Connect another
          </button>
        </div>
      )}
    </div>
  );
}
