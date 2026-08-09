/**
 * A sky of them.
 *
 * `ConstellationBody` on the landing page draws one human figure as a star
 * chart, big, centred, and hovering. That is a hero: one object, one screen,
 * nothing to read on top of it. This is the other half of the same idea — the
 * same figure repeated at every size across a whole viewport, near ones bright
 * and far ones almost gone, the way an actual sky holds a dozen constellations
 * at once rather than one specimen under glass.
 *
 * It belongs to the portal. The hero figure belongs to the site session, and
 * this is deliberately not a copy of it: a field needs different things from a
 * single specimen.
 *
 * ── Why not just render ConstellationBody n times ─────────────────────────
 *
 * Three reasons, and each of them is the whole problem.
 *
 * 1. It has 28 stars. At the size most figures here are drawn — sixty pixels
 *    tall, some of them — twenty-eight points inside a human outline is not a
 *    human outline, it is a smudge. So the topology below has three levels of
 *    detail and the small ones drop to eight joints, which is the fewest that
 *    still reads as a person. This is the same reason a road map stops drawing
 *    side streets when you zoom out.
 *
 * 2. Fourteen identical figures at four sizes is wallpaper. A repeated motif
 *    announces itself as a texture, and the eye files it under "pattern" and
 *    stops looking. Every figure here is jittered off a common skeleton by a
 *    seeded amount, some mirrored, some tilted a few degrees, so they read as
 *    a population rather than a stamp.
 *
 * 3. Cost. The hero calls `createRadialGradient` once per star per frame,
 *    which is fine for 28 and is not fine for 200 — building a gradient object
 *    allocates, and doing it two hundred times at 60fps on a mid-range Android
 *    is how a login screen starts dropping frames. The glow here is painted
 *    once into an offscreen sprite and then blitted, which turns per-frame
 *    allocation into a texture copy.
 *
 * Motion, pointer, DPR, offscreen pausing and prefers-reduced-motion all come
 * from `mountStage`; the breath comes from the site's shared clock, so this
 * swells in phase with every other canvas in the product rather than running
 * on a timer of its own.
 */

import { useEffect, useRef } from "react";
import { breathAt } from "@/lib/breath";
import { hash01, mountStage } from "@/lib/canvasStage";

/* ── The figure ───────────────────────────────────────────────────────────
   Normalised to a 100 × 200 box, origin at the top of the head, matching the
   hero's convention so the two read as the same species. Named rather than
   indexed because the levels of detail below are subsets, and subsetting a
   list of anonymous coordinate pairs by index is how the left arm ends up
   attached to the right knee. */

type Joint = { x: number; y: number; mag: number };

const J: Record<string, Joint> = {
  crown: { x: 50, y: 8, mag: 1.5 },
  throat: { x: 50, y: 21, mag: 1.0 },
  shoulderL: { x: 34, y: 28, mag: 1.3 },
  shoulderR: { x: 66, y: 28, mag: 1.3 },
  elbowL: { x: 24, y: 44, mag: 0.85 },
  elbowR: { x: 76, y: 44, mag: 0.85 },
  handL: { x: 18, y: 62, mag: 1.0 },
  handR: { x: 82, y: 62, mag: 1.0 },
  heart: { x: 50, y: 34, mag: 1.7 },
  core: { x: 50, y: 48, mag: 1.2 },
  pelvis: { x: 50, y: 62, mag: 1.4 },
  hipL: { x: 42, y: 70, mag: 1.1 },
  hipR: { x: 58, y: 70, mag: 1.1 },
  kneeL: { x: 38, y: 108, mag: 1.0 },
  kneeR: { x: 62, y: 108, mag: 1.0 },
  footL: { x: 35, y: 150, mag: 1.0 },
  footR: { x: 65, y: 150, mag: 1.0 },
};

/** The extent the joints actually occupy, for fitting. Not the nominal box. */
const FIG = { x0: 18, x1: 82, y0: 8, y1: 150 };
const FIG_W = FIG.x1 - FIG.x0;
const FIG_H = FIG.y1 - FIG.y0;
const FIG_CX = (FIG.x0 + FIG.x1) / 2;
const FIG_CY = (FIG.y0 + FIG.y1) / 2;

/** Width as a fraction of drawn height. A figure is roughly 0.45 as wide. */
export const ASPECT = FIG_W / FIG_H;

/** Fascia, per level of detail. Each is a complete figure, not a filtered one. */
export const LOD: { joints: string[]; edges: [string, string][] }[] = [
  // 0 — far. Eight joints. Head, span, hinge, reach.
  {
    joints: ["crown", "shoulderL", "shoulderR", "handL", "handR", "pelvis", "footL", "footR"],
    edges: [
      ["crown", "shoulderL"], ["crown", "shoulderR"],
      ["shoulderL", "handL"], ["shoulderR", "handR"],
      ["shoulderL", "pelvis"], ["shoulderR", "pelvis"],
      ["pelvis", "footL"], ["pelvis", "footR"],
    ],
  },
  // 1 — middle. The heart appears, and the legs get a knee.
  {
    joints: [
      "crown", "throat", "shoulderL", "shoulderR", "handL", "handR",
      "heart", "pelvis", "kneeL", "kneeR", "footL", "footR",
    ],
    edges: [
      ["crown", "throat"], ["throat", "shoulderL"], ["throat", "shoulderR"],
      ["throat", "heart"], ["shoulderL", "heart"], ["shoulderR", "heart"],
      ["shoulderL", "handL"], ["shoulderR", "handR"],
      ["heart", "pelvis"], ["pelvis", "kneeL"], ["pelvis", "kneeR"],
      ["kneeL", "footL"], ["kneeR", "footR"],
    ],
  },
  // 2 — near. Everything, including the long chains that run the whole body.
  {
    joints: Object.keys(J),
    edges: [
      ["crown", "throat"], ["throat", "shoulderL"], ["throat", "shoulderR"],
      ["throat", "heart"], ["shoulderL", "heart"], ["shoulderR", "heart"],
      ["shoulderL", "elbowL"], ["elbowL", "handL"],
      ["shoulderR", "elbowR"], ["elbowR", "handR"],
      ["heart", "core"], ["core", "pelvis"],
      ["pelvis", "hipL"], ["pelvis", "hipR"],
      ["hipL", "kneeL"], ["hipR", "kneeR"],
      ["kneeL", "footL"], ["kneeR", "footR"],
      // The chains. A body is strung, not stacked.
      ["shoulderL", "hipL"], ["shoulderR", "hipR"],
    ],
  },
];

/* ── Sprites ──────────────────────────────────────────────────────────────
   Built once, on first use, at a fixed size and then drawn scaled. The halo
   is separate from the core so the two can be given different opacities as a
   figure lights — which is most of what makes it look lit rather than just
   bigger. */

let HALO: HTMLCanvasElement | null = null;
let CORE: HTMLCanvasElement | null = null;

/** Halo radius as a multiple of the core radius. Fixes the sprite geometry. */
const HALO_SCALE = 7;
const HALO_PX = 48;

function sprites() {
  if (HALO && CORE) return { halo: HALO, core: CORE };

  const halo = document.createElement("canvas");
  halo.width = halo.height = HALO_PX * 2;
  const hc = halo.getContext("2d")!;
  const g = hc.createRadialGradient(HALO_PX, HALO_PX, 0, HALO_PX, HALO_PX, HALO_PX);
  g.addColorStop(0, "rgba(235,211,162,1)");
  g.addColorStop(0.45, "rgba(235,211,162,0.18)");
  g.addColorStop(1, "rgba(235,211,162,0)");
  hc.fillStyle = g;
  hc.fillRect(0, 0, HALO_PX * 2, HALO_PX * 2);

  // Drawn oversized and scaled down at use, so the core keeps a clean edge at
  // every figure size instead of going to mush on the large ones.
  const CORE_PX = 16;
  const core = document.createElement("canvas");
  core.width = core.height = CORE_PX * 2;
  const cc = core.getContext("2d")!;
  const cg = cc.createRadialGradient(CORE_PX, CORE_PX, 0, CORE_PX, CORE_PX, CORE_PX);
  cg.addColorStop(0, "rgba(255,251,240,1)");
  cg.addColorStop(0.55, "rgba(247,240,222,1)");
  cg.addColorStop(0.85, "rgba(240,225,190,0.5)");
  cg.addColorStop(1, "rgba(240,225,190,0)");
  cc.fillStyle = cg;
  cc.fillRect(0, 0, CORE_PX * 2, CORE_PX * 2);

  HALO = halo;
  CORE = core;
  return { halo, core };
}

/* ── A placed figure ──────────────────────────────────────────────────── */

export interface Figure {
  cx: number;
  cy: number;
  /** Drawn height in CSS px, head to foot. */
  h: number;
  lod: number;
  /** Resting brightness. Small figures sit further back and read fainter. */
  depth: number;
  mirror: boolean;
  tilt: number;
  /** Radians a second, and where in its own cycle it started. */
  rate: number;
  offset: number;
  seed: number;
  /** Joint positions in the 100 × 200 space, jittered once at placement. */
  pts: Record<string, Joint>;
  /** Parallax factor — near figures shift more under the pointer. */
  para: number;
}

/**
 * Where the figures stand, for a canvas of this size.
 *
 * Pulled out of the component and exported because it is the part that can be
 * silently, invisibly wrong. A canvas that paints nothing looks exactly like a
 * canvas that painted a sky too faint to notice, and neither a type check nor
 * a successful build can tell the two apart — so this is a pure function of
 * (width, height) with no canvas in sight, and `script/test-sky.ts` asserts
 * against it directly.
 *
 * Deterministic on purpose. Seeded attempts rather than `Math.random`, so a
 * given viewport gets the same sky on every load — this sits behind a login
 * form that people bounce off and come back to, and a composition that
 * reshuffles on each visit reads as a screen that hasn't finished loading.
 */
export function planSky(
  w: number,
  h: number,
  { density = 1, clearCentre = 0 }: { density?: number; clearCentre?: number } = {},
): Figure[] {
  if (!(w > 0) || !(h > 0)) return [];

  const min = Math.min(w, h);

  // Three sizes and a deliberate ratio between them. Two near figures anchor
  // the composition, a handful of middles carry it, and the rest are far
  // enough back to be texture.
  const LARGE = Math.max(180, Math.min(min * 0.58, 460));
  const SIZES = [LARGE * 0.24, LARGE * 0.46, LARGE];

  const want = Math.round(Math.max(6, Math.min(20, ((w * h) / 42000) * density)));

  const placed: Figure[] = [];
  for (let a = 0; a < want * 45 && placed.length < want; a++) {
    const i = placed.length;

    // Fixed by target index, not by draw order, so the mix is guaranteed
    // rather than hoped for: two near, a third middle, the rest far.
    const lod = i < 2 ? 2 : i < 2 + Math.ceil(want * 0.3) ? 1 : 0;
    const jitterH = 0.85 + hash01(a * 3 + 1, 24.11) * 0.3;

    // Shrunk to fit rather than skipped. A container short enough that the
    // near size doesn't fit — a squat panel, a landscape phone — would
    // otherwise reject every candidate for the first two indices and hand
    // back an empty sky, since the tier is chosen by target index and the
    // loop can never advance past a tier that never places.
    const fh = Math.min(SIZES[lod] * jitterH, h * 0.82, w * 0.82 * (FIG_H / FIG_W));
    const fw = fh * (FIG_W / FIG_H);

    // Margin so nothing is beheaded by the canvas edge. The glow needs more
    // room than the geometry does.
    const mx = fw * 0.6;
    const my = fh * 0.58;

    const cx = mx + hash01(a, 12.9898) * (w - mx * 2);
    const cy = my + hash01(a, 78.233) * (h - my * 2);

    if (clearCentre > 0 && lod > 0) {
      const band = h * clearCentre * 0.5;
      const wband = Math.min(w * 0.45, 260);
      if (Math.abs(cy - h / 2) < band && Math.abs(cx - w / 2) < wband) continue;
    }

    // Keep them apart. A tall narrow figure is badly modelled by a circle, so
    // the test is elliptical — figures may stand shoulder to shoulder more
    // closely than they may stand head to foot.
    let clash = false;
    for (const p of placed) {
      const dx = (cx - p.cx) / (((fw + p.h * (FIG_W / FIG_H)) / 2) * 0.85);
      const dy = (cy - p.cy) / (((fh + p.h) / 2) * 0.62);
      if (dx * dx + dy * dy < 1) {
        clash = true;
        break;
      }
    }
    if (clash) continue;

    // Jitter the skeleton. ±2 units on a 100-wide figure is enough to break
    // the stamp and not enough to dislocate a shoulder.
    const pts: Record<string, Joint> = {};
    for (const [name, j] of Object.entries(J)) {
      const k = name.length + name.charCodeAt(0);
      pts[name] = {
        x: j.x + (hash01(a * 97 + k, 17.3) - 0.5) * 4,
        y: j.y + (hash01(a * 97 + k, 51.7) - 0.5) * 4,
        mag: j.mag,
      };
    }

    placed.push({
      cx,
      cy,
      h: fh,
      lod,
      depth: lod === 2 ? 1 : lod === 1 ? 0.72 : 0.44,
      mirror: hash01(a, 5.31) > 0.5,
      tilt: (hash01(a, 9.17) - 0.5) * 0.16,
      rate: 0.16 + hash01(a, 31.9) * 0.22,
      offset: hash01(a, 66.3) * Math.PI * 2,
      seed: a,
      pts,
      para: lod === 2 ? 1 : lod === 1 ? 0.55 : 0.25,
    });
  }

  return placed;
}

export function ConstellationSky({
  className,
  /** Scales how many figures fit the viewport. Below 1 for a backdrop. */
  density = 1,
  /** Overall brightness. The portal wants this well under the login screen. */
  intensity = 1,
  /**
   * Fraction of the canvas height, centred, kept clear of large figures.
   * A face behind a login card is charming; a face behind a habit list is a
   * legibility problem. 0 disables it.
   */
  clearCentre = 0,
}: {
  className?: string;
  density?: number;
  intensity?: number;
  clearCentre?: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;

    return mountStage(canvas, (S) => {
      const { halo, core } = sprites();
      let figures: Figure[] = [];
      // Eased per-figure lit level, kept across frames so pointer light fades
      // in and out instead of snapping.
      let heat: number[] = [];

      S.onResize = () => {
        figures = planSky(S.w, S.h, { density, clearCentre });
        heat = figures.map(() => 0);
      };

      return (t) => {
        const { ctx, w, h } = S;
        const breath = breathAt(t);
        ctx.clearRect(0, 0, w, h);

        // Which figure the pointer is closest to, if any. One at a time —
        // lighting a neighbourhood reads as a spotlight, not as attention.
        let near = -1;
        if (S.inside) {
          let best = Infinity;
          for (let i = 0; i < figures.length; i++) {
            const f = figures[i];
            const d = Math.hypot(S.px - f.cx, (S.py - f.cy) * 0.6);
            if (d < best && d < f.h * 0.75) {
              best = d;
              near = i;
            }
          }
        }

        for (let i = 0; i < figures.length; i++) {
          const f = figures[i];
          const lod = LOD[f.lod];

          // Each figure breathes on its own slow cycle. Raised to a power so
          // it spends most of its time dim and only occasionally blooms —
          // fourteen things pulsing evenly is a Christmas tree.
          const wave = 0.5 + 0.5 * Math.sin(t * f.rate + f.offset);
          const own = wave * wave * wave;
          const target = near === i ? 1 : own;
          heat[i] += (target - heat[i]) * (near === i ? 0.12 : 0.06);
          const lit = heat[i];

          const scale = f.h / FIG_H;
          const push = f.para * 8;
          const dx = S.inside ? ((S.px - w / 2) / w) * push : 0;
          const dy = S.inside ? ((S.py - h / 2) / h) * push : 0;

          ctx.save();
          ctx.translate(f.cx + dx, f.cy + dy);
          ctx.rotate(f.tilt);
          if (f.mirror) ctx.scale(-1, 1);

          const P = (name: string) => {
            const j = f.pts[name];
            return { x: (j.x - FIG_CX) * scale, y: (j.y - FIG_CY) * scale };
          };

          // ── Fascia ──────────────────────────────────────────────
          const lineA = (0.1 + lit * 0.4 + breath * 0.05) * f.depth * intensity;
          ctx.strokeStyle = `rgba(214,178,104,${lineA})`;
          ctx.lineWidth = Math.max(0.5, (0.5 + lit * 0.7) * Math.min(1.6, scale * 2.2));
          ctx.beginPath();
          for (const [a, b] of lod.edges) {
            const pa = P(a);
            const pb = P(b);
            ctx.moveTo(pa.x, pa.y);
            ctx.lineTo(pb.x, pb.y);
          }
          // One path, one stroke, for the whole web. Stroking each segment
          // separately was twenty state changes per figure per frame.
          ctx.stroke();

          // A charge running the fascia while the figure is lit. Only on the
          // near figures — at forty pixels tall it is a jittering dot.
          if (f.lod === 2 && lit > 0.18) {
            ctx.fillStyle = `rgba(255,247,224,${lit * 0.9 * intensity})`;
            for (let e = 0; e < lod.edges.length; e += 2) {
              const pa = P(lod.edges[e][0]);
              const pb = P(lod.edges[e][1]);
              const k = (t * 0.4 + e * 0.19) % 1;
              const fade = Math.sin(k * Math.PI);
              const r = (1.1 + scale * 0.6) * fade;
              if (r <= 0.15) continue;
              ctx.beginPath();
              ctx.arc(pa.x + (pb.x - pa.x) * k, pa.y + (pb.y - pa.y) * k, r, 0, Math.PI * 2);
              ctx.fill();
            }
          }

          // ── Stars ───────────────────────────────────────────────
          for (let n = 0; n < lod.joints.length; n++) {
            const name = lod.joints[n];
            const j = f.pts[name];
            const p = P(name);

            const twinkle = 0.5 + 0.5 * Math.sin(t * 1.1 + hash01(f.seed * 17 + n, 31.7) * 12);
            const r =
              (j.mag * 1.5 + lit * 1.8) *
              (0.85 + twinkle * 0.15) *
              Math.max(0.42, scale * 1.5);

            const glow = (0.13 + lit * 0.32) * f.depth * intensity;
            const hr = r * HALO_SCALE;
            ctx.globalAlpha = Math.min(1, glow);
            ctx.drawImage(halo, p.x - hr, p.y - hr, hr * 2, hr * 2);

            ctx.globalAlpha = Math.min(1, (0.42 + lit * 0.5 + breath * 0.08) * f.depth * intensity);
            ctx.drawImage(core, p.x - r, p.y - r, r * 2, r * 2);
          }
          ctx.globalAlpha = 1;

          // Anchor stars flare four-pointed when the figure is lit. Skipped on
          // the far ones, where the arms would be longer than the figure.
          if (f.lod > 0 && lit > 0.22) {
            ctx.strokeStyle = `rgba(240,219,175,${lit * 0.6 * f.depth * intensity})`;
            ctx.lineWidth = Math.min(1.1, Math.max(0.5, scale * 1.6));
            ctx.beginPath();
            for (const name of lod.joints) {
              const j = f.pts[name];
              if (j.mag < 1.3) continue;
              const p = P(name);
              const arm = j.mag * scale * 9 * lit;
              ctx.moveTo(p.x - arm, p.y);
              ctx.lineTo(p.x + arm, p.y);
              ctx.moveTo(p.x, p.y - arm);
              ctx.lineTo(p.x, p.y + arm);
            }
            ctx.stroke();
          }

          ctx.restore();
        }
      };
    });
  }, [density, intensity, clearCentre]);

  return (
    <canvas
      ref={ref}
      className={className}
      aria-hidden="true"
      data-testid="constellation-sky"
    />
  );
}
