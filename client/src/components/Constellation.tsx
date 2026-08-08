import { useEffect, useRef } from "react";
import { breathAt } from "@/lib/breath";
import { hash01, mountStage } from "@/lib/canvasStage";

/**
 * Four territories drawn as one figure.
 *
 * Restore, Build, Embody and Gather are four stations of a single sequence, so
 * a field that links them is a truer picture than four cards in a row. Points
 * drift on their own paths; a line strikes between any two that come close
 * enough and brightens as they near.
 *
 * The four named anchors pulse on the shared breath. The cursor pulls the
 * nearest points toward it, so the figure reorganises around wherever you are.
 */

interface Pt {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

const DEFAULT_LABELS = ["Restore", "Build", "Embody", "Gather"];

export function Constellation({
  className,
  labels = DEFAULT_LABELS,
}: {
  className?: string;
  labels?: string[];
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;

    return mountStage(canvas, (S) => {
      let pts: Pt[] = [];
      let anchors: { name: string; x: number; y: number }[] = [];

      S.onResize = () => {
        const n = Math.round(Math.min(64, (S.w * S.h) / 11000));
        pts = Array.from({ length: n }, (_, i) => ({
          x: hash01(i, 12.9898) * S.w,
          y: hash01(i, 78.233) * S.h,
          vx: (hash01(i, 41.7) - 0.5) * 11,
          vy: (hash01(i, 93.1) - 0.5) * 11,
        }));
        anchors = labels.map((name, i) => ({
          name,
          x: S.w * (0.2 + (i % 2) * 0.6),
          y: S.h * (i < 2 ? 0.28 : 0.74),
        }));
      };

      return (t) => {
        const { ctx, w, h } = S;
        const breath = breathAt(t);
        ctx.clearRect(0, 0, w, h);

        const dt = 1 / 60;
        for (const p of pts) {
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          if (p.x < 0 || p.x > w) p.vx *= -1;
          if (p.y < 0 || p.y > h) p.vy *= -1;
          if (S.inside) {
            const dx = S.px - p.x;
            const dy = S.py - p.y;
            const d = Math.hypot(dx, dy);
            if (d < 180 && d > 1) {
              p.x += (dx / d) * (1 - d / 180) * 1.4;
              p.y += (dy / d) * (1 - d / 180) * 1.4;
            }
          }
        }

        const all = [...pts, ...anchors];
        const LINK = Math.min(w, h) * 0.3;
        for (let i = 0; i < all.length; i++) {
          for (let j = i + 1; j < all.length; j++) {
            const d = Math.hypot(all[i].x - all[j].x, all[i].y - all[j].y);
            if (d < LINK) {
              ctx.beginPath();
              ctx.moveTo(all[i].x, all[i].y);
              ctx.lineTo(all[j].x, all[j].y);
              ctx.strokeStyle = `rgba(197,160,89,${(1 - d / LINK) * 0.26})`;
              ctx.lineWidth = 0.6;
              ctx.stroke();
            }
          }
        }

        for (const p of pts) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, 1.2, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(197,160,89,0.4)";
          ctx.fill();
        }

        for (const a of anchors) {
          const r = 3.5 + breath * 1.8;
          ctx.beginPath();
          ctx.arc(a.x, a.y, r, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(235,211,162,0.9)";
          ctx.fill();
          ctx.beginPath();
          ctx.arc(a.x, a.y, r + 6 + breath * 5, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(197,160,89,${0.3 - breath * 0.14})`;
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      };
    });
  }, [labels]);

  return <canvas ref={ref} className={className} aria-hidden="true" />;
}
