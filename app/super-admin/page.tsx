"use client";

import { useEffect, useState } from "react";
import {
  Building2,
  Users,
  MessageSquare,
  Globe2,
  Share2,
  QrCode,
  Sparkles,
  Database,
  Activity,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  TrendingUp,
  ArrowUpRight,
  Shield,
  Bot,
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  CartesianGrid,
} from "recharts";
import { toast } from "sonner";

interface StatsData {
  dbLatencyMs: number;
  overview: {
    totalTenants: number;
    totalUsers: number;
    totalLocations: number;
    totalReviews: number;
    repliedReviewsCount: number;
    totalGoogleAccounts: number;
    totalPosts: number;
    totalQrCodes: number;
    totalQrScans: number;
    totalSites: number;
    totalAiReplies: number;
  };
  tenantsByStatus: Record<string, number>;
  tenantsByPlan: Record<string, number>;
  usersByStatus: Record<string, number>;
  usersByRole: Record<string, number>;
  reviewsBySentiment: Record<string, number>;
  googleAccountsByStatus: Record<string, number>;
  ratingBreakdown: Array<{ stars: number; count: number }>;
  sslStatusBreakdown: Record<string, number>;
  systemServices: {
    database: { status: string; latencyMs: number };
    smtp: { status: string; host: string };
    geminiAi: { status: string; model: string };
    googleOauth: { status: string };
    sslProvisioning: { mode: string };
  };
}

interface AnalyticsData {
  timeSeries: Array<{ date: string; tenants: number; reviews: number; users: number }>;
  totals30Days: {
    newTenants: number;
    newReviews: number;
    newUsers: number;
  };
}

const SENTIMENT_COLORS = ["#10b981", "#3b82f6", "#f59e0b", "#ef4444"];

export default function SuperAdminOverviewPage() {
  const [data, setData] = useState<{ stats: StatsData; analytics: AnalyticsData } | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchStats = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/super-admin/stats");
      const json = await res.json();
      if (json.success) {
        setData(json.data);
      } else {
        toast.error(json.error?.message || "Failed to load telemetry stats");
      }
    } catch {
      toast.error("Failed to connect to super admin telemetry API");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  if (loading || !data) {
    return (
      <div className="flex h-96 w-full items-center justify-center text-slate-400 gap-3">
        <RefreshCw className="h-6 w-6 animate-spin text-blue-500" />
        <span>Loading Platform Telemetry & Metrics...</span>
      </div>
    );
  }

  const { stats, analytics } = data;

  const sentimentPieData = [
    { name: "Positive", value: stats.reviewsBySentiment.POSITIVE || 0 },
    { name: "Neutral", value: stats.reviewsBySentiment.NEUTRAL || 0 },
    { name: "Mixed", value: stats.reviewsBySentiment.MIXED || 0 },
    { name: "Negative", value: stats.reviewsBySentiment.NEGATIVE || 0 },
  ].filter((d) => d.value > 0);

  const planBarData = Object.entries(stats.tenantsByPlan).map(([plan, count]) => ({
    plan,
    count,
  }));

  return (
    <div className="space-y-8">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border border-slate-800 bg-gradient-to-r from-slate-900 via-slate-900/80 to-blue-950/40 p-6 shadow-xl">
        <div>
          <div className="flex items-center gap-2 text-blue-400 font-semibold text-xs tracking-wider uppercase mb-1">
            <Shield className="h-4 w-4" />
            <span>Super Admin Command Center</span>
          </div>
          <h1 className="text-2xl font-extrabold text-white tracking-tight">
            Platform Analytics & Governance
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Real-time telemetry, database metrics, and system status across all workspaces.
          </p>
        </div>

        <button
          onClick={fetchStats}
          className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800/80 px-4 py-2.5 text-xs font-semibold text-slate-200 hover:bg-slate-700 hover:text-white transition"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          <span>Refresh Data</span>
        </button>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Workspaces */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 shadow-lg relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Total Workspaces</span>
            <div className="rounded-xl bg-blue-500/10 p-2 text-blue-400">
              <Building2 className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-bold text-white">{stats.overview.totalTenants}</span>
            <span className="text-xs text-emerald-400 font-semibold flex items-center">
              +{analytics.totals30Days.newTenants} (30d)
            </span>
          </div>
          <p className="mt-1 text-[11px] text-slate-500">
            {stats.tenantsByStatus.ACTIVE || 0} Active • {stats.tenantsByStatus.TRIAL || 0} Trial
          </p>
        </div>

        {/* Users */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 shadow-lg relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Platform Users</span>
            <div className="rounded-xl bg-indigo-500/10 p-2 text-indigo-400">
              <Users className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-bold text-white">{stats.overview.totalUsers}</span>
            <span className="text-xs text-emerald-400 font-semibold flex items-center">
              +{analytics.totals30Days.newUsers} (30d)
            </span>
          </div>
          <p className="mt-1 text-[11px] text-slate-500">
            {stats.usersByRole.TENANT_OWNER || 0} Owners • {stats.usersByStatus.ACTIVE || 0} Active
          </p>
        </div>

        {/* Reviews */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 shadow-lg relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Reviews Synced</span>
            <div className="rounded-xl bg-emerald-500/10 p-2 text-emerald-400">
              <MessageSquare className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-bold text-white">{stats.overview.totalReviews}</span>
            <span className="text-xs text-emerald-400 font-semibold flex items-center">
              +{analytics.totals30Days.newReviews} (30d)
            </span>
          </div>
          <p className="mt-1 text-[11px] text-slate-500">
            {stats.overview.repliedReviewsCount} Replied ({Math.round((stats.overview.repliedReviewsCount / Math.max(1, stats.overview.totalReviews)) * 100)}%)
          </p>
        </div>

        {/* AI & Integrations */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 shadow-lg relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Connected Accounts</span>
            <div className="rounded-xl bg-amber-500/10 p-2 text-amber-400">
              <Globe2 className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-bold text-white">{stats.overview.totalGoogleAccounts}</span>
            <span className="text-xs text-slate-400 font-medium">Google Accounts</span>
          </div>
          <p className="mt-1 text-[11px] text-slate-500">
            {stats.overview.totalAiReplies} AI Drafts • {stats.overview.totalQrScans} QR Scans
          </p>
        </div>
      </div>

      {/* Analytics Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Time Series Area Chart */}
        <div className="lg:col-span-2 rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-xl">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-blue-400" />
                <span>30-Day Growth & Sync Activity</span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                New Workspaces and Review sync volume trends
              </p>
            </div>
          </div>

          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={analytics.timeSeries}>
                <defs>
                  <linearGradient id="colorReviews" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorTenants" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="date" stroke="#64748b" fontSize={11} />
                <YAxis stroke="#64748b" fontSize={11} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#0f172a",
                    borderColor: "#334155",
                    borderRadius: "12px",
                    color: "#fff",
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="reviews"
                  name="Reviews Synced"
                  stroke="#3b82f6"
                  fillOpacity={1}
                  fill="url(#colorReviews)"
                />
                <Area
                  type="monotone"
                  dataKey="tenants"
                  name="Workspaces Created"
                  stroke="#10b981"
                  fillOpacity={1}
                  fill="url(#colorTenants)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Sentiment Pie Chart */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-xl flex flex-col justify-between">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-emerald-400" />
              <span>Review Sentiment Breakdown</span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">Sentiment analysis distribution</p>
          </div>

          <div className="h-56 w-full my-4">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={sentimentPieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {sentimentPieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={SENTIMENT_COLORS[index % SENTIMENT_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#0f172a",
                    borderColor: "#334155",
                    borderRadius: "12px",
                    color: "#fff",
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            {sentimentPieData.map((item, idx) => (
              <div key={item.name} className="flex items-center gap-2">
                <span
                  className="h-3 w-3 rounded-full"
                  style={{ backgroundColor: SENTIMENT_COLORS[idx % SENTIMENT_COLORS.length] }}
                />
                <span className="text-slate-300">{item.name}:</span>
                <span className="font-bold text-white">{item.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Plan Distribution & System Health */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Subscription Plan Bar Chart */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-xl">
          <h2 className="text-base font-bold text-white flex items-center gap-2 mb-4">
            <Building2 className="h-4 w-4 text-indigo-400" />
            <span>Workspace Plan Distribution</span>
          </h2>

          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={planBarData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="plan" stroke="#64748b" fontSize={11} />
                <YAxis stroke="#64748b" fontSize={11} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#0f172a",
                    borderColor: "#334155",
                    borderRadius: "12px",
                    color: "#fff",
                  }}
                />
                <Bar dataKey="count" fill="#6366f1" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* System Health Status Panel */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-xl">
          <h2 className="text-base font-bold text-white flex items-center gap-2 mb-4">
            <Activity className="h-4 w-4 text-emerald-400" />
            <span>Infrastructure Health & Services</span>
          </h2>

          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/60 p-3 text-xs">
              <div className="flex items-center gap-2.5">
                <Database className="h-4 w-4 text-blue-400" />
                <span className="font-medium text-slate-200">MySQL Database</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-slate-400 font-mono">{stats.systemServices.database.latencyMs}ms</span>
                <span className="rounded-full bg-emerald-500/20 text-emerald-400 px-2 py-0.5 font-semibold text-[10px]">
                  HEALTHY
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/60 p-3 text-xs">
              <div className="flex items-center gap-2.5">
                <Bot className="h-4 w-4 text-purple-400" />
                <span className="font-medium text-slate-200">Gemini AI Engine</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-slate-400 font-mono">{stats.systemServices.geminiAi.model}</span>
                <span className="rounded-full bg-purple-500/20 text-purple-400 px-2 py-0.5 font-semibold text-[10px]">
                  {stats.systemServices.geminiAi.status}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/60 p-3 text-xs">
              <div className="flex items-center gap-2.5">
                <Globe2 className="h-4 w-4 text-amber-400" />
                <span className="font-medium text-slate-200">Google OAuth & Places API</span>
              </div>
              <span className="rounded-full bg-amber-500/20 text-amber-400 px-2 py-0.5 font-semibold text-[10px]">
                {stats.systemServices.googleOauth.status}
              </span>
            </div>

            <div className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/60 p-3 text-xs">
              <div className="flex items-center gap-2.5">
                <Shield className="h-4 w-4 text-emerald-400" />
                <span className="font-medium text-slate-200">SSL & Custom Domain Engine</span>
              </div>
              <span className="rounded-full bg-emerald-500/20 text-emerald-400 px-2 py-0.5 font-semibold text-[10px]">
                MODE: {stats.systemServices.sslProvisioning.mode.toUpperCase()}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
