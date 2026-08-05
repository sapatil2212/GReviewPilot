"use client";

import Link from "next/link";
import { useState } from "react";
import { Check, Sparkles, X, HelpCircle, ShieldCheck, Zap } from "lucide-react";
import { Navbar } from "@/components/site/navbar";
import { SiteFooter } from "@/components/site/footer";

const tiers = [
  { name: "Starter", monthly: 0, yearly: 0, tag: "For solo operators", description: "Everything you need to keep one location's reputation clean.", features: ["1 Google Business location", "50 AI replies / month", "Basic sentiment analytics", "QR review campaign (1)", "Weekly reputation digest", "Email support"], cta: "Start free", popular: false },
  { name: "Growth", monthly: 4999, yearly: 3999, tag: "For growing brands", description: "The plan most teams choose. AI that runs your reviews on autopilot.", features: ["Up to 5 locations", "Unlimited AI replies", "Advanced sentiment & topic analysis", "Unlimited QR campaigns", "Local SEO rank tracking", "Custom AI voice profile", "Slack & WhatsApp alerts", "Priority chat support"], cta: "Start 14-day trial", popular: true },
  { name: "Enterprise", monthly: null, yearly: null, tag: "For multi-location", description: "Governance, security, and success motion for 20+ locations.", features: ["Unlimited locations & seats", "Custom AI voice & content guardrails", "SSO / SAML & audit logs", "Role-based access controls", "Dedicated success manager", "99.95% uptime SLA", "Regional data residency", "White-glove onboarding"], cta: "Talk to sales", popular: false },
];

const compareRows = [
  { label: "Locations", starter: "1", growth: "5", enterprise: "Unlimited" },
  { label: "AI replies", starter: "50 / mo", growth: "Unlimited", enterprise: "Unlimited" },
  { label: "QR campaigns", starter: "1", growth: "Unlimited", enterprise: "Unlimited" },
  { label: "Sentiment analysis", starter: "Basic", growth: "Advanced", enterprise: "Advanced + forecasting" },
  { label: "Local SEO tracking", starter: false, growth: true, enterprise: true },
  { label: "Custom AI voice", starter: false, growth: true, enterprise: true },
  { label: "Slack / WhatsApp alerts", starter: false, growth: true, enterprise: true },
  { label: "SSO / SAML", starter: false, growth: false, enterprise: true },
  { label: "Audit logs", starter: false, growth: false, enterprise: true },
  { label: "Data residency", starter: false, growth: false, enterprise: true },
  { label: "Uptime SLA", starter: false, growth: "99.9%", enterprise: "99.95%" },
  { label: "Support", starter: "Email", growth: "Priority chat", enterprise: "Dedicated CSM" },
];

const faqs = [
  { q: "Do I need a credit card to start?", a: "No. The Starter plan is free forever and requires only a Google account. You'll only be asked for payment when you upgrade to Growth or above." },
  { q: "Can I change plans or cancel anytime?", a: "Yes. Upgrade, downgrade, or cancel from your dashboard in one click. If you cancel mid-cycle we credit the unused portion to your next invoice." },
  { q: "How does AI reply pricing work?", a: "Starter includes 50 AI replies per month. Growth and Enterprise are unlimited — no per-reply metering, no throttling." },
  { q: "Do you offer discounts for agencies?", a: "Yes — agencies managing 10+ client locations get bulk pricing and a partner dashboard. Reach out via the Contact page." },
  { q: "Is my customer data safe?", a: "We're SOC 2 Type II certified, DPDP Act 2023 compliant, ISO 27001 certified, and never train public models on your data. All customer data is stored in India (Mumbai & Hyderabad regions)." },
  { q: "What happens after the 14-day trial?", a: "Your account moves to Starter automatically. Nothing is deleted, nothing is charged — you can stay free or upgrade whenever you're ready." },
];

const guarantees = [
  { icon: ShieldCheck, title: "30-day money back", body: "Not seeing lift? We refund the full amount, no questions asked." },
  { icon: Zap, title: "Setup in 8 minutes", body: "Connect Google Business, pick your voice, and you're live." },
  { icon: HelpCircle, title: "Real humans, real fast", body: "Median first response: 12 minutes on chat, 2 hours on email." },
];

function Cell({ v }: { v: string | boolean }) {
  if (v === true) return <Check className="mx-auto h-4 w-4 text-primary" strokeWidth={2.5} />;
  if (v === false) return <X className="mx-auto h-4 w-4 text-muted-foreground/40" />;
  return <span className="text-sm text-foreground/90">{v}</span>;
}

export default function PricingPage() {
  const [yearly, setYearly] = useState(true);

  return (
    <div className="relative overflow-x-clip bg-background text-foreground">
      <Navbar />
      <main className="pt-32 pb-24">
        {/* Hero */}
        <section className="relative">
          <div className="pointer-events-none absolute inset-0 -z-10 bg-mesh opacity-70" />
          <div className="mx-auto max-w-4xl px-6 text-center">
            <div className="mx-auto flex max-w-fit items-center gap-2 rounded-full border border-border bg-white/60 px-3 py-1 text-[12px] font-medium text-foreground/80 shadow-soft backdrop-blur">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              Pricing
            </div>
            <h1 className="mt-6 text-5xl font-bold tracking-tight md:text-6xl">
              Plans that grow with{" "}
              <span className="text-gradient">your reputation</span>.
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-lg text-muted-foreground">
              Start free. Upgrade when you&apos;re winning. No credit card required to begin, no per-seat games, no surprise line items.
            </p>
            <div className="mt-8 inline-flex items-center gap-2 rounded-full border border-border bg-card p-1 shadow-soft">
              <button onClick={() => setYearly(false)} className={"rounded-full px-4 py-1.5 text-sm font-medium transition " + (!yearly ? "bg-foreground text-background" : "text-muted-foreground")}>Monthly</button>
              <button onClick={() => setYearly(true)} className={"rounded-full px-4 py-1.5 text-sm font-medium transition " + (yearly ? "bg-foreground text-background" : "text-muted-foreground")}>Yearly <span className="text-xs opacity-70">−20%</span></button>
            </div>
          </div>
        </section>

        {/* Tier cards */}
        <section className="mx-auto mt-16 grid max-w-6xl gap-6 px-6 md:grid-cols-3">
          {tiers.map((t) => (
            <div key={t.name} className={"relative flex flex-col rounded-2xl border p-8 shadow-soft transition hover:-translate-y-1 " + (t.popular ? "border-primary/30 bg-card ring-gradient shadow-elevated" : "border-border bg-card")}>
              {t.popular && <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-[image:var(--gradient-brand)] px-3 py-1 text-[11px] font-semibold text-white shadow-glow">Most popular</span>}
              <div className="text-sm font-medium text-muted-foreground">{t.tag}</div>
              <div className="mt-1 text-2xl font-bold">{t.name}</div>
              <p className="mt-2 text-sm text-muted-foreground">{t.description}</p>
              <div className="mt-5">
                {t.monthly === null ? (
                  <div className="text-4xl font-bold tracking-tight">Custom</div>
                ) : (
                  <div className="flex items-end gap-1">
                    <div className="text-5xl font-bold tracking-tight">₹{(yearly ? t.yearly! : t.monthly).toLocaleString("en-IN")}</div>
                    <div className="mb-2 text-sm text-muted-foreground">/ month</div>
                  </div>
                )}
                {t.monthly !== null && yearly && t.monthly > 0 && (
                  <div className="mt-1 text-xs text-muted-foreground">
                    Billed yearly · save ₹{((t.monthly - (t.yearly ?? 0)) * 12).toLocaleString("en-IN")} · GST extra
                  </div>
                )}
              </div>
              <ul className="mt-6 space-y-3 text-sm">
                {t.features.map((f) => (
                  <li key={f} className="flex items-start gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><span>{f}</span></li>
                ))}
              </ul>
              <Link
                href={t.name === "Enterprise" ? "/contact" : "/auth?mode=signup"}
                className={"mt-8 inline-flex items-center justify-center rounded-lg px-4 py-2.5 text-sm font-semibold transition " + (t.popular ? "bg-foreground text-background hover:-translate-y-0.5" : "border border-border bg-card text-foreground hover:bg-muted")}
              >
                {t.cta}
              </Link>
            </div>
          ))}
        </section>

        {/* Guarantees */}
        <section className="mx-auto mt-20 grid max-w-6xl gap-6 px-6 md:grid-cols-3">
          {guarantees.map((g) => (
            <div key={g.title} className="flex items-start gap-4 rounded-2xl border border-border bg-card p-6 shadow-soft">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[image:var(--gradient-brand)] text-white shadow-glow"><g.icon className="h-5 w-5" /></div>
              <div><div className="font-semibold">{g.title}</div><p className="mt-1 text-sm text-muted-foreground">{g.body}</p></div>
            </div>
          ))}
        </section>

        {/* Compare table */}
        <section className="mx-auto mt-24 max-w-6xl px-6">
          <div className="text-center">
            <div className="text-sm font-semibold uppercase tracking-wider text-primary">Compare plans</div>
            <h2 className="mt-3 text-4xl font-bold tracking-tight">Every feature, side by side.</h2>
          </div>
          <div className="mt-10 overflow-hidden rounded-2xl border border-border bg-card shadow-elevated">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    <th className="px-6 py-4 text-left font-semibold">Feature</th>
                    <th className="px-6 py-4 text-center font-semibold">Starter</th>
                    <th className="px-6 py-4 text-center font-semibold text-primary">Growth</th>
                    <th className="px-6 py-4 text-center font-semibold">Enterprise</th>
                  </tr>
                </thead>
                <tbody>
                  {compareRows.map((r, i) => (
                    <tr key={r.label} className={i % 2 === 0 ? "border-b border-border/60" : "border-b border-border/60 bg-muted/20"}>
                      <td className="px-6 py-3 font-medium text-foreground/90">{r.label}</td>
                      <td className="px-6 py-3 text-center"><Cell v={r.starter} /></td>
                      <td className="px-6 py-3 text-center"><Cell v={r.growth} /></td>
                      <td className="px-6 py-3 text-center"><Cell v={r.enterprise} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="mx-auto mt-24 max-w-4xl px-6">
          <div className="text-center">
            <div className="text-sm font-semibold uppercase tracking-wider text-primary">Pricing FAQ</div>
            <h2 className="mt-3 text-4xl font-bold tracking-tight">Questions, answered.</h2>
          </div>
          <div className="mt-10 grid gap-4 md:grid-cols-2">
            {faqs.map((f) => (
              <details key={f.q} className="group rounded-2xl border border-border bg-card p-5 shadow-soft">
                <summary className="flex cursor-pointer list-none items-center justify-between font-semibold">
                  {f.q}
                  <span className="ml-4 text-muted-foreground transition group-open:rotate-45">+</span>
                </summary>
                <p className="mt-3 text-sm text-muted-foreground">{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="mx-auto mt-24 max-w-5xl px-6">
          <div className="ring-gradient rounded-3xl bg-card p-10 text-center shadow-elevated">
            <h2 className="text-3xl font-bold tracking-tight md:text-4xl">Try GReviewPilot free for 14 days.</h2>
            <p className="mx-auto mt-3 max-w-xl text-muted-foreground">No credit card. Full Growth features. Cancel anytime — most teams never do.</p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link href="/auth?mode=signup" className="rounded-lg bg-foreground px-5 py-2.5 text-sm font-semibold text-background transition hover:-translate-y-0.5">Start free trial</Link>
              <Link href="/contact" className="rounded-lg border border-border bg-card px-5 py-2.5 text-sm font-medium text-foreground transition hover:bg-muted">Talk to sales</Link>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
