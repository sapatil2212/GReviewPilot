"use client";

/**
 * Holiday hours override editor.
 * List past/upcoming entries + form to add a new one for a specific date.
 */

import { CalendarClock, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { locationsApi } from "@/lib/api";
import { useApi } from "@/lib/api/useApi";
import { Field, Input, Textarea } from "@/components/dashboard/field";
import { EmptyState } from "@/components/dashboard/empty-state";

interface HolidaysPanelProps {
  locationId: string;
}

export function HolidaysPanel({ locationId }: HolidaysPanelProps) {
  const { data, loading, refresh } = useApi(
    () => locationsApi.listHolidays(locationId),
    [locationId],
  );

  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    date: today,
    isClosed: true,
    openTime: "09:00",
    closeTime: "18:00",
    note: "",
  });
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await locationsApi.setHoliday(locationId, {
        date: form.date,
        isClosed: form.isClosed,
        openTime: form.isClosed ? undefined : form.openTime,
        closeTime: form.isClosed ? undefined : form.closeTime,
        note: form.note || undefined,
      });
      toast.success("Holiday saved");
      setForm({ ...form, note: "" });
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    try {
      await locationsApi.removeHoliday(locationId, id);
      toast.success("Removed");
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1.5fr]">
      <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
        <h3 className="mb-3 text-sm font-semibold text-slate-900">
          Set holiday hours
        </h3>
        <form onSubmit={submit} className="space-y-3">
          <Field label="Date" required>
            <Input
              type="date"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
              required
            />
          </Field>
          <Field label="Status">
            <div className="flex gap-4 text-xs text-slate-700">
              <label className="inline-flex items-center gap-2">
                <input
                  type="radio"
                  checked={form.isClosed}
                  onChange={() => setForm({ ...form, isClosed: true })}
                />
                Closed
              </label>
              <label className="inline-flex items-center gap-2">
                <input
                  type="radio"
                  checked={!form.isClosed}
                  onChange={() => setForm({ ...form, isClosed: false })}
                />
                Special hours
              </label>
            </div>
          </Field>
          {!form.isClosed && (
            <div className="grid gap-2 sm:grid-cols-2">
              <Field label="Open" required>
                <Input
                  type="time"
                  value={form.openTime}
                  onChange={(e) =>
                    setForm({ ...form, openTime: e.target.value })
                  }
                  required
                />
              </Field>
              <Field label="Close" required>
                <Input
                  type="time"
                  value={form.closeTime}
                  onChange={(e) =>
                    setForm({ ...form, closeTime: e.target.value })
                  }
                  required
                />
              </Field>
            </div>
          )}
          <Field label="Note">
            <Textarea
              rows={2}
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
              placeholder="Optional"
              maxLength={255}
            />
          </Field>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
          >
            <Plus className="h-3.5 w-3.5" />
            {saving ? "Saving…" : "Save holiday"}
          </button>
        </form>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
        <h3 className="mb-3 text-sm font-semibold text-slate-900">
          Upcoming & past overrides
        </h3>
        {loading ? (
          <div className="text-xs text-slate-500">Loading…</div>
        ) : (data?.items.length ?? 0) === 0 ? (
          <EmptyState
            icon={CalendarClock}
            title="No holidays set"
            description="Add closures for public holidays or special events."
          />
        ) : (
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-100">
            {data!.items.map((h) => (
              <li
                key={h.id}
                className="flex items-center justify-between gap-3 px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="font-semibold text-slate-900">
                      {new Date(h.date).toLocaleDateString(undefined, {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                    {h.isClosed ? (
                      <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">
                        Closed
                      </span>
                    ) : (
                      <span className="rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700">
                        {h.openTime}–{h.closeTime}
                      </span>
                    )}
                  </div>
                  {h.note && (
                    <div className="mt-0.5 truncate text-[11px] text-slate-500">
                      {h.note}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => remove(h.id)}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                  aria-label="Remove"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
