/**
 * Vitals — one organism, one clock.
 *
 * The brief was that the app should feel alive rather than drawn. The mistake
 * most attempts make is animating things *separately*: a pulsing button here,
 * a floating card there. That reads as a page with animations on it, not as a
 * living thing, because a body has one heart and one set of lungs and
 * everything in it moves to those.
 *
 * So this is a single global clock. Every component subscribes to the same
 * breath and the same pulse. When the page breathes, all of it breathes
 * together — that synchrony is the whole effect.
 *
 * ── What actually reads as alive ──────────────────────────────────────────
 *
 * 1. BREATH is the strongest signal, and it must not be a sine wave. Real
 *    breath is asymmetric: a shorter rise, a pause at the top, a longer fall,
 *    a rest at the bottom. A sine reads mechanical within about ten seconds.
 *
 * 2. PULSE is faster, sharper and subtler. A heartbeat is a fast systolic
 *    spike, a dip, a smaller secondary bump (the dicrotic notch as the aortic
 *    valve closes), then decay. Two beats, not one.
 *
 * 3. COUPLING is the detail that sells it. In a real body the heart speeds up
 *    on the inhale and slows on the exhale — respiratory sinus arrhythmia. So
 *    the pulse here is driven by the breath rather than running independently.
 *    Two rhythms that know about each other feel like one organism; two that
 *    don't feel like two timers.
 *
 * 4. DRIFT. Nothing living repeats exactly. A slow noise field detunes
 *    everything a little, forever, so no loop is ever quite the same.
 *
 * ── Cost ──────────────────────────────────────────────────────────────────
 *
 * One rAF loop for the entire app, whatever the number of subscribers. It
 * stops when the tab is hidden and when nobody is listening, and honours
 * prefers-reduced-motion by freezing at a resting pose rather than by
 * disappearing.
 */

export interface Vitals {
  /** Seconds since the clock started. Drifts, never resets. */
  t: number;

  /** 0..1 through the breath cycle. */
  breathPhase: number;
  /** -1 (fully out) .. 1 (fully in). The one most components want. */
  breath: number;
  /** Which part of the cycle we're in. */
  breathStage: "in" | "hold" | "out" | "rest";

  /** 0..1 through the current beat. */
  pulsePhase: number;
  /** 0..1 — sharp rise, dicrotic notch, decay. Mostly near zero. */
  pulse: number;
  /** Beats per minute right now. Varies with the breath. */
  bpm: number;

  /** Slow wander in -1..1. Use to detune anything that would otherwise loop. */
  drift: number;
  /** A second, faster wander, uncorrelated with the first. */
  drift2: number;

  /** True when the user asked for less motion. Hold a resting pose. */
  reduced: boolean;
}

// ─── Tuning ────────────────────────────────────────────────────────────────

/**
 * 5.5 breaths per minute — the rate that shows up in coherent-breathing
 * practice, and slow enough to read as calm rather than as anxious. ~10.9s.
 */
const BREATHS_PER_MINUTE = 5.5;
const BREATH_PERIOD = 60 / BREATHS_PER_MINUTE;

/** Proportions of one breath. They sum to 1. */
const INHALE = 0.34;
const HOLD = 0.08;
const EXHALE = 0.44;
const REST = 0.14;

/** Resting heart rate, before the breath pushes it around. */
const BASE_BPM = 58;
/** How much the breath swings it. ±6bpm is within a normal person's range. */
const BPM_SWING = 6;

// ─── Curves ────────────────────────────────────────────────────────────────

/** Smooth 0→1 with zero velocity at both ends. Bodies don't start abruptly. */
function smooth(x: number): number {
  const c = Math.min(1, Math.max(0, x));
  return c * c * (3 - 2 * c);
}

/**
 * The breath, as amplitude in 0..1 across the cycle.
 *
 * Deliberately not a sine. The inhale is quicker than the exhale, there's a
 * pause at the top, and the bottom rests — which is what makes it read as
 * breathing rather than as oscillating.
 */
function breathAmplitude(phase: number): { value: number; stage: Vitals["breathStage"] } {
  let p = phase;

  if (p < INHALE) return { value: smooth(p / INHALE), stage: "in" };
  p -= INHALE;

  if (p < HOLD) return { value: 1, stage: "hold" };
  p -= HOLD;

  if (p < EXHALE) return { value: 1 - smooth(p / EXHALE), stage: "out" };

  return { value: 0, stage: "rest" };
}

/**
 * One heartbeat in 0..1.
 *
 * Two humps: the systolic spike, then the dicrotic notch — the smaller bounce
 * as the aortic valve shuts. A single pulse reads as a blink; two reads as a
 * heart. Most of the cycle is near zero, which is why a heartbeat feels like
 * punctuation rather than like throbbing.
 */
function beat(phase: number): number {
  if (phase > 0.55) return 0;

  // Systole: fast up, slower down.
  const systole =
    phase < 0.09
      ? smooth(phase / 0.09)
      : Math.max(0, 1 - smooth((phase - 0.09) / 0.16));

  // The notch, a third the height and later.
  const notch =
    phase > 0.26 && phase < 0.5
      ? 0.32 * Math.sin(((phase - 0.26) / 0.24) * Math.PI)
      : 0;

  return Math.min(1, systole + notch);
}

/** Cheap smooth value noise. Deterministic, no dependency. */
function noise(x: number, seed: number): number {
  const i = Math.floor(x);
  const f = x - i;
  const h = (n: number) => {
    const s = Math.sin((n + seed) * 127.1) * 43758.5453;
    return (s - Math.floor(s)) * 2 - 1;
  };
  return h(i) * (1 - smooth(f)) + h(i + 1) * smooth(f);
}

// ─── The clock ─────────────────────────────────────────────────────────────

type Listener = (v: Vitals) => void;

class Organism {
  private listeners = new Set<Listener>();
  private raf = 0;
  private start = 0;
  private last = 0;
  /** Integrated separately from t, because its rate keeps changing. */
  private beatAccumulator = 0;
  private reduced = false;
  private running = false;

  private current: Vitals = {
    t: 0,
    breathPhase: 0,
    breath: -1,
    breathStage: "rest",
    pulsePhase: 0,
    pulse: 0,
    bpm: BASE_BPM,
    drift: 0,
    drift2: 0,
    reduced: false,
  };

  constructor() {
    if (typeof window !== "undefined") {
      const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
      this.reduced = mq.matches;
      mq.addEventListener?.("change", (e) => {
        this.reduced = e.matches;
        this.emit();
      });

      // Nothing should animate behind a hidden tab.
      document.addEventListener("visibilitychange", () => {
        if (document.hidden) this.stop();
        else if (this.listeners.size > 0) this.play();
      });
    }
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    fn(this.current);
    if (this.listeners.size === 1) this.play();
    return () => {
      this.listeners.delete(fn);
      if (this.listeners.size === 0) this.stop();
    };
  }

  /** Read without subscribing — for imperative canvas loops. */
  read(): Vitals {
    return this.current;
  }

  private play() {
    if (this.running || typeof window === "undefined") return;
    this.running = true;
    this.start = performance.now() - this.current.t * 1000;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.tick);
  }

  private stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  private tick = (now: number) => {
    if (!this.running) return;

    // Clamp: a backgrounded tab can hand back a delta of many seconds, which
    // would fire a burst of beats the moment it returns.
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    const t = (now - this.start) / 1000;

    if (this.reduced) {
      // A resting pose: mid-exhale, no pulse. Still present, not moving.
      this.current = {
        ...this.current,
        t,
        breathPhase: 0,
        breath: -0.3,
        breathStage: "rest",
        pulsePhase: 0,
        pulse: 0,
        drift: 0,
        drift2: 0,
        reduced: true,
      };
      this.emit();
      this.raf = requestAnimationFrame(this.tick);
      return;
    }

    const drift = noise(t * 0.05, 0);
    const drift2 = noise(t * 0.17, 91.7);

    // Breath, detuned slightly and continuously so it never loops exactly.
    const period = BREATH_PERIOD * (1 + drift * 0.06);
    const breathPhase = (t % period) / period;
    const { value, stage } = breathAmplitude(breathPhase);

    // Respiratory sinus arrhythmia: faster in, slower out.
    const bpm = BASE_BPM + BPM_SWING * (value * 2 - 1) + drift2 * 1.5;

    this.beatAccumulator += (dt * bpm) / 60;
    const pulsePhase = this.beatAccumulator % 1;

    this.current = {
      t,
      breathPhase,
      breath: value * 2 - 1,
      breathStage: stage,
      pulsePhase,
      pulse: beat(pulsePhase),
      bpm,
      drift,
      drift2,
      reduced: false,
    };

    this.emit();
    this.raf = requestAnimationFrame(this.tick);
  };

  private emit() {
    for (const fn of this.listeners) fn(this.current);
  }
}

/** One per document. Every component shares this body. */
export const organism = new Organism();
