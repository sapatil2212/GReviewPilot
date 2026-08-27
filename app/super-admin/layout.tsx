"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  LayoutDashboard,
  Building2,
  Users,
  BarChart3,
  ShieldCheck,
  LogOut,
  Sparkles,
  Activity,
  ChevronRight,
  Shield,
} from "lucide-react";
import { toast } from "sonner";

const navItems = [
  { href: "/super-admin", label: "Overview", icon: LayoutDashboard },
  { href: "/super-admin/tenants", label: "Workspaces", icon: Building2 },
  { href: "/super-admin/users", label: "User Directory", icon: Users },
  { href: "/super-admin/analytics", label: "Analytics & Trends", icon: BarChart3 },
  { href: "/super-admin/audit-logs", label: "Audit Logs", icon: ShieldCheck },
];

export default function SuperAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();

  // If on login page, skip the admin dashboard layout
  if (pathname === "/super-admin/login") {
    return <>{children}</>;
  }

  const handleLogout = async () => {
    toast.success("Super Admin signed out");
    await signOut({ callbackUrl: "/super-admin/login" });
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex font-sans">
      {/* Sidebar */}
      <aside className="w-64 border-r border-slate-800 bg-slate-900/60 backdrop-blur-xl flex flex-col justify-between shrink-0">
        <div>
          {/* Brand Logo */}
          <div className="h-16 px-6 border-b border-slate-800 flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
              <Shield className="h-5 w-5 text-white" />
            </div>
            <div>
              <div className="font-bold text-sm text-white tracking-wide flex items-center gap-1.5">
                <span>GReviewPilot</span>
                <span className="rounded-md bg-blue-500/20 border border-blue-400/30 px-1.5 py-0.2 text-[10px] font-semibold text-blue-400">
                  SUPER
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-medium">Super Admin Dashboard</p>
            </div>
          </div>

          {/* Nav Links */}
          <nav className="p-4 space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive =
                pathname === item.href ||
                (item.href !== "/super-admin" && pathname.startsWith(item.href));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                    isActive
                      ? "bg-blue-600/20 text-blue-400 border border-blue-500/30 font-semibold shadow-sm shadow-blue-500/10"
                      : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
                  }`}
                >
                  <Icon className={`h-4.5 w-4.5 ${isActive ? "text-blue-400" : "text-slate-400"}`} />
                  <span>{item.label}</span>
                  {isActive && <ChevronRight className="h-4 w-4 ml-auto text-blue-400" />}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Footer info & Logout */}
        <div className="p-4 border-t border-slate-800 space-y-3">
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
            <div className="flex items-center gap-2 text-xs text-emerald-400 font-semibold mb-1">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span>System Status: Healthy</span>
            </div>
            <p className="text-[11px] text-slate-400">Live Database Sync Active</p>
          </div>

          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold text-rose-400 border border-rose-500/20 bg-rose-500/10 hover:bg-rose-500/20 transition"
          >
            <LogOut className="h-4 w-4" />
            <span>Sign Out Super Admin</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Header Bar */}
        <header className="h-16 border-b border-slate-800 bg-slate-900/40 px-8 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 text-sm font-medium text-slate-300">
            <span>Platform Operations</span>
            <span className="text-slate-600">/</span>
            <span className="text-white font-semibold capitalize">
              {pathname === "/super-admin"
                ? "Overview"
                : pathname.replace("/super-admin/", "").replace("-", " ")}
            </span>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-800 bg-slate-900 text-xs text-slate-300">
              <Activity className="h-3.5 w-3.5 text-blue-400" />
              <span>Role: <strong className="text-white">SUPER_ADMIN</strong></span>
            </div>

            <div className="h-8 w-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-xs font-bold text-white shadow-md">
              SA
            </div>
          </div>
        </header>

        {/* Page Viewport */}
        <main className="flex-1 overflow-y-auto p-8">{children}</main>
      </div>
    </div>
  );
}
