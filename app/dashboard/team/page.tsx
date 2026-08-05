"use client";

/**
 * /dashboard/team — team members list.
 */

import { useState } from "react";
import { Search, UserPlus, Users } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/dashboard/page-header";
import { PaginationBar } from "@/components/dashboard/pagination-bar";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Field, Input, Select } from "@/components/dashboard/field";
import { ConfirmDialog } from "@/components/dashboard/confirm-dialog";
import { useApi } from "@/lib/api/useApi";
import { teamApi } from "@/lib/api";
import { TeamNav } from "./_components/team-nav";
import { InviteDialog } from "./_components/invite-dialog";

const ROLES = ["", "TENANT_OWNER", "ADMIN", "MANAGER", "STAFF", "VIEWER"] as const;
const STATUSES = ["", "ACTIVE", "PENDING", "BLOCKED"] as const;
const ROLE_OPTIONS = ["ADMIN", "MANAGER", "STAFF", "VIEWER", "TENANT_OWNER"];

export default function TeamMembersPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("");
  const [status, setStatus] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [pending, setPending] = useState<{
    id: string;
    action: "remove" | "block" | "unblock";
    name: string;
  } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const { data, loading, refresh } = useApi(
    () =>
      teamApi.listMembers({
        page,
        pageSize: 12,
        search: search.trim() || undefined,
        role: role || undefined,
        status: status || undefined,
        sortBy: "createdAt",
        sortDir: "desc",
      }),
    [page, search, role, status],
  );

  async function handleRoleChange(id: string, newRole: string) {
    setBusyId(id);
    try {
      await teamApi.changeRole(id, newRole);
      toast.success("Role updated");
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    } finally {
      setBusyId(null);
    }
  }

  async function handleConfirm() {
    if (!pending) return;
    try {
      if (pending.action === "remove") {
        await teamApi.removeMember(pending.id);
        toast.success("Member removed");
      } else if (pending.action === "block") {
        await teamApi.changeStatus(pending.id, "BLOCKED");
        toast.success("Member blocked");
      } else {
        await teamApi.changeStatus(pending.id, "ACTIVE");
        toast.success("Member unblocked");
      }
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action failed");
    } finally {
      setPending(null);
    }
  }

  return (
    <>
      <PageHeader
        title="Team"
        description="Manage members, roles, branch assignments, and pending invitations."
        actions={
          <button
            onClick={() => setInviteOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700"
          >
            <UserPlus className="h-3.5 w-3.5" />
            Invite member
          </button>
        }
      />
      <TeamNav />

      <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-3 sm:p-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
          <Field label="Search">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <Input
                value={search}
                onChange={(e) => {
                  setPage(1);
                  setSearch(e.target.value);
                }}
                placeholder="Name, email, phone"
                className="pl-8"
              />
            </div>
          </Field>
          <Field label="Role">
            <Select
              value={role}
              onChange={(e) => {
                setPage(1);
                setRole(e.target.value);
              }}
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r || "All"}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Status">
            <Select
              value={status}
              onChange={(e) => {
                setPage(1);
                setStatus(e.target.value);
              }}
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s || "All"}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white">
        {loading ? (
          <div className="p-6 text-sm text-slate-500">Loading…</div>
        ) : (data?.items.length ?? 0) === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={Users}
              title="No team members match this filter"
              description="Try clearing filters or invite a new member."
              action={
                <button
                  onClick={() => setInviteOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700"
                >
                  <UserPlus className="h-3.5 w-3.5" />
                  Invite member
                </button>
              }
            />
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="border-b border-slate-200 bg-slate-50 text-left text-[11px] uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-4 py-2">Member</th>
                    <th className="px-4 py-2">Role</th>
                    <th className="px-4 py-2">Status</th>
                    <th className="px-4 py-2">Branches</th>
                    <th className="px-4 py-2">Last login</th>
                    <th className="px-4 py-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data!.items.map((m) => (
                    <tr
                      key={m.id}
                      className="border-b border-slate-100 last:border-none"
                    >
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-tr from-blue-500 to-indigo-600 text-[10px] font-bold text-white">
                            {(m.firstName?.[0] ?? "") + (m.lastName?.[0] ?? "")}
                          </div>
                          <div className="min-w-0">
                            <div className="truncate font-semibold text-slate-900">
                              {m.firstName} {m.lastName}
                            </div>
                            <div className="truncate text-[11px] text-slate-500">
                              {m.email}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-2.5">
                        <Select
                          value={m.role}
                          disabled={busyId === m.id}
                          onChange={(e) => handleRoleChange(m.id, e.target.value)}
                          className="max-w-[140px]"
                        >
                          {ROLE_OPTIONS.map((r) => (
                            <option key={r} value={r}>
                              {r.replaceAll("_", " ")}
                            </option>
                          ))}
                        </Select>
                      </td>
                      <td className="px-4 py-2.5">
                        <StatusPill status={m.status} />
                      </td>
                      <td className="px-4 py-2.5 text-slate-700">
                        {m.assignments?.length ?? 0}
                      </td>
                      <td className="px-4 py-2.5 text-slate-500">
                        {m.lastLoginAt
                          ? new Date(m.lastLoginAt).toLocaleDateString()
                          : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <div className="flex justify-end gap-1">
                          {m.status === "BLOCKED" ? (
                            <button
                              onClick={() =>
                                setPending({
                                  id: m.id,
                                  action: "unblock",
                                  name: `${m.firstName} ${m.lastName}`,
                                })
                              }
                              className="rounded-lg border border-slate-200 px-2 py-1 font-semibold text-slate-700 hover:bg-slate-50"
                            >
                              Unblock
                            </button>
                          ) : (
                            <button
                              onClick={() =>
                                setPending({
                                  id: m.id,
                                  action: "block",
                                  name: `${m.firstName} ${m.lastName}`,
                                })
                              }
                              className="rounded-lg border border-slate-200 px-2 py-1 font-semibold text-slate-700 hover:bg-slate-50"
                            >
                              Block
                            </button>
                          )}
                          <button
                            onClick={() =>
                              setPending({
                                id: m.id,
                                action: "remove",
                                name: `${m.firstName} ${m.lastName}`,
                              })
                            }
                            className="rounded-lg border border-red-200 px-2 py-1 font-semibold text-red-600 hover:bg-red-50"
                          >
                            Remove
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <PaginationBar
              page={data!.page}
              pageSize={data!.pageSize}
              total={data!.total}
              totalPages={data!.totalPages}
              onPageChange={setPage}
            />
          </>
        )}
      </div>

      <InviteDialog
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        onInvited={() => refresh()}
      />

      <ConfirmDialog
        open={!!pending}
        title={
          pending?.action === "remove"
            ? `Remove ${pending.name}?`
            : pending?.action === "block"
              ? `Block ${pending?.name}?`
              : `Unblock ${pending?.name}?`
        }
        description={
          pending?.action === "remove"
            ? "This is a soft delete. Their sessions and branch assignments are removed."
            : pending?.action === "block"
              ? "All their sessions will be revoked immediately."
              : "They'll be able to sign in again."
        }
        destructive={pending?.action !== "unblock"}
        confirmLabel={
          pending?.action === "remove"
            ? "Remove"
            : pending?.action === "block"
              ? "Block"
              : "Unblock"
        }
        onConfirm={handleConfirm}
        onCancel={() => setPending(null)}
      />
    </>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    ACTIVE: "bg-emerald-100 text-emerald-700",
    PENDING: "bg-amber-100 text-amber-700",
    BLOCKED: "bg-red-100 text-red-700",
    DELETED: "bg-slate-200 text-slate-600",
  };
  return (
    <span
      className={
        "inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold " +
        (map[status] ?? "bg-slate-100 text-slate-600")
      }
    >
      {status}
    </span>
  );
}
