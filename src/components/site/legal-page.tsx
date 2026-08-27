import type { ReactNode } from "react";
import { Navbar } from "@/components/site/navbar";
import { SiteFooter } from "@/components/site/footer";

/**
 * Shared shell for legal / policy pages.
 *
 * These pages exist to satisfy a hard requirement of Google's OAuth
 * verification: an app requesting a sensitive scope must publish a privacy
 * policy on the same verified domain, reachable from the homepage, that
 * describes how Google user data is handled. Keeping them on one shell means
 * the disclosures stay consistent with each other.
 */
export function LegalPage({
  title,
  intro,
  lastUpdated,
  children,
}: {
  title: string;
  intro: string;
  lastUpdated: string;
  children: ReactNode;
}) {
  return (
    <div className="relative overflow-x-clip bg-background text-foreground">
      <Navbar />
      <main className="pt-32 pb-24">
        <section className="relative">
          <div className="pointer-events-none absolute inset-0 -z-10 bg-mesh opacity-70" />
          <div className="mx-auto max-w-3xl px-6">
            <h1 className="text-4xl font-bold tracking-tight md:text-5xl">
              {title}
            </h1>
            <p className="mt-4 text-lg text-muted-foreground">{intro}</p>
            <p className="mt-3 text-sm text-muted-foreground">
              Last updated:{" "}
              <time dateTime={lastUpdated}>{lastUpdated}</time>
            </p>
          </div>
        </section>

        <section className="mx-auto mt-12 max-w-3xl px-6">
          <div className="rounded-3xl border border-border bg-card p-8 shadow-elevated">
            <div className="space-y-8">{children}</div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}

/** A titled section within a legal document. */
export function LegalSection({
  id,
  heading,
  children,
}: {
  id: string;
  heading: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-28">
      <h2 className="text-xl font-semibold tracking-tight">{heading}</h2>
      <div className="mt-3 space-y-3 text-[15px] leading-relaxed text-muted-foreground">
        {children}
      </div>
    </section>
  );
}
