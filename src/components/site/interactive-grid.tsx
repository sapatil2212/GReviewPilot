import { useEffect, useRef, useState } from "react";

/**
 * InteractiveGrid
 * - CSS grid of cells that light up on hover with a spotlight following the cursor.
 * - A few randomly picked "pulse" cells continuously breathe to feel alive.
 * - Pointer-events-none by default on the wrapper; cells re-enable their own hover.
 * - Pauses animations when off-screen and throttles pointer tracking via rAF.
 */
export function InteractiveGrid({
  className = "",
  cell = 56,
  pulseCount = 28,
}: {
  className?: string;
  cell?: number;
  pulseCount?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [pulses, setPulses] = useState<number[]>([]);
  const [visible, setVisible] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(false);

  // Respect the user's reduced-motion preference
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(mq.matches);
    update();
    mq.addEventListener?.("change", update);
    return () => mq.removeEventListener?.("change", update);
  }, []);

  // Mouse spotlight removed per design — no pointer tracking needed.


  // Measure and compute grid
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        setSize({ w: e.contentRect.width, h: e.contentRect.height });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Pause animations when off-screen
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { threshold: 0 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const cols = Math.max(1, Math.ceil(size.w / cell));
  const rows = Math.max(1, Math.ceil(size.h / cell));
  const total = cols * rows;

  // Pick a stable set of pulse cells whenever grid dimensions change
  useEffect(() => {
    if (!total) return;
    const set = new Set<number>();
    const n = Math.min(pulseCount, Math.floor(total / 6));
    while (set.size < n) set.add(Math.floor(Math.random() * total));
    setPulses([...set]);
  }, [total, pulseCount]);

  const playState = visible && !reducedMotion ? "running" : "paused";

  return (
    <div
      ref={ref}
      className={
        "pointer-events-none absolute inset-0 overflow-hidden " + className
      }
    >

      {/* Grid of cells */}
      <div
        className="pointer-events-auto absolute inset-0 grid"
        style={{
          gridTemplateColumns: `repeat(${cols}, ${cell}px)`,
          gridTemplateRows: `repeat(${rows}, ${cell}px)`,
        }}
      >
        {Array.from({ length: total }).map((_, i) => (
          <div
            key={i}
            className="group relative border-r border-b border-border/40 transition-colors duration-300 hover:bg-primary/10"
          >
            <span className="absolute -right-[2px] -bottom-[2px] h-[3px] w-[3px] bg-border/70 transition-all duration-300 group-hover:bg-primary group-hover:shadow-[0_0_10px_hsl(var(--primary)/0.7)]" />
            <span className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100 bg-[image:var(--gradient-brand)] mix-blend-overlay" />
          </div>
        ))}
      </div>

      {/* Pulsing "alive" cells — omitted for reduced motion */}
      {!reducedMotion && (
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${cols}, ${cell}px)`,
            gridTemplateRows: `repeat(${rows}, ${cell}px)`,
          }}
        >
          {Array.from({ length: total }).map((_, i) => {
            const isPulse = pulses.includes(i);
            if (!isPulse) return <div key={i} />;
            const delay = ((i * 263) % 6000) / 1000;
            const duration = 4.5 + ((i * 53) % 2500) / 1000;
            return (
              <div key={i} className="relative">
                <span
                  className="absolute inset-0 bg-primary/25 opacity-0 animate-[gridPulse_var(--d)_cubic-bezier(0.4,0,0.2,1)_infinite]"
                  style={
                    {
                      animationDelay: `${delay}s`,
                      animationPlayState: playState,
                      "--d": `${duration}s`,
                    } as React.CSSProperties
                  }
                />
              </div>
            );
          })}

        </div>
      )}


      {/* Diagonal sweep light — omitted for reduced motion */}
      {!reducedMotion && (
        <div
          aria-hidden
          className="absolute -inset-1 opacity-40 animate-[gridSweep_9s_linear_infinite]"
          style={{
            background:
              "linear-gradient(115deg, transparent 40%, color-mix(in oklab, var(--primary) 22%, transparent) 50%, transparent 60%)",
            animationPlayState: playState,
          }}
        />
      )}

      {/* Fade mask so the grid dissolves into the page */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at 50% 40%, transparent 30%, var(--background) 85%)",
        }}
      />
    </div>
  );
}
