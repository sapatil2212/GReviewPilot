"use client";

import {
  ArrowRight,
  Sparkles,
  Star,
  QrCode,
  MessageSquare,
  BarChart3,
  ShieldCheck,
  Globe,
  Check,
  Minus,
  Plus,
  Lock,
  Cpu,
  Users,
} from "lucide-react";
import { useState } from "react";
import { Navbar } from "@/components/site/navbar";
import { SiteFooter } from "@/components/site/footer";
import { InteractiveGrid } from "@/components/site/interactive-grid";
import {
  HeroDashboard,
  FEATURES,
  FeatureCard,
  GradientButton,
  SectionEyebrow,
  Reveal,
  CheckList,
} from "@/components/site/hero-parts";
import { useCountUp, useInView } from "@/lib/hooks";

export default function Landing() {
  return (
    <div className="relative overflow-x-clip bg-background text-foreground">
      <Navbar />
      <main>
        <Hero />
        <LogoCloud />
        <Metrics />
        <Features />
        <DashboardShowcase />
        <HowItWorks />
        <Testimonials />
        <Pricing />
        <Enterprise />
        <FAQ />
        <FinalCTA />
      </main>
      <SiteFooter />
    </div>
  );
}

/* ------------------------------ HERO ------------------------------ */

function Hero() {
  return (
    <section className="relative isolate pt-36 pb-24">
      {/* animated background */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-mesh opacity-40" />
        <div className="absolute -top-24 left-1/2 h-[560px] w-[900px] -translate-x-1/2 rounded-full bg-primary/10 blur-[140px] animate-blob" />
        <div className="absolute top-32 right-10 h-72 w-72 rounded-full bg-secondary/10 blur-[120px] animate-blob [animation-delay:2s]" />
        <div className="absolute bottom-10 left-10 h-64 w-64 rounded-full bg-accent/10 blur-[120px] animate-blob [animation-delay:4s]" />
        <div className="absolute bg-noise inset-0 opacity-[0.08] mix-blend-overlay" />
      </div>
      {/* interactive animated grid */}
      <InteractiveGrid className="-z-10" cell={56} pulseCount={32} />

      <div className="mx-auto max-w-7xl px-6">
        <Reveal>
          <div className="mx-auto flex max-w-fit items-center gap-2 rounded-full border border-border bg-white/60 px-3 py-1 text-[12px] font-medium text-foreground/80 shadow-soft backdrop-blur">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[image:var(--gradient-brand)]">
              <Sparkles className="h-3 w-3 text-white" />
            </span>
            Introducing GReviewPilot 2.0 — AI Business Coach
            <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
        </Reveal>

        <Reveal delay={80}>
          <h1 className="mt-8 text-center text-[44px] font-semibold leading-[1.02] tracking-[-0.03em] sm:text-6xl md:text-7xl">
            Build Trust.
            <br />
            Automate Reviews.
            <br />
            <span className="text-gradient animate-gradient-x bg-clip-text">
              Grow with AI.
            </span>
          </h1>
        </Reveal>

        <Reveal delay={160}>
          <p className="mx-auto mt-6 max-w-2xl text-center text-[16px] leading-relaxed text-muted-foreground sm:text-[17px]">
            GReviewPilot is the AI growth platform for your Google presence.
            Reply to reviews in your voice, launch QR campaigns, monitor sentiment,
            and win local search — all from one intelligent workspace.
          </p>
        </Reveal>

        <Reveal delay={240}>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <GradientButton href="/auth?mode=signup">
              Get Started <ArrowRight className="h-4 w-4" />
            </GradientButton>
            <GradientButton href="/contact" variant="outline">
              Book Demo Now
            </GradientButton>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[12.5px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Check className="h-3.5 w-3.5 text-success" /> No credit card
            </span>
            <span className="flex items-center gap-1.5">
              <Check className="h-3.5 w-3.5 text-success" /> Setup in 3 minutes
            </span>
            <span className="flex items-center gap-1.5">
              <Check className="h-3.5 w-3.5 text-success" /> SOC 2 aligned
            </span>
          </div>
        </Reveal>

        <div className="mt-16">
          <Reveal delay={300}>
            <HeroDashboard />
          </Reveal>
        </div>
      </div>
    </section>
  );
}

/* --------------------------- LOGO CLOUD --------------------------- */

const LOGOS = [
  "Aroma Café",
  "NorthPeak",
  "Sundara Salon",
  "Tokri",
  "Vertex Dental",
  "Kinara Clinics",
  "Meridian Auto",
  "Lumo Fitness",
];

function LogoCloud() {
  return (
    <section className="relative py-14">
      <div className="mx-auto max-w-7xl px-6">
        <Reveal>
          <p className="text-center text-[12.5px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Trusted by 4,200+ local & multi-location businesses
          </p>
        </Reveal>
        <div className="relative mt-8 overflow-hidden">
          <div className="pointer-events-none absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-background to-transparent z-10" />
          <div className="pointer-events-none absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-background to-transparent z-10" />
          <div className="flex gap-14 [animation:marquee_28s_linear_infinite]">
            {[...LOGOS, ...LOGOS].map((l, i) => (
              <span
                key={i}
                className="whitespace-nowrap text-[22px] font-semibold tracking-tight text-muted-foreground/60 grayscale transition hover:grayscale-0 hover:text-foreground"
              >
                {l}
              </span>
            ))}
          </div>
          <style>{`@keyframes marquee { from { transform: translateX(0) } to { transform: translateX(-50%) } }`}</style>
        </div>
      </div>
    </section>
  );
}

/* --------------------------- METRICS ------------------------------ */

function Metric({ target, suffix = "", label }: { target: number; suffix?: string; label: string }) {
  const { ref, inView } = useInView<HTMLDivElement>(0.3);
  const v = useCountUp(target, 1800, inView);
  const isFloat = target % 1 !== 0;
  return (
    <div ref={ref} className="relative rounded-2xl border border-border bg-surface/50 p-6 backdrop-blur">
      <div className="text-[36px] font-semibold tracking-tight sm:text-[44px]">
        <span className="text-gradient">
          {isFloat ? v.toFixed(1) : Math.round(v).toLocaleString()}
        </span>
        <span className="text-foreground">{suffix}</span>
      </div>
      <div className="mt-1 text-[13px] text-muted-foreground">{label}</div>
    </div>
  );
}

function Metrics() {
  return (
    <section id="product" className="relative py-20">
      <div className="mx-auto max-w-7xl px-6">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <Metric target={4.8} label="Average rating lift" />
          <Metric target={5.2} suffix="×" label="More reviews with QR" />
          <Metric target={12} suffix="s" label="Median AI reply time" />
          <Metric target={38} suffix="%" label="Local rank improvement" />
        </div>
      </div>
    </section>
  );
}

/* --------------------------- FEATURES ----------------------------- */

function Features() {
  return (
    <section id="features" className="relative py-24">
      <div className="mx-auto max-w-7xl px-6">
        <Reveal>
          <div className="flex flex-col items-center text-center">
            <SectionEyebrow>Core platform</SectionEyebrow>
            <h2 className="mt-4 max-w-2xl text-[34px] font-semibold leading-[1.05] tracking-[-0.02em] sm:text-5xl">
              One workspace for your entire{" "}
              <span className="text-gradient">Google presence</span>.
            </h2>
            <p className="mt-4 max-w-xl text-[15.5px] text-muted-foreground">
              Built for owners, marketers, and multi-location teams. Every
              feature is AI-native from day one.
            </p>
          </div>
        </Reveal>

        <div className="mt-14 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f, i) => (
            <Reveal key={f.title} delay={i * 60}>
              <FeatureCard {...f} />
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* -------------------- DASHBOARD SHOWCASE / SPLIT ------------------ */

function DashboardShowcase() {
  const rows = [
    {
      icon: MessageSquare,
      title: "AI Reply Studio",
      desc: "Craft brand-perfect replies in seconds. Multiple tones, auto-escalation, multilingual out of the box.",
    },
    {
      icon: BarChart3,
      title: "Reputation Intelligence",
      desc: "Sentiment, funnel, and topic analytics from every review — turned into a weekly action plan.",
    },
    {
      icon: QrCode,
      title: "QR & SMS Campaigns",
      desc: "Custom-branded QR flows that filter unhappy customers and 5× your review volume.",
    },
    {
      icon: Globe,
      title: "Website & Widgets",
      desc: "A blazing-fast site with live review widgets, schema markup, and local SEO baked in.",
    },
  ];
  return (
    <section id="dashboard" className="relative py-24">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-mesh opacity-60" />
      <div className="mx-auto max-w-7xl px-6">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <Reveal>
            <SectionEyebrow>Interactive dashboard</SectionEyebrow>
            <h2 className="mt-4 text-[34px] font-semibold leading-[1.05] tracking-[-0.02em] sm:text-5xl">
              A control room for your <span className="text-gradient">reputation</span>.
            </h2>
            <p className="mt-4 max-w-lg text-[15.5px] text-muted-foreground">
              Every metric that matters, unified. Every action you&apos;d normally
              take — automated. GReviewPilot turns your Google Business Profile into
              a growth engine.
            </p>
            <div className="mt-8 space-y-6">
              {rows.map((r) => (
                <div key={r.title} className="flex items-start gap-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-background shadow-soft">
                    <r.icon className="h-4.5 w-4.5 text-primary" />
                  </div>
                  <div>
                    <div className="font-semibold">{r.title}</div>
                    <p className="mt-1 text-[13.5px] text-muted-foreground">
                      {r.desc}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </Reveal>
          <Reveal delay={120}>
            <HeroDashboard />
          </Reveal>
        </div>
      </div>
    </section>
  );
}

/* --------------------------- HOW IT WORKS ------------------------- */

function HowItWorks() {
  const steps = [
    {
      k: "01",
      title: "Connect your Google Business Profile",
      desc: "One-click OAuth. We sync locations, reviews, insights, and Q&A instantly.",
    },
    {
      k: "02",
      title: "GReviewPilot AI learns your brand voice",
      desc: "Upload guidelines or paste your website — AI captures your tone in minutes.",
    },
    {
      k: "03",
      title: "Automate replies, campaigns & alerts",
      desc: "AI drafts replies, QR campaigns launch, and sentiment alerts hit the right teams.",
    },
    {
      k: "04",
      title: "Grow with weekly AI recommendations",
      desc: "GReviewPilot tells you exactly what to fix this week to move your rating and rank.",
    },
  ];
  return (
    <section className="relative py-24">
      <div className="mx-auto max-w-7xl px-6">
        <Reveal>
          <div className="flex flex-col items-center text-center">
            <SectionEyebrow>How it works</SectionEyebrow>
            <h2 className="mt-4 max-w-2xl text-[34px] font-semibold leading-[1.05] tracking-[-0.02em] sm:text-5xl">
              Four steps to <span className="text-gradient">reputation autopilot</span>.
            </h2>
          </div>
        </Reveal>
        <div className="mt-14 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {steps.map((s, i) => (
            <Reveal key={s.k} delay={i * 80}>
              <div className="group relative h-full rounded-2xl border border-border/80 bg-background/80 p-6 shadow-soft transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-glow">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {s.k}
                </div>
                <h3 className="mt-3 text-lg font-semibold">{s.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{s.desc}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* --------------------------- TESTIMONIALS ------------------------- */

const TESTIMONIALS = [
  {
    name: "Riya Malhotra",
    role: "Owner · Aroma Café (7 locations)",
    quote:
      "GReviewPilot replaced three tools and a part-time contractor. Our Google rating went from 4.2 to 4.8 in one quarter.",
    stat: "+38% new customers",
  },
  {
    name: "Arjun Verma",
    role: "Marketing Lead · Vertex Dental",
    quote:
      "The AI replies genuinely sound like us. Patients notice. Reviews are up 4×, and negative ones now get resolved same-day.",
    stat: "4× review volume",
  },
  {
    name: "Nikhil Rao",
    role: "Growth · Meridian Auto",
    quote:
      "The competitor tracking alone is worth the price. We know exactly where we're losing and how to win back rank.",
    stat: "#1 in 12 grids",
  },
];

function Testimonials() {
  return (
    <section id="customers" className="relative py-24">
      <div className="mx-auto max-w-7xl px-6">
        <Reveal>
          <div className="flex flex-col items-center text-center">
            <SectionEyebrow>Customer stories</SectionEyebrow>
            <h2 className="mt-4 max-w-2xl text-[34px] font-semibold leading-[1.02] tracking-[-0.02em] sm:text-5xl">
              Teams love shipping with <span className="text-gradient">GReviewPilot</span>.
            </h2>
          </div>
        </Reveal>
        <div className="relative mt-14 overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_8%,black_92%,transparent)]">
          <div className="flex w-max gap-5 [animation:marquee_40s_linear_infinite] hover:[animation-play-state:paused]">
            {[...TESTIMONIALS, ...TESTIMONIALS].map((t, i) => (
              <div
                key={`${t.name}-${i}`}
                className="relative flex h-full w-[340px] shrink-0 flex-col rounded-2xl border border-border bg-background p-6 transition-all hover:-translate-y-1 hover:shadow-elevated sm:w-[380px]"
              >
                <div className="flex items-center gap-1 text-warning">
                  {Array.from({ length: 5 }).map((_, j) => (
                    <Star key={j} className="h-3.5 w-3.5 fill-current" />
                  ))}
                </div>
                <p className="mt-4 text-[14.5px] leading-relaxed text-foreground/85">
                  &ldquo;{t.quote}&rdquo;
                </p>
                <div className="mt-6 flex items-center gap-3 border-t border-border pt-4">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-primary via-accent to-secondary text-[12px] font-semibold text-white">
                    {t.name.split(" ").map((n) => n[0]).join("")}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-[13.5px] font-semibold">{t.name}</div>
                    <div className="truncate text-[11.5px] text-muted-foreground">{t.role}</div>
                  </div>
                  <div className="ml-auto rounded-full border border-success/20 bg-success/10 px-2 py-1 text-[10.5px] font-semibold text-success">
                    {t.stat}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* --------------------------- PRICING ------------------------------ */

function Pricing() {
  const [yearly, setYearly] = useState(true);
  const tiers = [
    {
      name: "Starter",
      desc: "For single locations getting serious about reviews.",
      m: 1999,
      y: 1599,
      features: [
        "1 Google Business location",
        "Unlimited AI reply drafts",
        "QR review campaigns",
        "Basic analytics",
        "Email support",
      ],
      cta: "Start free",
      popular: false,
    },
    {
      name: "Growth",
      desc: "For growing brands ready to automate reputation.",
      m: 4999,
      y: 3999,
      features: [
        "Up to 5 locations",
        "Auto-reply with brand voice",
        "Sentiment & topic analytics",
        "Competitor tracking (3)",
        "Local SEO grid tracking",
        "Priority support",
      ],
      cta: "Start free",
      popular: true,
    },
    {
      name: "Enterprise",
      desc: "For multi-location teams and agencies.",
      m: 0,
      y: 0,
      features: [
        "Unlimited locations",
        "Custom AI fine-tuning",
        "SSO, SAML, audit logs",
        "White-label website builder",
        "Dedicated CSM",
        "99.99% uptime SLA",
      ],
      cta: "Talk to sales",
      popular: false,
    },
  ];
  return (
    <section id="pricing" className="relative py-24">
      <div className="mx-auto max-w-7xl px-6">
        <Reveal>
          <div className="flex flex-col items-center text-center">
            <SectionEyebrow>Pricing</SectionEyebrow>
            <h2 className="mt-4 max-w-2xl text-[34px] font-semibold leading-[1.05] tracking-[-0.02em] sm:text-5xl">
              Simple pricing.{" "}
              <span className="text-gradient">Enterprise-grade</span> at every tier.
            </h2>
            <div className="mt-8 inline-flex items-center gap-1 rounded-full border border-border bg-surface p-1 text-[13px]">
              <button
                onClick={() => setYearly(false)}
                className={`rounded-full px-4 py-1.5 transition ${!yearly ? "bg-background shadow-soft font-semibold" : "text-muted-foreground"}`}
              >
                Monthly
              </button>
              <button
                onClick={() => setYearly(true)}
                className={`rounded-full px-4 py-1.5 transition ${yearly ? "bg-background shadow-soft font-semibold" : "text-muted-foreground"}`}
              >
                Yearly
                <span className="ml-1 rounded-full bg-success/15 px-1.5 py-0.5 text-[10px] font-semibold text-success">
                  −20%
                </span>
              </button>
            </div>
          </div>
        </Reveal>

        <div className="mt-14 grid gap-5 md:grid-cols-3">
          {tiers.map((t, i) => (
            <Reveal key={t.name} delay={i * 80}>
              <div
                className={
                  "relative flex h-full flex-col rounded-2xl border p-7 transition-all hover:-translate-y-1 " +
                  (t.popular
                    ? "border-transparent bg-foreground text-background shadow-elevated"
                    : "border-border bg-background hover:shadow-elevated")
                }
              >
                {t.popular && (
                  <div className="pointer-events-none absolute inset-0 rounded-2xl ring-gradient" />
                )}
                {t.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-[image:var(--gradient-brand)] px-3 py-1 text-[10.5px] font-semibold uppercase tracking-wider text-white shadow-glow">
                    Most popular
                  </div>
                )}
                <div className="text-[14px] font-semibold">{t.name}</div>
                <div className={"mt-1 text-[13px] " + (t.popular ? "text-background/70" : "text-muted-foreground")}>
                  {t.desc}
                </div>
                <div className="mt-6 flex items-baseline gap-1">
                  {t.m === 0 ? (
                    <span className="text-[38px] font-semibold tracking-tight">Custom</span>
                  ) : (
                    <>
                      <span className="text-[44px] font-semibold tracking-tight">
                        ₹{(yearly ? t.y : t.m).toLocaleString("en-IN")}
                      </span>
                      <span className={"text-[13px] " + (t.popular ? "text-background/70" : "text-muted-foreground")}>
                        /mo · GST extra
                      </span>
                    </>
                  )}
                </div>
                <div className="mt-6 space-y-2.5">
                  {t.features.map((f) => (
                    <div key={f} className="flex items-start gap-2 text-[13.5px]">
                      <Check
                        className={
                          "mt-0.5 h-4 w-4 " +
                          (t.popular ? "text-secondary" : "text-primary")
                        }
                      />
                      <span className={t.popular ? "text-background/90" : "text-foreground/85"}>
                        {f}
                      </span>
                    </div>
                  ))}
                </div>
                <a
                  href="#"
                  className={
                    "mt-8 inline-flex items-center justify-center gap-1 rounded-xl px-4 py-2.5 text-[13.5px] font-semibold transition " +
                    (t.popular
                      ? "bg-background text-foreground hover:-translate-y-0.5"
                      : "bg-foreground text-background hover:-translate-y-0.5")
                  }
                >
                  {t.cta} <ArrowRight className="h-3.5 w-3.5" />
                </a>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* --------------------------- ENTERPRISE --------------------------- */

function Enterprise() {
  return (
    <section className="relative py-24">
      <div className="mx-auto max-w-7xl px-6">
        <div className="relative overflow-hidden rounded-3xl border border-border bg-foreground p-10 text-background md:p-14">
          <div className="pointer-events-none absolute -top-24 -left-16 h-96 w-96 rounded-full bg-primary/40 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 -right-10 h-96 w-96 rounded-full bg-accent/40 blur-3xl" />
          <div className="pointer-events-none absolute inset-0 bg-grid opacity-[0.05]" />

          <div className="relative grid gap-10 md:grid-cols-2 md:items-center">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[11.5px] font-medium text-background/80 backdrop-blur">
                <ShieldCheck className="h-3.5 w-3.5" />
                Enterprise security
              </div>
              <h3 className="mt-4 text-[32px] font-semibold leading-tight tracking-[-0.02em] sm:text-4xl">
                Built for trust from the ground up.
              </h3>
              <p className="mt-4 max-w-md text-[14.5px] text-background/70">
                GReviewPilot is engineered for the world&apos;s most regulated brands.
                Isolation by design, encrypted end-to-end, audited annually.
              </p>
              <div className="mt-8 grid grid-cols-2 gap-4">
                {[
                  { icon: Lock, label: "SOC 2 · DPDP · ISO 27001" },
                  { icon: ShieldCheck, label: "SSO / SAML / SCIM" },
                  { icon: Cpu, label: "Private AI · zero retention" },
                  { icon: Users, label: "Role-based access & audit logs" },
                ].map((it) => (
                  <div key={it.label} className="flex items-center gap-2 text-[13px] text-background/85">
                    <it.icon className="h-4 w-4 text-secondary" />
                    {it.label}
                  </div>
                ))}
              </div>
            </div>
            <div className="glass-dark rounded-2xl p-6">
              <div className="text-[12.5px] font-semibold uppercase tracking-wider text-background/60">
                What you get
              </div>
              <div className="mt-4">
                <CheckListDark
                  items={[
                    "Dedicated success engineer",
                    "Custom AI fine-tuned to your brand",
                    "Data residency in India (Mumbai & Hyderabad)",
                    "99.99% uptime SLA + priority incident response",
                    "White-glove migration & training",
                  ]}
                />
              </div>
              <a
                href="#demo"
                className="mt-8 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-background px-4 py-3 text-[14px] font-semibold text-foreground transition hover:-translate-y-0.5"
              >
                Talk to sales <ArrowRight className="h-4 w-4" />
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function CheckListDark({ items }: { items: string[] }) {
  return (
    <ul className="space-y-2.5">
      {items.map((i) => (
        <li key={i} className="flex items-start gap-2 text-[13.5px] text-background/90">
          <Check className="mt-0.5 h-4 w-4 text-secondary" />
          {i}
        </li>
      ))}
    </ul>
  );
}

/* --------------------------- FAQ ---------------------------------- */

const FAQS = [
  {
    q: "How does GReviewPilot's AI actually reply to reviews?",
    a: "GReviewPilot learns your brand voice from your website, guidelines, and past replies. It drafts on-brand responses in seconds, flags sensitive reviews for human approval, and supports 20+ languages out of the box.",
  },
  {
    q: "Do I need to give up control of my Google Business Profile?",
    a: "No. GReviewPilot connects via Google's official OAuth. You retain full ownership and can revoke access at any time. All changes are logged and reversible.",
  },
  {
    q: "How quickly can I get set up?",
    a: "Most teams are live in under 3 minutes. Multi-location and enterprise migrations typically complete in under a week with a dedicated success engineer.",
  },
  {
    q: "Can GReviewPilot help with local SEO, not just reviews?",
    a: "Yes. Local SEO grid rank tracking, category optimization, post scheduling, keyword insights, and competitor benchmarking are all included.",
  },
  {
    q: "Is my data secure?",
    a: "GReviewPilot is SOC 2 aligned, DPDP Act 2023 compliant, ISO 27001 certified, and uses private AI with zero training retention on your data. All customer data is stored in India (Mumbai & Hyderabad regions).",
  },
];

function FAQ() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section id="faq" className="relative py-24">
      <div className="mx-auto max-w-4xl px-6">
        <Reveal>
          <div className="flex flex-col items-center text-center">
            <SectionEyebrow>FAQ</SectionEyebrow>
            <h2 className="mt-4 text-[34px] font-semibold leading-[1.05] tracking-[-0.02em] sm:text-5xl">
              Frequently asked questions.
            </h2>
          </div>
        </Reveal>
        <div className="mt-14 space-y-3">
          {FAQS.map((f, i) => (
            <Reveal key={f.q} delay={i * 50}>
              <div className="rounded-2xl border border-border bg-background p-5 shadow-soft transition hover:border-foreground/20">
                <button
                  onClick={() => setOpen(open === i ? null : i)}
                  className="flex w-full items-center justify-between text-left text-[16px] font-semibold"
                >
                  {f.q}
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border bg-surface text-muted-foreground">
                    {open === i ? (
                      <Minus className="h-4 w-4" />
                    ) : (
                      <Plus className="h-4 w-4" />
                    )}
                  </div>
                </button>
                {open === i && (
                  <p className="mt-3 text-[14px] leading-relaxed text-muted-foreground">
                    {f.a}
                  </p>
                )}
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* --------------------------- FINAL CTA ---------------------------- */

function FinalCTA() {
  return (
    <section className="relative py-28">
      <div className="mx-auto max-w-7xl px-6">
        <div className="relative overflow-hidden rounded-3xl border border-border bg-gradient-to-b from-surface via-background to-background p-10 sm:p-16">
          <div className="pointer-events-none absolute inset-0 bg-mesh opacity-50" />
          <div className="relative flex flex-col items-center text-center">
            <SectionEyebrow>Start growing today</SectionEyebrow>
            <h2 className="mt-5 max-w-3xl text-[36px] font-semibold leading-[1.02] tracking-[-0.03em] sm:text-6xl">
              The future of your Google presence
              <br />
              <span className="text-gradient">is one click away.</span>
            </h2>
            <p className="mt-5 max-w-xl text-[15.5px] text-muted-foreground">
              Join 4,200+ teams turning reviews into a growth engine with
              GReviewPilot.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <GradientButton href="#">
                Start free <ArrowRight className="h-4 w-4" />
              </GradientButton>
              <GradientButton href="#" variant="outline">
                Book a demo
              </GradientButton>
            </div>
            <div className="mt-8 max-w-md">
              <CheckList
                items={[
                  "14-day free trial · no credit card",
                  "Migrate from any tool in one week",
                  "Cancel anytime, keep your data",
                ]}
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
