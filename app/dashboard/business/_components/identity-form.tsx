"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Save } from "lucide-react";
import { ApiClientError } from "@/lib/fetcher";
import { businessApi, type BusinessProfileDto } from "@/lib/api";
import { Field, Input, Textarea, Select } from "@/components/dashboard/field";
import { LogoUploader } from "@/components/dashboard/logo-uploader";

interface IdentityFormProps {
  initial: BusinessProfileDto;
  onUpdated: () => void;
}

const EMPLOYEE_COUNTS = [
  "",
  "1-10",
  "11-50",
  "51-200",
  "201-500",
  "501-1000",
  "1000+",
];

export function IdentityForm({ initial, onUpdated }: IdentityFormProps) {
  const t = initial.tenant;
  const p = initial.profile;

  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [logoMediaId, setLogoMediaId] = useState<string | null>(t?.logo ?? null);
  const [coverMediaId, setCoverMediaId] = useState<string | null>(p.coverImage);

  const [form, setForm] = useState({
    name: t?.name ?? "",
    legalName: p.legalName ?? "",
    description: p.description ?? "",
    shortDescription: p.shortDescription ?? "",
    businessEmail: t?.businessEmail ?? "",
    phone: t?.phone ?? "",
    website: t?.website ?? "",
    industry: t?.industry ?? "",
    businessType: t?.businessType ?? "",
    employeeCount: t?.employeeCount ?? "",
    foundedYear: p.foundedYear ?? "",
    registrationNumber: p.registrationNumber ?? "",
    gstNumber: p.gstNumber ?? "",
    taxNumber: p.taxNumber ?? "",
  });

  const address = (t?.address ?? {}) as Record<string, string | undefined>;
  const [addr, setAddr] = useState({
    line1: address.line1 ?? "",
    line2: address.line2 ?? "",
    city: address.city ?? "",
    state: address.state ?? "",
    postalCode: address.postalCode ?? "",
    country: address.country ?? "",
  });

  const social = (t?.socialLinks ?? {}) as Record<string, string | undefined>;
  const [sl, setSl] = useState({
    linkedin: social.linkedin ?? "",
    twitter: social.twitter ?? "",
    facebook: social.facebook ?? "",
    instagram: social.instagram ?? "",
    youtube: social.youtube ?? "",
    whatsapp: social.whatsapp ?? "",
  });

  function updateForm<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErrors({});

    const payload: Record<string, unknown> = {
      legalName: form.legalName || undefined,
      description: form.description || undefined,
      shortDescription: form.shortDescription || undefined,
      foundedYear: form.foundedYear ? Number(form.foundedYear) : undefined,
      registrationNumber: form.registrationNumber || undefined,
      gstNumber: form.gstNumber || undefined,
      taxNumber: form.taxNumber || undefined,
      tenant: {
        name: form.name || undefined,
        businessEmail: form.businessEmail || undefined,
        phone: form.phone || undefined,
        website: form.website || undefined,
        industry: form.industry || undefined,
        businessType: form.businessType || undefined,
        employeeCount: form.employeeCount || undefined,
        address: hasAny(addr) ? addr : undefined,
        socialLinks: hasAny(sl) ? sl : undefined,
      },
    };

    try {
      await businessApi.update(payload);
      toast.success("Business profile saved");
      onUpdated();
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
    <form onSubmit={submit} className="space-y-6">
      {/* Branding row */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
        <div className="mb-3">
          <h3 className="text-sm font-semibold text-slate-900">Branding</h3>
          <p className="text-xs text-slate-500">
            Uploads are attached automatically. No extra save required.
          </p>
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <div className="mb-2 text-xs font-semibold text-slate-700">Logo</div>
            <LogoUploader
              value={logoMediaId}
              category="LOGO"
              attachTo="tenantLogo"
              onUploaded={(id) => {
                setLogoMediaId(id);
                onUpdated();
              }}
            />
          </div>
          <div>
            <div className="mb-2 text-xs font-semibold text-slate-700">
              Cover image
            </div>
            <LogoUploader
              value={coverMediaId}
              category="COVER"
              attachTo="profileCover"
              aspect="banner"
              height={96}
              onUploaded={(id) => {
                setCoverMediaId(id);
                onUpdated();
              }}
            />
          </div>
        </div>
      </section>

      {/* Identity */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
        <h3 className="mb-3 text-sm font-semibold text-slate-900">Identity</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Business name" required error={errors["tenant.name"]}>
            <Input
              value={form.name}
              onChange={(e) => updateForm("name", e.target.value)}
              maxLength={150}
            />
          </Field>
          <Field label="Legal name" error={errors.legalName}>
            <Input
              value={form.legalName}
              onChange={(e) => updateForm("legalName", e.target.value)}
              maxLength={200}
            />
          </Field>
          <Field
            className="sm:col-span-2"
            label="Short description"
            hint={`${form.shortDescription.length}/500`}
            error={errors.shortDescription}
          >
            <Textarea
              rows={2}
              value={form.shortDescription}
              onChange={(e) => updateForm("shortDescription", e.target.value)}
              maxLength={500}
              placeholder="One-line hook customers see on your profile"
            />
          </Field>
          <Field
            className="sm:col-span-2"
            label="Description"
            hint={`${form.description.length}/5000`}
            error={errors.description}
          >
            <Textarea
              rows={5}
              value={form.description}
              onChange={(e) => updateForm("description", e.target.value)}
              maxLength={5000}
              placeholder="Tell customers what makes your business great"
            />
          </Field>
        </div>
      </section>

      {/* Contact */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
        <h3 className="mb-3 text-sm font-semibold text-slate-900">Contact</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Business email" error={errors["tenant.businessEmail"]}>
            <Input
              type="email"
              value={form.businessEmail}
              onChange={(e) => updateForm("businessEmail", e.target.value)}
              maxLength={255}
            />
          </Field>
          <Field label="Phone" error={errors["tenant.phone"]}>
            <Input
              value={form.phone}
              onChange={(e) => updateForm("phone", e.target.value)}
              maxLength={30}
            />
          </Field>
          <Field
            className="sm:col-span-2"
            label="Website"
            error={errors["tenant.website"]}
          >
            <Input
              value={form.website}
              onChange={(e) => updateForm("website", e.target.value)}
              placeholder="acme.com"
              maxLength={500}
            />
          </Field>
        </div>
      </section>

      {/* Business categorization */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
        <h3 className="mb-3 text-sm font-semibold text-slate-900">
          Business details
        </h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Industry" error={errors["tenant.industry"]}>
            <Input
              value={form.industry}
              onChange={(e) => updateForm("industry", e.target.value)}
              placeholder="e.g. Healthcare"
              maxLength={100}
            />
          </Field>
          <Field label="Business type" error={errors["tenant.businessType"]}>
            <Input
              value={form.businessType}
              onChange={(e) => updateForm("businessType", e.target.value)}
              placeholder="e.g. Private Limited"
              maxLength={100}
            />
          </Field>
          <Field label="Team size" error={errors["tenant.employeeCount"]}>
            <Select
              value={form.employeeCount}
              onChange={(e) => updateForm("employeeCount", e.target.value)}
            >
              {EMPLOYEE_COUNTS.map((c) => (
                <option key={c} value={c}>
                  {c === "" ? "Select a range" : c}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Founded year" error={errors.foundedYear}>
            <Input
              type="number"
              value={form.foundedYear}
              onChange={(e) => updateForm("foundedYear", e.target.value)}
              min={1800}
              max={new Date().getFullYear()}
            />
          </Field>
        </div>
      </section>

      {/* Legal */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
        <h3 className="mb-3 text-sm font-semibold text-slate-900">
          Legal & tax
        </h3>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Registration #" error={errors.registrationNumber}>
            <Input
              value={form.registrationNumber}
              onChange={(e) => updateForm("registrationNumber", e.target.value)}
              maxLength={100}
            />
          </Field>
          <Field label="GST #" error={errors.gstNumber}>
            <Input
              value={form.gstNumber}
              onChange={(e) => updateForm("gstNumber", e.target.value)}
              maxLength={100}
            />
          </Field>
          <Field label="Tax #" error={errors.taxNumber}>
            <Input
              value={form.taxNumber}
              onChange={(e) => updateForm("taxNumber", e.target.value)}
              maxLength={100}
            />
          </Field>
        </div>
      </section>

      {/* Address */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
        <h3 className="mb-3 text-sm font-semibold text-slate-900">Address</h3>
        <div className="grid gap-4 sm:grid-cols-6">
          <Field className="sm:col-span-6" label="Line 1">
            <Input
              value={addr.line1}
              onChange={(e) => setAddr({ ...addr, line1: e.target.value })}
              maxLength={200}
            />
          </Field>
          <Field className="sm:col-span-6" label="Line 2">
            <Input
              value={addr.line2}
              onChange={(e) => setAddr({ ...addr, line2: e.target.value })}
              maxLength={200}
            />
          </Field>
          <Field className="sm:col-span-2" label="City">
            <Input
              value={addr.city}
              onChange={(e) => setAddr({ ...addr, city: e.target.value })}
              maxLength={100}
            />
          </Field>
          <Field className="sm:col-span-2" label="State">
            <Input
              value={addr.state}
              onChange={(e) => setAddr({ ...addr, state: e.target.value })}
              maxLength={100}
            />
          </Field>
          <Field className="sm:col-span-1" label="Postal">
            <Input
              value={addr.postalCode}
              onChange={(e) =>
                setAddr({ ...addr, postalCode: e.target.value })
              }
              maxLength={20}
            />
          </Field>
          <Field className="sm:col-span-1" label="Country" hint="ISO-2">
            <Input
              value={addr.country}
              onChange={(e) =>
                setAddr({ ...addr, country: e.target.value.toUpperCase() })
              }
              maxLength={2}
              placeholder="IN"
            />
          </Field>
        </div>
      </section>

      {/* Social */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
        <h3 className="mb-3 text-sm font-semibold text-slate-900">Social</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          {(
            [
              "linkedin",
              "twitter",
              "facebook",
              "instagram",
              "youtube",
              "whatsapp",
            ] as const
          ).map((k) => (
            <Field
              key={k}
              label={k[0]!.toUpperCase() + k.slice(1)}
            >
              <Input
                value={sl[k]}
                onChange={(e) => setSl({ ...sl, [k]: e.target.value })}
                placeholder="https://…"
                maxLength={500}
              />
            </Field>
          ))}
        </div>
      </section>

      <div className="sticky bottom-0 -mx-4 flex items-center justify-end gap-2 border-t border-slate-200 bg-white/90 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
        >
          <Save className="h-3.5 w-3.5" />
          {saving ? "Saving…" : "Save changes"}
        </button>
      </div>
    </form>
  );
}

function hasAny(o: Record<string, string>): boolean {
  return Object.values(o).some((v) => v && v.length > 0);
}
