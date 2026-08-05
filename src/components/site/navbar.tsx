"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";

const nav = [
  { label: "Home", href: "/" },
  { label: "Pricing", href: "/pricing" },
  { label: "About", href: "/about" },
  { label: "Contact", href: "/contact" },
];

export function Navbar() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="fixed inset-x-0 top-0 z-50 flex justify-center px-4 pt-4 pointer-events-none">
      <div
        className={
          "pointer-events-auto flex w-full max-w-6xl items-center justify-between rounded-2xl px-5 py-3 transition-all duration-500 " +
          (scrolled
            ? "glass shadow-soft"
            : "bg-transparent border border-transparent")
        }
      >
        <Link href="/" className="group flex items-center">
          <Image
            src="/assets/logo/greviewpilot-logo.png"
            alt="GReviewPilot Logo"
            width={180}
            height={40}
            className="h-9 w-auto object-contain transition-transform group-hover:scale-105"
            priority
          />
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {nav.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={
                "group relative rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:text-foreground " +
                (pathname === n.href
                  ? "text-foreground"
                  : "text-muted-foreground")
              }
            >
              {n.label}
              <span className="absolute inset-x-3 -bottom-0.5 h-px scale-x-0 bg-[image:var(--gradient-text)] transition-transform duration-300 group-hover:scale-x-100" />
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          <Link
            href="/auth?mode=login"
            className="rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Log in
          </Link>
          <Link
            href="/auth?mode=signup"
            className="group relative inline-flex items-center gap-1.5 overflow-hidden rounded-lg bg-foreground px-3.5 py-2 text-sm font-semibold text-background transition-transform hover:-translate-y-0.5"
          >
            <span className="relative z-10">Sign up</span>
            <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/30 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
          </Link>
        </div>

        <button
          className="md:hidden rounded-lg p-2 text-foreground"
          onClick={() => setOpen((v) => !v)}
          aria-label="Toggle menu"
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {open && (
        <div className="glass pointer-events-auto absolute left-4 right-4 top-20 rounded-2xl p-4 md:hidden">
          <div className="flex flex-col">
            {nav.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                onClick={() => setOpen(false)}
                className="rounded-lg px-3 py-2 text-sm font-medium text-foreground"
              >
                {n.label}
              </Link>
            ))}
            <div className="mt-2 flex flex-col gap-2">
              <Link
                href="/auth?mode=login"
                onClick={() => setOpen(false)}
                className="rounded-lg border border-border px-3 py-2 text-center text-sm font-medium text-foreground"
              >
                Log in
              </Link>
              <Link
                href="/auth?mode=signup"
                onClick={() => setOpen(false)}
                className="rounded-lg bg-foreground px-3 py-2 text-center text-sm font-semibold text-background"
              >
                Sign up
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
