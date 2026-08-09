import { useEffect, useRef } from "react";
import { breathAt } from "@/lib/breath";
import { mountStage } from "@/lib/canvasStage";

/**
 * The site's clock, made visible — and usable.
 *
 * Concentric rings expand on a four-count inhale and contract on a six-count
 * exhale, with the seconds printed in the middle. Embody is the daily-practice
 * page, and a pacer that actually paces a breath is the most on-brand object
 * the site can carry: useful rather than ornamental, and it states out loud the
 * rhythm every other animation here is already following.
 *
 * The rings carry a fine oscillation as well, so they read as under tension
 * rather than drawn.
 */
export function BreathPacer({ className }: { className?: string }) {
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
      const base = Math.min(w, h) * 0.13;

      for (let i = 0; i < 5; i++) {
        const R = base * (1 + i * 0.4) * (1 + breath * 0.42);
        ctx.beginPath();
        for (let a = 0; a <= Math.PI * 2 + 0.01; a += 0.06) {
          const wobble = Math.sin(a * (3 + i) + t * (9 + i * 3.5)) * 0.4;
          const r = R + wobble;
          const x = cx + Math.cos(a) * r;
          const y = cy + Math.sin(a) * r;
          if (a === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.strokeStyle = `rgba(197,160,89,${(0.42 - i * 0.06) * (0.45 + breath * 0.55)})`;
        ctx.lineWidth = i === 0 ? 1.6 : 1;
        ctx.stroke();
      }

      const cr = base * 0.42 * (1 + breath * 0.3);
      const core = ctx.createRadialGradient(cx - cr * 0.3, cy - cr * 0.3, 0, cx, cy, cr * 2.4);
      core.addColorStop(0, `rgba(235,211,162,${0.4 + breath * 0.45})`);
      core.addColorStop(1, "rgba(197,160,89,0)");
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.arc(cx, cy, cr * 2.4, 0, Math.PI * 2);
      ctx.fill();

      // No numerals. Behind the hero title the countdown and the INHALE/EXHALE
      // label sat directly under the word and over the marks — two competing
      // pieces of type in the same space, and neither readable. The rings
      // already pace the breath; a number only asks to be read instead.
    });
  }, []);

  return <canvas ref={ref} className={className} aria-hidden="true" />;
}
