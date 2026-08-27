import type { Metadata } from "next";
import Link from "next/link";
import {
  Sparkles,
  Target,
  Users,
  Rocket,
  Shield,
  Heart,
  TrendingUp,
  Zap,
} from "lucide-react";
import { Navbar } from "@/components/site/navbar";
import { SiteFooter } from "@/components/site/footer";

export const metadata: Metadata = {
  title: "About",
  description:
    "GReviewPilot is on a mission to help every local business build unshakeable trust online with AI-powered reputation management.",
  openGraph: {
    title: "About — GReviewPilot",
    description:
      "Meet the team building the AI reputation platform trusted by modern local businesses.",
  },
};

const values = [
  { icon: Target, title: "Trust, engineered", body: "Reputation isn't a vanity metric — it's revenue. We build with the same care banks use for money." },
  { icon: Users, title: "Customer-obsessed", body: "Every feature ships from a real merchant conversation. Founders answer every ticket in the first year." },
  { icon: Rocket, title: "AI that ships work", body: "We don't chase demos. Our AI replies, coaches, and reports so your team compounds, not clicks." },
  { icon: Shield, title: "Privacy by default", body: "Google credentials are encrypted at rest, workspaces are isolated, and our Privacy Policy states plainly what we access and how to delete it." },
  { icon: Heart, title: "Empathy first", body: "Behind every review is a human moment. Our AI is tuned to sound like a caring owner, never a bot." },
  { icon: Zap, title: "Speed compounds", body: "We ship every week. Small, sharp releases beat quarterly redesigns — and merchants feel it." },
];

// Removed, pending substantiation:
//
//   - `stats`     — "12,400+ businesses served", "3.2M AI replies sent",
//                   "14 countries live", "4.9★ customer rating".
//   - `timeline`  — a 2023-2026 company history including a Series A and
//                   "₹120 Cr raised from operators at Razorpay, Flipkart and
//                   Zomato", plus merchant counts.
//   - `team`      — four named people with biographies.
//   - `investors` — Peak XV Partners, Blume Ventures, Kunal Shah,
//                   Naval Ravikant, Titan Capital, Nexus Venture Partners.
//
// The funding and investor entries named real firms and individuals as
// backers, which implies an endorsement. Restore any of this only from
// official company records, and for the team and investor lists only with
// the consent of the people named.
//
// What the platform does is documented in `values` below and on the
// homepage; none of that depended on these figures.

export default function AboutPage() {
  return (
    <div className="relative overflow-x-clip bg-background text-foreground">
      <Navbar />
      <main className="pt-32 pb-24">
        {/* Hero */}
        <section className="relative">
          <div className="pointer-events-none absolute inset-0 -z-10 bg-mesh opacity-70" />
          <div className="mx-auto max-w-5xl px-6 text-center">
            <div className="mx-auto flex max-w-fit items-center gap-2 rounded-full border border-border bg-white/60 px-3 py-1 text-[12px] font-medium text-foreground/80 shadow-soft backdrop-blur">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              About GReviewPilot
            </div>
            <h1 className="mt-6 text-5xl font-bold tracking-tight md:text-6xl">
              We help local businesses win{" "}
              <span className="text-gradient">the trust economy</span>.
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
              We built GReviewPilot because the same pattern shows up
              everywhere: great service, invisible online. Local businesses earn
              trust in person and then lose it to an unanswered review. This is
              the AI companion we thought every storefront deserved.
            </p>
          </div>
        </section>

        {/* Mission */}
        <section className="mx-auto mt-24 grid max-w-6xl gap-10 px-6 md:grid-cols-2 md:items-center">
          <div>
            <div className="text-sm font-semibold uppercase tracking-wider text-primary">Our mission</div>
            <h2 className="mt-3 text-4xl font-bold tracking-tight">
              Make world-class reputation<br />a superpower for every merchant.
            </h2>
            <p className="mt-5 text-[15px] leading-relaxed text-muted-foreground">
              Nine out of ten customers read reviews before they walk in. Yet most local businesses are still fighting reputation with spreadsheets, guilt, and a browser tab left open at 11pm.
            </p>
            <p className="mt-4 text-[15px] leading-relaxed text-muted-foreground">
              We&apos;re building the operating system for reputation — one that listens across every channel, replies in your exact voice, and turns every mention into a compounding growth loop.
            </p>
          </div>
          <div className="ring-gradient rounded-3xl bg-card p-8 shadow-elevated">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[image:var(--gradient-brand)] text-white shadow-glow">
                <TrendingUp className="h-6 w-6" />
              </div>
              <div>
                <div className="text-sm text-muted-foreground">What the platform handles</div>
                <div className="text-lg font-semibold">From one workspace</div>
              </div>
            </div>
            {/* Previously four outcome metrics ("+312% review volume",
                "3.8 → 4.7 rating", "+58% local pack visibility"). Replaced
                with the capabilities those numbers were attached to, which
                are verifiable in the product. */}
            <ul className="mt-6 space-y-3 text-sm">
              <li className="flex justify-between border-b border-border/60 pb-2"><span className="text-muted-foreground">Reviews</span><span className="font-semibold">Synced &amp; answered</span></li>
              <li className="flex justify-between border-b border-border/60 pb-2"><span className="text-muted-foreground">Replies</span><span className="font-semibold">AI-drafted, you approve</span></li>
              <li className="flex justify-between border-b border-border/60 pb-2"><span className="text-muted-foreground">Sentiment</span><span className="font-semibold">Tracked by theme</span></li>
              <li className="flex justify-between"><span className="text-muted-foreground">Locations</span><span className="font-semibold">Managed together</span></li>
            </ul>
          </div>
        </section>

        {/* Values */}
        <section className="mx-auto mt-24 max-w-6xl px-6">
          <div className="text-center">
            <div className="text-sm font-semibold uppercase tracking-wider text-primary">What we believe</div>
            <h2 className="mt-3 text-4xl font-bold tracking-tight">Six principles that shape every decision.</h2>
          </div>
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {values.map((v) => (
              <div key={v.title} className="ring-gradient rounded-2xl bg-card p-6 shadow-soft transition hover:-translate-y-1">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[image:var(--gradient-brand)] text-white shadow-glow">
                  <v.icon className="h-5 w-5" />
                </div>
                <h3 className="mt-4 text-lg font-semibold">{v.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{v.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Timeline, Team and Investors sections removed.

            They presented an unsubstantiated company history (Series A,
            "₹120 Cr raised", merchant counts), four named team members with
            biographies, a headcount claim, and an investor wall naming real
            firms and individuals as backers.

            Restore only from official company records, and only with the
            consent of anyone named. The surrounding sections (hero, mission,
            values) stand on their own, so the page remains balanced. */}
        {/* CTA */}
        <section className="mx-auto mt-24 max-w-4xl px-6 text-center">
          <h2 className="text-4xl font-bold tracking-tight">Want to build the trust economy with us?</h2>
          <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
            We&apos;re hiring across engineering, AI, and customer success. And we&apos;d love to hear from you even if there&apos;s no role open.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/contact" className="rounded-lg bg-foreground px-5 py-2.5 text-sm font-semibold text-background transition hover:-translate-y-0.5">
              Get in touch
            </Link>
            <Link href="/pricing" className="rounded-lg border border-border bg-card px-5 py-2.5 text-sm font-medium text-foreground transition hover:bg-muted">
              See pricing
            </Link>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
