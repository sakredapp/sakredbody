import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { breathAt } from "@/lib/breath";
import { hash01, mountStage } from "@/lib/canvasStage";
import { usePrefersReducedMotion } from "@/hooks/use-reduced-motion";
import { STARS, FASCIA } from "@/components/ConstellationBody";
import {
  CHAIN_SOURCES,
  LEANS,
  REPRESENTATIVE_SCENARIO,
  SCENARIOS,
  resolveReading,
} from "@/data/signalChain";
import { cn } from "@/lib/utils";

export { CHAIN_SOURCES } from "@/data/signalChain";
export type { ChainSource } from "@/data/signalChain";

/**
 * How the reading is assembled — four sources, one terrain, three leans.
 *
 * ── The one rule this diagram exists to keep ──────────────────────────────
 *
 * The sources stay on screen after they converge. Every product in this
 * category draws inputs vanishing into a box and a number coming out, which is
 * the shape of an oracle: you are told the conclusion and cannot audit it.
 * Sakred's whole argument is the opposite — the app shows its working, the
 * member's own report can outvote a wearable, and the reading is allowed to
 * change its mind at four in the afternoon.
 *
 * So nothing travels *out* of a column. Each column keeps its label, its list
 * and its own note, and sends a trace toward the centre while staying exactly
 * where it is. What arrives at the centre is a convergence, not a transfer.
 *
 * ── Four kinds of knowing, four ways of moving ────────────────────────────
 *
 * Measured ticks like an instrument, in discrete steps, because that is what a
 * reading off a device is. Reported breathes on the shared breath clock, off
 * phase from the rest, because it comes from someone alive. Rhythm orbits,
 * slowly, and is the one thing on screen that does not care about the person at
 * all. Practice marches — an even row of bars filling one at a time, which is
 * what a habit looks like from outside. Four identical pulses would say these
 * are four flavours of the same knowledge, which is the belief this section
 * exists to argue against.
 *
 * ── The centre is a body, not a brain ─────────────────────────────────────
 *
 * Behind the reading is the constellation figure from the Body Map, faint, and
 * a slow orbit. Not a glowing node. The thing being understood is the body; the
 * interpretation is something that happens around it.
 *
 * ── The interesting day is the one where they disagree ────────────────────
 *
 * The rotation is three days and the middle one has the instruments satisfied
 * and the person flat. Both traces stay bright and the reading resolves to
 * "keep today adjustable" — see data/signalChain.ts, where that resolution is
 * computed from the columns rather than written beside them, and where
 * disagreement is checked before any arithmetic that could average it away.
 *
 * ── Discipline carried over from the Body Map ─────────────────────────────
 *
 * No setState per frame: the draw reads refs and React only hears about a
 * scenario or selection change. mountStage caps DPR, pauses offscreen and
 * exposes a repaint for reduced motion. The four sources are real buttons
 * outside the canvas, which is aria-hidden, so the whole argument is reachable
 * by keyboard and screen reader with no canvas involved.
 */

const GOLD = "214,178,104";
const LIGHT = "240,222,180";

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
interface Geo {
  glyphs: Box[];
  /** The source cards, so traces can be clipped out of them. */
  cards: Box[];
  /** Bottom-centre of each source card — where its trace departs. */
  from: { x: number; y: number }[];
  reading: Box;
  /** Top-centre of each lean card. */
  leans: { x: number; y: number }[];
}

export function SignalChain({ className, testId }: { className?: string; testId?: string }) {
  const reduced = usePrefersReducedMotion();

  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const glyphRefs = useRef<(HTMLElement | null)[]>([]);
  const cardRefs = useRef<(HTMLElement | null)[]>([]);
  const readingRef = useRef<HTMLDivElement>(null);
  const leanRefs = useRef<(HTMLElement | null)[]>([]);

  // Reduced motion holds the day where the sources disagree — the one that
  // teaches the most, and the wrong one to hide behind a rotation nobody with
  // that setting will ever see.
  const [dayIdx, setDayIdx] = useState(reduced ? REPRESENTATIVE_SCENARIO : 0);
  const [activeKey, setActiveKey] = useState<string | null>(null);

  const day = SCENARIOS[dayIdx] ?? SCENARIOS[0];
  const reading = resolveReading(day);

  const geoRef = useRef<Geo | null>(null);
  const repaintRef = useRef<(() => void) | null>(null);
  const dayRef = useRef(day);
  const activeRef = useRef(activeKey);
  const readingRefValue = useRef(reading);
  dayRef.current = day;
  activeRef.current = activeKey;
  readingRefValue.current = reading;

  /** Wall clock, ms, until which the rotation stands down after an input. */
  const suspendUntilRef = useRef(0);

  /** Measure the DOM the canvas draws between. Recomputed on any reflow. */
  const measure = useCallback(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const base = wrap.getBoundingClientRect();
    const rel = (el: Element | null): Box | null => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.left - base.left, y: r.top - base.top, w: r.width, h: r.height };
    };
    const glyphs = glyphRefs.current.map(rel);
    const cards = cardRefs.current.map(rel);
    const read = rel(readingRef.current);
    const leans = leanRefs.current.map(rel);
    if (glyphs.some((g) => !g) || cards.some((c) => !c) || !read || leans.some((l) => !l)) return;

    geoRef.current = {
      glyphs: glyphs as Box[],
      cards: cards as Box[],
      from: (cards as Box[]).map((c) => ({ x: c.x + c.w / 2, y: c.y + c.h })),
      reading: read,
      leans: (leans as Box[]).map((l) => ({ x: l.x + l.w / 2, y: l.y })),
    };
    repaintRef.current?.();
  }, []);

  useLayoutEffect(() => {
    measure();
    const wrap = wrapRef.current;
    if (!wrap) return;
    const ro = new ResizeObserver(measure);
    ro.observe(wrap);
    // The cards reflow when a note of a different length swaps in, which moves
    // every anchor below them.
    cardRefs.current.forEach((c) => c && ro.observe(c));
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [measure]);

  // Re-measure and repaint when the content changes shape or emphasis.
  useEffect(() => {
    measure();
  }, [dayIdx, activeKey, measure]);

  useEffect(() => {
    if (reduced) return;
    const timer = setInterval(() => {
      if (Date.now() < suspendUntilRef.current) return;
      setDayIdx((d) => (d + 1) % SCENARIOS.length);
    }, 9000);
    return () => clearInterval(timer);
  }, [reduced]);

  const choose = (key: string | null) => {
    suspendUntilRef.current = Date.now() + 14_000;
    setActiveKey(key);
  };
  const toggle = (key: string) => choose(activeRef.current === key ? null : key);
  /**
   * A tap is resolved on pointerdown rather than waiting for the click the
   * browser synthesises afterwards, so the response is immediate and does not
   * depend on tap-gesture recognition. The click still arrives though, and
   * would toggle the selection straight back off — hence the window.
   */
  const lastTouchRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const teardown = mountStage(
      canvas,
      (S) => {
        /** Eased emphasis per source, so nothing snaps. */
        const level: number[] = CHAIN_SOURCES.map(() => 0.7);
        const charges = Array.from({ length: CHAIN_SOURCES.length * 3 }, (_, i) => ({
          src: i % CHAIN_SOURCES.length,
          k: hash01(i, 17.3),
          speed: 0.16 + hash01(i, 5.9) * 0.1,
        }));

        let prev = 0;

        return (t) => {
          const { ctx, w, h } = S;
          const dt = Math.min(0.05, prev === 0 ? 0.016 : t - prev);
          prev = t;
          const still = S.reduced;
          ctx.clearRect(0, 0, w, h);
          const geo = geoRef.current;
          if (!geo) return;

          const says = dayRef.current.says;
          const active = activeRef.current;
          const contested = readingRefValue.current.contested;

          // Emphasis. Nothing ever reaches zero — a source that vanishes while
          // another is inspected is the disappearing-inputs move this whole
          // component exists to refuse.
          CHAIN_SOURCES.forEach((s, i) => {
            const target = !active ? 0.7 : s.key === active ? 1 : 0.32;
            level[i] = still ? target : level[i] + (target - level[i]) * 0.08;
          });

          const breath = still ? 0.5 : breathAt(t) * 0.5 + 0.5;

          // ── The centre, drawn first so everything crosses in front ────
          const rd = geo.reading;
          const cx = rd.x + rd.w / 2;
          const cy = rd.y + rd.h / 2;

          // The body, faint. Fitted to the reading's height, which keeps it
          // behind the words rather than around them.
          const fs = (rd.h * 0.86) / 152;
          const fx = cx - 50 * fs;
          const fy = cy - 84 * fs;
          ctx.lineWidth = 1;
          ctx.strokeStyle = `rgba(${GOLD},0.11)`;
          ctx.beginPath();
          for (const [a, b] of FASCIA) {
            ctx.moveTo(fx + STARS[a].x * fs, fy + STARS[a].y * fs);
            ctx.lineTo(fx + STARS[b].x * fs, fy + STARS[b].y * fs);
          }
          ctx.stroke();
          ctx.fillStyle = `rgba(${LIGHT},0.2)`;
          for (const s of STARS) {
            ctx.beginPath();
            ctx.arc(fx + s.x * fs, fy + s.y * fs, s.mag * 0.7, 0, Math.PI * 2);
            ctx.fill();
          }

          // The orbit. One slow ring and two marks on it — the interpretation
          // moving around the body rather than replacing it.
          const orbitR = Math.min(rd.w, rd.h * 2.4) * 0.42;
          ctx.strokeStyle = `rgba(${GOLD},${0.1 + breath * 0.06})`;
          ctx.beginPath();
          ctx.ellipse(cx, cy, orbitR, orbitR * 0.42, 0, 0, Math.PI * 2);
          ctx.stroke();
          if (!still) {
            for (let m = 0; m < 2; m++) {
              const a = t * 0.24 + m * Math.PI;
              const ox = cx + Math.cos(a) * orbitR;
              const oy = cy + Math.sin(a) * orbitR * 0.42;
              ctx.beginPath();
              ctx.arc(ox, oy, 1.6, 0, Math.PI * 2);
              ctx.fillStyle = `rgba(${LIGHT},0.5)`;
              ctx.fill();
            }
          }

          // ── Traces ───────────────────────────────────────────────────
          // Each ends short of the reading's edge. They converge on it; they
          // do not enter it and become it.
          //
          // Clipped out of the source cards rather than drawn under them. At
          // two columns the top row's traces have to travel past the bottom
          // row, and the cards are translucent, so without this a line ran
          // straight through somebody else's paragraph. Passing behind a card
          // and re-emerging is also just how depth reads.
          const topY = rd.y - 6;
          ctx.save();
          ctx.beginPath();
          ctx.rect(0, 0, w, h);
          for (const c of geo.cards) ctx.rect(c.x, c.y, c.w, c.h);
          ctx.clip("evenodd");
          for (let i = 0; i < CHAIN_SOURCES.length; i++) {
            const f = geo.from[i];
            const em = level[i];
            const pull = says[CHAIN_SOURCES[i].key]?.pull ?? 0;
            const isContested = contested.includes(CHAIN_SOURCES[i].key);

            const midY = (f.y + topY) / 2;
            ctx.beginPath();
            ctx.moveTo(f.x, f.y + 4);
            ctx.bezierCurveTo(f.x, midY, cx, midY, cx, topY);
            // A contested trace holds its brightness instead of yielding: the
            // point of that day is that neither source gives way.
            ctx.strokeStyle = `rgba(${GOLD},${0.1 + em * (isContested ? 0.42 : 0.26)})`;
            ctx.lineWidth = 0.9 + em * (isContested ? 0.9 : 0.5);
            ctx.stroke();

            if (still) continue;
            for (const c of charges) {
              if (c.src !== i) continue;
              c.k = (c.k + c.speed * dt * (0.6 + em)) % 1;
              const k = c.k;
              const u = 1 - k;
              // Same cubic as the stroke above.
              const px =
                u * u * u * f.x + 3 * u * u * k * f.x + 3 * u * k * k * cx + k * k * k * cx;
              const py =
                u * u * u * (f.y + 4) +
                3 * u * u * k * midY +
                3 * u * k * k * midY +
                k * k * k * topY;
              const fade = Math.sin(k * Math.PI);
              ctx.beginPath();
              ctx.arc(px, py, 1.4 + em * 0.8, 0, Math.PI * 2);
              ctx.fillStyle = `rgba(${LIGHT},${fade * em * (pull === 0 ? 0.4 : 0.7)})`;
              ctx.fill();
            }
          }

          ctx.restore();

          // ── Out to the lean ──────────────────────────────────────────
          const leanIdx = LEANS.findIndex((l) => l.lean === readingRefValue.current.lean);
          const target = geo.leans[leanIdx];
          if (target) {
            const startY = rd.y + rd.h + 4;
            ctx.beginPath();
            ctx.moveTo(cx, startY);
            ctx.bezierCurveTo(cx, (startY + target.y) / 2, target.x, (startY + target.y) / 2, target.x, target.y - 4);
            ctx.strokeStyle = `rgba(${GOLD},0.32)`;
            ctx.lineWidth = 1.2;
            ctx.stroke();
            if (!still) {
              const k = (t * 0.42) % 1;
              const u = 1 - k;
              const my = (startY + target.y) / 2;
              const px = u * u * u * cx + 3 * u * u * k * cx + 3 * u * k * k * target.x + k * k * k * target.x;
              const py = u * u * u * startY + 3 * u * u * k * my + 3 * u * k * k * my + k * k * k * (target.y - 4);
              ctx.beginPath();
              ctx.arc(px, py, 2, 0, Math.PI * 2);
              ctx.fillStyle = `rgba(${LIGHT},${Math.sin(k * Math.PI) * 0.8})`;
              ctx.fill();
            }
          }

          // ── Glyphs ───────────────────────────────────────────────────
          CHAIN_SOURCES.forEach((s, i) => {
            const g = geo.glyphs[i];
            const em = level[i];
            const a = 0.28 + em * 0.55;
            ctx.save();
            ctx.strokeStyle = `rgba(${GOLD},${a})`;
            ctx.fillStyle = `rgba(${LIGHT},${a})`;
            ctx.lineWidth = 1;

            if (s.motion === "instrument") {
              // Discrete, quantised, exact. A readout, not a wave.
              const n = 9;
              const step = still ? 0 : Math.floor(t * 2);
              for (let k = 0; k < n; k++) {
                const bx = g.x + 2 + (k * (g.w - 4)) / (n - 1);
                const mag = 0.25 + hash01(k + step * 0.37, 23.1) * 0.75;
                const bh = g.h * mag * 0.8;
                ctx.beginPath();
                ctx.moveTo(bx, g.y + g.h);
                ctx.lineTo(bx, g.y + g.h - bh);
                ctx.stroke();
              }
            } else if (s.motion === "human") {
              // Breathes, on the shared clock, a half cycle behind the site.
              const r = g.h * (0.32 + breath * 0.16);
              const gx = g.x + g.w / 2;
              const gy = g.y + g.h / 2;
              const halo = ctx.createRadialGradient(gx, gy, 0, gx, gy, r * 2.4);
              halo.addColorStop(0, `rgba(${LIGHT},${a * 0.5})`);
              halo.addColorStop(1, `rgba(${LIGHT},0)`);
              ctx.fillStyle = halo;
              ctx.beginPath();
              ctx.arc(gx, gy, r * 2.4, 0, Math.PI * 2);
              ctx.fill();
              ctx.beginPath();
              ctx.arc(gx, gy, r, 0, Math.PI * 2);
              ctx.strokeStyle = `rgba(${GOLD},${a})`;
              ctx.stroke();
            } else if (s.motion === "orbit") {
              // Indifferent to the person. Slow, and never stops anywhere.
              const gx = g.x + g.w / 2;
              const gy = g.y + g.h / 2;
              const rr = g.h * 0.4;
              ctx.beginPath();
              ctx.ellipse(gx, gy, rr * 1.9, rr, 0, 0, Math.PI * 2);
              ctx.stroke();
              const ang = still ? -0.6 : t * 0.5;
              ctx.beginPath();
              ctx.arc(gx + Math.cos(ang) * rr * 1.9, gy + Math.sin(ang) * rr, 2.2, 0, Math.PI * 2);
              ctx.fillStyle = `rgba(${LIGHT},${a})`;
              ctx.fill();
            } else {
              // Structure: an even row, filling one at a time. A streak.
              const n = 7;
              const filled = still ? 4 : Math.floor(t * 0.9) % (n + 1);
              for (let k = 0; k < n; k++) {
                const bx = g.x + 2 + (k * (g.w - 6)) / (n - 1);
                const bh = g.h * 0.62;
                const on = k < filled;
                ctx.beginPath();
                ctx.rect(bx - 1.5, g.y + (g.h - bh) / 2, 3, bh);
                if (on) {
                  ctx.fillStyle = `rgba(${LIGHT},${a})`;
                  ctx.fill();
                } else {
                  ctx.strokeStyle = `rgba(${GOLD},${a * 0.55})`;
                  ctx.stroke();
                }
              }
            }
            ctx.restore();
          });
        };
      },
      { controls: (h) => (repaintRef.current = h.repaint) },
    );

    return () => {
      repaintRef.current = null;
      teardown();
    };
  }, []);

  return (
    <div
      ref={wrapRef}
      className={cn("relative max-w-4xl mx-auto", className)}
      data-testid={testId}
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none"
        aria-hidden="true"
        data-testid="chain-canvas"
      />

      {/* ── The four sources ─────────────────────────────────────
          Real buttons, outside the canvas. The canvas is decoration for an
          argument that has to survive without it. */}
      <div
        className="relative grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4"
        role="group"
        aria-label="What the reading is assembled from"
      >
        {CHAIN_SOURCES.map((s, i) => {
          const said = day.says[s.key];
          const on = activeKey === s.key;
          return (
            <button
              key={s.key}
              ref={(el) => { cardRefs.current[i] = el; }}
              type="button"
              aria-pressed={on}
              onPointerDown={(e) => {
                if (e.pointerType !== "touch") return;
                lastTouchRef.current = Date.now();
                toggle(s.key);
              }}
              onClick={() => {
                if (Date.now() - lastTouchRef.current < 700) return;
                toggle(s.key);
              }}
              onPointerEnter={(e) => e.pointerType !== "touch" && choose(s.key)}
              onPointerLeave={(e) => e.pointerType !== "touch" && choose(null)}
              onFocus={() => choose(s.key)}
              onBlur={() => choose(null)}
              className={cn(
                "flex flex-col items-stretch justify-start text-left",
                "rounded-lg border p-3 sm:p-4 transition-colors",
                "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gold/70",
                on ? "border-gold/45 bg-gold/[0.07]" : "border-gold/15 bg-black/20 hover:border-gold/30",
              )}
              data-testid={`chain-source-${s.key}`}
            >
              <div
                ref={(el) => { glyphRefs.current[i] = el; }}
                className="h-6 w-full mb-2"
                aria-hidden="true"
              />
              <p className="text-[0.65rem] uppercase tracking-[0.18em] text-gold mb-1">{s.label}</p>
              <p className="text-[0.7rem] text-muted-foreground leading-snug mb-3">{s.kind}</p>
              <ul className="space-y-1 mb-3">
                {s.items.map((it) => (
                  <li key={it} className="text-xs text-foreground/85">
                    {it}
                  </li>
                ))}
              </ul>
              {/* What this column is saying on the day currently shown. It is
                  always present, never revealed only on hover — a source whose
                  contribution you have to go looking for is halfway to hidden. */}
              <p className="text-[0.7rem] leading-snug text-foreground/70 border-t border-gold/10 pt-2">
                {said?.note}
              </p>
            </button>
          );
        })}
      </div>

      {/* Vertical room for the traces to travel through. */}
      <div className="h-14 sm:h-16" aria-hidden="true" />

      {/* ── The reading ──────────────────────────────────────────
          Not a score. A single number is the one thing this category
          over-claims, and it is what makes a reading unarguable. */}
      <div
        ref={readingRef}
        className="relative rounded-lg border border-gold/35 bg-gold/[0.04] px-6 py-6 text-center shadow-gold-subtle"
        data-testid="chain-reading"
      >
        <p className="text-[0.65rem] uppercase tracking-[0.18em] text-gold mb-2">Terrain now</p>
        <p className="font-display text-2xl md:text-3xl leading-snug">{reading.lean}</p>
        <p className="text-xs text-muted-foreground mt-3 max-w-lg mx-auto leading-relaxed">
          {reading.because}
        </p>
      </div>

      <div className="h-14 sm:h-16" aria-hidden="true" />

      {/* ── The three leans ──────────────────────────────────────── */}
      <div className="relative grid grid-cols-1 sm:grid-cols-3 gap-3">
        {LEANS.map((d, i) => {
          const on = d.lean === reading.lean;
          return (
            <div
              key={d.lean}
              ref={(el) => { leanRefs.current[i] = el; }}
              className={cn(
                "rounded-lg border px-4 py-4 text-center transition-colors",
                on ? "border-gold/45 bg-gold/[0.06]" : "border-gold/12",
              )}
              data-testid={`chain-lean-${d.lean.toLowerCase().replace(/\s+/g, "-")}`}
            >
              <p className={cn("font-display text-lg mb-1", on ? "text-gold" : "text-foreground/70")}>
                {d.lean}
              </p>
              <p className="text-xs text-muted-foreground">{d.body}</p>
            </div>
          );
        })}
      </div>

      {/* The loop closes. A chain that ends at "do this" is a prescription;
          what makes it a practice is that the result comes back in as
          tomorrow's Reported column. */}
      <div className="relative mt-6 flex items-center justify-center gap-3 text-[0.65rem] uppercase tracking-[0.18em] text-muted-foreground text-center">
        <span className="h-px w-6 sm:w-8 bg-gold/30 shrink-0" aria-hidden="true" />
        Notice the response · adjust · read again
        <span className="h-px w-6 sm:w-8 bg-gold/30 shrink-0" aria-hidden="true" />
      </div>
    </div>
  );
}
