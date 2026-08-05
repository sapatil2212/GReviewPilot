"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/dashboard/team", label: "Members" },
  { href: "/dashboard/team/invitations", label: "Invitations" },
];

export function TeamNav() {
  const pathname = usePathname();
  return (
    <div className="mb-4 flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-white p-1">
      {TABS.map((t) => {
        const active = pathname === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            className={
              "rounded-lg px-3 py-1.5 text-xs font-semibold transition " +
              (active
                ? "bg-slate-900 text-white"
                : "text-slate-600 hover:bg-slate-50")
            }
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
