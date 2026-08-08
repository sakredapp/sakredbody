/**
 * The Core — a cut stone, rendered as real 3D on a 2D canvas.
 *
 * No three.js. The geometry here is a round brilliant cut — table, crown,
 * girdle, pavilion — with actual vertices, actual rotation matrices and
 * actual per-facet normals. That's a few hundred lines and no bundle cost,
 * against ~150KB for a library we'd use one primitive from.
 *
 * ── Why a gem reads as alive ──────────────────────────────────────────────
 *
 * A flat polygon with a gradient looks like a logo. What makes a stone look
 * like a stone is that every facet answers the light differently, and the
 * answer changes as it turns. Four things do that work here:
 *
 *   1. Per-facet Lambert shading from a real normal. Facets that face the
 *      light are bright; those that don't, aren't. This alone is most of it.
 *   2. Back facets drawn first, dim, so light appears to pass through the
 *      body of the stone rather than bouncing off a shell.
 *   3. Specular highlights that bloom and slide as it rotates.
 *   4. Dispersion — a warm and a cool edge on opposing facet boundaries, which
 *      is what "fire" is in a real stone.
 *
 * And then it breathes and beats, from the shared clock in vitals.ts, so it
 * belongs to the same body as everything else on the page.
 */

import { mountStage, type Stage } from "./canvasStage";
import { vitalsAt } from "./vitals";

// ─── Small 3D ──────────────────────────────────────────────────────────────

type Vec3 = [number, number, number];

function rotateY([x, y, z]: Vec3, a: number): Vec3 {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [x * c + z * s, y, -x * s + z * c];
}

function rotateX([x, y, z]: Vec3, a: number): Vec3 {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [x, y * c - z * s, y * s + z * c];
}

function subtract(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function normalise(v: Vec3): Vec3 {
  const len = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / len, v[1] / len, v[2] / len];
}

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function reflect(incident: Vec3, normal: Vec3): Vec3 {
  const d = 2 * dot(incident, normal);
  return [
    incident[0] - d * normal[0],
    incident[1] - d * normal[1],
    incident[2] - d * normal[2],
  ];
}

// ─── Environment ───────────────────────────────────────────────────────────

/**
 * A procedural surround, sampled by reflection vector.
 *
 * This is the piece that makes a stone look like a stone. Lambert shading
 * alone gives a smooth gradient across the facets, which reads as moulded
 * plastic — the first attempt at this looked exactly like that. What a real
 * brilliant does is *scintillate*: adjacent facets point at different parts of
 * the room, so one catches a window and its neighbour catches a dark corner,
 * and the stone becomes a mosaic of bright and near-black.
 *
 * So instead of one light, there's a small sky: a few hard sources, a warm
 * ground bounce, and a cool zenith. Facets sample it by where they point.
 * Turning the stone slides those samples across the facets, and the flashing
 * comes for free.
 */
const SOURCES: { dir: Vec3; power: number; tight: number; warm: number }[] = [
  // A key light, hard and warm — the window in the room.
  { dir: normalise([-0.5, 0.8, 0.35]), power: 1.35, tight: 14, warm: 1 },
  { dir: normalise([0.65, 0.45, 0.6]), power: 0.95, tight: 18, warm: 0.8 },
  { dir: normalise([0.1, -0.35, 0.9]), power: 0.7, tight: 10, warm: 0.35 },
  { dir: normalise([-0.85, -0.1, -0.4]), power: 0.8, tight: 12, warm: 0.95 },
  { dir: normalise([0.35, 0.95, -0.5]), power: 0.7, tight: 20, warm: 0.6 },
  // Fill: broad, low, everywhere. Without these most facets never catch
  // anything and the stone reads as brown mud, which is what happened first.
  { dir: normalise([0.9, 0.1, -0.1]), power: 0.55, tight: 6, warm: 0.85 },
  { dir: normalise([-0.2, 0.35, 0.95]), power: 0.6, tight: 5, warm: 0.7 },
  { dir: normalise([-0.6, -0.7, 0.3]), power: 0.45, tight: 7, warm: 0.5 },
  { dir: normalise([0.45, -0.8, -0.4]), power: 0.4, tight: 8, warm: 0.4 },
  { dir: normalise([0, 1, 0]), power: 0.5, tight: 4, warm: 0.3 },
];

/** Returns brightness 0..~1.6 and warmth 0..1 for a direction. */
function sampleEnvironment(dir: Vec3, spin: number): { light: number; warm: number } {
  // The surround turns slowly against the stone, so highlights migrate even
  // when the stone itself is still.
  const d = rotateY(dir, spin * 0.35);

  // Ground bounce below, cool sky above — the base gradient everything sits on.
  const vertical = d[1];
  let light = 0.22 + Math.max(0, -vertical) * 0.26 + Math.max(0, vertical) * 0.18;
  let warmAcc = Math.max(0, -vertical) * 0.26;

  for (const s of SOURCES) {
    const alignment = Math.max(0, dot(d, s.dir));
    const hit = Math.pow(alignment, s.tight) * s.power;
    light += hit;
    warmAcc += hit * s.warm;
  }

  return { light, warm: light > 0 ? Math.min(1, warmAcc / light) : 0.5 };
}

// ─── The cut ───────────────────────────────────────────────────────────────

interface Facet {
  /** Indices into the vertex list, wound counter-clockwise when facing us. */
  idx: number[];
  /** Which part of the stone — they take light differently. */
  kind: "table" | "crown" | "girdle" | "pavilion";
}

interface Geometry {
  vertices: Vec3[];
  facets: Facet[];
}

/**
 * A round brilliant, simplified to alternating crown and pavilion facets.
 *
 * `n` is the number of girdle segments. Sixteen gives enough facets to catch
 * light convincingly without the whole thing turning to mush at small sizes.
 */
function brilliantCut(n = 16): Geometry {
  const vertices: Vec3[] = [];
  const facets: Facet[] = [];

  const TABLE_Y = 0.52;
  const TABLE_R = 0.46;
  const GIRDLE_Y = 0.16;
  const GIRDLE_R = 1;
  const CROWN_Y = 0.34;
  const CROWN_R = 0.78;
  const CULET_Y = -1.15;

  // Table — the flat top.
  const tableStart = vertices.length;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    vertices.push([Math.cos(a) * TABLE_R, TABLE_Y, Math.sin(a) * TABLE_R]);
  }
  facets.push({ idx: Array.from({ length: n }, (_, i) => tableStart + i), kind: "table" });

  // Upper girdle ring — offset by half a step so facets interlock like a real cut.
  const crownStart = vertices.length;
  for (let i = 0; i < n; i++) {
    const a = ((i + 0.5) / n) * Math.PI * 2;
    vertices.push([Math.cos(a) * CROWN_R, CROWN_Y, Math.sin(a) * CROWN_R]);
  }

  // Girdle — the widest line.
  const girdleStart = vertices.length;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    vertices.push([Math.cos(a) * GIRDLE_R, GIRDLE_Y, Math.sin(a) * GIRDLE_R]);
  }

  // Lower girdle ring — breaks the pavilion into two rows, offset again so
  // the mosaic keeps interlocking all the way down.
  const lowerStart = vertices.length;
  for (let i = 0; i < n; i++) {
    const a = ((i + 0.5) / n) * Math.PI * 2;
    vertices.push([Math.cos(a) * 0.62, -0.42, Math.sin(a) * 0.62]);
  }

  // Culet — the point at the bottom.
  const culet = vertices.length;
  vertices.push([0, CULET_Y, 0]);

  for (let i = 0; i < n; i++) {
    const next = (i + 1) % n;

    // Crown: table edge down to the interlocked crown ring.
    facets.push({
      idx: [tableStart + i, tableStart + next, crownStart + i],
      kind: "crown",
    });
    facets.push({
      idx: [tableStart + next, girdleStart + next, crownStart + i],
      kind: "crown",
    });
    facets.push({
      idx: [crownStart + i, girdleStart + next, girdleStart + i],
      kind: "girdle",
    });

    // Pavilion, in two rows.
    facets.push({
      idx: [girdleStart + i, girdleStart + next, lowerStart + i],
      kind: "pavilion",
    });
    facets.push({
      idx: [girdleStart + next, lowerStart + next, lowerStart + i],
      kind: "pavilion",
    });
    facets.push({
      idx: [lowerStart + i, lowerStart + next, culet],
      kind: "pavilion",
    });
  }

  return { vertices, facets };
}

// ─── Palette ───────────────────────────────────────────────────────────────

/**
 * Amber and gold on ink — topaz rather than diamond, which suits the
 * old-money register far better than something icy would.
 */
const PALETTE = {
  /** Near-black. Facets pointing into nothing must go almost to zero, or the
   *  stone reads as moulded rather than cut. */
  shadow: [14, 11, 9] as const,
  deep: [52, 30, 12] as const,
  body: [150, 98, 34] as const,
  bright: [236, 194, 120] as const,
  fire: [255, 228, 172] as const,
  white: [255, 250, 238] as const,
  cool: [104, 132, 148] as const,
};

function mix(a: readonly number[], b: readonly number[], t: number): number[] {
  const k = Math.min(1, Math.max(0, t));
  return [
    Math.round(a[0] + (b[0] - a[0]) * k),
    Math.round(a[1] + (b[1] - a[1]) * k),
    Math.round(a[2] + (b[2] - a[2]) * k),
  ];
}

function rgba(c: readonly number[], alpha: number) {
  return `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${alpha})`;
}

// ─── Renderer ──────────────────────────────────────────────────────────────

export interface GemOptions {
  /** Fraction of the smaller canvas dimension the stone occupies. */
  scale?: number;
  /** Turns per minute. Slow — this is a stone, not a loading spinner. */
  rpm?: number;
  /** Follow the pointer. Off for decorative instances. */
  interactive?: boolean;
}

export function mountGem(canvas: HTMLCanvasElement, options: GemOptions = {}) {
  const { scale = 0.34, rpm = 1.1, interactive = true } = options;
  const geometry = brilliantCut(20);

  // mountStage owns the frame loop, device-pixel scaling, resize, pointer
  // tracking, IntersectionObserver pausing and reduced-motion. Re-implementing
  // any of that here would mean this canvas behaved differently from the nine
  // others on the site.
  return mountStage(canvas, (stage: Stage) => {
    // Pointer, eased, so the stone has weight rather than snapping.
    let easedX = 0;
    let easedY = 0;

    return (t: number) => {
      const { ctx, w, h } = stage;
      ctx.clearRect(0, 0, w, h);
      if (w === 0 || h === 0) return;

      const v = vitalsAt(t);

      const cx = w / 2;
      const cy = h / 2;
      const unit = Math.min(w, h) * scale;

      const targetX = interactive && stage.inside ? (stage.px / w) * 2 - 1 : 0;
      const targetY = interactive && stage.inside ? (stage.py / h) * 2 - 1 : 0;
      easedX += (targetX - easedX) * 0.045;
      easedY += (targetY - easedY) * 0.045;

      // Breath swells the stone below the threshold of notice. You feel it
      // before you see it.
      const breathScale = 1 + v.swell * 0.018;
      const lift = -v.swell * unit * 0.012;

      const spin = t * (rpm / 60) * Math.PI * 2;
      const tiltX = -1.16 + easedY * 0.22 + v.drift * 0.045;
      const tiltY = easedX * 0.5;

      const project = (p: Vec3) => {
        let q = rotateY(p, spin + tiltY);
        q = rotateX(q, tiltX);
        const depth = 3.2;
        const k = depth / (depth - q[2] * 0.55);
        return {
          x: cx + q[0] * unit * breathScale * k,
          y: cy + lift - q[1] * unit * breathScale * k,
          z: q[2],
          world: q,
        };
      };

      const projected = geometry.vertices.map(project);

      // Painter's algorithm — exact enough for a convex solid.
      const ordered = geometry.facets
        .map((facet) => {
          const pts = facet.idx.map((i) => projected[i]);
          const z = pts.reduce((s, p) => s + p.z, 0) / pts.length;
          return { facet, pts, z };
        })
        .sort((a, b) => a.z - b.z);

      const beatGlow = v.pulse * 0.55;
      const view: Vec3 = [0, 0, 1];

      for (const { facet, pts } of ordered) {
        if (pts.length < 3) continue;

        const normal = normalise(
          cross(subtract(pts[1].world, pts[0].world), subtract(pts[2].world, pts[0].world)),
        );
        const facing = normal[2] > 0;

        const bounce = reflect([-view[0], -view[1], -view[2]], normal);
        const env = sampleEnvironment(bounce, spin);
        const ambient = sampleEnvironment(normal, spin);

        const facingness = Math.abs(dot(normal, view));
        const fresnel = Math.pow(1 - facingness, 3);

        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
        ctx.closePath();

        if (!facing) {
          const back = mix(PALETTE.deep, PALETTE.body, ambient.light * 0.5);
          ctx.fillStyle = rgba(back, 0.34 + env.light * 0.1);
          ctx.fill();
          continue;
        }

        const brightness = Math.min(1.6, env.light * 0.82 + ambient.light * 0.42);
        const warmth = env.warm;

        let base: number[];
        if (brightness < 0.3) {
          base = mix(PALETTE.shadow, PALETTE.deep, brightness / 0.3);
        } else if (brightness < 0.72) {
          base = mix(PALETTE.deep, PALETTE.body, (brightness - 0.3) / 0.42);
        } else if (brightness < 1.12) {
          base = mix(PALETTE.body, PALETTE.bright, (brightness - 0.72) / 0.4);
        } else {
          base = mix(PALETTE.bright, PALETTE.white, Math.min(1, (brightness - 1.12) / 0.4));
        }

        base = mix(
          base,
          warmth > 0.6 ? PALETTE.fire : PALETTE.cool,
          (1 - Math.abs(warmth - 0.5) * 2) * 0.12,
        );

        // The beat wells up from inside, so it lifts the dark facets more than
        // the bright ones.
        if (beatGlow > 0.01) {
          base = mix(base, PALETTE.fire, beatGlow * (1 - Math.min(1, brightness)) * 0.5);
        }

        const alpha =
          facet.kind === "table" ? 0.62 + brightness * 0.3 : 0.78 + brightness * 0.18;

        ctx.fillStyle = rgba(base, Math.min(1, alpha));
        ctx.fill();

        if (fresnel > 0.08) {
          ctx.globalCompositeOperation = "lighter";
          ctx.fillStyle = rgba(PALETTE.fire, fresnel * 0.22);
          ctx.fill();
          ctx.globalCompositeOperation = "source-over";
        }

        if (env.light > 1.15) {
          ctx.globalCompositeOperation = "lighter";
          ctx.fillStyle = rgba(PALETTE.white, Math.min(0.55, (env.light - 1.15) * 1.1));
          ctx.fill();
          ctx.globalCompositeOperation = "source-over";
        }

        ctx.strokeStyle = rgba(PALETTE.fire, 0.06 + Math.min(0.4, brightness * 0.22));
        ctx.lineWidth = 0.5;
        ctx.stroke();
      }
    };
  });
}
