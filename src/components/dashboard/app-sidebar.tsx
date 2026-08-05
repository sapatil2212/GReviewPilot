"use client";

/**
 * Dashboard sidebar — route-based navigation.
 *
 * Consumed by `app/dashboard/layout.tsx`. Uses <Link> + usePathname
 * so browser back/forward + prefetch behave correctly. The /dashboard-v2
 * page keeps its own tab-based sidebar; do not import this from there.
 */

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, LogOut, X } from "lucide-react";
import { toast } from "sonner";
import { isNavItemActive, NAV_SECTIONS } from "./nav";
import { apiFetch } from "@/lib/fetcher";
import { useApi } from "@/lib/api/useApi";

interface AppSidebarProps {
  isOpenMobile: boolean;
  onCloseMobile: () => void;
}

export function AppSidebar({ isOpenMobile, onCloseMobile }: AppSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const userRef = useRef<HTMLDivElement>(null);
  const [showUserDropdown, setShowUserDropdown] = useState(false);

  // Pull real workspace + user from the auth endpoint. Cheap; cached
  // by the browser between navigations.
  const { data: session } = useApi(
    async () => {
      const res = await apiFetch<{
        user: {
          id: string;
          firstName: string;
          lastName: string;
          email: string;
          role: string;
        };
        tenant: { id: string; name: string; slug: string; plan: string } | null;
      }>("/api/auth/me");
      return res.data;
    },
    [],
  );

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (userRef.current && !userRef.current.contains(e.target as Node)) {
        setShowUserDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  async function handleLogout() {
    try {
      await apiFetch("/api/auth/logout", { method: "POST" });
      router.push("/auth?mode=login");
    } catch (err) {
      toast.error("Logout failed", {
        description: err instanceof Error ? err.message : "Please try again.",
      });
    }
  }

  const initials = session?.user
    ? `${session.user.firstName?.[0] ?? ""}${session.user.lastName?.[0] ?? ""}`.toUpperCase()
    : "";

  return (
    <>
      {isOpenMobile && (
        <div
          onClick={onCloseMobile}
          className="fixed inset-0 z-40 bg-slate-950/70 backdrop-blur-sm lg:hidden"
        />
      )}

      <aside
        className={
          "fixed top-0 bottom-0 left-0 z-50 flex h-screen w-64 shrink-0 flex-col bg-[#0B1528] text-slate-300 transition-transform duration-300 ease-in-out lg:sticky lg:top-0 lg:translate-x-0 border-r border-slate-800/80 " +
          (isOpenMobile ? "translate-x-0" : "-translate-x-full")
        }
      >
        {/* Logo */}
        <div className="flex h-16 items-center justify-between px-5 border-b border-slate-800/60">
          <Link href="/dashboard" className="flex items-center">
            <Image
              src="/assets/logo/greviewpilot-logo.png"
              alt="GReviewPilot"
              width={160}
              height={36}
              className="h-8 w-auto object-contain"
            />
          </Link>
          <button
            onClick={onCloseMobile}
            className="rounded-lg p-1 text-slate-400 hover:bg-[#182A45] lg:hidden"
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Workspace card */}
        <div className="px-3.5 py-3.5">
          <div className="flex items-center gap-2.5 rounded-xl border border-slate-700/60 bg-[#132238] p-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-600/20 text-blue-400 border border-blue-500/30">
              <Building2Fallback name={session?.tenant?.name} />
            </div>
            <div className="min-w-0 truncate">
              <div className="truncate text-xs font-semibold text-white">
                {session?.tenant?.name ?? "Loading…"}
              </div>
              <div className="truncate text-[11px] text-slate-400">
                {session?.tenant?.plan
                  ? `${session.tenant.plan[0]}${session.tenant.plan.slice(1).toLowerCase()} plan`
                  : ""}
              </div>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-2 space-y-4">
          {NAV_SECTIONS.map((section) => (
            <div key={section.label}>
              <div className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                {section.label}
              </div>
              <div className="space-y-0.5">
                {section.items.map((item) => {
                  const Icon = item.icon;
                  const active = isNavItemActive(item, pathname);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={onCloseMobile}
                      className={
                        "group relative flex items-center justify-between rounded-xl px-3 py-2.5 text-xs font-medium transition-all duration-200 " +
                        (active
                          ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold"
                          : "text-slate-300 hover:bg-[#182A45] hover:text-white")
                      }
                    >
                      <div className="flex items-center gap-3">
                        <Icon
                          className={
                            "h-4 w-4 transition-transform duration-200 group-hover:scale-110 " +
                            (active
                              ? "text-white"
                              : "text-slate-400 group-hover:text-white")
                          }
                        />
                        <span>{item.label}</span>
                      </div>
                      {item.badge && (
                        <span className="rounded-full bg-blue-500/20 border border-blue-400/30 px-2 py-0.5 text-[9px] font-semibold uppercase text-blue-300">
                          {item.badge}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* User */}
        <div ref={userRef} className="relative p-3.5 border-t border-slate-800/60">
          <button
            onClick={() => setShowUserDropdown((v) => !v)}
            className="flex w-full items-center justify-between rounded-xl border border-slate-700/60 bg-[#132238] p-2.5 transition hover:border-slate-600 hover:bg-[#182A45]"
          >
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-tr from-blue-500 to-indigo-600 text-xs font-bold text-white">
                {initials || "??"}
              </div>
              <div className="text-left">
                <div className="text-xs font-semibold text-white">
                  {session?.user
                    ? `${session.user.firstName} ${session.user.lastName}`
                    : "Loading…"}
                </div>
                <div className="text-[10px] text-slate-400 capitalize">
                  {session?.user?.role.replaceAll("_", " ").toLowerCase() ?? ""}
                </div>
              </div>
            </div>
            <ChevronDown className="h-4 w-4 text-slate-400" />
          </button>

          {showUserDropdown && (
            <div className="absolute bottom-full left-3.5 right-3.5 z-50 mb-2 rounded-2xl border border-slate-700 bg-[#132238] p-2 text-xs">
              <div className="border-b border-slate-800 p-2">
                <div className="font-semibold text-white">
                  {session?.user
                    ? `${session.user.firstName} ${session.user.lastName}`
                    : ""}
                </div>
                <div className="text-[10px] text-slate-400">
                  {session?.user?.email}
                </div>
              </div>
              <div className="mt-1 space-y-0.5">
                <Link
                  href="/dashboard/settings"
                  onClick={() => setShowUserDropdown(false)}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-slate-300 hover:bg-[#182A45] hover:text-white"
                >
                  Settings & Profile
                </Link>
                <button
                  onClick={handleLogout}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 font-semibold text-red-400 hover:bg-red-500/10"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  Log Out
                </button>
              </div>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}

function Building2Fallback({ name }: { name: string | null | undefined }) {
  const letter = (name?.trim()[0] ?? "?").toUpperCase();
  return <span className="text-xs font-bold">{letter}</span>;
}
