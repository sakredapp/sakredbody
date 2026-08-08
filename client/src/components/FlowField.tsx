import { useEffect, useRef } from "react";
import { breathAt } from "@/lib/breath";
import { mountStage, noise2 } from "@/lib/canvasStage";

/**
 * Drainage, drawn.
 *
 * Motes following a noise field — the visual argument for the whole Restore
 * territory: the lymphatic system has no pump, it moves when you move. The
 * field opens and stalls with the breath, so the whole thing clears on the
 * inhale and pools on the exhale.
 *
 * Deliberately slow. Fast particles read as a screensaver; at this rate it
 * reads as fluid, which is the only reason it belongs on the page.
 *
 * The cursor is a current: push through and the motes route around you.
 */

interface Mote {
  x: number;
  y: number;
  px: number;
  py: number;
  life: number;
}

export function FlowField({
  className,
  /** Overall speed multiplier. The default is a drift, not a flow. */
  speed = 1,
}: {
  className?: string;
  speed?: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;

    return mountStage(canvas, (S) => {
      let motes: Mote[] = [];
      let seeded = false;

      S.onResize = () => {
        const n = Math.round(Math.min(520, (S.w * S.h) / 320));
        motes = Array.from({ length: n }, (_, i) => {
          const x = ((i * 73) % 997) / 997 * S.w;
          const y = ((i * 131) % 991) / 991 * S.h;
          return { x, y, px: x, py: y, life: (i * 37) % 420 };
        });
        seeded = false;
      };

      return (t) => {
        const { ctx, w, h } = S;
        const breath = breathAt(t);

        if (!seeded) {
          ctx.fillStyle = "rgba(16,14,12,1)";
          ctx.fillRect(0, 0, w, h);
          seeded = true;
        }

        // Trails: fade the previous frame rather than clearing it.
        ctx.fillStyle = "rgba(16,14,12,0.075)";
        ctx.fillRect(0, 0, w, h);

        // A drift that swells on the inhale and nearly stalls on the exhale.
        const drift = (0.16 + breath * 0.34) * speed;

        for (const p of motes) {
          p.px = p.x;
          p.py = p.y;

          const angle = noise2(p.x * 0.0028, p.y * 0.0028 + t * 0.025) * Math.PI * 3.2;
          let vx = Math.cos(angle) * drift * 2.4;
          let vy = Math.sin(angle) * drift * 2.4;

          if (S.inside) {
            const dx = p.x - S.px;
            const dy = p.y - S.py;
            const d = Math.hypot(dx, dy);
            if (d < 120 && d > 0.5) {
              const f = (1 - d / 120) * 1.5;
              vx += (dx / d) * f;
              vy += (dy / d) * f;
            }
          }

          p.x += vx;
          p.y += vy;
          p.life -= 1;

          if (p.life < 0 || p.x < -12 || p.x > w + 12 || p.y < -12 || p.y > h + 12) {
            p.x = ((p.life * -13) % 1000) / 1000 * w;
            p.y = ((p.life * -29) % 1000) / 1000 * h;
            if (!Number.isFinite(p.x) || p.x < 0) p.x = w * 0.5;
            if (!Number.isFinite(p.y) || p.y < 0) p.y = h * 0.5;
            p.px = p.x;
            p.py = p.y;
            p.life = 340 + ((p.x + p.y) % 260);
          }

          ctx.beginPath();
          ctx.moveTo(p.px, p.py);
          ctx.lineTo(p.x, p.y);
          ctx.strokeStyle = `rgba(197,160,89,${0.07 + breath * 0.11})`;
          ctx.lineWidth = 0.8;
          ctx.stroke();
        }
      };
    });
  }, [speed]);

  return <canvas ref={ref} className={className} aria-hidden="true" />;
}
