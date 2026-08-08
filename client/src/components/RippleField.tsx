import { useEffect, useRef } from "react";

/**
 * Slow concentric rings drifting outward — a stone dropped in still water.
 * Ties to the raked sand garden on /philosophy rather than looking like a
 * generic background effect, and stays close to invisible on purpose.
 *
 * Canvas rather than a dependency: no third-party registry, no API key in the
 * repo, and the palette is ours. Pauses when off-screen and honours
 * prefers-reduced-motion.
 */
export function RippleField({ className }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let raf = 0;
    let running = true;
    let w = 0;
    let h = 0;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      const r = canvas.getBoundingClientRect();
      w = r.width;
      h = r.height;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    // Rings are staggered across one period so they never all bunch together.
    const RINGS = 5;
    const PERIOD = 14000;
    const start = performance.now();

    const draw = (now: number) => {
      if (!running) return;
      ctx.clearRect(0, 0, w, h);

      const cx = w / 2;
      const cy = h * 0.52;
      const max = Math.hypot(w, h) * 0.55;

      for (let i = 0; i < RINGS; i++) {
        const t = ((now - start + (i * PERIOD) / RINGS) % PERIOD) / PERIOD;
        const radius = t * max;
        // Fade in at the centre, out at the edge — no hard pop at either end.
        const alpha = Math.sin(t * Math.PI) * 0.16;
        if (alpha <= 0.002) continue;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.strokeStyle = `hsl(39 48% 56% / ${alpha})`;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    // Don't burn frames when the hero is scrolled past.
    const io = new IntersectionObserver(
      ([entry]) => {
        running = entry.isIntersecting;
        if (running) raf = requestAnimationFrame(draw);
        else cancelAnimationFrame(raf);
      },
      { threshold: 0 },
    );
    io.observe(canvas);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      io.disconnect();
      window.removeEventListener("resize", resize);
    };
  }, []);

  return <canvas ref={ref} className={className} aria-hidden="true" />;
}
