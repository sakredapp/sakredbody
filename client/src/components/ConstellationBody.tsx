import { useEffect, useRef, useState } from "react";
import { breathAt } from "@/lib/breath";
import { hash01, mountStage } from "@/lib/canvasStage";

/**
 * The Sakred Body, drawn the way a star chart draws a figure.
 *
 * A human silhouette plotted as stars, with the fascia strung between them as
 * the lines of the constellation. It is the brand's whole argument in one
 * object: the same eye that reads a body reads a sky, and neither is a
 * collection of parts.
 *
 * ── It is a system, not an illustration that lights up ────────────────────
 *
 * The figure used to do one thing: brighten a region and run a charge down its
 * lines. Everything else was still. That reads as a diagram with a highlight,
 * and the whole claim of this brand is that a body is none of those things.
 *
 * So there are three states, and the figure is never fully at rest:
 *
 *   REST         it breathes. The swell is local to the lower ribs and
 *                diaphragm rather than a scale on the whole silhouette —
 *                scaling the figure makes a balloon, not a breath.
 *   AUTOCYCLE    one region becomes legible every few seconds and performs
 *                its own behaviour, not a shared gold pulse.
 *   INTERACTION  a pointer or a tap takes priority immediately, and on
 *                release the hold decays over ~1.2s rather than snapping
 *                back to wherever the cycle had got to.
 *
 * ── Nothing happens alone ─────────────────────────────────────────────────
 *
 * NEIGHBOURS is the load-bearing idea, not the particles. Activating Breath
 * answers in Flow and the Central Axis; activating the Middle answers in the
 * Organ Network and Flow. A region is never lit in isolation, because that is
 * the one thing the page beside it says is never true of a body.
 *
 * ── What is deliberately absent ───────────────────────────────────────────
 *
 * No scroll-driven camera, no WebGL. mountStage caps device pixel ratio and
 * pauses on IntersectionObserver.
 *
 * ── Reduced motion means less moving, not less working ────────────────────
 *
 * It used to mean the loop stopped after one frame, which produced a composed
 * still figure and a dead one: selecting a region changed nothing on screen,
 * so somebody with the setting on got a handsome diagram permanently stuck on
 * whichever region rendered first. Now the movement is dropped — no breath, no
 * motes, no drift, no travelling charge, no autocycle — and the selection is
 * kept, repainting a single composed frame each time the region changes.
 */

interface Star {
  /** Normalised to a 100 × 200 figure, origin at the top of the head. */
  x: number;
  y: number;
  /** Bigger stars are the anchor points — joints, organs, the crown. */
  mag: number;
  region: string;
}

/** The figure. Anchors first, then the chain that strings them. */
const STARS: Star[] = [
  // Head and throat
  { x: 50, y: 8, mag: 1.6, region: "crown" },
  { x: 44, y: 14, mag: 0.8, region: "crown" },
  { x: 56, y: 14, mag: 0.8, region: "crown" },
  { x: 50, y: 21, mag: 1.2, region: "throat" },

  // Shoulders and arms
  { x: 34, y: 28, mag: 1.4, region: "arms" },
  { x: 66, y: 28, mag: 1.4, region: "arms" },
  { x: 24, y: 44, mag: 1.0, region: "arms" },
  { x: 76, y: 44, mag: 1.0, region: "arms" },
  { x: 18, y: 62, mag: 1.1, region: "arms" },
  { x: 82, y: 62, mag: 1.1, region: "arms" },

  // Heart and lungs
  { x: 50, y: 34, mag: 1.8, region: "heart" },
  { x: 40, y: 38, mag: 0.9, region: "heart" },
  { x: 60, y: 38, mag: 0.9, region: "heart" },

  // The middle — liver, gut, the whole engine room
  { x: 50, y: 48, mag: 1.5, region: "gut" },
  { x: 41, y: 52, mag: 0.9, region: "gut" },
  { x: 59, y: 52, mag: 0.9, region: "gut" },
  { x: 50, y: 60, mag: 1.3, region: "gut" },

  // Pelvis and the deep reserve
  { x: 42, y: 70, mag: 1.4, region: "root" },
  { x: 58, y: 70, mag: 1.4, region: "root" },
  { x: 50, y: 74, mag: 1.1, region: "root" },

  // Legs
  { x: 40, y: 92, mag: 1.0, region: "legs" },
  { x: 60, y: 92, mag: 1.0, region: "legs" },
  { x: 38, y: 116, mag: 1.2, region: "legs" },
  { x: 62, y: 116, mag: 1.2, region: "legs" },
  { x: 36, y: 140, mag: 0.9, region: "legs" },
  { x: 64, y: 140, mag: 0.9, region: "legs" },
  { x: 35, y: 160, mag: 1.1, region: "legs" },
  { x: 65, y: 160, mag: 1.1, region: "legs" },
];

/** The fascia. Indices into STARS — one continuous web, not a skeleton. */
const FASCIA: [number, number][] = [
  [0, 1], [0, 2], [1, 3], [2, 3],
  [3, 4], [3, 5], [3, 10],
  [4, 6], [6, 8], [5, 7], [7, 9],
  [4, 11], [5, 12], [10, 11], [10, 12],
  [11, 13], [12, 13], [13, 14], [13, 15],
  [14, 16], [15, 16],
  [16, 17], [16, 18], [17, 19], [18, 19],
  [17, 20], [18, 21],
  [20, 22], [21, 23], [22, 24], [23, 25], [24, 26], [25, 27],
  // The long lines: the chains that actually run the length of the body.
  [4, 17], [5, 18], [10, 16], [13, 19],
];

/** Edges touching each star, so a particle can pick a way onward. */
const EDGES_AT: number[][] = STARS.map(() => []);
FASCIA.forEach(([a, b], i) => {
  EDGES_AT[a].push(i);
  EDGES_AT[b].push(i);
});

export interface BodyRegion {
  key: string;
  name: string;
  reads: string;
}

/**
 * Geometry, not taxonomy.
 *
 * These names describe where the stars are. The vocabulary a visitor reads
 * lives in data/bodyMap.ts and is free to be the conceptual model instead —
 * see the header there. `name` and `reads` are not rendered anywhere.
 */
export const BODY_REGIONS: BodyRegion[] = [
  { key: "crown", name: "Crown", reads: "Light, sleep, the clock." },
  { key: "throat", name: "Breath", reads: "The switch between states." },
  { key: "heart", name: "Heart", reads: "Circulation, and the settling of it." },
  { key: "gut", name: "The Middle", reads: "Liver, gut, lymph." },
  { key: "root", name: "Root", reads: "The deep reserve." },
  { key: "arms", name: "Frame", reads: "What carries load." },
  { key: "legs", name: "The Pump", reads: "Lymph moves when you move." },
];

/**
 * Which systems answer which, and how strongly.
 *
 * Written as relationships rather than "everything affects everything" — a
 * figure where the whole body lights at 20% whenever anything is touched says
 * nothing at all. A strong neighbour is a quarter, a secondary is an eighth.
 */
const NEIGHBOURS: Record<string, { key: string; w: number }[]> = {
  crown: [{ key: "throat", w: 0.25 }, { key: "root", w: 0.12 }],
  throat: [{ key: "legs", w: 0.25 }, { key: "root", w: 0.25 }, { key: "heart", w: 0.12 }],
  root: [{ key: "arms", w: 0.25 }, { key: "throat", w: 0.25 }],
  heart: [{ key: "gut", w: 0.25 }, { key: "legs", w: 0.25 }],
  gut: [{ key: "heart", w: 0.25 }, { key: "legs", w: 0.25 }],
  legs: [{ key: "throat", w: 0.25 }, { key: "gut", w: 0.12 }, { key: "arms", w: 0.12 }],
  arms: [{ key: "root", w: 0.25 }, { key: "legs", w: 0.15 }],
};

/**
 * Where each region can be touched — declared, not derived.
 *
 * This was the mean of a region's stars, and for the paired regions that is
 * demonstrably the wrong place. Arms and legs are symmetric, so their centroid
 * lands on the midline — in the middle of the chest, where no arm is. Touching
 * a hand at (18, 62) measured 36 to the arms centroid and 33 to the gut's, so
 * the hand lit The Middle. Clever nearest-point maths that is occasionally,
 * confidently wrong is worse than large zones that are simply right.
 *
 * So: hand-placed circles in figure space, several per region where the region
 * has several places. Overlaps resolve by `d / r`, which lets a small zone hold
 * its ground inside a big one — the throat keeps its own target even though the
 * arm zones reach across it. Outside every zone, `pick` returns null and the
 * figure goes back to demonstrating itself.
 */
const HIT: Record<string, { x: number; y: number; r: number }[]> = {
  crown: [{ x: 50, y: 11, r: 13 }],
  throat: [{ x: 50, y: 22, r: 10 }],
  heart: [{ x: 50, y: 36, r: 13 }],
  gut: [{ x: 50, y: 54, r: 15 }],
  root: [{ x: 50, y: 71, r: 12 }],
  // Shoulders/upper arm, then forearm and hand.
  arms: [
    { x: 33, y: 30, r: 13 },
    { x: 67, y: 30, r: 13 },
    { x: 20, y: 53, r: 15 },
    { x: 80, y: 53, r: 15 },
  ],
  // Thigh-and-knee, then shin-and-foot. The pairs overlap on purpose: two
  // circles that merely touch leave a dead band across the middle of the shin.
  legs: [
    { x: 39, y: 104, r: 26 },
    { x: 61, y: 104, r: 26 },
    { x: 36, y: 146, r: 24 },
    { x: 64, y: 146, r: 24 },
  ],
};

/** A particle riding the fascia. */
interface Mote {
  edge: number;
  /** 0…1 along the edge, in the direction `dir`. */
  k: number;
  dir: 1 | -1;
  speed: number;
  seed: number;
}

const MOTES = 42;
const NO_MOTES: Mote[] = [];

/**
 * ── One state, several inputs ─────────────────────────────────────────────
 *
 * Hover, tap, the selector beside the figure, the keyboard and the autocycle
 * are five ways of saying the same sentence, and they all resolve to one key.
 * The canvas used to own that key, which meant the page beside it could only
 * ever listen. It now *renders* the key and *requests* changes to it:
 *
 *     body interaction ─┐
 *     region control ───┼→ activeKey → canvas + panel
 *     autocycle ────────┘
 *
 * `value` is optional so the uncontrolled use still works — the homepage hero
 * has no owner for the state and still needs the cycle to move.
 */
export function ConstellationBody({
  className,
  /** The lit region. Omit to let the figure keep its own. */
  value,
  /**
   * Fires with the region key whenever the figure wants a different region —
   * pointer, tap or cycle.
   *
   * Called on change only, never per frame. `lit` is read sixty times a second
   * and a React setter at that rate would re-render the page under the canvas.
   * React hears "region changed", never "frame changed".
   */
  onActive,
  /**
   * Home passes false. The hero figure gets the resting life — breath, depth,
   * drift — and none of the teaching behaviour, because the full interaction
   * belongs to /the-body-map and the hero is a signature rather than a lesson.
   */
  interactive = true,
  /**
   * Stops the cycle advancing while somebody is working the selector with a
   * keyboard. Without it the selection moves under a screen-reader user every
   * five seconds — the focused control quietly changing state on its own is
   * the one thing a tablist must never do.
   */
  paused = false,
}: {
  className?: string;
  value?: string;
  onActive?: (key: string) => void;
  interactive?: boolean;
  paused?: boolean;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  const [reduced] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );

  const [selfKey, setSelfKey] = useState(BODY_REGIONS[0].key);
  const lit = value ?? selfKey;

  const litRef = useRef(lit);
  const onActiveRef = useRef(onActive);
  const interactiveRef = useRef(interactive);
  const pausedRef = useRef(paused);
  litRef.current = lit;
  onActiveRef.current = onActive;
  interactiveRef.current = interactive;
  pausedRef.current = paused;

  /** Paints one frame. The only way anything moves under reduced motion. */
  const repaintRef = useRef<(() => void) | null>(null);

  /**
   * Wall clock, in ms, until which the autocycle stands down.
   *
   * Deliberately not the breath clock the draw runs on: under reduced motion
   * the draw is not running, and the cycle still has to know it was interrupted.
   */
  const suspendUntilRef = useRef(0);
  /**
   * The last key this figure asked for, so a change it did *not* ask for can
   * be recognised as somebody else's input and treated as an interruption.
   */
  const requestedRef = useRef<string>(value ?? BODY_REGIONS[0].key);

  const requestRef = useRef<(key: string) => void>(() => {});
  requestRef.current = (key: string) => {
    if (key === litRef.current) return;
    requestedRef.current = key;
    setSelfKey(key);
    onActiveRef.current?.(key);
  };

  // Somebody outside chose a region — the selector, or the keyboard. The
  // figure follows, and the cycle gets out of the way for as long as a tap.
  useEffect(() => {
    if (value === undefined || value === requestedRef.current) return;
    requestedRef.current = value;
    suspendUntilRef.current = Date.now() + 14_000;
  }, [value]);

  // Under reduced motion there is no loop to notice the change, so it has to
  // be painted explicitly.
  useEffect(() => {
    if (reduced) repaintRef.current?.();
  }, [lit, reduced]);

  // The cycle picks up from wherever the region currently is rather than from
  // its own counter, so a selection moves it rather than fighting it.
  useEffect(() => {
    // No automatic cycling under reduced motion: an unasked-for change every
    // five seconds is the thing the setting exists to turn off.
    if (reduced) return;
    const timer = setInterval(() => {
      if (pausedRef.current || Date.now() < suspendUntilRef.current) return;
      const i = BODY_REGIONS.findIndex((r) => r.key === litRef.current);
      requestRef.current(BODY_REGIONS[(i + 1) % BODY_REGIONS.length].key);
    }, 5200);
    return () => clearInterval(timer);
  }, [reduced]);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;

    /** Set by the tap handler below, consumed on the next frame. */
    let tapped: { x: number; y: number } | null = null;
    /**
     * A finger is not a hovering mouse.
     *
     * mountStage reports any pointer as `inside`, and on a touchscreen a
     * *scroll* is a stream of pointermove events. Left alone, dragging the page
     * past the figure hovered every region the finger swept over — so the panel
     * beside it thrashed through four headings while somebody was only trying
     * to get down the page, and the whole figure leaned toward the thumb as it
     * went. The page still scrolled; it just narrated itself while you did it.
     *
     * Touch therefore gets the tap path only, which is the deliberate gesture.
     * Latched rather than cleared on release, because a device that has sent
     * one touch has no hover to go back to.
     */
    let touchInput = false;
    const onDown = (e: PointerEvent) => {
      if (e.pointerType === "touch") touchInput = true;
      if (!interactiveRef.current) return;
      const rect = canvas.getBoundingClientRect();
      tapped = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      // Under reduced motion no frame is coming along to consume it.
      repaintRef.current?.();
    };
    const onMoveKind = (e: PointerEvent) => {
      if (e.pointerType === "touch") touchInput = true;
    };
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMoveKind);

    const teardown = mountStage(
      canvas,
      (S) => {
      /** Primary activation, eased so regions fade rather than switch. */
      const level: Record<string, number> = {};
      /** Primary plus what the neighbours lend it. */
      const act: Record<string, number> = {};
      BODY_REGIONS.forEach((r) => {
        level[r.key] = 0;
        act[r.key] = 0;
      });

      const motes: Mote[] = Array.from({ length: MOTES }, (_, i) => ({
        edge: Math.floor(hash01(i, 7.3) * FASCIA.length),
        k: hash01(i, 19.1),
        dir: hash01(i, 3.7) > 0.5 ? 1 : -1,
        speed: 0.09 + hash01(i, 11.9) * 0.11,
        seed: i,
      }));

      // Scratch, reused every frame so the draw allocates nothing.
      const px = new Float32Array(STARS.length);
      const py = new Float32Array(STARS.length);

      let prev = 0;

      return (t) => {
        const { ctx, w, h } = S;
        const dt = Math.min(0.05, prev === 0 ? 0.016 : t - prev);
        prev = t;
        // Reduced motion keeps the composition and drops the movement: no
        // breath, no motes, no drift, no travelling charge. What survives is
        // the part that carries meaning — which region is being talked about.
        const still = S.reduced;
        const breath = still ? 0 : breathAt(t);
        ctx.clearRect(0, 0, w, h);

        // The figure occupies x 18…82 and y 8…160. Fitting to its actual
        // extent — rather than to the nominal 100 × 200 box — is what keeps
        // the feet on the canvas at every size.
        const FIG_W = 64;
        const FIG_H = 152;
        const FIG_CX = 50;
        const FIG_CY = 84;
        // 0.82/0.84, not 0.9/0.94 — the figure has to leave room for its own
        // light. Every star paints a halo of radius r*7 and the anchor stars
        // throw flare arms of up to 6.6r; filling 94% of the height clipped
        // the crown's halo against the canvas edge on a dead straight line.
        const scale = Math.min((w * 0.82) / FIG_W, (h * 0.84) / FIG_H);

        // ── Depth ────────────────────────────────────────────
        // Four planes, shifted by a few pixels each. Small on purpose: this
        // is a figure suspended in space, not a parallax demo. The body plane
        // moves least of the moving ones because it is the thing being looked
        // at — the sense of depth comes from what sits behind and in front of
        // it drifting differently.
        // Everything a pointer drives — depth, attraction, hover — is gated on
        // this rather than on S.inside, so a scrolling finger moves nothing.
        // Hover needs a running loop to be worth anything, so under reduced
        // motion the tap is the way in and the pointer is left alone.
        const hovering = S.inside && !touchInput && !still;

        const pxN = hovering ? (S.px - w / 2) / (w / 2) : 0;
        const pyN = hovering ? (S.py - h / 2) / (h / 2) : 0;
        const plane = (depth: number) => ({ x: -pxN * depth, y: -pyN * depth });
        const planeBack = plane(2);
        const planeFlow = plane(5);
        const planeBody = plane(7);
        const planeInfo = plane(9);

        const ox = w / 2 - FIG_CX * scale;
        const oy = h / 2 - FIG_CY * scale;

        // ── Interaction ──────────────────────────────────────
        // Declared zones rather than nearest anything. A thumb cannot find a
        // 3px point, and a pointer should not have to. `d / r` so a small zone
        // still wins inside a large one that overlaps it.
        const pick = (cx: number, cy: number) => {
          let best = Infinity;
          let key: string | null = null;
          for (const r of BODY_REGIONS) {
            for (const z of HIT[r.key] ?? []) {
              const d = Math.hypot(ox + z.x * scale - cx, oy + z.y * scale - cy) / (z.r * scale);
              if (d < best) {
                best = d;
                key = r.key;
              }
            }
          }
          return best <= 1 ? key : null;
        };

        if (interactiveRef.current) {
          if (tapped) {
            // A tap is deliberate, and on a phone it is the *only* way in —
            // there is no hover to keep it alive while the copy is read. Long
            // enough to finish the panel beside it: a tradition line, a name,
            // the anatomy, what it governs, the lens, the measure.
            const k = pick(tapped.x, tapped.y);
            if (k) {
              suspendUntilRef.current = Date.now() + 14_000;
              requestRef.current(k);
            }
            tapped = null;
          }
          if (hovering) {
            const k = pick(S.px, S.py);
            // Refreshed every frame the pointer is near, so the cycle only
            // starts counting again once it actually leaves. Never shortens an
            // existing hold — a tap outranks a mouse passing over.
            if (k) {
              suspendUntilRef.current = Math.max(suspendUntilRef.current, Date.now() + 1200);
              requestRef.current(k);
            }
          }
        }

        const lit = litRef.current;

        // Primary eases toward its target; act adds what the neighbours lend.
        // Snapped rather than eased when still, because there is only one frame
        // and a region caught 5% of the way in reads as nothing selected.
        for (const r of BODY_REGIONS) {
          const target = r.key === lit ? 1 : 0;
          level[r.key] = still ? target : level[r.key] + (target - level[r.key]) * 0.05;
        }
        for (const r of BODY_REGIONS) act[r.key] = level[r.key];
        for (const r of BODY_REGIONS) {
          for (const n of NEIGHBOURS[r.key] ?? []) {
            act[n.key] = Math.min(1, act[n.key] + level[r.key] * n.w);
          }
        }

        // ── Behaviours ───────────────────────────────────────
        // Each region moves the way the thing it stands for moves. A shared
        // gold pulse would teach nothing.

        // Breath & Pressure — the ribs widen and a wave travels down.
        const breathGain = 1 + act.throat * 2.4;
        const waveY = 24 + ((t * 0.42) % 1) * 58;

        // The Central Axis — a conduction pulse down the spine.
        const axisY = 6 + ((t * 0.5) % 1) * 72;

        // The Middle — a slow rotation through the abdomen.
        const churn = t * 0.7;

        // Structure & Strength — lines tension and the frame gathers upright.
        const tension = act.arms;

        for (let i = 0; i < STARS.length; i++) {
          const s = STARS[i];
          let fx = s.x;
          let fy = s.y;

          // Resting breath, local to the diaphragm. A gaussian centred just
          // under the ribs, so the chest and belly move and the head and feet
          // do not. Scaling the whole silhouette would read as a balloon.
          const dFromDia = s.y - 44;
          const local = Math.exp(-(dFromDia * dFromDia) / (2 * 20 * 20));
          fx += (s.x - 50) * 0.030 * breath * local * breathGain;
          fy += 0.85 * breath * local * breathGain;

          // The pressure wave, only while Breath is answering.
          if (!still && act.throat > 0.02) {
            const dw = Math.abs(s.y - waveY);
            if (dw < 12) fy += Math.cos((dw / 12) * Math.PI * 0.5) * 0.5 * act.throat;
          }

          // The Middle turns rather than blinks.
          if (!still && act.gut > 0.02 && s.region === "gut") {
            fx += Math.cos(churn + i) * 0.7 * act.gut;
            fy += Math.sin(churn + i) * 0.5 * act.gut;
          }

          // The frame gathers: limbs draw very slightly toward the axis and
          // the whole figure stands a touch taller.
          if (tension > 0.02) {
            fx += (50 - s.x) * 0.012 * tension;
            fy -= (s.y - 84) * 0.008 * tension;
          }

          let X = ox + fx * scale + planeBody.x;
          let Y = oy + fy * scale + planeBody.y;

          // The body noticed you. 1–3px, and it returns — this is attention,
          // not gravity, and it must never deform the anatomy.
          if (hovering) {
            const dx = S.px - X;
            const dy = S.py - Y;
            const d = Math.hypot(dx, dy);
            const reach = 120;
            if (d < reach && d > 0.001) {
              const pullAmt = (1 - d / reach) ** 2 * 3;
              X += (dx / d) * pullAmt;
              Y += (dy / d) * pullAmt;
            }
          }

          px[i] = X;
          py[i] = Y;
        }

        // ── Fascia ──────────────────────────────────────────────
        for (let e = 0; e < FASCIA.length; e++) {
          const [a, b] = FASCIA[e];
          const heat = Math.max(act[STARS[a].region] ?? 0, act[STARS[b].region] ?? 0);

          ctx.beginPath();
          ctx.moveTo(px[a] + planeFlow.x - planeBody.x, py[a] + planeFlow.y - planeBody.y);
          ctx.lineTo(px[b] + planeFlow.x - planeBody.x, py[b] + planeFlow.y - planeBody.y);
          ctx.strokeStyle = `rgba(214,178,104,${0.16 + heat * 0.46 + breath * 0.05})`;
          ctx.lineWidth = 0.9 + heat * 1.1 + tension * 0.7;
          ctx.stroke();

          // A charge travelling the line, away from the lit region.
          if (!still && heat > 0.12) {
            const from = (act[STARS[a].region] ?? 0) >= (act[STARS[b].region] ?? 0) ? a : b;
            const to = from === a ? b : a;
            const k = (t * 0.55 + a * 0.17 + b * 0.11) % 1;
            const cx = px[from] + (px[to] - px[from]) * k;
            const cy = py[from] + (py[to] - py[from]) * k;
            const fade = Math.sin(k * Math.PI);
            ctx.beginPath();
            ctx.arc(cx, cy, 1.5 * scale * 0.5 + 0.8, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(255,247,224,${heat * fade})`;
            ctx.fill();
          }
        }

        // ── Flow ────────────────────────────────────────────────
        // Motes ride the fascia rather than drifting at random, and they hand
        // off at junctions instead of looping a visible circuit. They fade at
        // both ends of every edge, which is what reads as passing through the
        // body rather than around it.
        const flowGain = 0.55 + act.legs * 1.9 + breath * 0.25;
        // Flow is movement all the way down; there is no still version of
        // it, so under reduced motion it is absent rather than frozen.
        for (const m of still ? NO_MOTES : motes) {
          const [ea, eb] = FASCIA[m.edge];
          const from = m.dir === 1 ? ea : eb;
          const to = m.dir === 1 ? eb : ea;

          m.k += m.speed * flowGain * dt;
          if (m.k >= 1) {
            // Hand off to another line out of the junction just reached.
            const opts = EDGES_AT[to];
            const next = opts[Math.floor(hash01(m.seed + t * 13.7, 5.1) * opts.length) % opts.length];
            m.edge = next;
            m.dir = FASCIA[next][0] === to ? 1 : -1;
            m.k = 0;
            continue;
          }

          const x = px[from] + (px[to] - px[from]) * m.k + planeFlow.x - planeBody.x;
          const y = py[from] + (py[to] - py[from]) * m.k + planeFlow.y - planeBody.y;
          // Into the body and back out, rather than a bead on a wire.
          const fade = Math.sin(m.k * Math.PI);
          const heat = Math.max(act[STARS[from].region] ?? 0, act[STARS[to].region] ?? 0);
          const alpha = (0.10 + heat * 0.5) * fade;
          if (alpha < 0.01) continue;
          ctx.beginPath();
          ctx.arc(x, y, (0.8 + heat * 1.1) * Math.max(0.7, scale / 3), 0, Math.PI * 2);
          ctx.fillStyle = `rgba(226,205,158,${alpha})`;
          ctx.fill();
        }

        // ── Stars ───────────────────────────────────────────────
        for (let i = 0; i < STARS.length; i++) {
          const s = STARS[i];
          const heat = act[s.region] ?? 0;
          const X = px[i];
          const Y = py[i];

          // Mind & Awareness is finer and quicker than the rest — small
          // coherent pulses rather than a broad swell.
          const fine = s.region === "crown" ? 1 + act.crown * 1.6 : 1;
          const twinkle = still ? 0.5 : 0.5 + 0.5 * Math.sin(t * 1.1 * fine + hash01(i, 31.7) * 12);

          // The Organ Network answers itself: internal territories pulse on
          // staggered phases so the eye reads relationship, never one organ
          // blinking alone.
          let organ = 0;
          if (!still && (s.region === "heart" || s.region === "gut") && act.heart > 0.02) {
            organ = Math.max(0, Math.sin(t * 1.6 - i * 0.9)) * act.heart * 0.9;
          }

          // The spine conducts, crown to root, in sequence.
          let axis = 0;
          if (!still && act.root > 0.02 && Math.abs(s.x - 50) < 9) {
            const d = Math.abs(s.y - axisY);
            if (d < 14) axis = Math.cos((d / 14) * Math.PI * 0.5) * act.root;
          }

          const boost = heat + organ * 0.6 + axis * 0.7;
          const r = (s.mag * 1.9 + boost * 2.6) * (0.85 + twinkle * 0.15) * Math.max(0.7, scale / 3);
          const alpha = 0.5 + boost * 0.5 + breath * 0.1;

          const glow = 0.16 + boost * 0.36;
          const halo = ctx.createRadialGradient(X, Y, 0, X, Y, r * 7);
          halo.addColorStop(0, `rgba(235,211,162,${glow})`);
          halo.addColorStop(1, "rgba(235,211,162,0)");
          ctx.fillStyle = halo;
          ctx.beginPath();
          ctx.arc(X, Y, r * 7, 0, Math.PI * 2);
          ctx.fill();

          ctx.beginPath();
          ctx.arc(X, Y, r, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(247,240,222,${Math.min(1, alpha)})`;
          ctx.fill();

          // The anchor stars flare four-pointed when their region is lit.
          // Drawn on the information plane: it is the layer that says which
          // thing is being talked about, so it sits nearest the viewer.
          if (s.mag > 1.2 && boost > 0.15) {
            const arm = r * (4 + boost * 2.6);
            const ax = X + planeInfo.x - planeBody.x;
            const ay = Y + planeInfo.y - planeBody.y;
            ctx.strokeStyle = `rgba(240,219,175,${Math.min(1, boost) * 0.75})`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(ax - arm, ay);
            ctx.lineTo(ax + arm, ay);
            ctx.moveTo(ax, ay - arm);
            ctx.lineTo(ax, ay + arm);
            ctx.stroke();
          }
        }

        // A single faint ring on the background plane. It is the only thing
        // back there, and it exists so the two nearer planes have something
        // to be in front of.
        ctx.beginPath();
        ctx.arc(
          w / 2 + planeBack.x,
          h / 2 + planeBack.y,
          Math.min(w, h) * 0.42,
          0,
          Math.PI * 2,
        );
        ctx.strokeStyle = `rgba(214,178,104,${0.05 + breath * 0.03})`;
        ctx.lineWidth = 1;
        ctx.stroke();
        };
      },
      { controls: (h) => (repaintRef.current = h.repaint) },
    );

    return () => {
      repaintRef.current = null;
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMoveKind);
      teardown();
    };
  }, []);

  return (
    <div className="relative">
      <canvas
        ref={ref}
        className={`w-full h-[34rem] sm:h-[46rem] lg:h-[52rem] ${
          interactive ? "cursor-pointer touch-manipulation" : ""
        } ${className ?? ""}`}
        aria-hidden="true"
        data-testid="constellation-body"
      />
    </div>
  );
}
