import { useEffect, useRef, useState } from "react";
import { breathAt } from "@/lib/breath";
import { hash01, mountStage } from "@/lib/canvasStage";
import { usePrefersReducedMotion } from "@/hooks/use-reduced-motion";
import { STARS, FASCIA } from "@/components/ConstellationBody";
import { BEATS, COMMANDS, PIECES, type BeatKey } from "@/data/manifestoField";
import { cn } from "@/lib/utils";

/**
 * The manifesto, as one composition changing state.
 *
 * ── The movement ──────────────────────────────────────────────────────────
 *
 *   fragmentation → compression → recognition → integration → capacity
 *
 * Not "bad modern world → magical solution". Nothing here is a warning label
 * and none of it flashes red. Sleep, HRV and protein are real and worth
 * knowing; the argument is narrower and harder to dismiss — more information,
 * less relationship. The state that changes across the five beats is
 * *understanding*, never health. There is no before-and-after body here,
 * because that would be a claim we have no business making on a public page.
 *
 * ── Integration does not require erasure ──────────────────────────────────
 *
 * This is the same rule SignalChain is built on, and it is the reason the
 * fragments never fade out. At the turn they stop drifting and find the region
 * they belong with; a thin line appears between the two. Sleep is still sleep.
 * Twelve unrelated verdicts become one visible system with twelve parts, which
 * is a different thing from twelve pieces being tidied away.
 *
 * ── One figure, both directions ───────────────────────────────────────────
 *
 * Restore and Build are not two bodies side by side and not a sick/well pair.
 * The same figure performs both, alternating on an irregular clock — sometimes
 * wider, sometimes shorter, sometimes staying on one side longer — because
 * health is not permanent residence in either. The wave along the base is that
 * signal drawn out over time, not a decorative flourish.
 *
 * ── Scroll changes state, it does not move a camera ───────────────────────
 *
 * Scroll drives six numbers — density, pressure, hinge, relation, mode, room —
 * and everything on screen is a function of those. It is not twenty entrance
 * animations firing in sequence, and there is no camera. Scroll position is
 * read into a ref inside a passive listener; React is only told when the beat
 * changes, which is five times in the whole section.
 *
 * ── Reduced motion keeps the argument ─────────────────────────────────────
 *
 * The five states are composed stills rather than a continuous transition, and
 * the beat copy is real DOM text at every step, so the case is made in full
 * with nothing moving. The words in the field also exist as a list for screen
 * readers — the canvas is decoration for an argument that has to survive
 * without it.
 */

const GOLD = "214,178,104";
const LIGHT = "240,222,180";
const DIM = "196,186,168";

/** Centre of each region in figure space, for the pieces to settle against. */
const REGION_AT: Record<string, { x: number; y: number }> = (() => {
  const acc: Record<string, { x: number; y: number; n: number }> = {};
  for (const s of STARS) {
    const a = (acc[s.region] ??= { x: 0, y: 0, n: 0 });
    a.x += s.x;
    a.y += s.y;
    a.n += 1;
  }
  const out: Record<string, { x: number; y: number }> = {};
  for (const k of Object.keys(acc)) out[k] = { x: acc[k].x / acc[k].n, y: acc[k].y / acc[k].n };
  // Arms and legs are symmetric, so their mean lands on the midline in the
  // middle of the chest, where no limb is — the same fault the Body Map's hit
  // test had. Pinned to an actual forearm and an actual knee instead, so the
  // line from a label points at the thing it names.
  out.arms = { x: 24, y: 44 };
  out.legs = { x: 62, y: 112 };
  return out;
})();

/**
 * Which pieces share a home, so they can be given separate slots there.
 *
 * Three of them belong to the middle, and placed by region alone Calories,
 * Protein and Digestion printed on top of one another — the integrated state
 * has to be *more* legible than the fragmented one, not less.
 */
const REGION_GROUP: Record<string, number[]> = PIECES.reduce(
  (acc, pc, i) => {
    (acc[pc.region] ??= []).push(i);
    return acc;
  },
  {} as Record<string, number[]>,
);

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);
/** 0 below `a`, 1 above `b`, smooth between. */
const ramp = (p: number, a: number, b: number) => {
  const t = clamp01((p - a) / (b - a));
  return t * t * (3 - 2 * t);
};
/** A bump peaking at the middle of [a,b]. */
const bump = (p: number, a: number, b: number) => {
  const t = clamp01((p - a) / (b - a));
  return Math.sin(t * Math.PI);
};

/** Where each beat's copy takes over, as a fraction of the scroll. */
const BEAT_AT = [0.06, 0.28, 0.52, 0.72, 0.92];

/**
 * Where each state is fully formed — which is not the same place.
 *
 * A beat's copy arrives as its composition is still assembling, which is right
 * when you are scrolling through it and wrong when it is a still. At 0.06 only
 * three of the twelve pieces have arrived; as a composed image of "fragmented"
 * that undersells the whole point. Reduced motion gets the finished state of
 * each beat instead.
 */
const STILL_AT = [0.19, 0.33, 0.62, 0.76, 0.99];

function beatIndexFor(p: number) {
  // The boundary is the midpoint between anchors, so a beat is legible for the
  // whole stretch its composition holds.
  let i = 0;
  for (let k = 1; k < BEAT_AT.length; k++) {
    if (p >= (BEAT_AT[k - 1] + BEAT_AT[k]) / 2) i = k;
  }
  return i;
}

export function ManifestoField({ className }: { className?: string }) {
  const reduced = usePrefersReducedMotion();
  const outerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const repaintRef = useRef<(() => void) | null>(null);

  const pRef = useRef(0);
  const beatRef = useRef(0);
  const [beat, setBeat] = useState(0);
  const reducedRef = useRef(reduced);
  reducedRef.current = reduced;

  useEffect(() => {
    const onScroll = () => {
      const el = outerRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const travel = r.height - window.innerHeight;
      const p = travel > 0 ? clamp01(-r.top / travel) : 0;
      const i = beatIndexFor(p);
      // Under reduced motion the composition is a still per beat rather than a
      // continuous transition, so the progress the draw sees snaps to the beat.
      pRef.current = reducedRef.current ? STILL_AT[i] : p;
      if (i !== beatRef.current) {
        beatRef.current = i;
        setBeat(i);
        if (reducedRef.current) repaintRef.current?.();
      }
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  // Reduced motion recomputes the snapped progress when the setting flips.
  useEffect(() => {
    pRef.current = reduced ? STILL_AT[beatRef.current] : pRef.current;
    if (reduced) repaintRef.current?.();
  }, [reduced]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const teardown = mountStage(
      canvas,
      (S) => {
        const drift = PIECES.map((_, i) => ({
          sp: 0.12 + hash01(i, 9.7) * 0.2,
          ph: hash01(i, 4.1) * Math.PI * 2,
          wob: 0.5 + hash01(i, 15.3) * 0.9,
        }));

        return (t) => {
          const { ctx, w, h } = S;
          const still = S.reduced;
          const p = pRef.current;
          ctx.clearRect(0, 0, w, h);

          const narrow = w < 640;

          /* ── The six numbers everything is a function of ──────────── */

          // How much of the vocabulary has arrived.
          const density = ramp(p, 0.0, 0.2);
          // How tightly it crowds the body, and how mechanical the figure gets.
          const pressure = ramp(p, 0.16, 0.36) * (1 - ramp(p, 0.42, 0.54));
          // The single breath at the turn. The emotional hinge of the page:
          // the clutter goes quiet, the body takes one visible breath, and only
          // then do the relationships appear.
          const hinge = bump(p, 0.4, 0.56);
          // Pieces finding the region they belong with.
          const relation = ramp(p, 0.5, 0.66);
          // Restore ↔ Build, on an irregular clock. Two incommensurate terms
          // through a soft clip, so it dwells on one side for varying stretches
          // instead of ticking like a metronome.
          const modeOn = ramp(p, 0.64, 0.76);
          const th = (still ? 2.2 : t * 0.55) + p * 9;
          const raw = 0.72 * Math.sin(th) + 0.3 * Math.sin(th * 0.37 + 1.1);
          const mode = Math.tanh(raw * 1.9) * modeOn;
          // Space around the figure at the end. Not health — room.
          const room = ramp(p, 0.78, 0.98);

          const breathAmb = still ? 0 : breathAt(t);
          // Compression takes the breath away; the hinge gives one back, large.
          const breath = breathAmb * (1 - pressure * 0.8) + hinge * 1.5;

          /* ── The figure ───────────────────────────────────────────── */

          const FIG_W = 64;
          const FIG_H = 152;
          // Above centre, not at it: the lower part of the screen belongs to
          // the beat copy, and the figure should not be reading through it.
          // A phone gives the copy far more of the screen — five lines instead
          // of two — so the whole composition sits higher and smaller there.
          const figCy = h * (narrow ? 0.33 : 0.42);
          const floorY = h * (narrow ? 0.5 : 0.65);
          const waveY = h * (narrow ? 0.55 : 0.7);
          const fit = Math.min((w * (narrow ? 0.5 : 0.34)) / FIG_W, (h * (narrow ? 0.38 : 0.5)) / FIG_H);
          const scale = fit * (1 + room * 0.06);
          const ox = w / 2 - 50 * scale;
          const oy = figCy - 84 * scale;

          const px = new Array<number>(STARS.length);
          const py = new Array<number>(STARS.length);

          for (let i = 0; i < STARS.length; i++) {
            const s = STARS[i];
            let fx = s.x;
            let fy = s.y;

            // Local diaphragm breath, as everywhere else on this site.
            const d = s.y - 44;
            const local = Math.exp(-(d * d) / (2 * 20 * 20));
            fx += (s.x - 50) * 0.03 * breath * local;
            fy += 0.85 * breath * local;

            // Restore opens and widens; Build gathers toward the axis and
            // lifts. One figure doing both, never two figures.
            fx += (s.x - 50) * 0.05 * Math.max(0, -mode);
            fx += (50 - s.x) * 0.045 * Math.max(0, mode);
            fy -= (s.y - 84) * 0.02 * Math.max(0, mode);
            fy += (s.y - 84) * 0.012 * Math.max(0, -mode);

            px[i] = ox + fx * scale;
            py[i] = oy + fy * scale;
          }

          /* ── Fascia ───────────────────────────────────────────────── */
          // Under pressure the web goes rigid and even — the mechanical read.
          // Restore softens and lengthens it; Build tightens and brightens it.
          const lineAlpha =
            0.13 + room * 0.1 + Math.max(0, mode) * 0.16 - pressure * 0.04 + breath * 0.03;
          ctx.lineWidth = 0.9 + Math.max(0, mode) * 0.9 + pressure * 0.5;
          ctx.strokeStyle = `rgba(${GOLD},${clamp01(lineAlpha)})`;
          ctx.beginPath();
          for (const [a, b] of FASCIA) {
            ctx.moveTo(px[a], py[a]);
            ctx.lineTo(px[b], py[b]);
          }
          ctx.stroke();

          for (let i = 0; i < STARS.length; i++) {
            const s = STARS[i];
            const r = (s.mag * 1.5 + room * 1.1) * Math.max(0.6, scale / 3);
            ctx.beginPath();
            ctx.arc(px[i], py[i], r, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(${LIGHT},${0.45 + room * 0.35 + hinge * 0.2})`;
            ctx.fill();
          }

          // One soft halo for the whole figure rather than one per star: this
          // section is long and the cost has to stay flat.
          if (room > 0.01 || hinge > 0.01) {
            const g = ctx.createRadialGradient(w / 2, figCy, 0, w / 2, figCy, 72 * scale);
            const a = room * 0.06 + hinge * 0.05;
            g.addColorStop(0, `rgba(${GOLD},${a})`);
            g.addColorStop(1, `rgba(${GOLD},0)`);
            ctx.fillStyle = g;
            ctx.fillRect(0, 0, w, h);
          }

          /* ── The pieces ───────────────────────────────────────────── */

          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          const fontSize = narrow ? 11 : 13;
          ctx.font = `500 ${fontSize}px ui-sans-serif, system-ui, -apple-system, sans-serif`;
          if ("letterSpacing" in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = "0.12em";

          const far = Math.min(w, h) * (narrow ? 0.46 : 0.42);
          const tight = Math.min(w, h) * (narrow ? 0.26 : 0.2);

          for (let i = 0; i < PIECES.length; i++) {
            const pc = PIECES[i];
            const dr = drift[i];
            // Arrives in order, so the field accumulates rather than appearing.
            const born = clamp01((density - (i / PIECES.length) * 0.85) * 5);
            if (born <= 0.01) continue;

            const wob = still ? 0 : Math.sin(t * dr.sp + dr.ph) * dr.wob;
            // Evenly spaced rather than hand-authored angles. Twelve words on
            // arbitrary bearings collided at the crowded radius, and unreadable
            // is not the same effect as crowded.
            const ang = (i / PIECES.length) * Math.PI * 2 + 0.42 + wob * 0.05 * (1 - relation);

            // Scattered → crowded → belonging. The last is a position beside
            // the region it relates to, never a position inside the figure.
            const scatterR = far * pc.spread;
            const radius = scatterR + (tight - scatterR) * pressure;

            const sx = w / 2 + Math.cos(ang) * radius;
            const sy = figCy + Math.sin(ang) * radius * 0.58;

            const home = REGION_AT[pc.region] ?? { x: 50, y: 84 };
            const hx = ox + home.x * scale;
            const hy = oy + home.y * scale;
            // A slot within the region, alternating sides and stepping down,
            // so three pieces that share the middle are three readable labels.
            const grp = REGION_GROUP[pc.region] ?? [i];
            const slot = grp.indexOf(i);
            // A region that sits off the midline puts its labels on its own
            // side; only the midline regions alternate. Otherwise a label for
            // the left forearm gets pushed out to the right, across the torso.
            const offAxis = home.x - 50;
            const side =
              Math.abs(offAxis) > 6 ? Math.sign(offAxis) : slot % 2 === 0 ? 1 : -1;
            const rows = Math.ceil(grp.length / 2);
            const lh = narrow ? 16 : 20;
            // Pushed out from its region as room opens up, so integration ends
            // spacious rather than clustered on top of the body.
            const out = (narrow ? 76 : 108) * (0.74 + room * 0.5);
            const bx = hx + side * out;
            const by = hy + (Math.floor(slot / 2) - (rows - 1) / 2) * lh;

            const x = sx + (bx - sx) * relation;
            // Hard floor: the beat copy owns the bottom of the screen, and a
            // metric printed through a headline reads as a bug, not as clutter.
            const y = Math.max(52, Math.min(floorY, sy + (by - sy) * relation));

            // Never fades out. Dimmer while it is only clutter, clearest once
            // it belongs to something.
            const alpha = born * (0.34 + relation * 0.42 + room * 0.16 - pressure * 0.06);

            // The relationship, drawn only once there is one.
            if (relation > 0.02) {
              const lx = Math.max(28, Math.min(w - 28, x));
              ctx.beginPath();
              ctx.moveTo(lx, y);
              ctx.lineTo(hx, hy);
              ctx.strokeStyle = `rgba(${GOLD},${relation * 0.2 * born})`;
              ctx.lineWidth = 0.7;
              ctx.stroke();
            }

            ctx.fillStyle = `rgba(${DIM},${clamp01(alpha)})`;
            const halfWord = ctx.measureText(pc.word).width / 2;
            ctx.fillText(pc.word, Math.max(halfWord + 10, Math.min(w - halfWord - 10, x)), y);
          }

          // The verbs. Compression only, and quietly — this is not a rant
          // about wearables, it is an observation about instructions.
          // Threshold high enough that they are absent from the fragmented
          // still rather than ghosting through it at 3% and reading as noise.
          if (pressure > 0.14) {
            ctx.font = `600 ${narrow ? 10 : 12}px ui-sans-serif, system-ui, sans-serif`;
            for (let i = 0; i < COMMANDS.length; i++) {
              const ang = (i / COMMANDS.length) * Math.PI * 2 + 0.4;
              const r = tight * (1.42 + Math.sin(i * 2.1) * 0.12);
              ctx.fillStyle = `rgba(${LIGHT},${pressure * 0.3})`;
              ctx.fillText(
                COMMANDS[i].toUpperCase(),
                w / 2 + Math.cos(ang) * r,
                Math.min(floorY, figCy + Math.sin(ang) * r * 0.62),
              );
            }
          }

          /* ── The wave ─────────────────────────────────────────────── */
          // The mode signal drawn out over time. Irregular on purpose: health
          // is not permanent residence on either side, and a clean sine would
          // say it alternates on a schedule.
          if (modeOn > 0.02) {
            const baseY = waveY;
            const amp = 20 * modeOn;
            ctx.beginPath();
            for (let k = 0; k <= 120; k++) {
              const u = k / 120;
              const x = w * 0.14 + u * w * 0.72;
              const q = th - (1 - u) * 6;
              const v = Math.tanh((0.72 * Math.sin(q) + 0.3 * Math.sin(q * 0.37 + 1.1)) * 1.9);
              const y = baseY - v * amp;
              k === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
            }
            ctx.strokeStyle = `rgba(${GOLD},${modeOn * 0.4})`;
            ctx.lineWidth = 1.1;
            ctx.stroke();

            ctx.font = `500 ${narrow ? 9 : 10}px ui-sans-serif, system-ui, sans-serif`;
            ctx.fillStyle = `rgba(${DIM},${modeOn * 0.5})`;
            ctx.fillText("RESTORE", w * 0.14, baseY - amp - 14);
            ctx.fillText("BUILD", w * 0.86, baseY + amp + 14);
          }
        };
      },
      { controls: (h) => (repaintRef.current = h.repaint) },
    );

    return () => {
      repaintRef.current = null;
      teardown();
    };
  }, []);

  const current = BEATS[beat];

  return (
    <div ref={outerRef} className={cn("relative", className)} style={{ height: "460vh" }}>
      <div className="sticky top-0 h-screen overflow-hidden">
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full"
          aria-hidden="true"
          data-testid="manifesto-field"
        />

        {/* The argument itself, in the DOM, one beat at a time. Positioned
            low so the figure keeps the middle of the screen. */}
        <div className="relative h-full flex items-end justify-center pb-14 sm:pb-20 px-5 pointer-events-none">
          <div
            key={current.key}
            className="max-w-xl text-center animate-in fade-in slide-in-from-bottom-2 duration-700"
            data-testid={`manifesto-beat-${current.key}`}
          >
            <p className="text-[0.6rem] uppercase tracking-[0.22em] text-gold/70 mb-3">
              {current.eyebrow}
            </p>
            <p className="font-display text-2xl sm:text-3xl md:text-4xl leading-snug mb-4">
              {current.line}
              {current.gold && (
                <>
                  {" "}
                  <span className="text-gold">{current.gold}</span>
                </>
              )}
            </p>
            {current.body && (
              <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
                {current.body}
              </p>
            )}
          </div>
        </div>

        {/* Which of the five you are in. Also the only affordance saying the
            section responds to scrolling at all. */}
        <div
          className="absolute right-4 sm:right-7 top-1/2 -translate-y-1/2 flex flex-col gap-2"
          aria-hidden="true"
        >
          {BEATS.map((b, i) => (
            <span
              key={b.key}
              className={cn(
                "block w-1 rounded-full transition-all duration-500",
                i === beat ? "h-6 bg-gold/70" : "h-1.5 bg-white/20",
              )}
            />
          ))}
        </div>
      </div>

      {/* The canvas is aria-hidden, so the vocabulary it draws lives here too.
          Nothing on this page should exist only inside a painting. */}
      <ul className="sr-only" aria-label="The metrics modern health is measured in">
        {PIECES.map((p) => (
          <li key={p.word}>{p.word}</li>
        ))}
      </ul>
    </div>
  );
}

export type { BeatKey };
