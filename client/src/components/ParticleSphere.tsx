import { useEffect, useRef } from "react";

/**
 * A gilt sphere drawn as points, turning slowly on a tilted axis.
 *
 * The companion piece to `CelestialField`: where that one is a star chart, this
 * is the globe itself — a Fibonacci lattice of points on a sphere, depth-faded
 * so the far hemisphere sinks into the ink. Same rules: gold, low alpha, a
 * rotation you feel rather than watch.
 *
 * Canvas, no dependency. Honours prefers-reduced-motion and stops when
 * scrolled out of view.
 */
export function ParticleSphere({ className }: { className?: string }) {
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

    // Fibonacci lattice — the only distribution that stays even on a sphere
    // without visible seams at the poles.
    let points: { x: number; y: number; z: number }[] = [];
    const seedPoints = () => {
      const count = Math.round(Math.min(900, Math.max(320, (w * h) / 900)));
      const golden = Math.PI * (3 - Math.sqrt(5));
      points = Array.from({ length: count }, (_, i) => {
        const y = 1 - (i / (count - 1)) * 2;
        const radius = Math.sqrt(Math.max(0, 1 - y * y));
        const theta = golden * i;
        return { x: Math.cos(theta) * radius, y, z: Math.sin(theta) * radius };
      });
    };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      w = rect.width;
      h = rect.height;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      seedPoints();
    };
    resize();
    window.addEventListener("resize", resize);

    const TILT = 0.32; // a globe on a stand, not a spinning ball
    const start = performance.now();

    const render = (now: number) => {
      const t = reduced ? 0 : (now - start) / 1000;
      ctx.clearRect(0, 0, w, h);

      const cx = w / 2;
      const cy = h / 2;
      const unit = Math.min(w, h) * 0.36;
      const spin = t * 0.08;
      const cosT = Math.cos(TILT);
      const sinT = Math.sin(TILT);

      for (const p of points) {
        // Spin about Y, then tilt the whole lattice toward the viewer.
        const x = p.x * Math.cos(spin) - p.z * Math.sin(spin);
        const z0 = p.x * Math.sin(spin) + p.z * Math.cos(spin);
        const y = p.y * cosT - z0 * sinT;
        const z = p.y * sinT + z0 * cosT;

        // Depth: the far hemisphere fades rather than disappears, so the
        // silhouette stays a sphere instead of a disc.
        const depth = (z + 1) / 2;
        const alpha = 0.05 + depth * 0.32;
        const size = 0.5 + depth * 1.2;

        ctx.beginPath();
        ctx.arc(cx + x * unit, cy + y * unit, size, 0, Math.PI * 2);
        ctx.fillStyle = `hsl(41 62% ${58 + depth * 18}% / ${alpha})`;
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
