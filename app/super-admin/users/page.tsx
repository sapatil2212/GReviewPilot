"use client";

import { useEffect, useState } from "react";
import {
  Users,
  Search,
  ShieldAlert,
  CheckCircle,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  UserCheck,
  UserX,
  Lock,
} from "lucide-react";
import { toast } from "sonner";

interface UserItem {
  id: string;
  firstName: string;
  lastName: string;
  name: string;
  email: string;
  role: string;
  status: string;
  emailVerified: string | null;
  lastLoginAt: string | null;
  failedLoginCount: number;
  lockedUntil: string | null;
  createdAt: string;
  tenant: {
    id: string;
    name: string;
    slug: string;
    plan: string;
    status: string;
  } | null;
}

export default function SuperAdminUsersPage() {
  const [users, setUsers] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const query = new URLSearchParams({
        page: page.toString(),
        limit: "15",
        ...(search ? { search } : {}),
        ...(statusFilter ? { status: statusFilter } : {}),
        ...(roleFilter ? { role: roleFilter } : {}),
      });

      const res = await fetch(`/api/super-admin/users?${query.toString()}`);
      const json = await res.json();
      if (json.success) {
        setUsers(json.data.items);
        setTotalPages(json.data.pagination.totalPages);
        setTotalCount(json.data.pagination.total);
      } else {
        toast.error(json.error?.message || "Failed to load user directory");
      }
    } catch {
      toast.error("Failed to connect to super admin users API");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [page, statusFilter, roleFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchUsers();
  };

  const handleStatusToggle = async (userId: string, currentStatus: string) => {
    const nextStatus = currentStatus === "BLOCKED" ? "ACTIVE" : "BLOCKED";
    const confirmText = nextStatus === "BLOCKED"
      ? "Are you sure you want to BLOCK this user?"
      : "Are you sure you want to UNBLOCK & REACTIVATE this user?";

    if (!window.confirm(confirmText)) return;

    try {
      const res = await fetch(`/api/super-admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success(`User ${nextStatus.toLowerCase()} successfully`);
        fetchUsers();
      } else {
        toast.error(json.error?.message || "Failed to update user status");
      }
    } catch {
      toast.error("Error updating user status");
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Users className="h-5 w-5 text-indigo-400" />
            <span>Global User Directory</span>
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Total {totalCount} registered accounts across all workspaces
          </p>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 shadow-lg flex flex-col md:flex-row items-center justify-between gap-4">
        <form onSubmit={handleSearchSubmit} className="relative w-full md:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search user by name, email, or workspace..."
            className="w-full rounded-xl border border-slate-700/80 bg-slate-950/60 pl-9 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
          />
        </form>

        <div className="flex items-center gap-3 w-full md:w-auto">
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="rounded-xl border border-slate-700/80 bg-slate-950/60 px-3 py-2 text-xs text-slate-200 focus:outline-none"
          >
            <option value="">All User Statuses</option>
            <option value="ACTIVE">ACTIVE</option>
            <option value="PENDING">PENDING</option>
            <option value="BLOCKED">BLOCKED</option>
            <option value="DELETED">DELETED</option>
          </select>

          <select
            value={roleFilter}
            onChange={(e) => {
              setRoleFilter(e.target.value);
              setPage(1);
            }}
            className="rounded-xl border border-slate-700/80 bg-slate-950/60 px-3 py-2 text-xs text-slate-200 focus:outline-none"
          >
            <option value="">All Roles</option>
            <option value="SUPER_ADMIN">SUPER_ADMIN</option>
            <option value="TENANT_OWNER">TENANT_OWNER</option>
            <option value="ADMIN">ADMIN</option>
            <option value="MANAGER">MANAGER</option>
            <option value="STAFF">STAFF</option>
            <option value="VIEWER">VIEWER</option>
          </select>
        </div>
      </div>

      {/* Users Table */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 shadow-xl overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-400 text-xs flex items-center justify-center gap-2">
            <RefreshCw className="h-4 w-4 animate-spin text-indigo-400" />
            <span>Fetching User Directory...</span>
          </div>
        ) : users.length === 0 ? (
          <div className="p-12 text-center text-slate-500 text-xs">
            No users found matching query.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="border-b border-slate-800 bg-slate-950/80 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-3.5">User Details</th>
                  <th className="px-6 py-3.5">Workspace</th>
                  <th className="px-6 py-3.5">Role</th>
                  <th className="px-6 py-3.5">Status</th>
                  <th className="px-6 py-3.5">Last Login</th>
                  <th className="px-6 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-800/30 transition">
                    <td className="px-6 py-4">
                      <div className="font-semibold text-white text-sm">{u.name}</div>
                      <div className="text-[11px] text-slate-400">{u.email}</div>
                    </td>

                    <td className="px-6 py-4">
                      {u.tenant ? (
                        <div>
                          <div className="font-medium text-slate-200">{u.tenant.name}</div>
                          <div className="text-[10px] text-indigo-400 font-mono">Plan: {u.tenant.plan}</div>
                        </div>
                      ) : (
                        <span className="text-slate-500 italic">No workspace</span>
                      )}
                    </td>

                    <td className="px-6 py-4">
                      <span
                        className={`rounded-lg px-2 py-0.5 font-bold text-[10px] ${
                          u.role === "SUPER_ADMIN"
                            ? "bg-purple-500/20 text-purple-300 border border-purple-400/40"
                            : u.role === "TENANT_OWNER"
                            ? "bg-blue-500/20 text-blue-300 border border-blue-400/40"
                            : "bg-slate-800 text-slate-300 border border-slate-700"
                        }`}
                      >
                        {u.role}
                      </span>
                    </td>

                    <td className="px-6 py-4">
                      <span
                        className={`rounded-full px-2.5 py-0.5 font-semibold text-[10px] ${
                          u.status === "ACTIVE"
                            ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                            : u.status === "BLOCKED"
                            ? "bg-rose-500/15 text-rose-400 border border-rose-500/30"
                            : "bg-amber-500/15 text-amber-400 border border-amber-500/30"
                        }`}
                      >
                        {u.status}
                      </span>
                    </td>

                    <td className="px-6 py-4 text-slate-400 text-[11px]">
                      {u.lastLoginAt ? (
                        new Date(u.lastLoginAt).toLocaleString()
                      ) : (
                        <span className="text-slate-600">Never</span>
                      )}
                    </td>

                    <td className="px-6 py-4 text-right">
                      {u.role !== "SUPER_ADMIN" && (
                        <button
                          onClick={() => handleStatusToggle(u.id, u.status)}
                          className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition ${
                            u.status === "BLOCKED"
                              ? "bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-600/30"
                              : "bg-rose-600/20 text-rose-400 border border-rose-500/30 hover:bg-rose-600/30"
                          }`}
                        >
                          {u.status === "BLOCKED" ? "Unblock" : "Block User"}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Footer */}
        <div className="border-t border-slate-800 px-6 py-3 bg-slate-950/60 flex items-center justify-between text-xs text-slate-400">
          <span>
            Page {page} of {totalPages}
          </span>
          <div className="flex items-center gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="p-1.5 rounded-lg border border-slate-800 bg-slate-900 disabled:opacity-40 hover:bg-slate-800"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="p-1.5 rounded-lg border border-slate-800 bg-slate-900 disabled:opacity-40 hover:bg-slate-800"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
