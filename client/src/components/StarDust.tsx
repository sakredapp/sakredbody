import { useEffect, useRef } from "react";
import { breathAt } from "@/lib/breath";
import { hash01, mountStage } from "@/lib/canvasStage";

/**
 * The layer that makes a section feel like it is somewhere.
 *
 * Gilt motes drifting upward on a slow thermal, a handful of them catching the
 * light and flaring for a moment before going quiet again. It is the same idea
 * as dust in a shaft of sun and the same idea as a field of stars, which is
 * exactly the register this brand sits in — the cosmos and the forest floor
 * turn out to look alike at the right exposure.
 *
 * Cheap enough to layer on any section: one canvas, no images, pauses when
 * scrolled out of view.
 */
export function StarDust({
  className,
  /** Motes per 10,000px². Keep it low — this reads best as almost-nothing. */
  density = 0.9,
  /** Upward drift in px a second. */
  rise = 5,
}: {
  className?: string;
  density?: number;
  rise?: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;

    return mountStage(canvas, (S) => {
      let motes: { x: number; y: number; r: number; drift: number; flare: number; rate: number }[] = [];

      S.onResize = () => {
        const n = Math.round(Math.min(180, ((S.w * S.h) / 10000) * density));
        motes = Array.from({ length: n }, (_, i) => ({
          x: hash01(i, 12.7) * S.w,
          y: hash01(i, 45.3) * S.h,
          r: 0.5 + hash01(i, 77.1) * 1.4,
          drift: (hash01(i, 91.7) - 0.5) * 5,
          // Most motes never flare. The few that do are the whole effect.
          flare: hash01(i, 33.9) > 0.82 ? 1 : 0,
          rate: 0.5 + hash01(i, 61.1) * 1.6,
        }));
      };

      return (t) => {
        const { ctx, w, h } = S;
        const breath = breathAt(t);
        ctx.clearRect(0, 0, w, h);

        for (let i = 0; i < motes.length; i++) {
          const m = motes[i];
          // Position is derived from time rather than accumulated, so the
          // field is identical on every load and can't drift out of sync.
          const y = (((m.y - t * rise * m.rate) % h) + h) % h;
          const x = m.x + Math.sin(t * 0.12 * m.rate + i) * m.drift;

          let alpha = 0.1 + breath * 0.12;
          let radius = m.r;

          if (m.flare) {
            // A slow blink, out of phase per mote.
            const s = Math.sin(t * 0.55 * m.rate + i * 2.4);
            const glint = Math.pow(Math.max(0, s), 8);
            alpha += glint * 0.75;
            radius += glint * 1.4;

            if (glint > 0.25) {
              // Four-point star: the flare, not a bigger dot.
              const arm = radius * 4.5 * glint;
              ctx.strokeStyle = `rgba(235,211,162,${glint * 0.5})`;
              ctx.lineWidth = 0.7;
              ctx.beginPath();
              ctx.moveTo(x - arm, y);
              ctx.lineTo(x + arm, y);
              ctx.moveTo(x, y - arm);
              ctx.lineTo(x, y + arm);
              ctx.stroke();
            }
          }

          ctx.beginPath();
          ctx.arc(x, y, radius, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(235,211,162,${Math.min(0.95, alpha)})`;
          ctx.fill();
        }
      };
    });
  }, [density, rise]);

  return <canvas ref={ref} className={className} aria-hidden="true" />;
}
