import Link from "next/link";
import Image from "next/image";
import { Twitter, Github, Linkedin } from "lucide-react";

const cols = [
  {
    title: "Product",
    links: ["Overview", "Features", "Dashboard", "AI Replies", "QR Campaigns", "Website Builder"],
  },
  {
    title: "Resources",
    links: ["Docs", "API", "Guides", "Changelog", "Status", "Blog"],
  },
  {
    title: "Company",
    links: ["About", "Customers", "Careers", "Press", "Contact", "Security"],
  },
  {
    title: "Legal",
    links: ["Privacy", "Terms", "DPA", "Cookies", "Trust", "Sub-processors"],
  },
];

export function SiteFooter() {
  return (
    <footer className="relative mt-24 border-t border-border bg-surface">
      <div className="bg-mesh pointer-events-none absolute inset-0 opacity-40" />
      <div className="relative mx-auto max-w-7xl px-6 py-16">
        <div className="grid gap-12 md:grid-cols-6">
          <div className="md:col-span-2">
            <Link href="/" className="inline-block">
              <Image
                src="/assets/logo/greviewpilot-logo.png"
                alt="GReviewPilot Logo"
                width={180}
                height={40}
                className="h-9 w-auto object-contain"
              />
            </Link>
            <p className="mt-4 max-w-sm text-sm text-muted-foreground">
              The AI growth platform for Google reputation. Automate reviews,
              delight customers, and win local search.
            </p>
            <form className="mt-6 flex max-w-sm items-center gap-2">
              <input
                type="email"
                placeholder="you@company.com"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none ring-primary/20 transition focus:border-primary focus:ring-4"
              />
              <button className="rounded-lg bg-foreground px-3 py-2 text-sm font-semibold text-background">
                Subscribe
              </button>
            </form>
          </div>
          {cols.map((c) => (
            <div key={c.title}>
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {c.title}
              </div>
              <ul className="mt-4 space-y-2.5">
                {c.links.map((l) => (
                  <li key={l}>
                    <a
                      href="#"
                      className="text-sm text-foreground/80 transition-colors hover:text-foreground"
                    >
                      {l}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-col items-start justify-between gap-4 border-t border-border pt-6 md:flex-row md:items-center">
          <div className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} GReviewPilot Technologies. All rights reserved.
          </div>
          <div className="flex items-center gap-3 text-muted-foreground">
            <a href="#" aria-label="Twitter" className="rounded-md p-1.5 transition hover:bg-background hover:text-foreground">
              <Twitter className="h-4 w-4" />
            </a>
            <a href="#" aria-label="GitHub" className="rounded-md p-1.5 transition hover:bg-background hover:text-foreground">
              <Github className="h-4 w-4" />
            </a>
            <a href="#" aria-label="LinkedIn" className="rounded-md p-1.5 transition hover:bg-background hover:text-foreground">
              <Linkedin className="h-4 w-4" />
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
