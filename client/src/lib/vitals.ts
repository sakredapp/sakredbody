/**
 * Vitals — a heartbeat, layered onto the existing breath.
 *
 * `breath.ts` is the clock. It came first, eight pages read from it, and there
 * must only ever be one — two clocks is exactly the failure the shared-clock
 * design exists to prevent, and an earlier draft of this file was that second
 * clock. Everything here derives from `breathAt()` rather than re-deriving
 * time, so the pulse below is phase-locked to the breath every other canvas is
 * already following.
 *
 * What this adds that breath alone doesn't:
 *
 *   PULSE — faster, sharper, mostly near zero. A real beat is a systolic
 *   spike, a dip, then a smaller second bump as the aortic valve shuts. One
 *   hump reads as a blink; two reads as a heart.
 *
 *   COUPLING — the heart speeds up on the inhale and slows on the exhale.
 *   That's respiratory sinus arrhythmia, and it's the detail that makes two
 *   rhythms feel like one organism instead of two timers.
 *
 *   DRIFT — a slow wander, so nothing loops exactly.
 *
 * Pure functions over a timestamp. No rAF, no subscribers — `mountStage`
 * already runs the frame loop and hands every canvas the same `t`.
 */

import { breathAt, phaseAt, type BreathPhase } from "./breath";
import { noise2 } from "./canvasStage";

export interface Vitals {
  /** 0 at the bottom of the exhale, 1 at the top of the inhale. */
  breath: number;
  /** The same, as -1..1 — usually what you want for a swell. */
  swell: number;
  phase: BreathPhase;

  /** 0..1 through the current beat. */
  pulsePhase: number;
  /** 0..1 — sharp rise, dicrotic notch, decay. Near zero most of the time. */
  pulse: number;
  /** Beats per minute right now. Rises on the inhale. */
  bpm: number;

  /** Slow wander, -1..1. Detune anything that would otherwise loop. */
  drift: number;
  /** A second wander, uncorrelated with the first. */
  drift2: number;
}

/** Resting rate, before the breath pushes it around. */
const BASE_BPM = 58;
/** How far the breath swings it. ±6 is within a normal person's range. */
const BPM_SWING = 6;

/**
 * Beats have to be integrated rather than derived, because their rate keeps
 * changing — you can't take `t * bpm` when bpm is a function of t.
 *
 * Module-level, advanced once per distinct timestamp. Every canvas on the page
 * is handed the same `t` by `mountStage` in the same frame, so the guard means
 * ten canvases don't advance the heart ten times.
 */
let lastT = 0;
let beats = 0;

function advance(t: number) {
  if (t === lastT) return;
  // A backgrounded tab hands back a large jump; clamp so the heart doesn't
  // fire a burst of beats the moment it returns.
  const dt = Math.min(0.1, Math.max(0, t - lastT));
  lastT = t;
  const b = breathAt(t);
  beats += (dt * (BASE_BPM + BPM_SWING * (b * 2 - 1))) / 60;
}

/** Smooth 0→1, zero velocity at both ends. */
function smooth(x: number): number {
  const c = Math.min(1, Math.max(0, x));
  return c * c * (3 - 2 * c);
}

/**
 * One beat across 0..1.
 *
 * Systole is a fast rise and slower fall; the notch is a third the height and
 * later. Past 0.55 the heart is simply waiting, which is why a pulse reads as
 * punctuation rather than as throbbing.
 */
function beatShape(phase: number): number {
  if (phase > 0.55) return 0;

  const systole =
    phase < 0.09 ? smooth(phase / 0.09) : Math.max(0, 1 - smooth((phase - 0.09) / 0.16));

  const notch =
    phase > 0.26 && phase < 0.5 ? 0.32 * Math.sin(((phase - 0.26) / 0.24) * Math.PI) : 0;

  return Math.min(1, systole + notch);
}

/** Everything, for a given moment on the shared clock. */
export function vitalsAt(t: number): Vitals {
  advance(t);

  const breath = breathAt(t);
  const pulsePhase = beats % 1;

  return {
    breath,
    swell: breath * 2 - 1,
    phase: phaseAt(t),
    pulsePhase,
    pulse: beatShape(pulsePhase),
    bpm: BASE_BPM + BPM_SWING * (breath * 2 - 1),
    drift: noise2(t * 0.05, 0),
    drift2: noise2(0, t * 0.17 + 40),
  };
}

/**
 * The Opal detail: a tiny, fast oscillation riding the slow breath.
 *
 * Below the threshold of conscious notice — a few tenths of a pixel — but it
 * puts a ring under tension instead of leaving it drawn. `excite` climbs on
 * hover so the object answers when you approach it.
 */
export function resonance(t: number, excite = 0): number {
  const amplitude = 0.35 + excite * 1.6;
  const rate = 7.5 + excite * 5;
  return Math.sin(t * rate) * amplitude * (0.6 + breathAt(t) * 0.4);
}
