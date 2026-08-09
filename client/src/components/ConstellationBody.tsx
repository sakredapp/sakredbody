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
 * Regions light in turn — or on hover — and while a region is lit its stars
 * brighten, its lines run, and a charge travels the fascia away from it, the
 * way a signal actually leaves a site rather than staying put.
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

export interface BodyRegion {
  key: string;
  name: string;
  reads: string;
}

export const BODY_REGIONS: BodyRegion[] = [
  { key: "crown", name: "Crown", reads: "Light, sleep, the clock." },
  { key: "throat", name: "Breath", reads: "The switch between states." },
  { key: "heart", name: "Heart", reads: "Circulation, and the settling of it." },
  { key: "gut", name: "The Middle", reads: "Liver, gut, lymph." },
  { key: "root", name: "Root", reads: "The deep reserve." },
  { key: "arms", name: "Frame", reads: "What carries load." },
  { key: "legs", name: "The Pump", reads: "Lymph moves when you move." },
];

export function ConstellationBody({ className }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [active, setActive] = useState(0);
  const activeRef = useRef(0);
  const hoverRef = useRef<string | null>(null);
  activeRef.current = active;

  // Cycle through the regions unless a pointer is holding one.
  useEffect(() => {
    const timer = setInterval(() => {
      if (!hoverRef.current) setActive((a) => (a + 1) % BODY_REGIONS.length);
    }, 5200);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;

    return mountStage(canvas, (S) => {
      // Per-region lit level, eased so regions fade rather than switch.
      const level: Record<string, number> = {};
      BODY_REGIONS.forEach((r) => (level[r.key] = 0));

      return (t) => {
        const { ctx, w, h } = S;
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
        // light. Every star now paints a halo of radius r*7 and the anchor
        // stars throw flare arms of up to 6.6r; around the crown that is some
        // forty pixels of glow above the topmost point of the figure. Filling
        // 94% of the height put the crown ~25px from the canvas edge, so the
        // halo was clipped by the canvas and ended on a dead straight line
        // right above the head. The margin is now wider than the glow.
        const scale = Math.min((w * 0.82) / FIG_W, (h * 0.84) / FIG_H);
        const ox = w / 2 - FIG_CX * scale;
        const oy = h / 2 - FIG_CY * scale;
        const P = (s: Star) => ({ x: ox + s.x * scale, y: oy + s.y * scale });

        // Which region is lit, and is the pointer overriding the cycle?
        let hovered: string | null = null;
        if (S.inside) {
          let best = Infinity;
          for (const s of STARS) {
            const p = P(s);
            const d = Math.hypot(p.x - S.px, p.y - S.py);
            if (d < best && d < 70 * (scale / 3)) {
              best = d;
              hovered = s.region;
            }
          }
        }
        hoverRef.current = hovered;
        const lit = hovered ?? BODY_REGIONS[activeRef.current].key;

        for (const r of BODY_REGIONS) {
          const target = r.key === lit ? 1 : 0;
          level[r.key] += (target - level[r.key]) * 0.05;
        }

        // ── Fascia ──────────────────────────────────────────────
        for (const [a, b] of FASCIA) {
          const pa = P(STARS[a]);
          const pb = P(STARS[b]);
          const heat = Math.max(level[STARS[a].region] ?? 0, level[STARS[b].region] ?? 0);

          ctx.beginPath();
          ctx.moveTo(pa.x, pa.y);
          ctx.lineTo(pb.x, pb.y);
          ctx.strokeStyle = `rgba(214,178,104,${0.16 + heat * 0.46 + breath * 0.05})`;
          ctx.lineWidth = 0.9 + heat * 1.1;
          ctx.stroke();

          // A charge travelling the line, away from the lit region.
          if (heat > 0.12) {
            const from = (level[STARS[a].region] ?? 0) >= (level[STARS[b].region] ?? 0) ? pa : pb;
            const to = from === pa ? pb : pa;
            const k = (t * 0.55 + a * 0.17 + b * 0.11) % 1;
            const cx = from.x + (to.x - from.x) * k;
            const cy = from.y + (to.y - from.y) * k;
            const fade = Math.sin(k * Math.PI);
            ctx.beginPath();
            ctx.arc(cx, cy, 1.5 * scale * 0.5 + 0.8, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(255,247,224,${heat * fade})`;
            ctx.fill();
          }
        }

        // ── Stars ───────────────────────────────────────────────
        STARS.forEach((s, i) => {
          const p = P(s);
          const heat = level[s.region] ?? 0;
          const twinkle = 0.5 + 0.5 * Math.sin(t * 1.1 + hash01(i, 31.7) * 12);
          const r = (s.mag * 1.9 + heat * 2.6) * (0.85 + twinkle * 0.15) * Math.max(0.7, scale / 3);
          const alpha = 0.5 + heat * 0.5 + breath * 0.1;

          const glow = 0.16 + heat * 0.36;
          const halo = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 7);
          halo.addColorStop(0, `rgba(235,211,162,${glow})`);
          halo.addColorStop(1, "rgba(235,211,162,0)");
          ctx.fillStyle = halo;
          ctx.beginPath();
          ctx.arc(p.x, p.y, r * 7, 0, Math.PI * 2);
          ctx.fill();

          ctx.beginPath();
          ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(247,240,222,${Math.min(1, alpha)})`;
          ctx.fill();

          // The anchor stars flare four-pointed when their region is lit.
          if (s.mag > 1.2 && heat > 0.15) {
            const arm = r * (4 + heat * 2.6);
            ctx.strokeStyle = `rgba(240,219,175,${heat * 0.75})`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(p.x - arm, p.y);
            ctx.lineTo(p.x + arm, p.y);
            ctx.moveTo(p.x, p.y - arm);
            ctx.lineTo(p.x, p.y + arm);
            ctx.stroke();
          }
        });
      };
    });
  }, []);

  return (
    <div className="relative">
      <canvas
        ref={ref}
        className={`w-full h-[34rem] sm:h-[46rem] lg:h-[52rem] ${className ?? ""}`}
        aria-hidden="true"
        data-testid="constellation-body"
      />

    </div>
  );
}
