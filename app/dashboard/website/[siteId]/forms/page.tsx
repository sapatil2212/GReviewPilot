"use client";

/**
 * Forms management.
 *
 * Editing a form's fields is deliberately non-destructive: removing a field
 * changes what future visitors are asked, but existing leads keep their stored
 * values (the inbox falls back to raw keys for fields the form no longer
 * declares). That is called out in the UI so the user is not afraid to edit.
 */

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  ArrowLeft,
  ChevronDown,
  Inbox,
  Loader2,
  Plus,
  Save,
  Trash2,
} from "lucide-react";
import { useApi } from "@/lib/api/useApi";
import { siteFormApi, type SiteFormDto, type SiteFormFieldDto } from "@/lib/api/site";
import { ApiClientError } from "@/lib/fetcher";
import { cn } from "@/lib/utils";

const FIELD_KINDS: Array<{ value: SiteFormFieldDto["kind"]; label: string }> = [
  { value: "TEXT", label: "Short text" },
  { value: "TEXTAREA", label: "Long text" },
  { value: "EMAIL", label: "Email" },
  { value: "PHONE", label: "Phone" },
  { value: "NUMBER", label: "Number" },
  { value: "DATE", label: "Date" },
  { value: "SELECT", label: "Dropdown" },
  { value: "CHECKBOX", label: "Checkbox" },
];

export default function FormsPage({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = use(params);
  const [creating, setCreating] = useState(false);
  const { data, loading, error, refresh } = useApi(() => siteFormApi.listForms(siteId), [siteId]);

  const forms = data ?? [];

  const createForm = async () => {
    setCreating(true);
    try {
      await siteFormApi.createForm(siteId, {
        name: "New form",
        fields: [{ key: "name", label: "Your name", kind: "TEXT", required: true }],
      });
      await refresh();
      toast.success("Form created");
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : "Could not create the form");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href="/dashboard/website"
            className="mb-2 inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-800"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to websites
          </Link>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">Forms</h1>
          <p className="mt-1 text-sm text-slate-500">
            Choose what you ask visitors, and who gets notified when they submit.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href={`/dashboard/website/${siteId}/leads`}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            <Inbox className="h-3.5 w-3.5" />
            View leads
          </Link>
          <button
            type="button"
            onClick={() => void createForm()}
            disabled={creating}
            className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
          >
            {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            New form
          </button>
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-16 text-sm text-slate-500">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Loading forms…
        </div>
      )}

      {error && !loading && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error.message}
        </div>
      )}

      {!loading && forms.length === 0 && (
        <p className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center text-sm text-slate-500">
          No forms yet. Create one, then point a Form block at it in the editor.
        </p>
      )}

      {forms.map((form) => (
        <FormCard
          key={form.id}
          siteId={siteId}
          form={form}
          canDelete={forms.length > 1}
          onChanged={refresh}
        />
      ))}
    </div>
  );
}

// =====================================================================
// Form card
// =====================================================================

function FormCard({
  siteId,
  form,
  canDelete,
  onChanged,
}: {
  siteId: string;
  form: SiteFormDto;
  canDelete: boolean;
  onChanged: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(form.name);
  const [fields, setFields] = useState<SiteFormFieldDto[]>(form.fields);
  const [notify, setNotify] = useState(form.notifyEmails.join(", "));
  const [successMessage, setSuccessMessage] = useState(form.successMessage ?? "");
  const [saving, setSaving] = useState(false);

  // Adopt server state when the list refreshes, so an edit elsewhere is not
  // overwritten by this card's stale local copy.
  useEffect(() => {
    setName(form.name);
    setFields(form.fields);
    setNotify(form.notifyEmails.join(", "));
    setSuccessMessage(form.successMessage ?? "");
  }, [form]);

  const dirty =
    name !== form.name ||
    successMessage !== (form.successMessage ?? "") ||
    notify !== form.notifyEmails.join(", ") ||
    JSON.stringify(fields) !== JSON.stringify(form.fields);

  const save = async () => {
    if (fields.length === 0) {
      toast.error("A form needs at least one field");
      return;
    }
    setSaving(true);
    try {
      await siteFormApi.updateForm(siteId, form.id, {
        name,
        fields,
        notifyEmails: notify
          .split(",")
          .map((e) => e.trim())
          .filter(Boolean),
        successMessage: successMessage.trim() || null,
      });
      await onChanged();
      toast.success("Form saved");
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : "Could not save the form");
    } finally {
      setSaving(false);
    }
  };

  const updateField = (index: number, patch: Partial<SiteFormFieldDto>) =>
    setFields((prev) => prev.map((f, i) => (i === index ? { ...f, ...patch } : f)));

  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 p-4 text-left"
      >
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-slate-400 transition-transform", !open && "-rotate-90")} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-slate-900">{form.name}</span>
          <span className="mt-0.5 block text-xs text-slate-500">
            {form.fields.length} field{form.fields.length === 1 ? "" : "s"} ·{" "}
            {form.submissionCount} submission{form.submissionCount === 1 ? "" : "s"}
            {form.notifyEmails.length === 0 && " · no notifications"}
          </span>
        </span>
        {form.unreadCount > 0 && (
          <span className="shrink-0 rounded-full bg-blue-600 px-2 py-0.5 text-[10px] font-semibold text-white">
            {form.unreadCount} new
          </span>
        )}
      </button>

      {open && (
        <div className="space-y-4 border-t border-slate-100 p-4">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-700">Form name</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
          </label>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-xs font-medium text-slate-700">Fields</span>
              <button
                type="button"
                onClick={() =>
                  setFields((prev) => [
                    ...prev,
                    {
                      // Suffixed so the key is unique without the user thinking
                      // about it; duplicate keys are rejected server-side.
                      key: `field_${prev.length + 1}`,
                      label: "New field",
                      kind: "TEXT",
                      required: false,
                    },
                  ])
                }
                className="text-xs font-medium text-blue-600 hover:text-blue-700"
              >
                + Add field
              </button>
            </div>

            <div className="space-y-2">
              {fields.map((field, index) => (
                <div key={index} className="rounded-lg border border-slate-200 p-2.5">
                  <div className="grid gap-2 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto]">
                    <label className="block">
                      <span className="mb-0.5 block text-[10px] uppercase tracking-wide text-slate-400">
                        Label
                      </span>
                      <input
                        type="text"
                        value={field.label}
                        onChange={(e) => updateField(index, { label: e.target.value })}
                        className="w-full rounded border border-slate-200 px-2 py-1.5 text-xs focus:border-blue-500 focus:outline-none"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-0.5 block text-[10px] uppercase tracking-wide text-slate-400">
                        Type
                      </span>
                      <select
                        value={field.kind}
                        onChange={(e) =>
                          updateField(index, { kind: e.target.value as SiteFormFieldDto["kind"] })
                        }
                        className="w-full rounded border border-slate-200 bg-white px-2 py-1.5 text-xs focus:border-blue-500 focus:outline-none"
                      >
                        {FIELD_KINDS.map((kind) => (
                          <option key={kind.value} value={kind.value}>
                            {kind.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="flex items-end gap-1 pb-0.5">
                      <label className="flex cursor-pointer items-center gap-1 whitespace-nowrap text-[11px] text-slate-600">
                        <input
                          type="checkbox"
                          checked={Boolean(field.required)}
                          onChange={(e) => updateField(index, { required: e.target.checked })}
                          className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600"
                        />
                        Required
                      </label>
                      <button
                        type="button"
                        aria-label={`Remove ${field.label}`}
                        onClick={() => setFields((prev) => prev.filter((_, i) => i !== index))}
                        className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  {field.kind === "SELECT" && (
                    <label className="mt-2 block">
                      <span className="mb-0.5 block text-[10px] uppercase tracking-wide text-slate-400">
                        Options (one per line)
                      </span>
                      <textarea
                        value={(field.options ?? []).join("\n")}
                        rows={3}
                        onChange={(e) =>
                          updateField(index, {
                            options: e.target.value
                              .split("\n")
                              .map((o) => o.trim())
                              .filter(Boolean),
                          })
                        }
                        className="w-full rounded border border-slate-200 px-2 py-1.5 text-xs focus:border-blue-500 focus:outline-none"
                      />
                    </label>
                  )}

                  <p className="mt-1.5 font-mono text-[10px] text-slate-400">key: {field.key}</p>
                </div>
              ))}
            </div>

            <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
              Removing a field only changes what future visitors are asked. Existing leads keep
              everything they submitted.
            </p>
          </div>

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-700">
              Notify these email addresses
            </span>
            <input
              type="text"
              value={notify}
              onChange={(e) => setNotify(e.target.value)}
              placeholder="you@business.com, manager@business.com"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
            <span className="mt-1 block text-[11px] text-slate-400">
              Comma separated. Leave empty to only collect leads in the dashboard.
            </span>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-700">
              Thank-you message
            </span>
            <textarea
              value={successMessage}
              rows={2}
              onChange={(e) => setSuccessMessage(e.target.value)}
              placeholder="Thank you. We have received your message and will be in touch shortly."
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
          </label>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving || !dirty}
              className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              {dirty ? "Save changes" : "Saved"}
            </button>

            {canDelete && (
              <button
                type="button"
                onClick={() => {
                  if (
                    !window.confirm(
                      `Delete "${form.name}"? Its ${form.submissionCount} existing lead(s) are kept.`,
                    )
                  ) {
                    return;
                  }
                  void siteFormApi
                    .deleteForm(siteId, form.id)
                    .then(onChanged)
                    .then(() => toast.success("Form deleted"))
                    .catch((err: unknown) =>
                      toast.error(
                        err instanceof ApiClientError ? err.message : "Could not delete the form",
                      ),
                    );
                }}
                className="ml-auto flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-2 text-xs font-medium text-slate-500 hover:bg-red-50 hover:text-red-600"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete form
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
