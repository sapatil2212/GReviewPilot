"use client";

/**
 * Shared create/edit form for a Location.
 *
 * Renders every editable field on the LocationDto except working
 * hours + holidays + staff assignments — those live in their own sub-tabs
 * on the detail page (`/dashboard/locations/[id]`).
 */

import { useState } from "react";
import { Save } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { ApiClientError } from "@/lib/fetcher";
import { locationsApi, type LocationDto } from "@/lib/api";
import { Field, Input, Select } from "@/components/dashboard/field";

interface LocationFormProps {
  mode: "create" | "edit";
  initial?: LocationDto;
  onSaved?: (loc: LocationDto) => void;
}

const STATUS_OPTIONS: Array<LocationDto["status"]> = [
  "ACTIVE",
  "INACTIVE",
];

export function LocationForm({ mode, initial, onSaved }: LocationFormProps) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [form, setForm] = useState({
    name: initial?.name ?? "",
    slug: initial?.slug ?? "",
    storeCode: initial?.storeCode ?? "",
    addressLine1: initial?.addressLine1 ?? "",
    addressLine2: initial?.addressLine2 ?? "",
    city: initial?.city ?? "",
    state: initial?.state ?? "",
    postalCode: initial?.postalCode ?? "",
    country: initial?.country ?? "",
    latitude: initial?.latitude ?? "",
    longitude: initial?.longitude ?? "",
    phone: initial?.phone ?? "",
    email: initial?.email ?? "",
    website: initial?.website ?? "",
    timezone: initial?.timezone ?? "",
    googleLocationId: initial?.googleLocationId ?? "",
    googlePlaceId: initial?.googlePlaceId ?? "",
    status: initial?.status ?? "ACTIVE",
  });

  function up<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErrors({});

    const payload: Record<string, unknown> = {
      name: form.name.trim(),
      addressLine1: form.addressLine1.trim(),
      city: form.city.trim(),
      country: form.country.trim().toUpperCase(),
      ...(form.slug ? { slug: form.slug.trim().toLowerCase() } : {}),
      storeCode: emptyToUndef(form.storeCode),
      addressLine2: emptyToUndef(form.addressLine2),
      state: emptyToUndef(form.state),
      postalCode: emptyToUndef(form.postalCode),
      latitude: form.latitude ? Number(form.latitude) : undefined,
      longitude: form.longitude ? Number(form.longitude) : undefined,
      phone: emptyToUndef(form.phone),
      email: emptyToUndef(form.email),
      website: emptyToUndef(form.website),
      timezone: emptyToUndef(form.timezone),
      googleLocationId: emptyToUndef(form.googleLocationId),
      googlePlaceId: emptyToUndef(form.googlePlaceId),
    };

    try {
      const loc =
        mode === "create"
          ? await locationsApi.create(payload)
          : await locationsApi.update(initial!.id, payload);
      toast.success(mode === "create" ? "Location created" : "Location updated");
      if (onSaved) onSaved(loc);
      if (mode === "create") router.push(`/dashboard/locations/${loc.id}`);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setErrors(err.fields ?? {});
        toast.error(err.message);
      } else {
        toast.error("Save failed");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
        <h3 className="mb-3 text-sm font-semibold text-slate-900">Basics</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Location name" required error={errors.name}>
            <Input
              value={form.name}
              onChange={(e) => up("name", e.target.value)}
              maxLength={150}
              required
            />
          </Field>
          <Field label="Slug" hint="Optional, auto-generated" error={errors.slug}>
            <Input
              value={form.slug}
              onChange={(e) => up("slug", e.target.value)}
              placeholder="downtown-branch"
              maxLength={80}
            />
          </Field>
          <Field label="Store code" error={errors.storeCode}>
            <Input
              value={form.storeCode}
              onChange={(e) => up("storeCode", e.target.value)}
              maxLength={50}
            />
          </Field>
          <Field label="Timezone" error={errors.timezone}>
            <Input
              value={form.timezone}
              onChange={(e) => up("timezone", e.target.value)}
              placeholder="Asia/Kolkata"
              maxLength={60}
            />
          </Field>
          {mode === "edit" && (
            <Field label="Status">
              <Select
                value={form.status}
                onChange={(e) =>
                  up("status", e.target.value as LocationDto["status"])
                }
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            </Field>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
        <h3 className="mb-3 text-sm font-semibold text-slate-900">Address</h3>
        <div className="grid gap-4 sm:grid-cols-6">
          <Field className="sm:col-span-6" label="Line 1" required error={errors.addressLine1}>
            <Input
              value={form.addressLine1}
              onChange={(e) => up("addressLine1", e.target.value)}
              maxLength={200}
              required
            />
          </Field>
          <Field className="sm:col-span-6" label="Line 2" error={errors.addressLine2}>
            <Input
              value={form.addressLine2}
              onChange={(e) => up("addressLine2", e.target.value)}
              maxLength={200}
            />
          </Field>
          <Field className="sm:col-span-2" label="City" required error={errors.city}>
            <Input
              value={form.city}
              onChange={(e) => up("city", e.target.value)}
              maxLength={100}
              required
            />
          </Field>
          <Field className="sm:col-span-2" label="State" error={errors.state}>
            <Input
              value={form.state}
              onChange={(e) => up("state", e.target.value)}
              maxLength={100}
            />
          </Field>
          <Field className="sm:col-span-1" label="Postal" error={errors.postalCode}>
            <Input
              value={form.postalCode}
              onChange={(e) => up("postalCode", e.target.value)}
              maxLength={20}
            />
          </Field>
          <Field className="sm:col-span-1" label="Country" hint="ISO-2" required error={errors.country}>
            <Input
              value={form.country}
              onChange={(e) => up("country", e.target.value.toUpperCase())}
              maxLength={2}
              required
              placeholder="IN"
            />
          </Field>
          <Field className="sm:col-span-3" label="Latitude" error={errors.latitude}>
            <Input
              type="number"
              step="any"
              value={String(form.latitude ?? "")}
              onChange={(e) => up("latitude", e.target.value)}
              min={-90}
              max={90}
            />
          </Field>
          <Field className="sm:col-span-3" label="Longitude" error={errors.longitude}>
            <Input
              type="number"
              step="any"
              value={String(form.longitude ?? "")}
              onChange={(e) => up("longitude", e.target.value)}
              min={-180}
              max={180}
            />
          </Field>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
        <h3 className="mb-3 text-sm font-semibold text-slate-900">Contact</h3>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Phone" error={errors.phone}>
            <Input
              value={form.phone}
              onChange={(e) => up("phone", e.target.value)}
              maxLength={30}
            />
          </Field>
          <Field label="Email" error={errors.email}>
            <Input
              type="email"
              value={form.email}
              onChange={(e) => up("email", e.target.value)}
              maxLength={255}
            />
          </Field>
          <Field label="Website" error={errors.website}>
            <Input
              value={form.website}
              onChange={(e) => up("website", e.target.value)}
              maxLength={500}
              placeholder="branch.acme.com"
            />
          </Field>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
        <h3 className="mb-3 text-sm font-semibold text-slate-900">
          Google Business
        </h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Google Location ID" error={errors.googleLocationId}>
            <Input
              value={form.googleLocationId}
              onChange={(e) => up("googleLocationId", e.target.value)}
              placeholder="accounts/.../locations/..."
            />
          </Field>
          <Field label="Google Place ID" error={errors.googlePlaceId}>
            <Input
              value={form.googlePlaceId}
              onChange={(e) => up("googlePlaceId", e.target.value)}
            />
          </Field>
        </div>
      </section>

      <div className="sticky bottom-0 -mx-4 flex items-center justify-end gap-2 border-t border-slate-200 bg-white/90 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
        >
          <Save className="h-3.5 w-3.5" />
          {saving
            ? "Saving…"
            : mode === "create"
              ? "Create location"
              : "Save changes"}
        </button>
      </div>
    </form>
  );
}

function emptyToUndef(v: string | null | undefined): string | undefined {
  const t = (v ?? "").trim();
  return t.length > 0 ? t : undefined;
}
