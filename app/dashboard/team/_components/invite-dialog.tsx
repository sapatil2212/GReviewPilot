"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { teamApi, locationsApi, type LocationDto } from "@/lib/api";
import { ApiClientError } from "@/lib/fetcher";
import { Field, Input, Select, Textarea } from "@/components/dashboard/field";

const ROLES = ["ADMIN", "MANAGER", "STAFF", "VIEWER"] as const;

interface InviteDialogProps {
  open: boolean;
  onClose: () => void;
  onInvited: () => void;
}

export function InviteDialog({ open, onClose, onInvited }: InviteDialogProps) {
  const [form, setForm] = useState({
    email: "",
    firstName: "",
    lastName: "",
    role: "STAFF",
    message: "",
    locationIds: [] as string[],
  });
  const [locations, setLocations] = useState<LocationDto[]>([]);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    setForm({
      email: "",
      firstName: "",
      lastName: "",
      role: "STAFF",
      message: "",
      locationIds: [],
    });
    setErrors({});
    locationsApi
      .list({ pageSize: 100, status: "ACTIVE" })
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
      await teamApi.invite({
        email: form.email.trim(),
        firstName: form.firstName.trim() || undefined,
        lastName: form.lastName.trim() || undefined,
        role: form.role,
        message: form.message.trim() || undefined,
        locationIds: form.locationIds.length ? form.locationIds : undefined,
      });
      toast.success("Invitation sent");
      onInvited();
      onClose();
    } catch (err) {
      if (err instanceof ApiClientError) {
        setErrors(err.fields ?? {});
        toast.error(err.message);
      } else {
        toast.error("Send failed");
      }
    } finally {
      setSaving(false);
    }
  }

  function toggleLocation(id: string) {
    setForm((f) =>
      f.locationIds.includes(id)
        ? { ...f, locationIds: f.locationIds.filter((x) => x !== id) }
        : { ...f, locationIds: [...f.locationIds, id] },
    );
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 backdrop-blur-sm sm:items-center">
      <div className="w-full max-w-lg rounded-2xl bg-white p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">
              Invite a team member
            </h3>
            <p className="text-xs text-slate-500">
              They&apos;ll receive an email with a link to set their password and join.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={submit} className="mt-4 space-y-3">
          <Field label="Email" required error={errors.email}>
            <Input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
              maxLength={255}
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="First name" error={errors.firstName}>
              <Input
                value={form.firstName}
                onChange={(e) =>
                  setForm({ ...form, firstName: e.target.value })
                }
                maxLength={100}
              />
            </Field>
            <Field label="Last name" error={errors.lastName}>
              <Input
                value={form.lastName}
                onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                maxLength={100}
              />
            </Field>
          </div>
          <Field label="Role" required error={errors.role}>
            <Select
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="Personal note"
            hint={`${form.message.length}/1000`}
            error={errors.message}
          >
            <Textarea
              rows={3}
              value={form.message}
              onChange={(e) => setForm({ ...form, message: e.target.value })}
              maxLength={1000}
              placeholder="Optional — appears in the invite email"
            />
          </Field>

          {locations.length > 0 && (
            <Field label="Assign to locations (optional)">
              <div className="grid max-h-40 gap-1 overflow-y-auto rounded-lg border border-slate-200 p-2 sm:grid-cols-2">
                {locations.map((l) => (
                  <label
                    key={l.id}
                    className="flex items-center gap-2 rounded-md px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
                  >
                    <input
                      type="checkbox"
                      checked={form.locationIds.includes(l.id)}
                      onChange={() => toggleLocation(l.id)}
                      className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="truncate">
                      {l.name} <span className="text-slate-400">· {l.city}</span>
                    </span>
                  </label>
                ))}
              </div>
            </Field>
          )}

          <div className="mt-5 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !form.email.trim()}
              className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {saving ? "Sending…" : "Send invitation"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
