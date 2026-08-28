"use client";

import { useEffect, useState } from "react";
import { ShieldCheck, Search, RefreshCw, Terminal, Clock } from "lucide-react";
import { toast } from "sonner";

interface AuditLogItem {
  id: string;
  action: string;
  ipAddress: string | null;
  userAgent: string | null;
  metadata: unknown;
  createdAt: string;
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
  } | null;
  tenant: {
    id: string;
    name: string;
    slug: string;
  } | null;
}

export default function SuperAdminAuditLogsPage() {
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("");

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const query = new URLSearchParams({
        limit: "40",
        ...(search ? { search } : {}),
        ...(actionFilter ? { action: actionFilter } : {}),
      });

      const res = await fetch(`/api/super-admin/audit-logs?${query.toString()}`);
      const json = await res.json();
      if (json.success) {
        setLogs(json.data);
      } else {
        toast.error(json.error?.message || "Failed to load audit logs");
      }
    } catch {
      toast.error("Failed to connect to audit logs API");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [actionFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchLogs();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-emerald-400" />
          <span>Global Audit Trail & Security Logs</span>
        </h1>
        <p className="text-xs text-slate-400 mt-0.5">
          Real-time security log stream of platform actions, authentication, and workspace lifecycle events
        </p>
      </div>

      {/* Filter Bar */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 shadow-lg flex flex-col md:flex-row items-center justify-between gap-4">
        <form onSubmit={handleSearchSubmit} className="relative w-full md:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by user email, workspace, or IP..."
            className="w-full rounded-xl border border-slate-700/80 bg-slate-950/60 pl-9 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
          />
        </form>

        <button
          onClick={fetchLogs}
          className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900 px-3.5 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          <span>Refresh Logs</span>
        </button>
      </div>

      {/* Audit Log Table */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 shadow-xl overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-400 text-xs flex items-center justify-center gap-2">
            <RefreshCw className="h-4 w-4 animate-spin text-emerald-400" />
            <span>Streaming Audit Trail...</span>
          </div>
        ) : logs.length === 0 ? (
          <div className="p-12 text-center text-slate-500 text-xs">
            No audit logs recorded for query.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="border-b border-slate-800 bg-slate-950/80 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-3.5">Timestamp</th>
                  <th className="px-6 py-3.5">Action Event</th>
                  <th className="px-6 py-3.5">User</th>
                  <th className="px-6 py-3.5">Workspace</th>
                  <th className="px-6 py-3.5">IP Address</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-800/30 transition">
                    <td className="px-6 py-3 text-slate-400 text-[11px] whitespace-nowrap">
                      {new Date(log.createdAt).toLocaleString()}
                    </td>

                    <td className="px-6 py-3">
                      <span className="rounded-md bg-blue-500/10 border border-blue-400/20 text-blue-300 px-2 py-0.5 text-[11px] font-bold">
                        {log.action}
                      </span>
                    </td>

                    <td className="px-6 py-3 font-sans">
                      {log.user ? (
                        <div className="text-slate-200 text-xs">{log.user.email}</div>
                      ) : (
                        <span className="text-slate-500 italic">System / Anonymous</span>
                      )}
                    </td>

                    <td className="px-6 py-3 font-sans">
                      {log.tenant ? (
                        <div className="text-slate-300 text-xs">{log.tenant.name}</div>
                      ) : (
                        <span className="text-slate-600">-</span>
                      )}
                    </td>

                    <td className="px-6 py-3 text-slate-400 text-[11px]">
                      {log.ipAddress || "Internal"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
