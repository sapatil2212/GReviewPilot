"use client";

/**
 * Shared layout for every /dashboard/** route.
 *
 * Renders the sidebar + header shell once so each page only needs to
 * emit its own <main> content. Mobile menu state lives here.
 */

import { useState, type ReactNode } from "react";
import { AppSidebar } from "@/components/dashboard/app-sidebar";
import { AppHeader } from "@/components/dashboard/app-header";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  return (
    <div className="flex h-screen overflow-hidden bg-[#F8FAFC] font-sans antialiased text-slate-900">
      <AppSidebar
        isOpenMobile={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
      />
      <div className="flex flex-1 flex-col h-screen overflow-hidden min-w-0">
        <AppHeader onOpenMobileMenu={() => setMobileOpen(true)} />
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 max-w-[1600px] mx-auto w-full">
          {children}
        </main>
      </div>
    </div>
  );
}
