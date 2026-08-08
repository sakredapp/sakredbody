import { useEffect, useRef } from "react";
import { breathAt } from "@/lib/breath";
import { mountStage } from "@/lib/canvasStage";

/**
 * Rings under tension.
 *
 * A ring drawn as a circle is a shape. A ring whose radius carries a fast,
 * tiny oscillation — a few tenths of a pixel, riding on the slow breath — is
 * an object under load. It is too small to consciously watch and exactly large
 * enough to feel, which is the entire trick.
 *
 * Hovering excites it: the harmonics separate and the amplitude climbs, then
 * it settles when the pointer leaves.
 */
export function ResonantRing({
  className,
  /** Rings drawn, innermost first. */
  rings = 4,
  testId,
}: {
  className?: string;
  rings?: number;
  testId?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;

    return mountStage(canvas, (S) => {
      let excite = 0;

      return (t) => {
        const { ctx, w, h } = S;
        const breath = breathAt(t);
        ctx.clearRect(0, 0, w, h);

        const cx = w / 2;
        const cy = h / 2;
        excite += ((S.inside ? 1 : 0) - excite) * 0.06;

        const base = Math.min(w, h) * 0.14;
        for (let i = 0; i < rings; i++) {
          const R = base * (1 + i * 0.42) * (1 + breath * 0.05);
          const amp = 0.3 + excite * 1.4;
          const freq = 2.4 + i * 0.9 + excite * 2.2;

          ctx.beginPath();
          for (let a = 0; a <= Math.PI * 2 + 0.01; a += 0.06) {
            const r = R + Math.sin(a * (3 + i) + t * freq) * amp;
            const x = cx + Math.cos(a) * r;
            const y = cy + Math.sin(a) * r;
            if (a === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.closePath();
          ctx.strokeStyle = `rgba(197,160,89,${(0.42 - i * 0.07) * (0.5 + excite * 0.5 + breath * 0.2)})`;
          ctx.lineWidth = i === 0 ? 1.5 : 1;
          ctx.stroke();
        }

        const cr = base * 0.34 * (1 + breath * 0.22 + excite * 0.12);
        const core = ctx.createRadialGradient(cx - cr * 0.3, cy - cr * 0.3, 0, cx, cy, cr * 2.2);
        core.addColorStop(0, `rgba(235,211,162,${0.45 + excite * 0.35})`);
        core.addColorStop(1, "rgba(197,160,89,0)");
        ctx.fillStyle = core;
        ctx.beginPath();
        ctx.arc(cx, cy, cr * 2.2, 0, Math.PI * 2);
        ctx.fill();
      };
    });
  }, [rings]);

  return <canvas ref={ref} className={className} aria-hidden="true" data-testid={testId} />;
}
