"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { businessApi } from "@/lib/api";
import { useApi } from "@/lib/api/useApi";
import { Field, Input, Select } from "@/components/dashboard/field";
import { EmptyState } from "@/components/dashboard/empty-state";
import { ConfirmDialog } from "@/components/dashboard/confirm-dialog";
import { Tag } from "lucide-react";

const TYPES = ["TEXT", "BOOLEAN", "NUMBER", "URL", "ENUM"] as const;

export function AttributesPanel() {
  const { data, loading, refresh } = useApi(
    () => businessApi.listAttributes(),
    [],
  );

  const [form, setForm] = useState({ key: "", value: "", type: "TEXT" });
  const [saving, setSaving] = useState(false);
  const [toDelete, setToDelete] = useState<{ id: string; key: string } | null>(
    null,
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await businessApi.setAttribute({
        key: form.key.trim(),
        value: form.value.trim(),
        type: form.type,
      });
      toast.success("Attribute saved");
      setForm({ key: "", value: "", type: "TEXT" });
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!toDelete) return;
    try {
      await businessApi.removeAttribute(toDelete.id);
      toast.success("Attribute removed");
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setToDelete(null);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1.6fr]">
      {/* Add attribute */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
        <h3 className="mb-3 text-sm font-semibold text-slate-900">
          Add attribute
        </h3>
        <form onSubmit={submit} className="space-y-3">
          <Field
            label="Key"
            hint="letters, digits, underscores"
            required
          >
            <Input
              value={form.key}
              onChange={(e) => setForm({ ...form, key: e.target.value })}
              placeholder="has_wifi"
              maxLength={100}
              required
              pattern="^[A-Za-z][A-Za-z0-9_]*$"
            />
          </Field>
          <Field label="Type">
            <Select
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value })}
            >
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Value" required>
            <Input
              value={form.value}
              onChange={(e) => setForm({ ...form, value: e.target.value })}
              placeholder={
                form.type === "BOOLEAN"
                  ? "true / false"
                  : form.type === "URL"
                    ? "https://…"
                    : ""
              }
              required
            />
          </Field>
          <button
            type="submit"
            disabled={saving || !form.key.trim() || !form.value.trim()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
          >
            <Plus className="h-3.5 w-3.5" />
            {saving ? "Saving…" : "Add / update"}
          </button>
        </form>
      </section>

      {/* List */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900">
            All attributes
          </h3>
          <span className="text-xs text-slate-500">
            {data?.total ?? 0} of 200
          </span>
        </div>
        {loading ? (
          <div className="text-xs text-slate-500">Loading…</div>
        ) : (data?.items.length ?? 0) === 0 ? (
          <EmptyState
            icon={Tag}
            title="No attributes yet"
            description="Add key/value flags like has_wifi = true, accepts_credit_cards = true."
          />
        ) : (
          <div className="divide-y divide-slate-100 rounded-xl border border-slate-100">
            {data!.items.map((a) => (
              <div
                key={a.id}
                className="flex items-center justify-between gap-3 px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-semibold text-slate-900">
                      {a.key}
                    </span>
                    <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-slate-600">
                      {a.type}
                    </span>
                  </div>
                  <div className="mt-0.5 truncate font-mono text-[11px] text-slate-500">
                    {a.value}
                  </div>
                </div>
                <button
                  onClick={() => setToDelete({ id: a.id, key: a.key })}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                  aria-label="Remove"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <ConfirmDialog
        open={!!toDelete}
        title={`Remove attribute ${toDelete?.key ?? ""}?`}
        description="This can be re-added later, but the current value will be lost."
        confirmLabel="Remove"
        destructive
        onConfirm={handleDelete}
        onCancel={() => setToDelete(null)}
      />
    </div>
  );
}
