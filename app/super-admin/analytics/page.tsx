"use client";

import { useEffect, useState } from "react";
import {
  BarChart3,
  TrendingUp,
  Sparkles,
  MessageSquare,
  QrCode,
  Globe,
  RefreshCw,
  Star,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { toast } from "sonner";

/**
 * Shape of /api/super-admin/stats, narrowed to the fields this page reads.
 * Deliberately partial: the endpoint returns more, and re-declaring all of it
 * here would drift from the service.
 */
interface AnalyticsResponse {
  stats: {
    ratingBreakdown: Array<{ stars: number; count: number }>;
    overview: {
      totalAiReplies: number;
      totalQrCodes: number;
      totalQrScans: number;
      totalSites: number;
    };
  };
}

export default function SuperAdminAnalyticsPage() {
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchAnalytics = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/super-admin/stats");
      const json = await res.json();
      if (json.success) {
        setData(json.data);
      } else {
        toast.error(json.error?.message || "Failed to load analytics");
      }
    } catch {
      toast.error("Failed to connect to super admin analytics API");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
  }, []);

  if (loading || !data) {
    return (
      <div className="flex h-96 w-full items-center justify-center text-slate-400 gap-3">
        <RefreshCw className="h-6 w-6 animate-spin text-blue-500" />
        <span>Loading Deep Telemetry Analytics...</span>
      </div>
    );
  }

  const { stats } = data;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-bold text-white flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-blue-400" />
          <span>Advanced Platform Analytics & Telemetry</span>
        </h1>
        <p className="text-xs text-slate-400 mt-0.5">
          Deep-dive analysis on review distributions, rating telemetry, and module usage
        </p>
      </div>

      {/* Grid Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Rating Breakdown Chart */}
        <div className="md:col-span-2 rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-xl">
          <h2 className="text-base font-bold text-white flex items-center gap-2 mb-4">
            <Star className="h-4 w-4 text-amber-400 fill-amber-400" />
            <span>Google Review Star Rating Distribution</span>
          </h2>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.ratingBreakdown}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="stars" stroke="#64748b" fontSize={11} tickFormatter={(v: number | string) => `${v} Stars`} />
                <YAxis stroke="#64748b" fontSize={11} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#0f172a",
                    borderColor: "#334155",
                    borderRadius: "12px",
                    color: "#fff",
                  }}
                />
                <Bar dataKey="count" fill="#f59e0b" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Feature Usage Overview */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-xl space-y-4">
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-purple-400" />
            <span>Module Activity Overview</span>
          </h2>

          <div className="space-y-3 text-xs">
            <div className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950 p-3">
              <span className="text-slate-300">AI Reply Drafts Created</span>
              <span className="font-bold text-white text-sm">{stats.overview.totalAiReplies}</span>
            </div>

            <div className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950 p-3">
              <span className="text-slate-300">QR Codes Generated</span>
              <span className="font-bold text-white text-sm">{stats.overview.totalQrCodes}</span>
            </div>

            <div className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950 p-3">
              <span className="text-slate-300">Total QR Scans Registered</span>
              <span className="font-bold text-emerald-400 text-sm">{stats.overview.totalQrScans}</span>
            </div>

            <div className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950 p-3">
              <span className="text-slate-300">Published Websites</span>
              <span className="font-bold text-blue-400 text-sm">{stats.overview.totalSites}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
