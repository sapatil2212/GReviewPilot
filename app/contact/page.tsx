"use client";

import { useState } from "react";
import Link from "next/link";
import {
  MessageSquare,
  Sparkles,
  Send,
  Phone,
} from "lucide-react";
import { Navbar } from "@/components/site/navbar";
import { SiteFooter } from "@/components/site/footer";

// Previously four unverifiable service metrics ("12 min median first
// response", "4 hrs sales SLA", "99.95% uptime last quarter", "4.9 / 5
// support CSAT"). Replaced with what we can state plainly about how support
// works. Reinstate measured figures only once they are actually measured.
const stats = [
  { value: "Email", label: "Support channel" },
  { value: "Live chat", label: "During business hours" },
  { value: "Mon–Fri", label: "Support days" },
  { value: "IST", label: "Team timezone" },
];

export default function ContactPage() {
  const [sent, setSent] = useState(false);
  const [topic, setTopic] = useState("sales");

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
              Get in touch
            </div>
            <h1 className="mt-6 text-5xl font-bold tracking-tight md:text-6xl">
              Let&apos;s build your{" "}
              <span className="text-gradient">reputation engine</span>.
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-lg text-muted-foreground">
              Tell us about your business. Whether you run one café or five
              hundred showrooms, we&apos;ll show you exactly how GReviewPilot turns
              reviews into revenue.
            </p>
          </div>
        </section>

        {/* Form + sidebar */}
        <section className="mx-auto mt-20 grid max-w-6xl gap-8 px-6 lg:grid-cols-[1.4fr_1fr]">
          <form
            onSubmit={(e) => { e.preventDefault(); setSent(true); }}
            className="rounded-3xl border border-border bg-card p-8 shadow-elevated"
          >
            <h2 className="text-2xl font-bold tracking-tight">Send us a message</h2>
            <p className="mt-1 text-sm text-muted-foreground">Fill this in and we&apos;ll get back within one business day.</p>

            {sent ? (
              <div className="mt-6 rounded-xl border border-primary/30 bg-primary/5 p-8 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[image:var(--gradient-brand)] text-white shadow-glow">
                  <Send className="h-5 w-5" />
                </div>
                <h3 className="mt-3 font-semibold">Message received</h3>
                <p className="mt-1 text-sm text-muted-foreground">Thanks — a real human will be in touch shortly.</p>
              </div>
            ) : (
              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <div className="md:col-span-2">
                  <div className="mb-2 text-sm font-medium">What&apos;s this about?</div>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { id: "sales", label: "Sales / demo" },
                      { id: "support", label: "Support" },
                      { id: "partnership", label: "Partnership" },
                      { id: "other", label: "Other" },
                    ].map((t) => (
                      <button
                        type="button"
                        key={t.id}
                        onClick={() => setTopic(t.id)}
                        className={
                          "rounded-full border px-3 py-1.5 text-sm transition " +
                          (topic === t.id
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border bg-background text-muted-foreground hover:text-foreground")
                        }
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>
                <label className="text-sm"><span className="font-medium">Full name</span><input required type="text" placeholder="Jane Doe" className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" /></label>
                <label className="text-sm"><span className="font-medium">Work email</span><input required type="email" placeholder="you@company.com" className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" /></label>
                <label className="text-sm"><span className="font-medium">Company</span><input type="text" placeholder="Acme Coffee Co." className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" /></label>
                <label className="text-sm">
                  <span className="font-medium">Locations</span>
                  <select className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring">
                    <option>1 location</option>
                    <option>2–5 locations</option>
                    <option>6–20 locations</option>
                    <option>21–100 locations</option>
                    <option>100+ locations</option>
                  </select>
                </label>
                <label className="text-sm md:col-span-2">
                  <span className="font-medium">How can we help?</span>
                  <textarea required rows={5} placeholder="Tell us a bit about your business and what you're trying to solve…" className="mt-1 w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" />
                </label>
                <div className="flex items-center justify-between md:col-span-2">
                  <p className="text-xs text-muted-foreground">
                    We&apos;ll never share your details. Read our{" "}
                    <Link className="underline underline-offset-2" href="/privacy">privacy policy</Link>.
                  </p>
                  <button type="submit" className="group relative inline-flex items-center justify-center gap-2 overflow-hidden rounded-lg bg-foreground px-5 py-2.5 text-sm font-semibold text-background transition hover:-translate-y-0.5">
                    Send message
                    <Send className="h-4 w-4" />
                    <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/30 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
                  </button>
                </div>
              </div>
            )}
          </form>

          <aside className="space-y-6">
            <div className="ring-gradient rounded-3xl bg-card p-6 shadow-elevated">
              <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-primary"><MessageSquare className="h-4 w-4" /> Live chat</div>
              <h3 className="mt-2 text-xl font-bold tracking-tight">Prefer to talk right now?</h3>
              <p className="mt-2 text-sm text-muted-foreground">Chat with the team during business hours — no bots, no queues.</p>
              <button className="mt-4 inline-flex items-center gap-2 rounded-lg bg-foreground px-4 py-2 text-sm font-semibold text-background"><MessageSquare className="h-4 w-4" /> Open live chat</button>
            </div>
            <div className="rounded-3xl border border-border bg-card p-6 shadow-soft">
              <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-primary"><Phone className="h-4 w-4" /> Call sales</div>
              {/* Previously listed Bengaluru, Mumbai, and toll-free numbers.
                  Replaced with the single published contact number and address
                  used in the footer and on the legal pages, so a reviewer
                  checking our details finds one consistent answer. */}
              <div className="mt-3 space-y-2 text-sm">
                <div className="flex items-center justify-between"><span className="text-muted-foreground">Phone</span><a href="tel:+919168081355" className="font-medium hover:underline">+91 9168 08 1355</a></div>
                <div className="flex items-center justify-between"><span className="text-muted-foreground">Email</span><a href="mailto:contact.greviewpilot@gmail.com" className="font-medium hover:underline">contact.greviewpilot@gmail.com</a></div>
                <div className="flex items-center justify-between"><span className="text-muted-foreground">Office</span><span className="font-medium">Pune, Maharashtra</span></div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {stats.map((s) => (
                <div key={s.label} className="rounded-xl border border-border bg-card p-4 text-center shadow-soft">
                  <div className="text-xl font-bold text-gradient">{s.value}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">{s.label}</div>
                </div>
              ))}
            </div>
          </aside>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
