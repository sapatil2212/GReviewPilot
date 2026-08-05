"use client";

import Link from "next/link";
import Image from "next/image";
import { useState, useRef, useEffect } from "react";
import {
  LayoutDashboard,
  Star,
  BarChart3,
  MessageSquare,
  Send,
  Building2,
  Sparkles,
  FileText,
  Settings,
  Layers,
  ChevronDown,
  X,
  Check,
} from "lucide-react";

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  isOpenMobile?: boolean;
  onCloseMobile?: () => void;
}

const NAV_ITEMS = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "reviews", label: "Reviews", icon: Star },
  { id: "analytics", label: "Analytics", icon: BarChart3 },
  { id: "messages", label: "Messages", icon: MessageSquare },
  { id: "requests", label: "Requests", icon: Send, badge: "New" },
  { id: "listings", label: "Listings", icon: Building2 },
  { id: "ai-assistant", label: "AI Reply Assistant", icon: Sparkles },
  { id: "reports", label: "Reports", icon: FileText },
  { id: "settings", label: "Settings", icon: Settings },
  { id: "integrations", label: "Integrations", icon: Layers },
];

const LOCATIONS = [
  { id: "loc-1", name: "Acme Dental Care", address: "New York, USA" },
  { id: "loc-2", name: "Acme Dental Care", address: "Boston, USA" },
  { id: "loc-3", name: "Acme Dental Care", address: "Chicago, USA" },
];

export function Sidebar({
  activeTab,
  setActiveTab,
  isOpenMobile = false,
  onCloseMobile,
}: SidebarProps) {
  const [selectedLocation, setSelectedLocation] = useState(LOCATIONS[0]);
  const [showLocationDropdown, setShowLocationDropdown] = useState(false);
  const [showUserDropdown, setShowUserDropdown] = useState(false);

  const locationRef = useRef<HTMLDivElement>(null);
  const userRef = useRef<HTMLDivElement>(null);

  // Close dropdowns on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        locationRef.current &&
        !locationRef.current.contains(e.target as Node)
      ) {
        setShowLocationDropdown(false);
      }
      if (
        userRef.current &&
        !userRef.current.contains(e.target as Node)
      ) {
        setShowUserDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpenMobile && (
        <div
          onClick={onCloseMobile}
          className="fixed inset-0 z-40 bg-slate-950/70 backdrop-blur-sm lg:hidden"
        />
      )}

      {/* Modern Navy Blue Sidebar */}
      <aside
        className={
          "fixed top-0 bottom-0 left-0 z-50 flex h-screen w-64 shrink-0 flex-col bg-[#0B1528] text-slate-300 transition-transform duration-300 ease-in-out lg:sticky lg:top-0 lg:translate-x-0 border-r border-slate-800/80 " +
          (isOpenMobile ? "translate-x-0" : "-translate-x-full")
        }
      >
        {/* Top Header / Logo */}
        <div className="flex h-16 items-center justify-between px-5 border-b border-slate-800/60">
          <Link href="/" className="flex items-center">
            <Image
              src="/assets/logo/greviewpilot-logo.png"
              alt="GReviewPilot Logo"
              width={160}
              height={36}
              className="h-8 w-auto object-contain"
            />
          </Link>
          <button
            onClick={onCloseMobile}
            className="rounded-lg p-1 text-slate-400 hover:bg-[#182A45] lg:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Location / Business Switcher Card */}
        <div ref={locationRef} className="relative px-3.5 py-3.5">
          <button
            onClick={() => setShowLocationDropdown((v) => !v)}
            className="flex w-full items-center justify-between rounded-xl border border-slate-700/60 bg-[#132238] p-2.5 transition-colors hover:border-slate-600 hover:bg-[#182A45]"
          >
            <div className="flex items-center gap-2.5 overflow-hidden text-left">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-600/20 text-blue-400 border border-blue-500/30">
                <svg className="h-4 w-4 fill-current" viewBox="0 0 24 24">
                  <path d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 15.987 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z" />
                </svg>
              </div>
              <div className="truncate">
                <div className="truncate text-xs font-semibold text-white">
                  {selectedLocation.name}
                </div>
                <div className="truncate text-[11px] text-slate-400">
                  {selectedLocation.address}
                </div>
              </div>
            </div>
            <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
          </button>

          {/* Location Dropdown Menu */}
          {showLocationDropdown && (
            <div className="absolute left-3.5 right-3.5 top-full z-50 mt-1 rounded-xl border border-slate-700 bg-[#132238] p-1.5 shadow-2xl animate-in fade-in zoom-in-95 duration-200 ease-out">
              {LOCATIONS.map((loc) => (
                <button
                  key={loc.id}
                  onClick={() => {
                    setSelectedLocation(loc);
                    setShowLocationDropdown(false);
                  }}
                  className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-xs hover:bg-[#182A45]"
                >
                  <div>
                    <div className="font-medium text-white">{loc.name}</div>
                    <div className="text-[10px] text-slate-400">{loc.address}</div>
                  </div>
                  {selectedLocation.id === loc.id && (
                    <Check className="h-3.5 w-3.5 text-blue-400" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 overflow-y-auto px-3 py-2 space-y-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  setActiveTab(item.id);
                  if (onCloseMobile) onCloseMobile();
                }}
                className={
                  "group relative flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-xs font-medium transition-all duration-200 " +
                  (isActive
                    ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold"
                    : "text-slate-300 hover:bg-[#182A45] hover:text-white")
                }
              >
                <div className="flex items-center gap-3">
                  <Icon
                    className={
                      "h-4 w-4 transition-transform duration-200 group-hover:scale-110 " +
                      (isActive ? "text-white" : "text-slate-400 group-hover:text-white")
                    }
                  />
                  <span>{item.label}</span>
                </div>
                {item.badge && (
                  <span className="rounded-full bg-blue-500/20 border border-blue-400/30 px-2 py-0.5 text-[9px] font-semibold uppercase text-blue-300">
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Bottom Section: User Profile */}
        <div ref={userRef} className="relative p-3.5 border-t border-slate-800/60">
          <button
            onClick={() => setShowUserDropdown((v) => !v)}
            className="flex w-full items-center justify-between rounded-xl border border-slate-700/60 bg-[#132238] p-2.5 transition hover:border-slate-600 hover:bg-[#182A45]"
          >
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-tr from-blue-500 to-indigo-600 text-xs font-bold text-white shadow-md">
                AS
              </div>
              <div className="text-left">
                <div className="text-xs font-semibold text-white">Admin User</div>
                <div className="text-[10px] text-slate-400">Super Admin</div>
              </div>
            </div>
            <ChevronDown className="h-4 w-4 text-slate-400" />
          </button>

          {/* User Sidebar Dropdown Menu */}
          {showUserDropdown && (
            <div className="absolute bottom-full left-3.5 right-3.5 z-50 mb-2 rounded-2xl border border-slate-700 bg-[#132238] p-2 text-xs shadow-2xl animate-in fade-in zoom-in-95 duration-200 ease-out">
              <div className="border-b border-slate-800 p-2">
                <div className="font-bold text-white">Admin User</div>
                <div className="text-[10px] text-slate-400">admin@greviewpilot.com</div>
              </div>
              <div className="mt-1 space-y-0.5">
                <button
                  onClick={() => {
                    setActiveTab("settings");
                    setShowUserDropdown(false);
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-slate-300 hover:bg-[#182A45] hover:text-white"
                >
                  Settings & Profile
                </button>
                <Link
                  href="/auth?mode=login"
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 font-semibold text-red-400 hover:bg-red-500/10"
                >
                  Log Out
                </Link>
              </div>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
