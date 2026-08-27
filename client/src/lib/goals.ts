/**
 * Turning what a member typed into a target, and back.
 *
 * A goal's target is stored in canonical units — metres, seconds, kilograms —
 * and entered in whatever a person actually says: a mile, six minutes flat,
 * 225 pounds. This is the only place that translation happens on the client,
 * for the same reason `server/training/routes.ts` converts weight at exactly
 * two points: a conversion that happens where it is convenient is a conversion
 * that eventually happens twice.
 */

import {
  parseTarget,
  type GoalTarget,
  type Measurement,
} from "@shared/models/goals";
import { lbToKg, kgToLb } from "@shared/models/training";

/** How a member enters distance. Metres are what gets stored. */
export const DISTANCE_UNITS = [
  { id: "mi", label: "miles", metres: 1609.34 },
  { id: "km", label: "km", metres: 1000 },
  { id: "m", label: "m", metres: 1 },
] as const;
export type DistanceUnit = (typeof DISTANCE_UNITS)[number]["id"];

export const FREQUENCY_WINDOWS = [
  { id: 7, label: "a week" },
  { id: 1, label: "a day" },
  { id: 30, label: "a month" },
] as const;

/**
 * Everything any of the seven kinds needs, in one bag.
 *
 * One state object rather than a form per kind, because a member changing
 * their mind about the kind mid-entry should not lose the number they already
 * typed — and because a form per kind is seven places for the same rounding
 * bug to live.
 */
export type TargetDraft = {
  /** m:ss or h:mm:ss, as typed. */
  time: string;
  distance: string;
  distanceUnit: DistanceUnit;
  reps: string;
  weight: string;
  minutes: string;
  count: string;
  perDays: number;
  amount: string;
  unit: string;
  direction: "up" | "down";
};

export const emptyDraft: TargetDraft = {
  time: "",
  distance: "",
  distanceUnit: "mi",
  reps: "",
  weight: "",
  minutes: "",
  count: "",
  perDays: 7,
  amount: "",
  unit: "",
  direction: "up",
};

/**
 * "6:00" → 360. "1:30:00" → 5400. "90" → 90 seconds, not 90 minutes.
 *
 * A bare number is seconds because that is what the colon-less case means
 * everywhere else a time is typed, and because guessing minutes would turn a
 * mistyped "6" into a six-minute goal that was meant to be six seconds — the
 * wrong direction to be wrong in for something a member is measured against.
 */
export function parseClock(text: string): number | null {
  const parts = text.trim().split(":");
  if (parts.length > 3 || parts.some((p) => p === "" || !/^\d+$/.test(p))) return null;
  const numbers = parts.map(Number);
  if (numbers.some((n) => !Number.isFinite(n))) return null;
  if (numbers.length === 1) return numbers[0];
  if (numbers.length === 2) return numbers[0] * 60 + numbers[1];
  return numbers[0] * 3600 + numbers[1] * 60 + numbers[2];
}

const number = (text: string): number | null => {
  const v = Number(text.trim());
  return text.trim() !== "" && Number.isFinite(v) ? v : null;
};

const metresOf = (draft: TargetDraft): number | null => {
  const value = number(draft.distance);
  if (value === null) return null;
  const unit = DISTANCE_UNITS.find((u) => u.id === draft.distanceUnit);
  return unit ? value * unit.metres : null;
};

/**
 * The draft as a target, or null when it is not one yet.
 *
 * Null rather than a partial object, so a half-filled form cannot be submitted
 * and completed with zeros by the server's defaults. `parseTarget` is the same
 * validator the API uses, so the client refuses exactly what the server would.
 */
export function draftToTarget(
  measurement: Measurement,
  draft: TargetDraft,
  weightUnit: "kg" | "lb",
): GoalTarget | null {
  switch (measurement) {
    case "time_for_distance": {
      const seconds = parseClock(draft.time);
      const distanceM = metresOf(draft);
      return seconds && distanceM ? parseTarget(measurement, { distanceM, seconds }) : null;
    }
    case "reps": {
      const reps = number(draft.reps);
      return reps ? parseTarget(measurement, { reps }) : null;
    }
    case "load_reps": {
      const entered = number(draft.weight);
      const reps = number(draft.reps);
      if (!entered || !reps) return null;
      const weightKg = weightUnit === "lb" ? lbToKg(entered) : entered;
      return parseTarget(measurement, { weightKg, reps });
    }
    case "duration": {
      const minutes = number(draft.minutes);
      return minutes ? parseTarget(measurement, { seconds: minutes * 60 }) : null;
    }
    case "distance": {
      const distanceM = metresOf(draft);
      return distanceM ? parseTarget(measurement, { distanceM }) : null;
    }
    case "frequency": {
      const count = number(draft.count);
      return count ? parseTarget(measurement, { count, perDays: draft.perDays }) : null;
    }
    case "custom": {
      const amount = number(draft.amount);
      const unit = draft.unit.trim();
      return amount !== null && unit
        ? parseTarget(measurement, { amount, unit, direction: draft.direction })
        : null;
    }
  }
}

/**
 * A stored target back into the fields it came from.
 *
 * Used when editing, and when the progress sheet opens pre-filled with the
 * shape the goal is measured in. The distance unit is chosen to be the one a
 * member would recognise — a mile stored as 1609.34 m comes back as "1 mile",
 * not as "1609.34 m", because the second is a number nobody typed.
 */
export function targetToDraft(
  measurement: Measurement,
  target: GoalTarget,
  weightUnit: "kg" | "lb",
): TargetDraft {
  const draft = { ...emptyDraft };
  const fillDistance = (metres: number) => {
    const unit =
      metres % 1609.34 === 0 || Math.abs(metres / 1609.34 - Math.round(metres / 1609.34)) < 0.001
        ? DISTANCE_UNITS[0]
        : metres >= 1000
          ? DISTANCE_UNITS[1]
          : DISTANCE_UNITS[2];
    draft.distanceUnit = unit.id;
    const value = metres / unit.metres;
    draft.distance = String(Math.round(value * 100) / 100);
  };

  switch (measurement) {
    case "time_for_distance": {
      const t = target as { distanceM: number; seconds: number };
      draft.time = secondsToClock(t.seconds);
      fillDistance(t.distanceM);
      break;
    }
    case "reps":
      draft.reps = String((target as { reps: number }).reps);
      break;
    case "load_reps": {
      const t = target as { weightKg: number; reps: number };
      draft.weight = String(weightUnit === "lb" ? Math.round(kgToLb(t.weightKg)) : Math.round(t.weightKg));
      draft.reps = String(t.reps);
      break;
    }
    case "duration":
      draft.minutes = String(Math.round((target as { seconds: number }).seconds / 60));
      break;
    case "distance":
      fillDistance((target as { distanceM: number }).distanceM);
      break;
    case "frequency": {
      const t = target as { count: number; perDays: number };
      draft.count = String(t.count);
      draft.perDays = t.perDays;
      break;
    }
    case "custom": {
      const t = target as { amount: number; unit: string; direction: "up" | "down" };
      draft.amount = String(t.amount);
      draft.unit = t.unit;
      draft.direction = t.direction;
      break;
    }
  }
  return draft;
}

function secondsToClock(seconds: number): string {
  const whole = Math.round(seconds);
  const h = Math.floor(whole / 3600);
  const m = Math.floor((whole % 3600) / 60);
  const s = whole % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}
