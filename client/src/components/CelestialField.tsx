import { useEffect, useRef } from "react";

/**
 * An engraved star chart, slowly turning.
 *
 * The brief was cosmos without crypto-landing-page. The resolution is antique
 * astronomy: gilt points, thin concentric orbits, a slow rotation you feel
 * rather than watch — a celestial globe in a library, not a particle demo.
 * Everything is gold on ink at low alpha so it reads as engraving.
 *
 * Canvas, no dependency. Honours prefers-reduced-motion and stops when
 * scrolled out of view.
 */
export function CelestialField({ className }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let raf = 0;
    let running = true;
    let w = 0;
    let h = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    // Deterministic star field — regenerated on resize so density stays even.
    let stars: { a: number; r: number; size: number; twinkle: number }[] = [];
    const seedStars = () => {
      const count = Math.round(Math.min(160, (w * h) / 9000));
      stars = Array.from({ length: count }, (_, i) => {
        const n = Math.sin(i * 127.1) * 43758.5453;
        const m = Math.sin(i * 311.7) * 27183.1234;
        return {
          a: (n - Math.floor(n)) * Math.PI * 2,
          r: 0.12 + (m - Math.floor(m)) * 0.9,
          size: 0.5 + (n - Math.floor(n)) * 1.1,
          twinkle: (m - Math.floor(m)) * Math.PI * 2,
        };
      });
    };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      w = rect.width;
      h = rect.height;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      seedStars();
    };
    resize();
    window.addEventListener("resize", resize);

    const ORBITS = [0.34, 0.52, 0.72, 0.94];
    const start = performance.now();

    const render = (now: number) => {
      const t = reduced ? 0 : (now - start) / 1000;
      ctx.clearRect(0, 0, w, h);

      const cx = w / 2;
      const cy = h * 0.5;
      const unit = Math.min(w, h) * 0.78;

      // Orbits: thin ellipses, each turning at its own slow rate.
      ORBITS.forEach((scale, i) => {
        const rx = unit * scale;
        const ry = rx * (0.3 + i * 0.06);
        const tilt = t * 0.006 * (i % 2 === 0 ? 1 : -1) + i * 0.5;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(tilt);
        ctx.beginPath();
        ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
        ctx.strokeStyle = `hsl(39 48% 56% / ${0.1 - i * 0.015})`;
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.restore();
      });

      // Stars: the whole field rotates as one, like a turning globe.
      const spin = t * 0.008;
      for (const s of stars) {
        const a = s.a + spin;
        const rr = s.r * unit * 0.95;
        const x = cx + Math.cos(a) * rr;
        const y = cy + Math.sin(a) * rr * 0.42;
        const alpha = 0.18 + Math.sin(t * 0.5 + s.twinkle) * 0.1;
        ctx.beginPath();
        ctx.arc(x, y, s.size, 0, Math.PI * 2);
        ctx.fillStyle = `hsl(42 70% 76% / ${Math.max(0.05, alpha)})`;
        ctx.fill();
      }

      if (running && !reduced) raf = requestAnimationFrame(render);
    };
    raf = requestAnimationFrame(render);

    const io = new IntersectionObserver(
      ([entry]) => {
        running = entry.isIntersecting;
        if (running && !reduced) raf = requestAnimationFrame(render);
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
