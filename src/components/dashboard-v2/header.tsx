"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Bell,
  Menu,
  CheckCircle2,
  AlertCircle,
  MessageSquare,
  User,
  Building,
  CreditCard,
  HelpCircle,
  LogOut,
  ChevronDown,
  ShieldCheck,
} from "lucide-react";

interface HeaderProps {
  onOpenMobileMenu: () => void;
  selectedRange?: string;
  onRangeChange?: (range: string) => void;
  onTriggerToast: (msg: string) => void;
}

const NOTIFICATIONS = [
  { id: 1, title: "New 5-star review from Sarah Johnson", time: "10 mins ago", type: "success" },
  { id: 2, title: "Response rate target achieved (92%)", time: "1 hour ago", type: "success" },
  { id: 3, title: "12 review request SMS sent automatically", time: "3 hours ago", type: "info" },
];

export function Header({
  onOpenMobileMenu,
  onTriggerToast,
}: HeaderProps) {
  const router = useRouter();
  const [showNotifications, setShowNotifications] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);

  const notificationsRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        notificationsRef.current &&
        !notificationsRef.current.contains(e.target as Node)
      ) {
        setShowNotifications(false);
      }
      if (
        profileRef.current &&
        !profileRef.current.contains(e.target as Node)
      ) {
        setShowProfileMenu(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleLogout = () => {
    setShowProfileMenu(false);
    onTriggerToast("Logging out...");
    setTimeout(() => {
      router.push("/auth?mode=login");
    }, 500);
  };

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-slate-200/80 bg-white/90 px-4 sm:px-6 backdrop-blur-md">
      {/* Left: Mobile Menu & Page Title */}
      <div className="flex items-center gap-3">
        <button
          onClick={onOpenMobileMenu}
          className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50 lg:hidden"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg sm:text-xl font-bold tracking-tight text-slate-900">
              Dashboard
            </h1>
            {/* Sync Status Badge */}
            <span className="hidden md:inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-700">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Google Sync Active
            </span>
          </div>
          <p className="hidden text-xs text-slate-500 sm:block">
            Monitor and improve your Google reputation
          </p>
        </div>
      </div>

      {/* Right: Notifications & Profile */}
      <div className="flex items-center gap-2.5 sm:gap-3">
        {/* Notification Bell */}
        <div ref={notificationsRef} className="relative">
          <button
            onClick={() => {
              setShowNotifications((v) => !v);
              setShowProfileMenu(false);
            }}
            className="relative flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50"
          >
            <Bell className="h-4 w-4" />
            <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white ring-2 ring-white">
              3
            </span>
          </button>

          {showNotifications && (
            <div className="absolute right-0 top-full z-50 mt-1.5 w-80 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-xl animate-in fade-in zoom-in-95 duration-200 ease-out">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                <div className="text-xs font-bold text-slate-900">Notifications</div>
                <button
                  onClick={() => {
                    setShowNotifications(false);
                    onTriggerToast("Marked all notifications as read");
                  }}
                  className="text-[11px] font-semibold text-blue-600 hover:underline"
                >
                  Mark all read
                </button>
              </div>
              <div className="mt-2 space-y-2">
                {NOTIFICATIONS.map((n) => (
                  <div
                    key={n.id}
                    className="flex items-start gap-2.5 rounded-xl p-2 transition hover:bg-slate-50"
                  >
                    {n.type === "success" ? (
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                    ) : n.type === "alert" ? (
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                    ) : (
                      <MessageSquare className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
                    )}
                    <div>
                      <div className="text-xs font-semibold text-slate-800">
                        {n.title}
                      </div>
                      <div className="text-[10px] text-slate-400">{n.time}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* User Profile Avatar with Dropdown */}
        <div ref={profileRef} className="relative">
          <button
            onClick={() => {
              setShowProfileMenu((v) => !v);
              setShowNotifications(false);
            }}
            className="flex items-center gap-2 rounded-xl p-1 transition hover:bg-slate-100"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white ring-2 ring-slate-200">
              AS
            </div>
            <ChevronDown className="h-3.5 w-3.5 text-slate-500 hidden sm:block" />
          </button>

          {/* Profile Dropdown Menu */}
          {showProfileMenu && (
            <div className="absolute right-0 top-full z-50 mt-1.5 w-64 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl animate-in fade-in zoom-in-95 duration-200 ease-out">
              {/* User Header Details */}
              <div className="flex items-center gap-3 border-b border-slate-100 p-2.5">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white">
                  AS
                </div>
                <div className="truncate">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-slate-900 truncate">Admin User</span>
                    <span className="rounded-full bg-blue-50 px-1.5 py-0.2 text-[9px] font-extrabold uppercase text-blue-600">
                      Super
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-400 truncate">admin@greviewpilot.com</div>
                </div>
              </div>

              {/* Menu Links */}
              <div className="py-1.5 space-y-0.5 text-xs">
                <button
                  onClick={() => {
                    setShowProfileMenu(false);
                    onTriggerToast("Opening Profile Settings...");
                  }}
                  className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition"
                >
                  <User className="h-4 w-4 text-slate-400" />
                  <span>Profile Settings</span>
                </button>

                <button
                  onClick={() => {
                    setShowProfileMenu(false);
                    onTriggerToast("Opening Locations & Business Info...");
                  }}
                  className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition"
                >
                  <Building className="h-4 w-4 text-slate-400" />
                  <span>Locations & Business</span>
                </button>

                <button
                  onClick={() => {
                    setShowProfileMenu(false);
                    onTriggerToast("Opening Billing & Plan...");
                  }}
                  className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition"
                >
                  <CreditCard className="h-4 w-4 text-slate-400" />
                  <span>Billing & Subscription</span>
                </button>

                <div className="my-1.5 border-t border-slate-100" />

                <button
                  onClick={() => {
                    setShowProfileMenu(false);
                    onTriggerToast("Opening Help & Documentation...");
                  }}
                  className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition"
                >
                  <HelpCircle className="h-4 w-4 text-slate-400" />
                  <span>Help & Docs</span>
                </button>

                <button
                  onClick={() => {
                    setShowProfileMenu(false);
                    onTriggerToast("Google API Connection Verified (SOC 2 Aligned)");
                  }}
                  className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition"
                >
                  <ShieldCheck className="h-4 w-4 text-emerald-500" />
                  <span>Security & Compliance</span>
                </button>

                <div className="my-1.5 border-t border-slate-100" />

                {/* Log Out */}
                <button
                  onClick={handleLogout}
                  className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left font-semibold text-red-600 hover:bg-red-50 transition"
                >
                  <LogOut className="h-4 w-4 text-red-500" />
                  <span>Log Out</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
