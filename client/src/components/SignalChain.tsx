import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { breathAt } from "@/lib/breath";
import { hash01, mountStage } from "@/lib/canvasStage";
import { usePrefersReducedMotion } from "@/hooks/use-reduced-motion";
import { STARS, FASCIA } from "@/components/ConstellationBody";
import {
  CHAIN_SOURCES,
  CONTEXT_SOURCES,
  LEANS,
  REPRESENTATIVE_SCENARIO,
  SCENARIOS,
  STATE_SOURCES,
  resolveDirection,
  resolveTerrain,
} from "@/data/signalChain";
import { cn } from "@/lib/utils";

export { CHAIN_SOURCES } from "@/data/signalChain";
export type { ChainSource } from "@/data/signalChain";

/**
 * How a reading forms — two stages, four sources, none of them discarded.
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
 * So nothing travels *out* of a column. Each keeps its label, its list and its
 * own note, and sends a trace onward while staying exactly where it is. What
 * arrives is a convergence, not a transfer.
 *
 * ── Two stages, because the four are not the same kind of thing ───────────
 *
 * This was one stage and four equal inputs, and that quietly taught something
 * false: that a coach's plan asking for a hard session contributes to how
 * recovered a body is. Terrain is **state**, and only Measured and Reported
 * assemble it. Rhythm and Practice are **context and intention**; they join at
 * the second stage, where the question changes from "what is true" to "what
 * should today be". See data/signalChain.ts, which holds the invariant and
 * derives every conclusion from the columns rather than asserting it beside
 * them.
 *
 * ── Four kinds of knowing, four ways of moving ────────────────────────────
 *
 * Measured ticks like an instrument, in discrete steps, because that is what a
 * reading off a device is. Reported breathes on the shared breath clock,
 * because it comes from someone alive. Rhythm orbits, slowly, and is the one
 * thing on screen that does not care about the person at all. Practice marches
 * — an even row filling one at a time, which is what a habit looks like from
 * outside. Four identical pulses would say these are four flavours of the same
 * knowledge, which is the belief this section exists to argue against.
 *
 * ── The centre is a body, not a brain ─────────────────────────────────────
 *
 * The constellation figure sits behind Terrain now, because terrain *is* the
 * body's state. The orbit belongs to the direction below it — the
 * interpretation moving around the body rather than replacing it.
 *
 * ── Discipline carried over from the Body Map ─────────────────────────────
 *
 * No setState per frame: the draw reads refs and React only hears about a day
 * or a selection changing. mountStage caps DPR, pauses offscreen and exposes a
 * repaint for reduced motion. The four sources are real buttons outside the
 * canvas, which is aria-hidden, so the whole argument is reachable by keyboard
 * and screen reader with no canvas involved.
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
  terrain: Box;
  direction: Box;
  /** Top-centre of each lean card. */
  leans: { x: number; y: number }[];
}

export function SignalChain({ className, testId }: { className?: string; testId?: string }) {
  const reduced = usePrefersReducedMotion();

  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const glyphRefs = useRef<(HTMLElement | null)[]>([]);
  const cardRefs = useRef<(HTMLElement | null)[]>([]);
  const terrainRef = useRef<HTMLDivElement>(null);
  const directionRef = useRef<HTMLDivElement>(null);
  const leanRefs = useRef<(HTMLElement | null)[]>([]);

  // Reduced motion holds the day where the plan asks for what the body cannot
  // give — the one that teaches the invariant, and the wrong one to hide
  // behind a rotation nobody with that setting will ever see.
  const [dayIdx, setDayIdx] = useState(reduced ? REPRESENTATIVE_SCENARIO : 0);
  const [activeKey, setActiveKey] = useState<string | null>(null);

  const day = SCENARIOS[dayIdx] ?? SCENARIOS[0];
  const terrain = resolveTerrain(day);
  const direction = resolveDirection(terrain, day);

  const geoRef = useRef<Geo | null>(null);
  const repaintRef = useRef<(() => void) | null>(null);
  const dayRef = useRef(day);
  const activeRef = useRef(activeKey);
  const terrainValRef = useRef(terrain);
  const directionValRef = useRef(direction);
  dayRef.current = day;
  activeRef.current = activeKey;
  terrainValRef.current = terrain;
  directionValRef.current = direction;

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
    const terr = rel(terrainRef.current);
    const dir = rel(directionRef.current);
    const leans = leanRefs.current.map(rel);
    if (glyphs.some((g) => !g) || cards.some((c) => !c) || !terr || !dir) return;
    if (leans.length !== LEANS.length || leans.some((l) => !l)) return;

    geoRef.current = {
      glyphs: glyphs as Box[],
      cards: cards as Box[],
      from: (cards as Box[]).map((c) => ({ x: c.x + c.w / 2, y: c.y + c.h })),
      terrain: terr,
      direction: dir,
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
    if (terrainRef.current) ro.observe(terrainRef.current);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [measure]);

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
          const contested = terrainValRef.current.contested;

          // Emphasis. Nothing ever reaches zero — a source that vanishes while
          // another is inspected is the disappearing-inputs move this whole
          // component exists to refuse.
          CHAIN_SOURCES.forEach((s, i) => {
            const target = !active ? 0.7 : s.key === active ? 1 : 0.32;
            level[i] = still ? target : level[i] + (target - level[i]) * 0.08;
          });

          const breath = still ? 0.5 : breathAt(t) * 0.5 + 0.5;

          const tr = geo.terrain;
          const dr = geo.direction;
          const trCx = tr.x + tr.w / 2;
          const drCx = dr.x + dr.w / 2;

          // ── The body, behind the terrain ─────────────────────────────
          // Behind *this* card specifically: terrain is the body's state, and
          // the figure is the body. The direction below is what gets decided
          // about it, which is not the same thing and does not get the figure.
          const fs = (tr.h * 0.86) / 152;
          const fx = trCx - 50 * fs;
          const fy = tr.y + tr.h / 2 - 84 * fs;
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

          // ── The orbit, around the direction ──────────────────────────
          const orbitR = Math.min(dr.w, dr.h * 2.4) * 0.42;
          const dCy = dr.y + dr.h / 2;
          ctx.strokeStyle = `rgba(${GOLD},${0.1 + breath * 0.06})`;
          ctx.beginPath();
          ctx.ellipse(drCx, dCy, orbitR, orbitR * 0.42, 0, 0, Math.PI * 2);
          ctx.stroke();
          if (!still) {
            for (let m = 0; m < 2; m++) {
              const ang = t * 0.24 + m * Math.PI;
              ctx.beginPath();
              ctx.arc(drCx + Math.cos(ang) * orbitR, dCy + Math.sin(ang) * orbitR * 0.42, 1.6, 0, Math.PI * 2);
              ctx.fillStyle = `rgba(${LIGHT},0.5)`;
              ctx.fill();
            }
          }

          // ── Traces ───────────────────────────────────────────────────
          // Each ends short of its target's edge. They converge on it; they do
          // not enter it and become it.
          //
          // Clipped out of the source cards rather than drawn under them. The
          // terrain has to reach past the context row to get to the direction,
          // and the cards are translucent, so without this a line ran straight
          // through somebody else's paragraph. Passing behind a card and
          // re-emerging is also just how depth reads.
          ctx.save();
          ctx.beginPath();
          ctx.rect(0, 0, w, h);
          for (const c of geo.cards) ctx.rect(c.x, c.y, c.w, c.h);
          ctx.clip("evenodd");

          const trace = (
            from: { x: number; y: number },
            toX: number,
            toY: number,
            alpha: number,
            width: number,
          ) => {
            const midY = (from.y + toY) / 2;
            ctx.beginPath();
            ctx.moveTo(from.x, from.y + 4);
            ctx.bezierCurveTo(from.x, midY, toX, midY, toX, toY);
            ctx.strokeStyle = `rgba(${GOLD},${alpha})`;
            ctx.lineWidth = width;
            ctx.stroke();
            return midY;
          };

          for (let i = 0; i < CHAIN_SOURCES.length; i++) {
            const src = CHAIN_SOURCES[i];
            const f = geo.from[i];
            const em = level[i];
            // A state source feeds the terrain. A context source skips it
            // entirely and joins at the direction — which is the whole
            // correction this layout exists to make.
            const box = src.role === "state" ? tr : dr;
            const toX = src.role === "state" ? trCx : drCx;
            const toY = box.y - 6;
            const isContested = contested.includes(src.key);

            const midY = trace(
              f,
              toX,
              toY,
              0.1 + em * (isContested ? 0.42 : 0.26),
              // A contested trace holds its weight instead of yielding: the
              // point of that day is that neither source gives way.
              0.9 + em * (isContested ? 0.9 : 0.5),
            );

            if (still) continue;
            const pull = says[src.key]?.pull ?? 0;
            for (const c of charges) {
              if (c.src !== i) continue;
              c.k = (c.k + c.speed * dt * (0.6 + em)) % 1;
              const k = c.k;
              const u = 1 - k;
              const px = u * u * u * f.x + 3 * u * u * k * f.x + 3 * u * k * k * toX + k * k * k * toX;
              const py =
                u * u * u * (f.y + 4) + 3 * u * u * k * midY + 3 * u * k * k * midY + k * k * k * toY;
              ctx.beginPath();
              ctx.arc(px, py, 1.4 + em * 0.8, 0, Math.PI * 2);
              ctx.fillStyle = `rgba(${LIGHT},${Math.sin(k * Math.PI) * em * (pull === 0 ? 0.4 : 0.7)})`;
              ctx.fill();
            }
          }

          // Terrain into the direction. Heavier than a source trace, because
          // the state is the thing the direction is mostly answering to.
          const tFrom = { x: trCx, y: tr.y + tr.h };
          const tMid = trace(tFrom, drCx, dr.y - 6, 0.34, 1.6);
          if (!still) {
            const k = (t * 0.3) % 1;
            const u = 1 - k;
            const px = u * u * u * trCx + 3 * u * u * k * trCx + 3 * u * k * k * drCx + k * k * k * drCx;
            const py =
              u * u * u * (tFrom.y + 4) + 3 * u * u * k * tMid + 3 * u * k * k * tMid + k * k * k * (dr.y - 6);
            ctx.beginPath();
            ctx.arc(px, py, 2.2, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(${LIGHT},${Math.sin(k * Math.PI) * 0.85})`;
            ctx.fill();
          }
          ctx.restore();

          // ── Out to the lean ──────────────────────────────────────────
          const leanIdx = LEANS.findIndex((l) => l.lean === directionValRef.current.lean);
          const target = geo.leans[leanIdx];
          if (target) {
            const startY = dr.y + dr.h;
            const my = (startY + target.y) / 2;
            ctx.beginPath();
            ctx.moveTo(drCx, startY + 4);
            ctx.bezierCurveTo(drCx, my, target.x, my, target.x, target.y - 4);
            ctx.strokeStyle = `rgba(${GOLD},0.32)`;
            ctx.lineWidth = 1.2;
            ctx.stroke();
            if (!still) {
              const k = (t * 0.42) % 1;
              const u = 1 - k;
              const px = u * u * u * drCx + 3 * u * u * k * drCx + 3 * u * k * k * target.x + k * k * k * target.x;
              const py =
                u * u * u * (startY + 4) + 3 * u * u * k * my + 3 * u * k * k * my + k * k * k * (target.y - 4);
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
                const bh = g.h * (0.25 + hash01(k + step * 0.37, 23.1) * 0.75) * 0.8;
                ctx.beginPath();
                ctx.moveTo(bx, g.y + g.h);
                ctx.lineTo(bx, g.y + g.h - bh);
                ctx.stroke();
              }
            } else if (s.motion === "human") {
              // Breathes, on the shared clock. It comes from someone alive.
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
                ctx.beginPath();
                ctx.rect(bx - 1.5, g.y + (g.h - bh) / 2, 3, bh);
                if (k < filled) {
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

  /** One source card. The two stages render two of these each. */
  const sourceCard = (s: (typeof CHAIN_SOURCES)[number]) => {
    const i = CHAIN_SOURCES.indexOf(s);
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
          // A <button> centres its content when a grid stretches it taller than
          // the content, and the columns have different numbers of items — so
          // without this the glyph rows sit at different heights.
          "flex flex-col items-stretch justify-start text-left",
          "rounded-lg border p-3 sm:p-4 transition-colors",
          "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gold/70",
          on ? "border-gold/45 bg-gold/[0.07]" : "border-gold/15 bg-black/20 hover:border-gold/30",
        )}
        data-testid={`chain-source-${s.key}`}
      >
        <div ref={(el) => { glyphRefs.current[i] = el; }} className="h-6 w-full mb-2" aria-hidden="true" />
        <p className="text-[0.65rem] uppercase tracking-[0.18em] text-gold mb-1">{s.label}</p>
        <p className="text-[0.7rem] text-muted-foreground leading-snug mb-3">{s.kind}</p>
        <ul className="space-y-1 mb-3">
          {s.items.map((it) => (
            <li key={it} className="text-xs text-foreground/85">
              {it}
            </li>
          ))}
        </ul>
        {/* What this column is saying on the day shown. Always present, never
            revealed only on hover — a source whose contribution you have to go
            looking for is halfway to hidden. */}
        <p className="text-[0.7rem] leading-snug text-foreground/70 border-t border-gold/10 pt-2 mt-auto">
          {said?.note}
        </p>
      </button>
    );
  };

  const gap = <div className="h-12 sm:h-14" aria-hidden="true" />;

  return (
    <div ref={wrapRef} className={cn("relative max-w-4xl mx-auto", className)} data-testid={testId}>
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none"
        aria-hidden="true"
        data-testid="chain-canvas"
      />

      {/* These are worked examples on a public page, not a live reading of
          anybody. Said once, quietly, at the top — nobody should wonder even
          for a moment whether this site is reading their body. */}
      <p className="relative text-center text-[0.6rem] uppercase tracking-[0.22em] text-muted-foreground/70 mb-7">
        An example day · how a reading forms
      </p>

      {/* ── Stage one: the state ────────────────────────────────── */}
      <p className="relative text-center text-[0.6rem] uppercase tracking-[0.2em] text-gold/60 mb-3">
        What the body is in
      </p>
      <div
        className="relative grid grid-cols-2 gap-3 sm:gap-4"
        role="group"
        aria-label="What the terrain is assembled from"
      >
        {STATE_SOURCES.map(sourceCard)}
      </div>

      {gap}

      <div
        ref={terrainRef}
        className="relative rounded-lg border border-gold/35 bg-gold/[0.04] px-6 py-6 text-center shadow-gold-subtle max-w-xl mx-auto"
        data-testid="chain-terrain"
      >
        <p className="text-[0.65rem] uppercase tracking-[0.18em] text-gold mb-2">Terrain now</p>
        <p className="font-display text-2xl md:text-3xl leading-snug" data-testid="chain-terrain-state">
          {terrain.state}
        </p>
        <p className="text-xs text-muted-foreground mt-3 max-w-md mx-auto leading-relaxed">
          {terrain.because}
        </p>
      </div>

      {gap}

      {/* ── Stage two: the context and the intention ────────────── */}
      <p className="relative text-center text-[0.6rem] uppercase tracking-[0.2em] text-gold/60 mb-3">
        What surrounds it, and what you intend
      </p>
      <div
        className="relative grid grid-cols-2 gap-3 sm:gap-4"
        role="group"
        aria-label="What the direction also considers"
      >
        {CONTEXT_SOURCES.map(sourceCard)}
      </div>

      {gap}

      {/* Not a score. A single number is the one thing this category
          over-claims, and it is what makes a reading unarguable. */}
      <div
        ref={directionRef}
        className="relative rounded-lg border border-gold/35 bg-gold/[0.04] px-6 py-6 text-center shadow-gold-subtle"
        data-testid="chain-direction"
      >
        <p className="text-[0.65rem] uppercase tracking-[0.18em] text-gold mb-2">Today's direction</p>
        <p className="font-display text-2xl md:text-3xl leading-snug" data-testid="chain-lean-value">
          {direction.lean}
        </p>
        <p className="text-xs text-muted-foreground mt-3 max-w-lg mx-auto leading-relaxed">
          {direction.because}
        </p>
      </div>

      {gap}

      <div className="relative grid grid-cols-1 sm:grid-cols-3 gap-3">
        {LEANS.map((d, i) => {
          const on = d.lean === direction.lean;
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
