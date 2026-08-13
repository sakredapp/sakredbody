import { useEffect, useRef, useState } from "react";
import { breathAt } from "@/lib/breath";
import { hash01, mountStage } from "@/lib/canvasStage";

/**
 * The Sakred Body, drawn the way a star chart draws a figure.
 *
 * A human silhouette plotted as stars, with the fascia strung between them as
 * the lines of the constellation. It is the brand's whole argument in one
 * object: the same eye that reads a body reads a sky, and neither is a
 * collection of parts.
 *
 * ── It is a system, not an illustration that lights up ────────────────────
 *
 * The figure used to do one thing: brighten a region and run a charge down its
 * lines. Everything else was still. That reads as a diagram with a highlight,
 * and the whole claim of this brand is that a body is none of those things.
 *
 * So there are three states, and the figure is never fully at rest:
 *
 *   REST         it breathes. The swell is local to the lower ribs and
 *                diaphragm rather than a scale on the whole silhouette —
 *                scaling the figure makes a balloon, not a breath.
 *   AUTOCYCLE    one region becomes legible every few seconds and performs
 *                its own behaviour, not a shared gold pulse.
 *   INTERACTION  a pointer or a tap takes priority immediately, and on
 *                release the hold decays over ~1.2s rather than snapping
 *                back to wherever the cycle had got to.
 *
 * ── Nothing happens alone ─────────────────────────────────────────────────
 *
 * NEIGHBOURS is the load-bearing idea, not the particles. Activating Breath
 * answers in Flow and the Central Axis; activating the Middle answers in the
 * Organ Network and Flow. A region is never lit in isolation, because that is
 * the one thing the page beside it says is never true of a body.
 *
 * ── What is deliberately absent ───────────────────────────────────────────
 *
 * No scroll-driven camera, no WebGL. mountStage already caps device pixel
 * ratio, pauses on IntersectionObserver, and freezes under prefers-reduced-
 * motion while still painting one frame — so reduced motion gets a composed
 * still figure rather than a blank box.
 */

interface Star {
  /** Normalised to a 100 × 200 figure, origin at the top of the head. */
  x: number;
  y: number;
  /** Bigger stars are the anchor points — joints, organs, the crown. */
  mag: number;
  region: string;
}

/** The figure. Anchors first, then the chain that strings them. */
const STARS: Star[] = [
  // Head and throat
  { x: 50, y: 8, mag: 1.6, region: "crown" },
  { x: 44, y: 14, mag: 0.8, region: "crown" },
  { x: 56, y: 14, mag: 0.8, region: "crown" },
  { x: 50, y: 21, mag: 1.2, region: "throat" },

  // Shoulders and arms
  { x: 34, y: 28, mag: 1.4, region: "arms" },
  { x: 66, y: 28, mag: 1.4, region: "arms" },
  { x: 24, y: 44, mag: 1.0, region: "arms" },
  { x: 76, y: 44, mag: 1.0, region: "arms" },
  { x: 18, y: 62, mag: 1.1, region: "arms" },
  { x: 82, y: 62, mag: 1.1, region: "arms" },

  // Heart and lungs
  { x: 50, y: 34, mag: 1.8, region: "heart" },
  { x: 40, y: 38, mag: 0.9, region: "heart" },
  { x: 60, y: 38, mag: 0.9, region: "heart" },

  // The middle — liver, gut, the whole engine room
  { x: 50, y: 48, mag: 1.5, region: "gut" },
  { x: 41, y: 52, mag: 0.9, region: "gut" },
  { x: 59, y: 52, mag: 0.9, region: "gut" },
  { x: 50, y: 60, mag: 1.3, region: "gut" },

  // Pelvis and the deep reserve
  { x: 42, y: 70, mag: 1.4, region: "root" },
  { x: 58, y: 70, mag: 1.4, region: "root" },
  { x: 50, y: 74, mag: 1.1, region: "root" },

  // Legs
  { x: 40, y: 92, mag: 1.0, region: "legs" },
  { x: 60, y: 92, mag: 1.0, region: "legs" },
  { x: 38, y: 116, mag: 1.2, region: "legs" },
  { x: 62, y: 116, mag: 1.2, region: "legs" },
  { x: 36, y: 140, mag: 0.9, region: "legs" },
  { x: 64, y: 140, mag: 0.9, region: "legs" },
  { x: 35, y: 160, mag: 1.1, region: "legs" },
  { x: 65, y: 160, mag: 1.1, region: "legs" },
];

/** The fascia. Indices into STARS — one continuous web, not a skeleton. */
const FASCIA: [number, number][] = [
  [0, 1], [0, 2], [1, 3], [2, 3],
  [3, 4], [3, 5], [3, 10],
  [4, 6], [6, 8], [5, 7], [7, 9],
  [4, 11], [5, 12], [10, 11], [10, 12],
  [11, 13], [12, 13], [13, 14], [13, 15],
  [14, 16], [15, 16],
  [16, 17], [16, 18], [17, 19], [18, 19],
  [17, 20], [18, 21],
  [20, 22], [21, 23], [22, 24], [23, 25], [24, 26], [25, 27],
  // The long lines: the chains that actually run the length of the body.
  [4, 17], [5, 18], [10, 16], [13, 19],
];

/** Edges touching each star, so a particle can pick a way onward. */
const EDGES_AT: number[][] = STARS.map(() => []);
FASCIA.forEach(([a, b], i) => {
  EDGES_AT[a].push(i);
  EDGES_AT[b].push(i);
});

export interface BodyRegion {
  key: string;
  name: string;
  reads: string;
}

/**
 * Geometry, not taxonomy.
 *
 * These names describe where the stars are. The vocabulary a visitor reads
 * lives in data/bodyMap.ts and is free to be the conceptual model instead —
 * see the header there. `name` and `reads` are not rendered anywhere.
 */
export const BODY_REGIONS: BodyRegion[] = [
  { key: "crown", name: "Crown", reads: "Light, sleep, the clock." },
  { key: "throat", name: "Breath", reads: "The switch between states." },
  { key: "heart", name: "Heart", reads: "Circulation, and the settling of it." },
  { key: "gut", name: "The Middle", reads: "Liver, gut, lymph." },
  { key: "root", name: "Root", reads: "The deep reserve." },
  { key: "arms", name: "Frame", reads: "What carries load." },
  { key: "legs", name: "The Pump", reads: "Lymph moves when you move." },
];

/**
 * Which systems answer which, and how strongly.
 *
 * Written as relationships rather than "everything affects everything" — a
 * figure where the whole body lights at 20% whenever anything is touched says
 * nothing at all. A strong neighbour is a quarter, a secondary is an eighth.
 */
const NEIGHBOURS: Record<string, { key: string; w: number }[]> = {
  crown: [{ key: "throat", w: 0.25 }, { key: "root", w: 0.12 }],
  throat: [{ key: "legs", w: 0.25 }, { key: "root", w: 0.25 }, { key: "heart", w: 0.12 }],
  root: [{ key: "arms", w: 0.25 }, { key: "throat", w: 0.25 }],
  heart: [{ key: "gut", w: 0.25 }, { key: "legs", w: 0.25 }],
  gut: [{ key: "heart", w: 0.25 }, { key: "legs", w: 0.25 }],
  legs: [{ key: "throat", w: 0.25 }, { key: "gut", w: 0.12 }, { key: "arms", w: 0.12 }],
  arms: [{ key: "root", w: 0.25 }, { key: "legs", w: 0.15 }],
};

/** Centre of each region, for a hit area a thumb can actually find. */
const CENTROIDS: Record<string, { x: number; y: number }> = (() => {
  const acc: Record<string, { x: number; y: number; n: number }> = {};
  for (const s of STARS) {
    const a = (acc[s.region] ??= { x: 0, y: 0, n: 0 });
    a.x += s.x;
    a.y += s.y;
    a.n += 1;
  }
  const out: Record<string, { x: number; y: number }> = {};
  for (const k of Object.keys(acc)) out[k] = { x: acc[k].x / acc[k].n, y: acc[k].y / acc[k].n };
  return out;
})();

/** A particle riding the fascia. */
interface Mote {
  edge: number;
  /** 0…1 along the edge, in the direction `dir`. */
  k: number;
  dir: 1 | -1;
  speed: number;
  seed: number;
}

const MOTES = 42;

export function ConstellationBody({
  className,
  /**
   * Fires with the region key whenever the lit region changes — whether the
   * pointer chose it, a tap chose it, or the cycle did.
   *
   * Emitted from a ref comparison inside the animation loop rather than on
   * every frame: `lit` is recomputed sixty times a second, and calling a React
   * setter that often would re-render the page under the canvas. React hears
   * "region changed", never "frame changed".
   */
  onActive,
  /**
   * Home passes false. The hero figure gets the resting life — breath, depth,
   * drift — and none of the teaching behaviour, because the full interaction
   * belongs to /the-body-map and the hero is a signature rather than a lesson.
   */
  interactive = true,
}: {
  className?: string;
  onActive?: (key: string) => void;
  interactive?: boolean;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [active, setActive] = useState(0);
  const activeRef = useRef(0);
  /** A deliberate choice and the moment it stops counting. */
  const holdRef = useRef<{ key: string; until: number } | null>(null);
  const holdingRef = useRef(false);
  const litRef = useRef<string | null>(null);
  const onActiveRef = useRef(onActive);
  const interactiveRef = useRef(interactive);
  onActiveRef.current = onActive;
  interactiveRef.current = interactive;
  activeRef.current = active;

  // The cycle stalls while somebody is holding a region, and picks up from
  // where it was rather than jumping.
  useEffect(() => {
    const timer = setInterval(() => {
      if (!holdingRef.current) setActive((a) => (a + 1) % BODY_REGIONS.length);
    }, 5200);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;

    /** Set by the tap handler below, consumed on the next frame. */
    let tapped: { x: number; y: number } | null = null;
    const onDown = (e: PointerEvent) => {
      if (!interactiveRef.current) return;
      const rect = canvas.getBoundingClientRect();
      tapped = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };
    canvas.addEventListener("pointerdown", onDown);

    const teardown = mountStage(canvas, (S) => {
      /** Primary activation, eased so regions fade rather than switch. */
      const level: Record<string, number> = {};
      /** Primary plus what the neighbours lend it. */
      const act: Record<string, number> = {};
      BODY_REGIONS.forEach((r) => {
        level[r.key] = 0;
        act[r.key] = 0;
      });

      const motes: Mote[] = Array.from({ length: MOTES }, (_, i) => ({
        edge: Math.floor(hash01(i, 7.3) * FASCIA.length),
        k: hash01(i, 19.1),
        dir: hash01(i, 3.7) > 0.5 ? 1 : -1,
        speed: 0.09 + hash01(i, 11.9) * 0.11,
        seed: i,
      }));

      // Scratch, reused every frame so the draw allocates nothing.
      const px = new Float32Array(STARS.length);
      const py = new Float32Array(STARS.length);

      let prev = 0;

      return (t) => {
        const { ctx, w, h } = S;
        const dt = Math.min(0.05, prev === 0 ? 0.016 : t - prev);
        prev = t;
        const breath = breathAt(t);
        ctx.clearRect(0, 0, w, h);

        // The figure occupies x 18…82 and y 8…160. Fitting to its actual
        // extent — rather than to the nominal 100 × 200 box — is what keeps
        // the feet on the canvas at every size.
        const FIG_W = 64;
        const FIG_H = 152;
        const FIG_CX = 50;
        const FIG_CY = 84;
        // 0.82/0.84, not 0.9/0.94 — the figure has to leave room for its own
        // light. Every star paints a halo of radius r*7 and the anchor stars
        // throw flare arms of up to 6.6r; filling 94% of the height clipped
        // the crown's halo against the canvas edge on a dead straight line.
        const scale = Math.min((w * 0.82) / FIG_W, (h * 0.84) / FIG_H);

        // ── Depth ────────────────────────────────────────────
        // Four planes, shifted by a few pixels each. Small on purpose: this
        // is a figure suspended in space, not a parallax demo. The body plane
        // moves least of the moving ones because it is the thing being looked
        // at — the sense of depth comes from what sits behind and in front of
        // it drifting differently.
        const pxN = S.inside ? (S.px - w / 2) / (w / 2) : 0;
        const pyN = S.inside ? (S.py - h / 2) / (h / 2) : 0;
        const plane = (depth: number) => ({ x: -pxN * depth, y: -pyN * depth });
        const planeBack = plane(2);
        const planeFlow = plane(5);
        const planeBody = plane(7);
        const planeInfo = plane(9);

        const ox = w / 2 - FIG_CX * scale;
        const oy = h / 2 - FIG_CY * scale;

        // ── Interaction ──────────────────────────────────────
        // Nearest region centre rather than nearest star. A thumb cannot find
        // a 3px point, and a pointer should not have to.
        const pick = (cx: number, cy: number) => {
          let best = Infinity;
          let key: string | null = null;
          for (const r of BODY_REGIONS) {
            const c = CENTROIDS[r.key];
            const d = Math.hypot(ox + c.x * scale - cx, oy + c.y * scale - cy);
            if (d < best) {
              best = d;
              key = r.key;
            }
          }
          // Generous, but not the whole canvas — outside this the figure goes
          // back to demonstrating itself.
          return best < 46 * scale * 0.45 ? key : null;
        };

        if (interactiveRef.current) {
          if (tapped) {
            const k = pick(tapped.x, tapped.y);
            // A tap is deliberate, so it holds far longer than a hover.
            if (k) holdRef.current = { key: k, until: t + 7 };
            tapped = null;
          }
          if (S.inside) {
            const k = pick(S.px, S.py);
            // Refreshed every frame the pointer is near, so the decay only
            // starts once it actually leaves.
            if (k) holdRef.current = { key: k, until: t + 1.2 };
          }
        }

        const hold = holdRef.current && t < holdRef.current.until ? holdRef.current : null;
        holdingRef.current = !!hold;
        const lit = hold?.key ?? BODY_REGIONS[activeRef.current].key;

        if (lit !== litRef.current) {
          litRef.current = lit;
          onActiveRef.current?.(lit);
        }

        // Primary eases toward its target; act adds what the neighbours lend.
        for (const r of BODY_REGIONS) {
          const target = r.key === lit ? 1 : 0;
          level[r.key] += (target - level[r.key]) * 0.05;
        }
        for (const r of BODY_REGIONS) act[r.key] = level[r.key];
        for (const r of BODY_REGIONS) {
          for (const n of NEIGHBOURS[r.key] ?? []) {
            act[n.key] = Math.min(1, act[n.key] + level[r.key] * n.w);
          }
        }

        // ── Behaviours ───────────────────────────────────────
        // Each region moves the way the thing it stands for moves. A shared
        // gold pulse would teach nothing.

        // Breath & Pressure — the ribs widen and a wave travels down.
        const breathGain = 1 + act.throat * 2.4;
        const waveY = 24 + ((t * 0.42) % 1) * 58;

        // The Central Axis — a conduction pulse down the spine.
        const axisY = 6 + ((t * 0.5) % 1) * 72;

        // The Middle — a slow rotation through the abdomen.
        const churn = t * 0.7;

        // Structure & Strength — lines tension and the frame gathers upright.
        const tension = act.arms;

        for (let i = 0; i < STARS.length; i++) {
          const s = STARS[i];
          let fx = s.x;
          let fy = s.y;

          // Resting breath, local to the diaphragm. A gaussian centred just
          // under the ribs, so the chest and belly move and the head and feet
          // do not. Scaling the whole silhouette would read as a balloon.
          const dFromDia = s.y - 44;
          const local = Math.exp(-(dFromDia * dFromDia) / (2 * 20 * 20));
          fx += (s.x - 50) * 0.030 * breath * local * breathGain;
          fy += 0.85 * breath * local * breathGain;

          // The pressure wave, only while Breath is answering.
          if (act.throat > 0.02) {
            const dw = Math.abs(s.y - waveY);
            if (dw < 12) fy += Math.cos((dw / 12) * Math.PI * 0.5) * 0.5 * act.throat;
          }

          // The Middle turns rather than blinks.
          if (act.gut > 0.02 && s.region === "gut") {
            fx += Math.cos(churn + i) * 0.7 * act.gut;
            fy += Math.sin(churn + i) * 0.5 * act.gut;
          }

          // The frame gathers: limbs draw very slightly toward the axis and
          // the whole figure stands a touch taller.
          if (tension > 0.02) {
            fx += (50 - s.x) * 0.012 * tension;
            fy -= (s.y - 84) * 0.008 * tension;
          }

          let X = ox + fx * scale + planeBody.x;
          let Y = oy + fy * scale + planeBody.y;

          // The body noticed you. 1–3px, and it returns — this is attention,
          // not gravity, and it must never deform the anatomy.
          if (S.inside) {
            const dx = S.px - X;
            const dy = S.py - Y;
            const d = Math.hypot(dx, dy);
            const reach = 120;
            if (d < reach && d > 0.001) {
              const pullAmt = (1 - d / reach) ** 2 * 3;
              X += (dx / d) * pullAmt;
              Y += (dy / d) * pullAmt;
            }
          }

          px[i] = X;
          py[i] = Y;
        }

        // ── Fascia ──────────────────────────────────────────────
        for (let e = 0; e < FASCIA.length; e++) {
          const [a, b] = FASCIA[e];
          const heat = Math.max(act[STARS[a].region] ?? 0, act[STARS[b].region] ?? 0);

          ctx.beginPath();
          ctx.moveTo(px[a] + planeFlow.x - planeBody.x, py[a] + planeFlow.y - planeBody.y);
          ctx.lineTo(px[b] + planeFlow.x - planeBody.x, py[b] + planeFlow.y - planeBody.y);
          ctx.strokeStyle = `rgba(214,178,104,${0.16 + heat * 0.46 + breath * 0.05})`;
          ctx.lineWidth = 0.9 + heat * 1.1 + tension * 0.7;
          ctx.stroke();

          // A charge travelling the line, away from the lit region.
          if (heat > 0.12) {
            const from = (act[STARS[a].region] ?? 0) >= (act[STARS[b].region] ?? 0) ? a : b;
            const to = from === a ? b : a;
            const k = (t * 0.55 + a * 0.17 + b * 0.11) % 1;
            const cx = px[from] + (px[to] - px[from]) * k;
            const cy = py[from] + (py[to] - py[from]) * k;
            const fade = Math.sin(k * Math.PI);
            ctx.beginPath();
            ctx.arc(cx, cy, 1.5 * scale * 0.5 + 0.8, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(255,247,224,${heat * fade})`;
            ctx.fill();
          }
        }

        // ── Flow ────────────────────────────────────────────────
        // Motes ride the fascia rather than drifting at random, and they hand
        // off at junctions instead of looping a visible circuit. They fade at
        // both ends of every edge, which is what reads as passing through the
        // body rather than around it.
        const flowGain = 0.55 + act.legs * 1.9 + breath * 0.25;
        for (const m of motes) {
          const [ea, eb] = FASCIA[m.edge];
          const from = m.dir === 1 ? ea : eb;
          const to = m.dir === 1 ? eb : ea;

          m.k += m.speed * flowGain * dt;
          if (m.k >= 1) {
            // Hand off to another line out of the junction just reached.
            const opts = EDGES_AT[to];
            const next = opts[Math.floor(hash01(m.seed + t * 13.7, 5.1) * opts.length) % opts.length];
            m.edge = next;
            m.dir = FASCIA[next][0] === to ? 1 : -1;
            m.k = 0;
            continue;
          }

          const x = px[from] + (px[to] - px[from]) * m.k + planeFlow.x - planeBody.x;
          const y = py[from] + (py[to] - py[from]) * m.k + planeFlow.y - planeBody.y;
          // Into the body and back out, rather than a bead on a wire.
          const fade = Math.sin(m.k * Math.PI);
          const heat = Math.max(act[STARS[from].region] ?? 0, act[STARS[to].region] ?? 0);
          const alpha = (0.10 + heat * 0.5) * fade;
          if (alpha < 0.01) continue;
          ctx.beginPath();
          ctx.arc(x, y, (0.8 + heat * 1.1) * Math.max(0.7, scale / 3), 0, Math.PI * 2);
          ctx.fillStyle = `rgba(226,205,158,${alpha})`;
          ctx.fill();
        }

        // ── Stars ───────────────────────────────────────────────
        for (let i = 0; i < STARS.length; i++) {
          const s = STARS[i];
          const heat = act[s.region] ?? 0;
          const X = px[i];
          const Y = py[i];

          // Mind & Awareness is finer and quicker than the rest — small
          // coherent pulses rather than a broad swell.
          const fine = s.region === "crown" ? 1 + act.crown * 1.6 : 1;
          const twinkle = 0.5 + 0.5 * Math.sin(t * 1.1 * fine + hash01(i, 31.7) * 12);

          // The Organ Network answers itself: internal territories pulse on
          // staggered phases so the eye reads relationship, never one organ
          // blinking alone.
          let organ = 0;
          if ((s.region === "heart" || s.region === "gut") && act.heart > 0.02) {
            organ = Math.max(0, Math.sin(t * 1.6 - i * 0.9)) * act.heart * 0.9;
          }

          // The spine conducts, crown to root, in sequence.
          let axis = 0;
          if (act.root > 0.02 && Math.abs(s.x - 50) < 9) {
            const d = Math.abs(s.y - axisY);
            if (d < 14) axis = Math.cos((d / 14) * Math.PI * 0.5) * act.root;
          }

          const boost = heat + organ * 0.6 + axis * 0.7;
          const r = (s.mag * 1.9 + boost * 2.6) * (0.85 + twinkle * 0.15) * Math.max(0.7, scale / 3);
          const alpha = 0.5 + boost * 0.5 + breath * 0.1;

          const glow = 0.16 + boost * 0.36;
          const halo = ctx.createRadialGradient(X, Y, 0, X, Y, r * 7);
          halo.addColorStop(0, `rgba(235,211,162,${glow})`);
          halo.addColorStop(1, "rgba(235,211,162,0)");
          ctx.fillStyle = halo;
          ctx.beginPath();
          ctx.arc(X, Y, r * 7, 0, Math.PI * 2);
          ctx.fill();

          ctx.beginPath();
          ctx.arc(X, Y, r, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(247,240,222,${Math.min(1, alpha)})`;
          ctx.fill();

          // The anchor stars flare four-pointed when their region is lit.
          // Drawn on the information plane: it is the layer that says which
          // thing is being talked about, so it sits nearest the viewer.
          if (s.mag > 1.2 && boost > 0.15) {
            const arm = r * (4 + boost * 2.6);
            const ax = X + planeInfo.x - planeBody.x;
            const ay = Y + planeInfo.y - planeBody.y;
            ctx.strokeStyle = `rgba(240,219,175,${Math.min(1, boost) * 0.75})`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(ax - arm, ay);
            ctx.lineTo(ax + arm, ay);
            ctx.moveTo(ax, ay - arm);
            ctx.lineTo(ax, ay + arm);
            ctx.stroke();
          }
        }

        // A single faint ring on the background plane. It is the only thing
        // back there, and it exists so the two nearer planes have something
        // to be in front of.
        ctx.beginPath();
        ctx.arc(
          w / 2 + planeBack.x,
          h / 2 + planeBack.y,
          Math.min(w, h) * 0.42,
          0,
          Math.PI * 2,
        );
        ctx.strokeStyle = `rgba(214,178,104,${0.05 + breath * 0.03})`;
        ctx.lineWidth = 1;
        ctx.stroke();
      };
    });

    return () => {
      canvas.removeEventListener("pointerdown", onDown);
      teardown();
    };
  }, []);

  return (
    <div className="relative">
      <canvas
        ref={ref}
        className={`w-full h-[34rem] sm:h-[46rem] lg:h-[52rem] ${
          interactive ? "cursor-pointer touch-manipulation" : ""
        } ${className ?? ""}`}
        aria-hidden="true"
        data-testid="constellation-body"
      />
    </div>
  );
}
