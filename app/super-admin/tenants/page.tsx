"use client";

import { useEffect, useState } from "react";
import {
  Building2,
  Search,
  Filter,
  MoreVertical,
  ShieldAlert,
  CheckCircle,
  AlertTriangle,
  RefreshCw,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

interface TenantItem {
  id: string;
  name: string;
  slug: string;
  status: string;
  plan: string;
  billingStatus: string;
  createdAt: string;
  owner: {
    name: string;
    email: string;
    lastLoginAt: string | null;
  } | null;
  counts: {
    users: number;
    locations: number;
    reviews: number;
    googleAccounts: number;
  };
}

export default function SuperAdminTenantsPage() {
  const [tenants, setTenants] = useState<TenantItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [planFilter, setPlanFilter] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // Selected tenant for Plan modal
  const [selectedTenant, setSelectedTenant] = useState<TenantItem | null>(null);
  const [newPlan, setNewPlan] = useState<string>("STARTER");
  const [updating, setUpdating] = useState(false);

  const fetchTenants = async () => {
    setLoading(true);
    try {
      const query = new URLSearchParams({
        page: page.toString(),
        limit: "12",
        ...(search ? { search } : {}),
        ...(statusFilter ? { status: statusFilter } : {}),
        ...(planFilter ? { plan: planFilter } : {}),
      });

      const res = await fetch(`/api/super-admin/tenants?${query.toString()}`);
      const json = await res.json();
      if (json.success) {
        setTenants(json.data.items);
        setTotalPages(json.data.pagination.totalPages);
        setTotalCount(json.data.pagination.total);
      } else {
        toast.error(json.error?.message || "Failed to load workspaces");
      }
    } catch {
      toast.error("Failed to connect to super admin tenants API");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTenants();
  }, [page, statusFilter, planFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchTenants();
  };

  const handleStatusToggle = async (tenantId: string, currentStatus: string) => {
    const nextStatus = currentStatus === "SUSPENDED" ? "ACTIVE" : "SUSPENDED";
    const confirmText = nextStatus === "SUSPENDED"
      ? "Are you sure you want to SUSPEND this workspace?"
      : "Are you sure you want to REACTIVATE this workspace?";

    if (!window.confirm(confirmText)) return;

    try {
      const res = await fetch(`/api/super-admin/tenants/${tenantId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success(`Workspace ${nextStatus.toLowerCase()} successfully`);
        fetchTenants();
      } else {
        toast.error(json.error?.message || "Failed to update workspace status");
      }
    } catch {
      toast.error("Error updating workspace status");
    }
  };

  const handlePlanUpdate = async () => {
    if (!selectedTenant) return;
    setUpdating(true);
    try {
      const res = await fetch(`/api/super-admin/tenants/${selectedTenant.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: newPlan }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success("Workspace subscription plan updated");
        setSelectedTenant(null);
        fetchTenants();
      } else {
        toast.error(json.error?.message || "Failed to update plan");
      }
    } catch {
      toast.error("Error updating plan");
    } finally {
      setUpdating(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Building2 className="h-5 w-5 text-blue-400" />
            <span>Workspace Management</span>
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Total {totalCount} workspaces registered across GReviewPilot
          </p>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 shadow-lg flex flex-col md:flex-row items-center justify-between gap-4">
        <form onSubmit={handleSearchSubmit} className="relative w-full md:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by workspace, slug, or owner..."
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
            <option value="">All Statuses</option>
            <option value="ACTIVE">ACTIVE</option>
            <option value="TRIAL">TRIAL</option>
            <option value="SUSPENDED">SUSPENDED</option>
            <option value="CANCELLED">CANCELLED</option>
            <option value="DELETED">DELETED</option>
          </select>

          <select
            value={planFilter}
            onChange={(e) => {
              setPlanFilter(e.target.value);
              setPage(1);
            }}
            className="rounded-xl border border-slate-700/80 bg-slate-950/60 px-3 py-2 text-xs text-slate-200 focus:outline-none"
          >
            <option value="">All Plans</option>
            <option value="TRIAL">TRIAL</option>
            <option value="STARTER">STARTER</option>
            <option value="GROWTH">GROWTH</option>
            <option value="SCALE">SCALE</option>
            <option value="ENTERPRISE">ENTERPRISE</option>
          </select>
        </div>
      </div>

      {/* Tenants Table */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 shadow-xl overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-400 text-xs flex items-center justify-center gap-2">
            <RefreshCw className="h-4 w-4 animate-spin text-blue-400" />
            <span>Fetching Workspaces...</span>
          </div>
        ) : tenants.length === 0 ? (
          <div className="p-12 text-center text-slate-500 text-xs">
            No workspaces found matching filters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="border-b border-slate-800 bg-slate-950/80 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-3.5">Workspace</th>
                  <th className="px-6 py-3.5">Owner</th>
                  <th className="px-6 py-3.5">Plan & Billing</th>
                  <th className="px-6 py-3.5">Status</th>
                  <th className="px-6 py-3.5">Telemetry Stats</th>
                  <th className="px-6 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {tenants.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-800/30 transition">
                    <td className="px-6 py-4">
                      <div className="font-semibold text-white text-sm">{t.name}</div>
                      <div className="text-[11px] text-slate-500 font-mono">slug: {t.slug}</div>
                    </td>

                    <td className="px-6 py-4">
                      {t.owner ? (
                        <div>
                          <div className="font-medium text-slate-200">{t.owner.name}</div>
                          <div className="text-[11px] text-slate-400">{t.owner.email}</div>
                        </div>
                      ) : (
                        <span className="text-slate-500 italic">No owner assigned</span>
                      )}
                    </td>

                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <span className="rounded-lg bg-indigo-500/15 border border-indigo-500/30 text-indigo-400 px-2 py-0.5 font-bold text-[10px]">
                          {t.plan}
                        </span>
                        <span className="text-[11px] text-slate-400">{t.billingStatus}</span>
                      </div>
                    </td>

                    <td className="px-6 py-4">
                      <span
                        className={`rounded-full px-2.5 py-0.5 font-semibold text-[10px] ${
                          t.status === "ACTIVE"
                            ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                            : t.status === "TRIAL"
                            ? "bg-blue-500/15 text-blue-400 border border-blue-500/30"
                            : t.status === "SUSPENDED"
                            ? "bg-rose-500/15 text-rose-400 border border-rose-500/30"
                            : "bg-slate-700/40 text-slate-400 border border-slate-600/30"
                        }`}
                      >
                        {t.status}
                      </span>
                    </td>

                    <td className="px-6 py-4">
                      <div className="text-[11px] text-slate-400 space-x-2">
                        <span>👥 {t.counts.users} users</span>
                        <span>• 📍 {t.counts.locations} locs</span>
                        <span>• ⭐ {t.counts.reviews} reviews</span>
                      </div>
                    </td>

                    <td className="px-6 py-4 text-right space-x-2">
                      <button
                        onClick={() => {
                          setSelectedTenant(t);
                          setNewPlan(t.plan);
                        }}
                        className="rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1 text-[11px] font-medium text-slate-200 hover:bg-slate-700 transition"
                      >
                        Change Plan
                      </button>

                      <button
                        onClick={() => handleStatusToggle(t.id, t.status)}
                        className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition ${
                          t.status === "SUSPENDED"
                            ? "bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-600/30"
                            : "bg-rose-600/20 text-rose-400 border border-rose-500/30 hover:bg-rose-600/30"
                        }`}
                      >
                        {t.status === "SUSPENDED" ? "Reactivate" : "Suspend"}
                      </button>
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

      {/* Plan Update Modal */}
      {selectedTenant && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Zap className="h-4 w-4 text-amber-400" />
              <span>Update Subscription Plan</span>
            </h3>
            <p className="text-xs text-slate-400">
              Workspace: <strong className="text-white">{selectedTenant.name}</strong>
            </p>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">Select New Plan</label>
              <select
                value={newPlan}
                onChange={(e) => setNewPlan(e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 p-2.5 text-xs text-white focus:outline-none"
              >
                <option value="TRIAL">TRIAL</option>
                <option value="STARTER">STARTER</option>
                <option value="GROWTH">GROWTH</option>
                <option value="SCALE">SCALE</option>
                <option value="ENTERPRISE">ENTERPRISE</option>
              </select>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setSelectedTenant(null)}
                className="px-4 py-2 rounded-xl text-xs font-medium text-slate-400 border border-slate-800 hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                disabled={updating}
                onClick={handlePlanUpdate}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-50"
              >
                {updating ? "Saving..." : "Save Plan"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
