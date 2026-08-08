import { useEffect, useRef } from "react";
import { breathAt } from "@/lib/breath";
import { mountStage } from "@/lib/canvasStage";

/**
 * A brilliant cut, rendered facet by facet.
 *
 * Each face is shaded by its own angle to a single light, which is what makes
 * the stone flash as it turns — the flash is a facet crossing the light,
 * exactly as it happens in a real cut. A flat gradient can't do that, and it's
 * the whole difference between a gem and a coloured circle.
 *
 * The cursor is the light. Under it sits a pool of colour, as if light were
 * leaving through the pavilion onto the page.
 */

export interface Stone {
  /** Hue, saturation, lightness of the body colour. */
  h: number;
  s: number;
  l: number;
}

/** The four territories, cut. Restore is jade, Build carnelian,
 *  Embody amber, Gather sapphire — the sequence, in stone. */
export const TERRITORY_STONES: Record<string, Stone> = {
  restore: { h: 148, s: 34, l: 44 },
  build: { h: 8, s: 58, l: 48 },
  embody: { h: 38, s: 62, l: 52 },
  gather: { h: 212, s: 34, l: 42 },
};

/** The five elements as minerals rather than swatches. */
export const ELEMENT_STONES: Record<string, Stone> = {
  wood: { h: 148, s: 34, l: 44 },   // jade
  fire: { h: 8, s: 58, l: 48 },     // carnelian
  earth: { h: 38, s: 62, l: 52 },   // amber
  metal: { h: 42, s: 12, l: 66 },   // moonstone
  water: { h: 212, s: 34, l: 38 },  // obsidian blue
};

interface P3 { x: number; y: number; z: number }

/** Crown facets to a flat table, pavilion down to a point. */
function buildFaces(n: number): P3[][] {
  const girdle: P3[] = [];
  const table: P3[] = [];
  const crown: P3[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    girdle.push({ x: Math.cos(a), y: 0, z: Math.sin(a) });
    table.push({ x: Math.cos(a) * 0.44, y: 0.42, z: Math.sin(a) * 0.44 });
    const a2 = a + Math.PI / n;
    crown.push({ x: Math.cos(a2) * 0.78, y: 0.2, z: Math.sin(a2) * 0.78 });
  }
  const tip: P3 = { x: 0, y: -1.25, z: 0 };

  const faces: P3[][] = [];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    faces.push([table[i], table[j], crown[i]]);
    faces.push([table[j], crown[i], girdle[j], crown[j]]);
    faces.push([crown[i], girdle[i], girdle[j]]);
    faces.push([girdle[i], girdle[j], tip]);
  }
  faces.push(table.slice());
  return faces;
}

const FACES = buildFaces(8);

export function GemStone({
  stone,
  className,
  /** Radians a second. Slow — a stone turning in the hand, not a spinner. */
  spinRate = 0.28,
  testId,
}: {
  stone: Stone;
  className?: string;
  spinRate?: number;
  testId?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;

    return mountStage(canvas, (S) => (t) => {
      const { ctx, w, h } = S;
      const breath = breathAt(t);
      ctx.clearRect(0, 0, w, h);

      const cx = w / 2;
      const cy = h / 2;
      const R = Math.min(w, h) * 0.3 * (1 + breath * 0.02);

      // Light follows the pointer; rests at the upper left otherwise.
      const lx = S.inside ? (S.px - cx) / R : -0.7;
      const ly = S.inside ? (S.py - cy) / R : -0.9;
      const ll = Math.hypot(lx, ly, 0.8) || 1;
      const L = { x: lx / ll, y: ly / ll, z: 0.8 / ll };

      const spin = t * spinRate;
      const tilt = 0.34 + Math.sin(t * 0.21) * 0.06;
      const cs = Math.cos(tilt);
      const sn = Math.sin(tilt);
      const cospin = Math.cos(spin);
      const sinspin = Math.sin(spin);

      const project = (p: P3) => {
        const x = p.x * cospin - p.z * sinspin;
        const z0 = p.x * sinspin + p.z * cospin;
        const y = p.y * cs - z0 * sn;
        const z = p.y * sn + z0 * cs;
        return { x: cx + x * R, y: cy - y * R, sx: x, sy: y, sz: z };
      };

      const drawn = FACES.map((f) => {
        const pts = f.map(project);
        // Newell's method — robust for the quads as well as the triangles.
        let nx = 0;
        let ny = 0;
        let nz = 0;
        for (let i = 0; i < pts.length; i++) {
          const a = pts[i];
          const b = pts[(i + 1) % pts.length];
          nx += (a.sy - b.sy) * (a.sz + b.sz);
          ny += (a.sz - b.sz) * (a.sx + b.sx);
          nz += (a.sx - b.sx) * (a.sy + b.sy);
        }
        const len = Math.hypot(nx, ny, nz) || 1;
        nx /= len;
        ny /= len;
        nz /= len;
        const depth = pts.reduce((s, p) => s + p.sz, 0) / pts.length;
        const lambert = Math.max(0, nx * L.x + ny * -L.y + nz * L.z);
        return { pts, depth, lambert, spec: Math.pow(lambert, 22) };
      }).sort((a, b) => a.depth - b.depth);

      // No pooled glow. Painting it with fillRect tinted the whole canvas,
      // and at these sizes the gradient never reached zero before the edge —
      // so every stone sat on a hard-cornered square. The stone is enough.

      for (const f of drawn) {
        ctx.beginPath();
        ctx.moveTo(f.pts[0].x, f.pts[0].y);
        for (let i = 1; i < f.pts.length; i++) ctx.lineTo(f.pts[i].x, f.pts[i].y);
        ctx.closePath();

        const back = f.depth < 0;
        const light = 12 + f.lambert * (stone.l + 26) + (back ? 4 : 0);
        ctx.fillStyle = `hsla(${stone.h},${stone.s}%,${Math.min(92, light)}%,${back ? 0.3 : 0.9})`;
        ctx.fill();

        // The glint. A tight exponent keeps it a flash, never a glow.
        if (f.spec > 0.02 && !back) {
          ctx.fillStyle = `rgba(255,250,236,${f.spec * 0.85})`;
          ctx.fill();
        }
        ctx.strokeStyle = `rgba(235,211,162,${back ? 0.06 : 0.2})`;
        ctx.lineWidth = 0.7;
        ctx.stroke();
      }
    });
  }, [stone, spinRate]);

  return <canvas ref={ref} className={className} aria-hidden="true" data-testid={testId} />;
}
