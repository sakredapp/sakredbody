import { elapsed } from "./breath";

export interface Stage {
  ctx: CanvasRenderingContext2D;
  canvas: HTMLCanvasElement;
  /** CSS pixels, not device pixels — the context is already scaled. */
  w: number;
  h: number;
  /** Pointer position in CSS pixels, or -9999 when the pointer is away. */
  px: number;
  py: number;
  inside: boolean;
  /** Seconds since the shared breath epoch. */
  t: number;
  /** Called after every resize, before the next frame. Seed particles here. */
  onResize?: () => void;
}

/**
 * The boilerplate every ambient canvas on this site would otherwise repeat:
 * device-pixel scaling, resize, pointer tracking, pausing when scrolled out of
 * view, and freezing under prefers-reduced-motion.
 *
 * `init` receives the stage and returns the per-frame draw. Anything the draw
 * needs to size against the canvas should be seeded in `stage.onResize`, which
 * runs once up front and again on every resize.
 *
 * Returns a teardown for the effect cleanup.
 */
export function mountStage(
  canvas: HTMLCanvasElement,
  init: (stage: Stage) => (t: number) => void,
  options: {
    /**
     * Cap the redraw rate. Omit for every frame the display offers.
     *
     * Worth setting for anything ambient. A hero the eye is on wants 60; a
     * star field drifting a few pixels a second behind a habit list does not
     * — at 30 the motion is identical to look at and the work is halved.
     * That matters most exactly where it is hardest to see: a `fixed`
     * full-viewport backdrop never leaves the screen, so the IntersectionObserver
     * below never pauses it, and it will happily redraw sixty times a second
     * for as long as somebody keeps the app open.
     */
    fps?: number;
  } = {},
): () => void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return () => {};

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  const stage: Stage = { ctx, canvas, w: 0, h: 0, px: -9999, py: -9999, inside: false, t: 0 };

  const resize = () => {
    const rect = canvas.getBoundingClientRect();
    // A canvas laid out at zero — inside a collapsed parent, or before the
    // first layout — must not latch a 1×1 backing store and then draw a whole
    // scene into it. Skip; the observer fires again when it has a size.
    if (rect.width < 1 || rect.height < 1) return;
    if (rect.width === stage.w && rect.height === stage.h) return;

    stage.w = rect.width;
    stage.h = rect.height;
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    stage.onResize?.();
  };

  const onMove = (e: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    stage.px = e.clientX - rect.left;
    stage.py = e.clientY - rect.top;
    stage.inside = true;
  };
  const onLeave = () => {
    stage.inside = false;
    stage.px = -9999;
    stage.py = -9999;
  };

  const draw = init(stage);
  resize();

  /**
   * The canvas is watched directly, not via `window.resize`.
   *
   * This is the fix for the stretched animations in the native shells. A
   * canvas has two sizes — the CSS box it occupies and the pixel buffer it
   * owns — and they are only kept in step by this function running. In a
   * browser `window.resize` is a decent proxy. In an iOS WebView it is not:
   * the box changes when the safe-area insets resolve after first paint, when
   * the keyboard opens, when the status bar overlays. None of those reliably
   * fire `resize`. The element grows, the buffer doesn't, and the browser
   * scales the old bitmap to the new box — non-uniformly, because the aspect
   * ratio changed. That is exactly what "stretching the animations out"
   * looks like, and it affects every canvas in the product.
   *
   * ResizeObserver watches the thing that actually matters. `window.resize`
   * stays as a belt-and-braces for browsers where an orientation change
   * resizes the viewport without resizing this element.
   */
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);

  window.addEventListener("resize", resize);
  window.addEventListener("orientationchange", resize);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerleave", onLeave);

  let raf = 0;
  let visible = false;

  // The rAF loop still runs at display rate — it has to, to stay in step with
  // the compositor — but the draw is skipped between slots. Skipping the draw
  // is where the cost is; the callback itself is free.
  const minGap = options.fps ? 1 / options.fps : 0;
  let lastDraw = -Infinity;

  const frame = (now: number) => {
    stage.t = elapsed(now);
    if (stage.t - lastDraw >= minGap) {
      lastDraw = stage.t;
      draw(stage.t);
    }
    if (visible && !reduced) raf = requestAnimationFrame(frame);
  };

  const io = new IntersectionObserver(
    ([entry]) => {
      const next = entry.isIntersecting;
      if (next && !visible) {
        visible = true;
        raf = requestAnimationFrame(frame);
      } else if (!next) {
        visible = false;
        cancelAnimationFrame(raf);
      }
    },
    { threshold: 0 },
  );
  io.observe(canvas);

  // One frame regardless, so a reduced-motion or offscreen canvas still paints
  // its resting state instead of sitting blank.
  frame(performance.now());

  return () => {
    visible = false;
    cancelAnimationFrame(raf);
    io.disconnect();
    observer.disconnect();
    window.removeEventListener("resize", resize);
    window.removeEventListener("orientationchange", resize);
    canvas.removeEventListener("pointermove", onMove);
    canvas.removeEventListener("pointerleave", onLeave);
  };
}

/* ── Value noise ────────────────────────────────────────────────
   One permutation table, seeded deterministically so the wind in
   the canopy is the same wind on every load. Shared by the canopy,
   the flow field and the embers. */

const perm = new Uint8Array(512);
{
  const p = Uint8Array.from({ length: 256 }, (_, i) => i);
  let seed = 1337;
  for (let i = 255; i > 0; i--) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const j = seed % (i + 1);
    const tmp = p[i];
    p[i] = p[j];
    p[j] = tmp;
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
}

const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const grad = (h: number, x: number, y: number) => (h & 1 ? x : -x) + (h & 2 ? y : -y);

/** Roughly -1…1. Cheap, smooth, and good enough for wind and current. */
export function noise2(x: number, y: number) {
  const X = Math.floor(x) & 255;
  const Y = Math.floor(y) & 255;
  const fx = x - Math.floor(x);
  const fy = y - Math.floor(y);
  const u = fade(fx);
  const v = fade(fy);
  const A = perm[X] + Y;
  const B = perm[X + 1] + Y;
  return (
    lerp(
      lerp(grad(perm[A], fx, fy), grad(perm[B], fx - 1, fy), u),
      lerp(grad(perm[A + 1], fx, fy - 1), grad(perm[B + 1], fx - 1, fy - 1), u),
      v,
    ) * 0.5
  );
}

/** Deterministic 0…1 from an integer — for seeding without Math.random. */
export function hash01(i: number, salt = 12.9898) {
  const v = Math.sin(i * salt) * 43758.5453;
  return v - Math.floor(v);
}
