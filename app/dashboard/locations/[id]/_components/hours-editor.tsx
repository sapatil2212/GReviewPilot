"use client";

/**
 * Weekly working-hours editor.
 *
 * Each day supports up to 3 open/close ranges. Ranges are validated
 * client-side (open < close) before send. Backend re-validates.
 */

import { useState } from "react";
import { Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Field, Input } from "@/components/dashboard/field";
import { locationsApi, type DayKey, type WorkingHours } from "@/lib/api";

const DAYS: DayKey[] = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

const DEFAULT: WorkingHours = DAYS.reduce((acc, d) => {
  acc[d] = { isOpen: d !== "saturday" && d !== "sunday", ranges: [] };
  if (acc[d].isOpen) acc[d].ranges = [{ open: "09:00", close: "18:00" }];
  return acc;
}, {} as WorkingHours);

interface HoursEditorProps {
  locationId: string;
  initial: WorkingHours | null;
  onSaved?: (next: WorkingHours) => void;
}

export function HoursEditor({ locationId, initial, onSaved }: HoursEditorProps) {
  const [hours, setHours] = useState<WorkingHours>(() =>
    initial ? mergeWithDefault(initial) : DEFAULT,
  );
  const [saving, setSaving] = useState(false);

  function setDay(day: DayKey, next: WorkingHours[DayKey]) {
    setHours((h) => ({ ...h, [day]: next }));
  }

  async function save() {
    // Client-side validation.
    for (const day of DAYS) {
      const cfg = hours[day];
      if (!cfg.isOpen) continue;
      for (const r of cfg.ranges) {
        if (!r.open || !r.close || r.open >= r.close) {
          toast.error(`${day} has an invalid range (${r.open}–${r.close})`);
          return;
        }
      }
    }
    setSaving(true);
    try {
      const updated = await locationsApi.updateHours(locationId, hours);
      toast.success("Working hours saved");
      if (onSaved) onSaved(updated.workingHours ?? hours);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
        <div className="space-y-2.5">
          {DAYS.map((day) => {
            const cfg = hours[day];
            return (
              <div
                key={day}
                className="flex flex-col gap-2 rounded-xl border border-slate-100 p-3 sm:flex-row sm:items-start sm:gap-4"
              >
                <div className="flex w-full items-center justify-between sm:w-40 sm:justify-start sm:gap-3">
                  <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-800">
                    <input
                      type="checkbox"
                      checked={cfg.isOpen}
                      onChange={(e) =>
                        setDay(day, {
                          isOpen: e.target.checked,
                          ranges: e.target.checked
                            ? cfg.ranges.length > 0
                              ? cfg.ranges
                              : [{ open: "09:00", close: "18:00" }]
                            : [],
                        })
                      }
                      className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="capitalize">{day}</span>
                  </label>
                </div>

                <div className="flex-1 space-y-2">
                  {!cfg.isOpen && (
                    <div className="text-xs italic text-slate-400">Closed</div>
                  )}
                  {cfg.isOpen &&
                    cfg.ranges.map((r, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <Input
                          type="time"
                          value={r.open}
                          onChange={(e) => {
                            const ranges = [...cfg.ranges];
                            ranges[i] = { ...ranges[i]!, open: e.target.value };
                            setDay(day, { ...cfg, ranges });
                          }}
                          className="w-32"
                        />
                        <span className="text-xs text-slate-400">to</span>
                        <Input
                          type="time"
                          value={r.close}
                          onChange={(e) => {
                            const ranges = [...cfg.ranges];
                            ranges[i] = { ...ranges[i]!, close: e.target.value };
                            setDay(day, { ...cfg, ranges });
                          }}
                          className="w-32"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const ranges = cfg.ranges.filter((_, j) => j !== i);
                            setDay(day, { ...cfg, ranges });
                          }}
                          className="rounded-lg p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                          aria-label="Remove range"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  {cfg.isOpen && cfg.ranges.length < 3 && (
                    <button
                      type="button"
                      onClick={() =>
                        setDay(day, {
                          ...cfg,
                          ranges: [
                            ...cfg.ranges,
                            { open: "09:00", close: "18:00" },
                          ],
                        })
                      }
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:text-blue-700"
                    >
                      <Plus className="h-3 w-3" />
                      Add another range
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="flex justify-end">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
        >
          <Save className="h-3.5 w-3.5" />
          {saving ? "Saving…" : "Save hours"}
        </button>
      </div>
    </div>
  );
}

function mergeWithDefault(h: WorkingHours): WorkingHours {
  const out = { ...DEFAULT };
  for (const d of DAYS) {
    if (h[d]) out[d] = h[d];
  }
  return out;
}
