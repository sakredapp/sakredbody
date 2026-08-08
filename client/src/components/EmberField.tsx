import { useEffect, useRef } from "react";
import { breathAt } from "@/lib/breath";
import { hash01, mountStage, noise2 } from "@/lib/canvasStage";

/**
 * Heat, rising.
 *
 * Build is the fire half of the duality and the one page that should feel like
 * effort. Embers accelerate as they climb — a thermal, not a constant drift —
 * and cool from gold through to ash before they go out.
 *
 * Density and heat swell on the inhale, so the field surges with the same
 * clock everything else on the site runs on.
 */

interface Ember {
  x: number;
  y: number;
  v: number;
  r: number;
  drift: number;
}

export function EmberField({ className }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;

    return mountStage(canvas, (S) => {
      let embers: Ember[] = [];

      const respawn = (e: Ember, i: number, atBottom: boolean) => {
        e.x = hash01(i, 45.7) * S.w;
        e.y = atBottom ? S.h + hash01(i, 12.3) * 40 : hash01(i, 88.1) * S.h;
        e.v = 0.3 + hash01(i, 61.9) * 0.8;
        e.r = 0.6 + hash01(i, 33.1) * 1.9;
        e.drift = (hash01(i, 7.7) - 0.5) * 0.4;
      };

      S.onResize = () => {
        const n = Math.round(Math.min(150, S.w / 4.5));
        embers = Array.from({ length: n }, () => ({ x: 0, y: 0, v: 0, r: 0, drift: 0 }));
        embers.forEach((e, i) => respawn(e, i, false));
      };

      return (t) => {
        const { ctx, w, h } = S;
        const breath = breathAt(t);
        ctx.clearRect(0, 0, w, h);

        const heat = 0.6 + breath * 0.8;

        embers.forEach((e, i) => {
          // The thermal: faster the higher it gets.
          e.y -= e.v * heat * 1.4 * (1 + (1 - e.y / h) * 1.4);
          e.x += e.drift + noise2(e.x * 0.01, t * 0.3) * 0.9;
          if (e.y < -12) respawn(e, i, true);

          const cool = Math.max(0, Math.min(1, e.y / h)); // 1 hot at the base, 0 ash above
          ctx.beginPath();
          ctx.arc(e.x, e.y, e.r * (0.5 + cool * 0.8), 0, Math.PI * 2);
          ctx.fillStyle = `hsla(${28 + cool * 16},${45 + cool * 30}%,${40 + cool * 32}%,${cool * 0.75})`;
          ctx.fill();
        });

        // The bed of coals the whole thing is rising off.
        const bed = ctx.createLinearGradient(0, h, 0, h * 0.35);
        bed.addColorStop(0, `rgba(192,101,91,${0.12 * heat})`);
        bed.addColorStop(1, "rgba(192,101,91,0)");
        ctx.fillStyle = bed;
        ctx.fillRect(0, 0, w, h);
      };
    });
  }, []);

  return <canvas ref={ref} className={className} aria-hidden="true" />;
}
