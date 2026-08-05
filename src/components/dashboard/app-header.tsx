"use client";

/**
 * Dashboard top bar — used by app/dashboard/layout.tsx.
 * Renders the mobile menu button, page title (derived from route),
 * and a slot on the right for page-specific actions.
 */

import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { NAV_SECTIONS } from "./nav";
import type { ReactNode } from "react";

interface AppHeaderProps {
  onOpenMobileMenu: () => void;
  right?: ReactNode;
}

function findTitle(pathname: string): string {
  for (const section of NAV_SECTIONS) {
    for (const item of section.items) {
      if (
        pathname === item.href ||
        (item.href !== "/dashboard" && pathname.startsWith(item.href + "/"))
      ) {
        return item.label;
      }
    }
  }
  return "Dashboard";
}

export function AppHeader({ onOpenMobileMenu, right }: AppHeaderProps) {
  const pathname = usePathname();
  const title = findTitle(pathname);
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-slate-200 bg-white/80 px-4 backdrop-blur-md sm:px-6">
      <div className="flex items-center gap-3">
        <button
          onClick={onOpenMobileMenu}
          className="rounded-lg border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-50 lg:hidden"
          aria-label="Open menu"
        >
          <Menu className="h-4 w-4" />
        </button>
        <h1 className="text-sm font-semibold text-slate-900 sm:text-base">
          {title}
        </h1>
      </div>
      <div className="flex items-center gap-2">{right}</div>
    </header>
  );
}
