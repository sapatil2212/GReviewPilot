"use client";

import Link from "next/link";
import { useState } from "react";
import { Search, UserPlus, MoreVertical, Users } from "lucide-react";
import { toast } from "sonner";
import { useApi } from "@/lib/api/useApi";
import { teamApi, type TeamMemberDto } from "@/lib/api";
import { Field, Input, Select } from "@/components/dashboard/field";
import { PaginationBar } from "@/components/dashboard/pagination-bar";
import { EmptyState } from "@/components/dashboard/empty-state";
import { ConfirmDialog } from "@/components/dashboard/confirm-dialog";
import { InviteDialog } from "./invite-dialog";

const ROLES = ["", "TENANT_OWNER", "ADMIN", "MANAGER", "STAFF", "VIEWER"];
const STATUSES = ["", "ACTIVE", "PENDING", "BLOCKED"];

export function MembersTab() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("");
  const [status, setStatus] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [pending, setPending] = useState<{
    id: string;
    action: "block" | "unblock" | "remove";
    label: string;
  } | null>(null);

  const { data, loading, refresh } = useApi(
    () =>
      teamApi.listMembers({
        page,
        pageSize: 12,
        search: search.trim() || undefined,
        role: role || undefined,
        status: status || undefined,
      }),
    [page, search, role, status],
  );

  async function handleConfirm() {
    if (!pending) return;
    try {
      if (pending.action === "remove") {
        await teamApi.removeMember(pending.id);
        toast.success("Member removed");
      } else {
        await teamApi.changeStatus(
          pending.id,
          pending.action === "block" ? "BLOCKED" : "ACTIVE",
        );
        toast.success(
          pending.action === "block" ? "Member blocked" : "Member unblocked",
        );
      }
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setPending(null);
    }
  }

  return (
    <>
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="grid flex-1 gap-3 sm:grid-cols-[1fr_auto_auto]">
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
        <button
          onClick={() => setInviteOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700"
        >
          <UserPlus className="h-3.5 w-3.5" /> Invite member
        </button>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white">
        {loading ? (
          <div className="p-6 text-sm text-slate-500">Loading…</div>
        ) : (data?.items.length ?? 0) === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={Users}
              title="No team members match"
              description="Adjust filters or invite someone new."
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
                    <th className="px-4 py-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data!.items.map((m) => (
                    <MemberRow
                      key={m.id}
                      member={m}
                      onPending={(a) =>
                        setPending({
                          id: m.id,
                          action: a,
                          label: `${m.firstName} ${m.lastName}`,
                        })
                      }
                    />
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
        onInvited={() => {
          setInviteOpen(false);
          refresh();
          toast.success("Invitation sent");
        }}
      />

      <ConfirmDialog
        open={!!pending}
        title={
          pending?.action === "block"
            ? `Block ${pending?.label}?`
            : pending?.action === "unblock"
              ? `Unblock ${pending?.label}?`
              : `Remove ${pending?.label}?`
        }
        description={
          pending?.action === "block"
            ? "All their active sessions will be revoked immediately."
            : pending?.action === "unblock"
              ? "They'll be able to sign in again."
              : "Soft-deletes the account. All their location assignments are removed."
        }
        destructive={pending?.action !== "unblock"}
        confirmLabel={
          pending?.action === "block"
            ? "Block"
            : pending?.action === "unblock"
              ? "Unblock"
              : "Remove"
        }
        onConfirm={handleConfirm}
        onCancel={() => setPending(null)}
      />
    </>
  );
}

function MemberRow({
  member,
  onPending,
}: {
  member: TeamMemberDto;
  onPending: (a: "block" | "unblock" | "remove") => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <tr className="border-b border-slate-100 last:border-none align-top">
      <td className="px-4 py-2.5">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[10px] font-bold text-slate-700">
            {member.firstName?.[0]?.toUpperCase() ?? "?"}
            {member.lastName?.[0]?.toUpperCase() ?? ""}
          </div>
          <div className="min-w-0">
            <div className="truncate font-semibold text-slate-900">
              {member.firstName} {member.lastName}
            </div>
            <div className="truncate text-[11px] text-slate-500">
              {member.email}
            </div>
          </div>
        </div>
      </td>
      <td className="px-4 py-2.5">
        <RolePicker member={member} />
      </td>
      <td className="px-4 py-2.5">
        <StatusBadge status={member.status} />
      </td>
      <td className="px-4 py-2.5 text-slate-700">
        {(member.assignments?.length ?? 0) === 0 ? (
          <span className="text-slate-400">—</span>
        ) : (
          <div className="flex flex-wrap gap-1">
            {member.assignments!.slice(0, 3).map((a) => (
              <Link
                key={a.id}
                href={`/dashboard/locations/${a.locationId}`}
                className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700 hover:bg-slate-200"
              >
                {a.location?.name ?? "Branch"}
              </Link>
            ))}
            {(member.assignments?.length ?? 0) > 3 && (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
                +{(member.assignments!.length ?? 0) - 3}
              </span>
            )}
          </div>
        )}
      </td>
      <td className="relative px-4 py-2.5 text-right">
        <button
          onClick={() => setMenuOpen((v) => !v)}
          className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-50"
          aria-label="More"
        >
          <MoreVertical className="h-3.5 w-3.5" />
        </button>
        {menuOpen && (
          <>
            <div
              className="fixed inset-0 z-10"
              onClick={() => setMenuOpen(false)}
            />
            <div className="absolute right-4 top-9 z-20 w-40 rounded-lg border border-slate-200 bg-white p-1 text-xs">
              {member.status === "BLOCKED" ? (
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    onPending("unblock");
                  }}
                  className="flex w-full items-center rounded-lg px-2.5 py-1.5 text-left text-slate-700 hover:bg-slate-50"
                >
                  Unblock
                </button>
              ) : (
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    onPending("block");
                  }}
                  className="flex w-full items-center rounded-lg px-2.5 py-1.5 text-left text-amber-700 hover:bg-amber-50"
                >
                  Block
                </button>
              )}
              <button
                onClick={() => {
                  setMenuOpen(false);
                  onPending("remove");
                }}
                className="flex w-full items-center rounded-lg px-2.5 py-1.5 text-left text-red-600 hover:bg-red-50"
              >
                Remove
              </button>
            </div>
          </>
        )}
      </td>
    </tr>
  );
}

function RolePicker({ member }: { member: TeamMemberDto }) {
  const [role, setRole] = useState(member.role);
  const [saving, setSaving] = useState(false);
  async function onChange(next: string) {
    if (next === role) return;
    const prev = role;
    setRole(next);
    setSaving(true);
    try {
      await teamApi.changeRole(member.id, next);
      toast.success("Role updated");
    } catch (err) {
      setRole(prev);
      toast.error(err instanceof Error ? err.message : "Change failed");
    } finally {
      setSaving(false);
    }
  }
  return (
    <select
      value={role}
      disabled={saving}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 disabled:opacity-60"
    >
      {ROLES.filter((r) => r).map((r) => (
        <option key={r} value={r}>
          {r}
        </option>
      ))}
    </select>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    ACTIVE: "bg-emerald-100 text-emerald-700",
    PENDING: "bg-amber-100 text-amber-700",
    BLOCKED: "bg-red-100 text-red-700",
    DELETED: "bg-slate-200 text-slate-700",
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
