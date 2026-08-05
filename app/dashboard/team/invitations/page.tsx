"use client";

import { useState } from "react";
import { Search, Send, UserPlus, MailCheck } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/dashboard/page-header";
import { PaginationBar } from "@/components/dashboard/pagination-bar";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Field, Input, Select } from "@/components/dashboard/field";
import { ConfirmDialog } from "@/components/dashboard/confirm-dialog";
import { useApi } from "@/lib/api/useApi";
import { teamApi } from "@/lib/api";
import { TeamNav } from "../_components/team-nav";
import { InviteDialog } from "../_components/invite-dialog";

const STATUSES = ["", "PENDING", "ACCEPTED", "REVOKED", "EXPIRED"] as const;

export default function InvitationsPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [pending, setPending] = useState<{
    id: string;
    action: "resend" | "revoke";
    email: string;
  } | null>(null);

  const { data, loading, refresh } = useApi(
    () =>
      teamApi.listInvitations({
        page,
        pageSize: 12,
        search: search.trim() || undefined,
        status: status || undefined,
        sortBy: "createdAt",
        sortDir: "desc",
      }),
    [page, search, status],
  );

  async function handleConfirm() {
    if (!pending) return;
    try {
      if (pending.action === "resend") {
        await teamApi.resendInvitation(pending.id);
        toast.success("Invitation resent");
      } else {
        await teamApi.revokeInvitation(pending.id);
        toast.success("Invitation revoked");
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
        title="Invitations"
        description="Pending, accepted, and past team invites."
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
        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <Field label="Search">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <Input
                value={search}
                onChange={(e) => {
                  setPage(1);
                  setSearch(e.target.value);
                }}
                placeholder="Email, first or last name"
                className="pl-8"
              />
            </div>
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
              icon={MailCheck}
              title="No invitations to show"
              description="Send your first invite to get someone on board."
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
                    <th className="px-4 py-2">Invitee</th>
                    <th className="px-4 py-2">Role</th>
                    <th className="px-4 py-2">Status</th>
                    <th className="px-4 py-2">Invited by</th>
                    <th className="px-4 py-2">Expires</th>
                    <th className="px-4 py-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data!.items.map((inv) => (
                    <tr
                      key={inv.id}
                      className="border-b border-slate-100 last:border-none"
                    >
                      <td className="px-4 py-2.5">
                        <div className="flex flex-col">
                          <span className="font-semibold text-slate-900">
                            {inv.firstName || inv.lastName
                              ? `${inv.firstName ?? ""} ${inv.lastName ?? ""}`
                              : inv.email}
                          </span>
                          <span className="text-[11px] text-slate-500">
                            {inv.email}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-slate-700">
                        {inv.role.replaceAll("_", " ")}
                      </td>
                      <td className="px-4 py-2.5">
                        <StatusPill status={inv.status} />
                      </td>
                      <td className="px-4 py-2.5 text-slate-700">
                        {inv.invitedBy
                          ? `${inv.invitedBy.firstName} ${inv.invitedBy.lastName}`
                          : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-slate-500">
                        {new Date(inv.expiresAt).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {inv.status === "PENDING" ? (
                          <div className="flex justify-end gap-1">
                            <button
                              onClick={() =>
                                setPending({
                                  id: inv.id,
                                  action: "resend",
                                  email: inv.email,
                                })
                              }
                              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 font-semibold text-slate-700 hover:bg-slate-50"
                            >
                              <Send className="h-3 w-3" /> Resend
                            </button>
                            <button
                              onClick={() =>
                                setPending({
                                  id: inv.id,
                                  action: "revoke",
                                  email: inv.email,
                                })
                              }
                              className="rounded-lg border border-red-200 px-2 py-1 font-semibold text-red-600 hover:bg-red-50"
                            >
                              Revoke
                            </button>
                          </div>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
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
          pending?.action === "resend"
            ? `Resend invite to ${pending?.email}?`
            : `Revoke invite to ${pending?.email}?`
        }
        description={
          pending?.action === "resend"
            ? "A fresh token is emailed and the previous link stops working."
            : "The current link stops working. You can invite them again later."
        }
        destructive={pending?.action === "revoke"}
        confirmLabel={pending?.action === "resend" ? "Resend" : "Revoke"}
        onConfirm={handleConfirm}
        onCancel={() => setPending(null)}
      />
    </>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    PENDING: "bg-amber-100 text-amber-700",
    ACCEPTED: "bg-emerald-100 text-emerald-700",
    REVOKED: "bg-red-100 text-red-700",
    EXPIRED: "bg-slate-200 text-slate-600",
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
