"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { qrApi, locationsApi, type LocationDto } from "@/lib/api";
import { ApiClientError } from "@/lib/fetcher";
import { Field, Input, Select, Textarea } from "@/components/dashboard/field";

const TYPES = [
  { value: "GOOGLE_REVIEW", label: "Google Review" },
  { value: "WEBSITE", label: "Website" },
  { value: "WHATSAPP", label: "WhatsApp" },
  { value: "SOCIAL_MEDIA", label: "Social Media" },
  { value: "MENU", label: "Menu" },
  { value: "CUSTOM", label: "Custom URL" },
];

export function CreateQrDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [type, setType] = useState("GOOGLE_REVIEW");
  const [label, setLabel] = useState("");
  const [locationId, setLocationId] = useState("");
  const [targetUrl, setTargetUrl] = useState("");
  const [waNumber, setWaNumber] = useState("");
  const [waMessage, setWaMessage] = useState("");
  const [locations, setLocations] = useState<LocationDto[]>([]);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    setType("GOOGLE_REVIEW");
    setLabel("");
    setLocationId("");
    setTargetUrl("");
    setWaNumber("");
    setWaMessage("");
    setErrors({});
    locationsApi
      .list({ pageSize: 100, status: "ACTIVE", sortBy: "name", sortDir: "asc" })
      .then((r) => setLocations(r.items))
      .catch(() => setLocations([]));
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    try {
      await qrApi.create({
        type,
        label: label.trim(),
        locationId: locationId || undefined,
        targetUrl: targetUrl.trim() || undefined,
        whatsappNumber: waNumber || undefined,
        whatsappMessage: waMessage.trim() || undefined,
      });
      toast.success("QR code created");
      onCreated();
      onClose();
    } catch (err) {
      if (err instanceof ApiClientError) {
        setErrors(err.fields ?? {});
        toast.error(err.message);
      } else {
        toast.error("Create failed");
      }
    } finally {
      setSaving(false);
    }
  }

  const needsTarget = ["WEBSITE", "SOCIAL_MEDIA", "MENU", "CUSTOM"].includes(type);

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 backdrop-blur-sm sm:items-center">
      <div className="my-4 w-full max-w-lg rounded-2xl bg-white p-5">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Create QR code</h3>
            <p className="text-xs text-slate-500">
              Dynamic &amp; trackable — you can change the target later without
              reprinting.
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={submit} className="mt-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Type" required>
              <Select value={type} onChange={(e) => setType(e.target.value)}>
                {TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </Select>
            </Field>
            <Field label="Label" required error={errors.label}>
              <Input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Front desk QR"
                maxLength={150}
                required
              />
            </Field>
          </div>

          {(type === "GOOGLE_REVIEW" || locations.length > 0) && (
            <Field
              label="Location"
              required={type === "GOOGLE_REVIEW"}
              error={errors.locationId}
              hint={type === "GOOGLE_REVIEW" ? undefined : "optional"}
            >
              <Select value={locationId} onChange={(e) => setLocationId(e.target.value)}>
                <option value="">
                  {type === "GOOGLE_REVIEW" ? "Choose a location…" : "None"}
                </option>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name} · {l.city}
                  </option>
                ))}
              </Select>
            </Field>
          )}

          {needsTarget && (
            <Field label="Target URL" required error={errors.targetUrl}>
              <Input
                value={targetUrl}
                onChange={(e) => setTargetUrl(e.target.value)}
                placeholder="acme.com/menu"
                maxLength={2000}
              />
            </Field>
          )}

          {type === "WHATSAPP" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="WhatsApp number" required error={errors.whatsappNumber} hint="with country code">
                <Input
                  value={waNumber}
                  onChange={(e) => setWaNumber(e.target.value)}
                  placeholder="919876543210"
                  maxLength={20}
                />
              </Field>
              <Field label="Prefilled message" hint="optional">
                <Input
                  value={waMessage}
                  onChange={(e) => setWaMessage(e.target.value)}
                  placeholder="Hi! I'd like to book…"
                  maxLength={500}
                />
              </Field>
            </div>
          )}

          {type === "GOOGLE_REVIEW" && (
            <div className="rounded-lg border border-blue-100 bg-blue-50/60 p-2.5 text-[11px] text-slate-600">
              Points to the selected location&apos;s Google review page (or your
              AI review funnel if no Place ID is linked yet).
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !label.trim()}
              className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {saving ? "Creating…" : "Create QR"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
