import type { Metadata } from "next";
import Link from "next/link";
import {
  Sparkles,
  Target,
  Users,
  Rocket,
  Shield,
  Globe2,
  Heart,
  TrendingUp,
  Award,
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
  { icon: Shield, title: "Privacy by default", body: "Your customer data never trains a public model. SOC 2, DPDP Act 2023, and India-only data residency baked in." },
  { icon: Heart, title: "Empathy first", body: "Behind every review is a human moment. Our AI is tuned to sound like a caring owner, never a bot." },
  { icon: Zap, title: "Speed compounds", body: "We ship every week. Small, sharp releases beat quarterly redesigns — and merchants feel it." },
];

const stats = [
  { value: "12,400+", label: "Businesses served" },
  { value: "3.2M", label: "AI replies sent" },
  { value: "14", label: "Countries live" },
  { value: "4.9★", label: "Customer rating" },
];

const timeline = [
  { year: "2023", title: "The 2am inbox", body: "Two founders manually reply to reviews for 40 coffee shops. The pattern is obvious — this can't scale by hand." },
  { year: "2024", title: "GReviewPilot is born", body: "First version ships to 12 pilot merchants. Reply time drops from 3 days to 8 minutes. Retention hits 100%." },
  { year: "2025", title: "Series A + AI Studio", body: "₹120 Cr raised from operators at Razorpay, Flipkart, and Zomato. We launch the AI Voice Studio and Local SEO suite." },
  { year: "2026", title: "GReviewPilot 2.0", body: "Multi-location intelligence, SSO, and sentiment forecasting go live. 10,000 businesses on the platform." },
];

const team = [
  { name: "Aarav Mehta", role: "Co-founder & CEO", bio: "Previously scaled ops at Zomato across 200+ cities. Believes reputation is the last unfair advantage for local business." },
  { name: "Priya Shankar", role: "Co-founder & CTO", bio: "Ex-Razorpay infra. Obsessed with latency, correctness, and the craft of building AI that Indian businesses actually trust." },
  { name: "Rohan Iyer", role: "Head of AI", bio: "Applied ML lead from Flipkart. Leads the models behind GReviewPilot's reply engine, sentiment, and voice cloning." },
  { name: "Nadia Rahman", role: "Head of Customer", bio: "Built support at Freshworks from 20 to 2,000. Runs every customer motion, from onboarding to enterprise success." },
];

const investors = ["Peak XV Partners", "Blume Ventures", "Kunal Shah", "Naval Ravikant", "Titan Capital", "Nexus Venture Partners"];

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
              GReviewPilot was founded in 2024 by operators who spent a decade
              scaling neighborhood businesses. We saw the same pattern
              everywhere: great service, invisible online. So we built the AI
              companion every storefront deserves.
            </p>
          </div>
        </section>

        {/* Stats */}
        <section className="mx-auto mt-20 max-w-6xl px-6">
          <div className="grid grid-cols-2 gap-4 rounded-3xl border border-border bg-card p-8 shadow-elevated md:grid-cols-4">
            {stats.map((s) => (
              <div key={s.label} className="text-center">
                <div className="text-4xl font-bold tracking-tight text-gradient">{s.value}</div>
                <div className="mt-1 text-sm text-muted-foreground">{s.label}</div>
              </div>
            ))}
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
                <div className="text-sm text-muted-foreground">Average customer impact</div>
                <div className="text-lg font-semibold">After 90 days on GReviewPilot</div>
              </div>
            </div>
            <ul className="mt-6 space-y-3 text-sm">
              <li className="flex justify-between border-b border-border/60 pb-2"><span className="text-muted-foreground">Reply time</span><span className="font-semibold">3 days → 6 minutes</span></li>
              <li className="flex justify-between border-b border-border/60 pb-2"><span className="text-muted-foreground">Review volume</span><span className="font-semibold">+312%</span></li>
              <li className="flex justify-between border-b border-border/60 pb-2"><span className="text-muted-foreground">Google star rating</span><span className="font-semibold">3.8 → 4.7</span></li>
              <li className="flex justify-between"><span className="text-muted-foreground">Local pack visibility</span><span className="font-semibold">+58%</span></li>
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

        {/* Timeline */}
        <section className="mx-auto mt-24 max-w-4xl px-6">
          <div className="text-center">
            <div className="text-sm font-semibold uppercase tracking-wider text-primary">Our story</div>
            <h2 className="mt-3 text-4xl font-bold tracking-tight">From a 2am inbox to 12,000 merchants.</h2>
          </div>
          <div className="relative mt-12 space-y-6">
            <div aria-hidden className="absolute left-4 top-2 bottom-2 w-px bg-gradient-to-b from-primary/60 via-border to-transparent md:left-24" />
            {timeline.map((t) => (
              <div key={t.year} className="relative pl-12 md:pl-32">
                <div className="absolute left-2.5 top-1.5 h-3 w-3 rounded-full bg-[image:var(--gradient-brand)] shadow-glow md:left-[86px]" />
                <div className="absolute left-0 top-0 text-sm font-semibold text-muted-foreground md:left-0 md:w-20 md:text-right">{t.year}</div>
                <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
                  <div className="font-semibold">{t.title}</div>
                  <p className="mt-1 text-sm text-muted-foreground">{t.body}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Team */}
        <section className="mx-auto mt-24 max-w-6xl px-6">
          <div className="text-center">
            <div className="text-sm font-semibold uppercase tracking-wider text-primary">The team</div>
            <h2 className="mt-3 text-4xl font-bold tracking-tight">Operators, engineers, and merchants.</h2>
            <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">
              24 people across 4 continents. Half of us have run a physical business. All of us have replied to a 1-star review.
            </p>
          </div>
          <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {team.map((m) => (
              <div key={m.name} className="rounded-2xl border border-border bg-card p-6 shadow-soft">
                <div className="h-14 w-14 rounded-full bg-[image:var(--gradient-brand)] shadow-glow" />
                <div className="mt-4 font-semibold">{m.name}</div>
                <div className="text-xs font-medium text-primary">{m.role}</div>
                <p className="mt-3 text-sm text-muted-foreground">{m.bio}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Investors */}
        <section className="mx-auto mt-24 max-w-6xl px-6">
          <div className="rounded-3xl border border-border bg-card p-10 shadow-elevated">
            <div className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-primary">
                  <Award className="h-4 w-4" /> Backed by operators
                </div>
                <h2 className="mt-2 text-3xl font-bold tracking-tight">
                  The people betting on us have built this before.
                </h2>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Globe2 className="h-4 w-4" />
                Remote-first · HQ Bengaluru
              </div>
            </div>
            <div className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
              {investors.map((i) => (
                <div key={i} className="rounded-xl border border-border bg-background/60 px-4 py-3 text-center text-sm font-medium text-foreground/80">
                  {i}
                </div>
              ))}
            </div>
          </div>
        </section>

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
