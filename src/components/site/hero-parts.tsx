import { useEffect, useRef, useState } from "react";
import {
  Star,
  TrendingUp,
  Sparkles,
  QrCode,
  MessageSquare,
  BarChart3,
  MapPin,
  ArrowUpRight,
  CheckCircle2,
} from "lucide-react";
import { useCountUp, useInView } from "@/lib/hooks";

/* ----------------------------- Floating dashboard ---------------------------- */

export function HeroDashboard() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onMove = (e: MouseEvent) => {
      const r = el.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width - 0.5;
      const py = (e.clientY - r.top) / r.height - 0.5;
      setTilt({ x: py * -6, y: px * 8 });
    };
    const onLeave = () => setTilt({ x: 0, y: 0 });
    el.addEventListener("mousemove", onMove);
    el.addEventListener("mouseleave", onLeave);
    return () => {
      el.removeEventListener("mousemove", onMove);
      el.removeEventListener("mouseleave", onLeave);
    };
  }, []);

  const rating = useCountUp(4.9, 1800);
  const reviews = useCountUp(12847, 2000);
  const growth = useCountUp(38, 1600);

  return (
    <div
      ref={wrapRef}
      className="relative mx-auto w-full max-w-5xl [perspective:1600px]"
    >
      {/* floating orbs behind dashboard */}
      <div className="pointer-events-none absolute -left-16 top-10 h-64 w-64 rounded-full bg-primary/30 blur-3xl animate-blob" />
      <div className="pointer-events-none absolute -right-10 top-32 h-72 w-72 rounded-full bg-secondary/25 blur-3xl animate-blob [animation-delay:2s]" />
      <div className="pointer-events-none absolute bottom-0 left-1/3 h-72 w-72 rounded-full bg-accent/25 blur-3xl animate-blob [animation-delay:4s]" />

      <div
        className="relative rounded-[28px] border border-white/60 bg-white/60 p-3 shadow-elevated backdrop-blur-xl transition-transform duration-300 ease-out will-change-transform"
        style={{
          transform: `rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`,
          background:
            "linear-gradient(180deg, oklch(1 0 0 / 0.85), oklch(0.98 0.008 250 / 0.7))",
        }}
      >
        <div className="ring-gradient rounded-[22px] overflow-hidden bg-white">
          {/* top chrome */}
          <div className="flex items-center justify-between border-b border-border/70 bg-surface/60 px-4 py-2.5">
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-red-400/80" />
              <span className="h-2.5 w-2.5 rounded-full bg-yellow-400/80" />
              <span className="h-2.5 w-2.5 rounded-full bg-green-400/80" />
            </div>
            <div className="hidden items-center gap-2 rounded-md border border-border bg-background px-2 py-1 text-[11px] text-muted-foreground sm:flex">
              <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
              sathi.app / dashboard
            </div>
            <div className="text-[11px] text-muted-foreground">Live</div>
          </div>

          <div className="grid gap-3 p-4 md:grid-cols-12">
            {/* Sidebar */}
            <div className="hidden md:col-span-3 md:block">
              <div className="mb-3 flex items-center gap-2 rounded-lg bg-surface px-2.5 py-2">
                <div className="h-6 w-6 rounded-md bg-[image:var(--gradient-brand)]" />
                <div>
                  <div className="text-[11px] font-semibold leading-tight">Blue Tokri</div>
                  <div className="text-[10px] text-muted-foreground">Coffee · Bengaluru</div>
                </div>
              </div>
              {[
                ["Overview", true],
                ["Reviews", false],
                ["AI Replies", false],
                ["Campaigns", false],
                ["Insights", false],
                ["Competitors", false],
                ["Settings", false],
              ].map(([label, active]) => (
                <div
                  key={label as string}
                  className={
                    "flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[12px] " +
                    (active
                      ? "bg-primary/10 font-medium text-primary"
                      : "text-muted-foreground")
                  }
                >
                  <span
                    className={
                      "h-1.5 w-1.5 rounded-full " +
                      (active ? "bg-primary" : "bg-border")
                    }
                  />
                  {label as string}
                </div>
              ))}
            </div>

            {/* Main content */}
            <div className="md:col-span-9 space-y-3">
              {/* KPI row */}
              <div className="grid grid-cols-3 gap-3">
                <KpiCard
                  icon={<Star className="h-3.5 w-3.5" />}
                  label="Google Rating"
                  value={rating.toFixed(1)}
                  suffix="★"
                  trend="+0.4"
                  accent="from-warning/20 to-warning/0"
                />
                <KpiCard
                  icon={<MessageSquare className="h-3.5 w-3.5" />}
                  label="Total Reviews"
                  value={Math.round(reviews).toLocaleString()}
                  trend="+312 this wk"
                  accent="from-primary/20 to-primary/0"
                />
                <KpiCard
                  icon={<TrendingUp className="h-3.5 w-3.5" />}
                  label="Reputation Score"
                  value={`${Math.round(growth) + 54}`}
                  suffix="/100"
                  trend={`+${Math.round(growth)}%`}
                  accent="from-secondary/20 to-secondary/0"
                />
              </div>

              {/* Chart + Sentiment */}
              <div className="grid grid-cols-5 gap-3">
                <div className="col-span-3 rounded-xl border border-border bg-background p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <div className="text-[11px] font-semibold">Rating trend · 90 days</div>
                    <div className="flex gap-1 text-[10px] text-muted-foreground">
                      <span className="rounded bg-surface px-1.5 py-0.5">Daily</span>
                    </div>
                  </div>
                  <MiniChart />
                </div>
                <div className="col-span-2 rounded-xl border border-border bg-background p-3">
                  <div className="mb-2 text-[11px] font-semibold">Sentiment</div>
                  <SentimentRing positive={78} neutral={16} negative={6} />
                </div>
              </div>

              {/* Review + AI reply */}
              <div className="rounded-xl border border-border bg-background p-3">
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-primary to-accent text-[10px] font-semibold text-white">
                      A
                    </div>
                    <div>
                      <div className="text-[11px] font-semibold leading-tight">Ananya S.</div>
                      <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Star key={i} className="h-2.5 w-2.5 fill-warning text-warning" />
                        ))}
                        <span>· 2m ago</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 rounded-full border border-primary/20 bg-primary/5 px-2 py-0.5 text-[10px] font-medium text-primary">
                    <Sparkles className="h-2.5 w-2.5" /> AI Draft ready
                  </div>
                </div>
                <p className="text-[11.5px] leading-relaxed text-foreground/85">
                  &ldquo;Absolutely loved the pour-over. The barista remembered my
                  order — such a warm neighbourhood spot.&rdquo;
                </p>
                <div className="mt-2 rounded-lg border border-primary/20 bg-primary/[0.04] p-2">
                  <div className="mb-1 flex items-center justify-between text-[10px] text-primary">
                    <span className="flex items-center gap-1">
                      <Sparkles className="h-2.5 w-2.5" /> Sathi AI · warm tone
                    </span>
                    <span className="text-muted-foreground">98% match</span>
                  </div>
                  <p className="text-[11px] leading-relaxed text-foreground/80">
                    Ananya, you just made our day! Rajesh will be thrilled to hear
                    the pour-over hit the spot. See you soon — your usual will be waiting. ☕
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
  suffix,
  trend,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  suffix?: string;
  trend: string;
  accent: string;
}) {
  return (
    <div className={`relative overflow-hidden rounded-xl border border-border bg-background p-3`}>
      <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${accent}`} />
      <div className="relative flex items-center justify-between text-muted-foreground">
        <span className="flex items-center gap-1.5 text-[10.5px] font-medium">
          {icon} {label}
        </span>
      </div>
      <div className="relative mt-1 flex items-baseline gap-1">
        <span className="text-[22px] font-semibold tracking-tight">{value}</span>
        {suffix && <span className="text-[12px] text-muted-foreground">{suffix}</span>}
      </div>
      <div className="relative mt-0.5 text-[10px] font-medium text-success">{trend}</div>
    </div>
  );
}



/* ---------- Mini chart (SVG) ---------- */
function MiniChart() {
  const { ref, inView } = useInView<SVGSVGElement>(0.3);
  const points = [
    12, 15, 14, 18, 22, 21, 27, 30, 28, 34, 40, 38, 46, 52, 48, 58, 66, 62, 74, 82,
  ];
  const w = 320;
  const h = 90;
  const max = Math.max(...points);
  const step = w / (points.length - 1);
  const path = points
    .map((p, i) => {
      const x = i * step;
      const y = h - (p / max) * (h - 8) - 4;
      return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
  const area = `${path} L ${w} ${h} L 0 ${h} Z`;

  return (
    <svg ref={ref} viewBox={`0 0 ${w} ${h}`} className="h-24 w-full">
      <defs>
        <linearGradient id="chartFill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#2563EB" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#2563EB" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="chartStroke" x1="0" x2="1">
          <stop offset="0%" stopColor="#2563EB" />
          <stop offset="60%" stopColor="#6366F1" />
          <stop offset="100%" stopColor="#14B8A6" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#chartFill)" />
      <path
        d={path}
        fill="none"
        stroke="url(#chartStroke)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray={800}
        strokeDashoffset={inView ? 0 : 800}
        style={{ transition: "stroke-dashoffset 1.6s ease-out" }}
      />
    </svg>
  );
}

function SentimentRing({
  positive,
  neutral,
  negative,
}: {
  positive: number;
  neutral: number;
  negative: number;
}) {
  const c = 2 * Math.PI * 28;
  const p = (positive / 100) * c;
  const n = (neutral / 100) * c;
  const ng = (negative / 100) * c;
  return (
    <div className="flex items-center gap-3">
      <svg viewBox="0 0 72 72" className="h-20 w-20 -rotate-90">
        <circle cx="36" cy="36" r="28" stroke="var(--color-border)" strokeWidth="8" fill="none" />
        <circle
          cx="36"
          cy="36"
          r="28"
          stroke="#22C55E"
          strokeWidth="8"
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${p} ${c}`}
        />
        <circle
          cx="36"
          cy="36"
          r="28"
          stroke="#F59E0B"
          strokeWidth="8"
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${n} ${c}`}
          strokeDashoffset={-p}
        />
        <circle
          cx="36"
          cy="36"
          r="28"
          stroke="#EF4444"
          strokeWidth="8"
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${ng} ${c}`}
          strokeDashoffset={-(p + n)}
        />
      </svg>
      <div className="space-y-1 text-[11px]">
        <Legend color="#22C55E" label="Positive" value={positive} />
        <Legend color="#F59E0B" label="Neutral" value={neutral} />
        <Legend color="#EF4444" label="Negative" value={negative} />
      </div>
    </div>
  );
}
function Legend({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="h-2 w-2 rounded-full" style={{ background: color }} />
      <span className="text-muted-foreground">{label}</span>
      <span className="ml-auto font-semibold text-foreground">{value}%</span>
    </div>
  );
}

/* --------------------------------- Feature cards --------------------------------- */

const COMPETITOR_HOVER_ACCENT = "from-primary/15 via-primary/10 to-secondary/15";

export const FEATURES = [
  {
    icon: MessageSquare,
    title: "AI Review Replies",
    desc: "Draft on-brand responses in seconds. Learns your tone, escalates the tough ones.",
    accent: COMPETITOR_HOVER_ACCENT,
    stat: "12s avg reply",
  },
  {
    icon: QrCode,
    title: "QR Review Campaigns",
    desc: "Turn every table, invoice, and package into a review moment with smart QR flows.",
    accent: COMPETITOR_HOVER_ACCENT,
    stat: "5.2× more reviews",
  },
  {
    icon: BarChart3,
    title: "Reputation Analytics",
    desc: "Live dashboards for ratings, sentiment, funnels, and customer intent.",
    accent: COMPETITOR_HOVER_ACCENT,
    stat: "Real-time",
  },
  {
    icon: MapPin,
    title: "Local SEO Insights",
    desc: "Track rank in every neighborhood grid and see exactly what to fix.",
    accent: COMPETITOR_HOVER_ACCENT,
    stat: "Grid rank tracking",
  },
  {
    icon: TrendingUp,
    title: "Competitor Tracking",
    desc: "Benchmark against your top 5 rivals — ratings, keywords, and posting cadence.",
    accent: COMPETITOR_HOVER_ACCENT,
    stat: "5 rivals tracked",
  },
  {
    icon: Sparkles,
    title: "AI Business Coach",
    desc: "Weekly recommendations that actually move your rating and revenue.",
    accent: COMPETITOR_HOVER_ACCENT,
    stat: "12 growth plays",
  },
];

export function FeatureCard({
  icon: Icon,
  title,
  desc,
  accent,
  stat,
}: (typeof FEATURES)[number]) {
  return (
    <div className="group relative rounded-2xl border border-border bg-background p-6 transition-all duration-500 hover:-translate-y-1 hover:shadow-elevated">
      <div
        className={`pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-br ${accent} opacity-0 transition-opacity duration-500 group-hover:opacity-100`}
      />
      <div className="pointer-events-none absolute inset-0 rounded-2xl opacity-0 ring-gradient transition-opacity duration-500 group-hover:opacity-100" />
      <div className="relative flex items-start justify-between">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[image:var(--gradient-brand)] text-white shadow-glow transition-transform duration-500 group-hover:scale-110 group-hover:rotate-3">
          <Icon className="h-5 w-5" />
        </div>
        <div className="flex items-center gap-1 rounded-full border border-border bg-surface px-2 py-1 text-[10px] font-medium text-muted-foreground">
          <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
          {stat}
        </div>
      </div>
      <h3 className="relative mt-5 text-[17px] font-semibold tracking-tight">{title}</h3>
      <p className="relative mt-1.5 text-[13.5px] leading-relaxed text-muted-foreground">
        {desc}
      </p>
      <div className="relative mt-5 flex items-center gap-1 text-[12.5px] font-medium text-primary">
        Learn more
        <ArrowUpRight className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
      </div>
    </div>
  );
}

/* --------------------------------- CTA + misc --------------------------------- */

export function GradientButton({
  children,
  href = "#",
  variant = "solid",
}: {
  children: React.ReactNode;
  href?: string;
  variant?: "solid" | "outline";
}) {
  if (variant === "outline") {
    return (
      <a
        href={href}
        className="group inline-flex items-center gap-2 rounded-xl border border-border bg-background px-5 py-3 text-[14px] font-semibold text-foreground shadow-soft transition-all hover:-translate-y-0.5 hover:border-foreground/30"
      >
        {children}
      </a>
    );
  }
  return (
    <a
      href={href}
      className="group relative inline-flex items-center gap-2 overflow-hidden rounded-xl bg-foreground px-5 py-3 text-[14px] font-semibold text-background shadow-glow transition-all hover:-translate-y-0.5"
    >
      <span className="pointer-events-none absolute inset-0 bg-[image:var(--gradient-brand)] opacity-100 transition-opacity duration-500 group-hover:opacity-90" />
      <span className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/40 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
      <span className="relative z-10 flex items-center gap-2 text-white">{children}</span>
    </a>
  );
}

export function SectionEyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-[11.5px] font-medium text-muted-foreground">
      <span className="h-1.5 w-1.5 rounded-full bg-[image:var(--gradient-brand)]" />
      {children}
    </div>
  );
}

export function Reveal({
  children,
  delay = 0,
  className = "",
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const { ref, inView } = useInView<HTMLDivElement>(0.1);
  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: inView ? 1 : 0,
        transform: inView
          ? "translate3d(0, 0, 0) scale(1)"
          : "translate3d(0, 32px, 0) scale(0.97)",
        transition: `opacity 0.85s cubic-bezier(0.16, 1, 0.3, 1) ${delay}ms, transform 0.85s cubic-bezier(0.16, 1, 0.3, 1) ${delay}ms`,
        willChange: "opacity, transform",
      }}
    >
      {children}
    </div>
  );
}

export function CheckList({ items }: { items: string[] }) {
  return (
    <ul className="space-y-2">
      {items.map((i) => (
        <li key={i} className="flex items-start gap-2 text-[13.5px] text-foreground/85">
          <CheckCircle2 className="mt-0.5 h-4 w-4 text-success" />
          {i}
        </li>
      ))}
    </ul>
  );
}
