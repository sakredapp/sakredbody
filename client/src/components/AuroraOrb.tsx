import { useEffect, useRef } from "react";

/**
 * A gilt nebula, turning inside a sphere.
 *
 * Layered radial blooms drift on slow, mutually prime cycles and are clipped
 * to a circle, so the thing reads as weather inside a glass ball rather than a
 * gradient someone parked on the page. The rim light is a single arc at the
 * top-left — one light source, like the rest of the site.
 *
 * Canvas, no dependency. Honours prefers-reduced-motion and stops when
 * scrolled out of view.
 */
export function AuroraOrb({ className }: { className?: string }) {
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

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      w = rect.width;
      h = rect.height;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    // Hue, drift rate, orbit radius, bloom size. Rates are deliberately
    // unrelated so the pattern never visibly repeats.
    const BLOOMS = [
      { hue: 41, sat: 62, light: 58, rate: 0.055, orbit: 0.3, size: 0.66, phase: 0 },
      { hue: 36, sat: 55, light: 46, rate: -0.037, orbit: 0.38, size: 0.58, phase: 2.1 },
      { hue: 46, sat: 70, light: 70, rate: 0.081, orbit: 0.22, size: 0.44, phase: 4.3 },
      { hue: 28, sat: 40, light: 34, rate: -0.062, orbit: 0.44, size: 0.52, phase: 5.6 },
    ];

    const start = performance.now();

    const render = (now: number) => {
      const t = reduced ? 0 : (now - start) / 1000;
      ctx.clearRect(0, 0, w, h);

      const cx = w / 2;
      const cy = h / 2;
      const r = Math.min(w, h) * 0.42;

      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.clip();

      // The ink the weather sits in.
      ctx.fillStyle = "hsl(30 12% 7% / 0.92)";
      ctx.fill();

      ctx.globalCompositeOperation = "lighter";
      for (const b of BLOOMS) {
        const a = b.phase + t * b.rate;
        // A wobble on the radius keeps the blooms from tracing clean circles.
        const rr = r * b.orbit * (1 + Math.sin(t * b.rate * 2.7 + b.phase) * 0.22);
        const x = cx + Math.cos(a) * rr;
        const y = cy + Math.sin(a * 1.3) * rr * 0.8;
        const size = r * b.size;

        const g = ctx.createRadialGradient(x, y, 0, x, y, size);
        g.addColorStop(0, `hsl(${b.hue} ${b.sat}% ${b.light}% / 0.4)`);
        g.addColorStop(0.45, `hsl(${b.hue} ${b.sat}% ${b.light}% / 0.13)`);
        g.addColorStop(1, `hsl(${b.hue} ${b.sat}% ${b.light}% / 0)`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      // Rim: bright at the upper left, falling away around the sphere.
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      const rim = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
      rim.addColorStop(0, "hsl(42 70% 76% / 0.5)");
      rim.addColorStop(0.4, "hsl(39 48% 56% / 0.14)");
      rim.addColorStop(1, "hsl(39 48% 56% / 0.04)");
      ctx.strokeStyle = rim;
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.restore();

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
