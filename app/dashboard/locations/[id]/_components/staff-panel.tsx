"use client";

/**
 * Location staff & manager panel.
 *
 *  - Top: assign / clear the primary manager
 *  - Bottom: many-to-many staff assignments
 */

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { UserPlus, X, Users } from "lucide-react";
import { locationsApi, teamApi, type TeamMemberDto } from "@/lib/api";
import { useApi } from "@/lib/api/useApi";
import { Field, Select } from "@/components/dashboard/field";
import { EmptyState } from "@/components/dashboard/empty-state";

interface StaffPanelProps {
  locationId: string;
  currentManagerId: string | null;
  onManagerChanged?: () => void;
}

export function StaffPanel({
  locationId,
  currentManagerId,
  onManagerChanged,
}: StaffPanelProps) {
  const assignments = useApi(
    () => locationsApi.listAssignments(locationId),
    [locationId],
  );
  const members = useApi(
    () => teamApi.listMembers({ pageSize: 100, sortBy: "firstName", sortDir: "asc" }),
    [],
  );

  const [managerId, setManagerId] = useState<string>(currentManagerId ?? "");
  const [savingManager, setSavingManager] = useState(false);
  const [addUserId, setAddUserId] = useState<string>("");
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    setManagerId(currentManagerId ?? "");
  }, [currentManagerId]);

  const eligibleForManager = useMemo(
    () =>
      members.data?.items.filter((m) => m.status === "ACTIVE") ?? [],
    [members.data],
  );
  const assignedIds = new Set(
    assignments.data?.items.map((a) => a.user!.id) ?? [],
  );
  const eligibleForAssignment = useMemo(
    () =>
      (members.data?.items ?? []).filter(
        (m) => m.status === "ACTIVE" && !assignedIds.has(m.id),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [members.data, assignments.data],
  );

  async function saveManager() {
    setSavingManager(true);
    try {
      await locationsApi.assignManager(
        locationId,
        managerId === "" ? null : managerId,
      );
      toast.success("Manager updated");
      if (onManagerChanged) onManagerChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setSavingManager(false);
    }
  }

  async function addAssignment() {
    if (!addUserId) return;
    setBusy(addUserId);
    try {
      await locationsApi.assignUser(locationId, addUserId);
      toast.success("User assigned");
      setAddUserId("");
      await assignments.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(null);
    }
  }

  async function removeAssignment(userId: string) {
    setBusy(userId);
    try {
      await locationsApi.unassignUser(locationId, userId);
      toast.success("Removed");
      await assignments.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      {/* Manager */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
        <h3 className="mb-3 text-sm font-semibold text-slate-900">
          Primary manager
        </h3>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <Field label="Assigned manager" className="flex-1">
            <Select
              value={managerId}
              onChange={(e) => setManagerId(e.target.value)}
            >
              <option value="">— None —</option>
              {eligibleForManager.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.firstName} {m.lastName} · {m.role}
                </option>
              ))}
            </Select>
          </Field>
          <button
            type="button"
            onClick={saveManager}
            disabled={savingManager}
            className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {savingManager ? "Saving…" : "Save"}
          </button>
        </div>
      </section>

      {/* Assignments */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900">
            Assigned staff
          </h3>
          <span className="text-xs text-slate-500">
            {assignments.data?.total ?? 0} member
            {assignments.data?.total === 1 ? "" : "s"}
          </span>
        </div>

        <div className="mb-4 flex flex-col gap-2 rounded-xl border border-slate-100 bg-slate-50 p-3 sm:flex-row sm:items-end">
          <Field label="Add staff member" className="flex-1">
            <Select
              value={addUserId}
              onChange={(e) => setAddUserId(e.target.value)}
            >
              <option value="">Choose someone…</option>
              {eligibleForAssignment.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.firstName} {m.lastName} · {m.email}
                </option>
              ))}
            </Select>
          </Field>
          <button
            type="button"
            disabled={!addUserId || busy === addUserId}
            onClick={addAssignment}
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
          >
            <UserPlus className="h-3.5 w-3.5" /> Assign
          </button>
        </div>

        {(assignments.data?.items.length ?? 0) === 0 ? (
          <EmptyState
            icon={Users}
            title="No staff assigned yet"
            description="Assign team members so they can respond to reviews and edit posts for this branch."
          />
        ) : (
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-100">
            {assignments.data!.items.map((a) => (
              <li
                key={a.id}
                className="flex items-center justify-between gap-3 px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="truncate text-xs font-semibold text-slate-900">
                    {a.user!.firstName} {a.user!.lastName}
                  </div>
                  <div className="truncate text-[11px] text-slate-500">
                    {a.user!.email} · {a.user!.role}
                  </div>
                </div>
                <button
                  onClick={() => removeAssignment(a.user!.id)}
                  disabled={busy === a.user!.id}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                  aria-label="Unassign"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
