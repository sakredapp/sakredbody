import { useEffect, useRef } from "react";
import { breathAt } from "@/lib/breath";
import { hash01, mountStage } from "@/lib/canvasStage";

/**
 * Walking in.
 *
 * Five layers of foliage at five parallax rates with mist banked between them
 * and a warm shaft falling from the upper right. Depth comes from the rate
 * difference — far layers are nearly black and barely move, near fronds are
 * large and slow — rather than from blur, which never convinces anyone.
 *
 * The fronds breathe on the shared clock and the whole scene shifts against
 * the cursor, so the page has a viewpoint that answers you.
 */

interface Layer {
  fill: string;
  /** px of travel against the cursor — the depth cue. */
  rate: number;
  scale: number;
  count: number;
  /** Where the fronds root, as a fraction of height. */
  y: number;
}

const LAYERS: Layer[] = [
  { fill: "#0C0F0D", rate: 3, scale: 1.5, count: 5, y: 0.3 },
  { fill: "#121712", rate: 6, scale: 1.2, count: 6, y: 0.44 },
  { fill: "#161C16", rate: 10, scale: 0.95, count: 6, y: 0.6 },
  { fill: "#1A211A", rate: 16, scale: 0.72, count: 5, y: 0.78 },
  { fill: "#0E120E", rate: 26, scale: 0.5, count: 4, y: 0.98 },
];

/** A frond: one curved spine with leaflets stepped down either side. */
function frond(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  len: number,
  ang: number,
  scale: number,
) {
  const tipX = x + Math.cos(ang) * len;
  const tipY = y + Math.sin(ang) * len;
  const cpX = x + Math.cos(ang - 0.3) * len * 0.6;
  const cpY = y + Math.sin(ang - 0.3) * len * 0.6;

  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.quadraticCurveTo(cpX, cpY, tipX, tipY);

  const steps = 9;
  const at = (p: number) => ({
    x: x * (1 - p) * (1 - p) + cpX * 2 * p * (1 - p) + tipX * p * p,
    y: y * (1 - p) * (1 - p) + cpY * 2 * p * (1 - p) + tipY * p * p,
  });

  for (let i = steps; i >= 1; i--) {
    const p = i / steps;
    const b = at(p);
    const leaf = len * 0.3 * Math.sin(p * Math.PI) * scale;
    ctx.lineTo(b.x + Math.cos(ang + 1.5) * leaf, b.y + Math.sin(ang + 1.5) * leaf);
  }
  for (let i = 1; i <= steps; i++) {
    const p = i / steps;
    const b = at(p);
    const leaf = len * 0.3 * Math.sin(p * Math.PI) * scale;
    ctx.lineTo(b.x + Math.cos(ang - 1.5) * leaf, b.y + Math.sin(ang - 1.5) * leaf);
  }
  ctx.closePath();
  ctx.fill();
}

/** Two times of day. `deep` is the ink hero; `dawn` lifts the page. */
const SKIES = {
  deep: { top: "#141A16", mid: "#0F1310", bottom: "#1C1917", shaft: 0.16, warm: 0.035 },
  dawn: { top: "#3A3A2C", mid: "#242519", bottom: "#1C1917", shaft: 0.4, warm: 0.1 },
} as const;

export function JungleCanopy({
  className,
  variant = "deep",
}: {
  className?: string;
  variant?: keyof typeof SKIES;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const sky = SKIES[variant];

    // The eye the scene is viewed from. It chases the pointer rather than
    // snapping to it — reading the raw position every frame is what made a
    // fast mouse tear the layers apart.
    let eyeX = 0;
    let eyeY = 0;

    return mountStage(canvas, (S) => (t) => {
      const { ctx, w, h } = S;
      const breath = breathAt(t);

      const ground = ctx.createLinearGradient(0, 0, 0, h);
      ground.addColorStop(0, sky.top);
      ground.addColorStop(0.45, sky.mid);
      ground.addColorStop(1, sky.bottom);
      ctx.fillStyle = ground;
      ctx.fillRect(0, 0, w, h);

      // The shaft: one light source, from above and behind the canopy.
      const shaft = ctx.createRadialGradient(w * 0.62, -h * 0.15, 0, w * 0.62, -h * 0.15, h * 1.35);
      shaft.addColorStop(0, `rgba(226,193,132,${sky.shaft + breath * 0.07})`);
      shaft.addColorStop(0.45, `rgba(197,160,89,${sky.warm})`);
      shaft.addColorStop(1, "rgba(197,160,89,0)");
      ctx.fillStyle = shaft;
      ctx.fillRect(0, 0, w, h);

      const targetX = S.inside ? S.px / w - 0.5 : 0;
      const targetY = S.inside ? S.py / h - 0.5 : 0;
      eyeX += (targetX - eyeX) * 0.05;
      eyeY += (targetY - eyeY) * 0.05;
      const mx = eyeX;
      const my = eyeY;

      LAYERS.forEach((L, li) => {
        const sway = Math.sin(t * 0.16 + li) * (3 + L.rate * 0.12) * (0.6 + breath * 0.8);
        ctx.save();
        ctx.translate(-mx * L.rate + sway, -my * L.rate * 0.32);
        ctx.fillStyle = L.fill;

        for (let i = 0; i < L.count; i++) {
          const seed = li * 17 + i * 5.3;
          const r = hash01(seed);
          const fx = r * w * 1.2 - w * 0.1;
          const fy = h * L.y + Math.sin(seed) * h * 0.05;
          const len = h * 0.42 * L.scale * (0.75 + r * 0.5);
          const lean = (i % 2 ? -1 : 1) * (0.5 + r * 0.4);
          const breathe = Math.sin(t * 0.3 + seed) * 0.045 * (0.5 + breath);
          frond(ctx, fx, fy, len, -Math.PI / 2 + lean + breathe, L.scale);
        }
        ctx.restore();

        if (li < LAYERS.length - 1) {
          const mist = ctx.createLinearGradient(0, h * (L.y - 0.18), 0, h * (L.y + 0.24));
          mist.addColorStop(0, "rgba(150,160,150,0)");
          mist.addColorStop(0.5, `rgba(150,160,150,${0.035 + breath * 0.022 - li * 0.004})`);
          mist.addColorStop(1, "rgba(150,160,150,0)");
          ctx.fillStyle = mist;
          ctx.fillRect(0, h * (L.y - 0.18), w, h * 0.42);
        }
      });

      // Motes carried in the shaft.
      for (let i = 0; i < 26; i++) {
        const fx = (hash01(i, 45.1) * w + t * (6 + (i % 5)) * 0.6) % w;
        const fy = (hash01(i, 91.7) * h + Math.sin(t * 0.3 + i) * 14 + h) % h;
        ctx.beginPath();
        ctx.arc(fx, fy, 0.7 + (i % 3) * 0.4, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(235,211,162,${0.1 + breath * 0.14})`;
        ctx.fill();
      }
    });
  }, [variant]);

  return <canvas ref={ref} className={className} aria-hidden="true" />;
}
