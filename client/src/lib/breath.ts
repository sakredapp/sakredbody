/**
 * One clock for the whole site.
 *
 * A page feels alive when its motion is correlated — the way a room of plants
 * moves on one draught. Every ambient canvas reads its swell from here rather
 * than from a private timer, so the page inhales as a whole instead of being a
 * dozen unrelated effects running side by side.
 *
 * Four counts in, six counts out. The epoch is module load, so a canvas that
 * mounts late is still in phase with one that mounted on first paint.
 */

export const BREATH_CYCLE = 10;
export const BREATH_IN = 4;

const EPOCH = typeof performance !== "undefined" ? performance.now() : 0;

/** Seconds since the shared epoch. Pass a `performance.now()` reading. */
export function elapsed(now: number) {
  return (now - EPOCH) / 1000;
}

export type BreathPhase = "inhale" | "exhale";

/**
 * 0 at the bottom of the exhale, 1 at the top of the inhale, smoothstepped so
 * the turn at each end is soft rather than a corner.
 */
export function breathAt(seconds: number) {
  const p = ((seconds % BREATH_CYCLE) + BREATH_CYCLE) % BREATH_CYCLE;
  const inFrac = BREATH_IN / BREATH_CYCLE;
  const raw = p < BREATH_IN ? p / BREATH_IN : 1 - (p / BREATH_CYCLE - inFrac) / (1 - inFrac);
  return raw * raw * (3 - 2 * raw);
}

export function phaseAt(seconds: number): BreathPhase {
  const p = ((seconds % BREATH_CYCLE) + BREATH_CYCLE) % BREATH_CYCLE;
  return p < BREATH_IN ? "inhale" : "exhale";
}

/** Whole seconds left in the current phase — for a pacer that counts down. */
export function countdownAt(seconds: number) {
  const p = ((seconds % BREATH_CYCLE) + BREATH_CYCLE) % BREATH_CYCLE;
  return p < BREATH_IN
    ? Math.max(1, Math.ceil(BREATH_IN - p))
    : Math.max(1, Math.ceil(BREATH_CYCLE - p));
}
