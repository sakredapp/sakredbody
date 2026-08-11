/**
 * When a habit is expected — and the difference between "not done" and
 * "not asked for".
 *
 * ── Why this is not a boolean ─────────────────────────────────────────────
 *
 * The obvious API is `isScheduled(date) → boolean`, and it is wrong twice.
 *
 * A sauna habit set to Mon/Wed/Sat is not owed on Tuesday. If Tuesday returns
 * false and the caller reads false as "not done", the member's Tuesday becomes
 * a miss for a thing nobody asked them to do — a habit tracker that invents
 * failures is worse than no habit tracker.
 *
 * And a weekly habit is owed *this week*, on no particular day. Wednesday is
 * neither a scheduled day nor an off day: it is a day you may do it, and not
 * doing it proves nothing until Sunday. Three states, because there are three.
 *
 *   scheduled  today counts. Missing it is a miss.
 *   open       today is available and doesn't count against you. Weekly,
 *              times-per-week and as-needed live here.
 *   off        outside the phase window, or paused, or not one of its days.
 *
 * Everything — home, Restore, Build, the coach portal, history, adherence —
 * calls this one function. Two implementations is how one screen calls
 * Wednesday a missed day and another says it was never scheduled.
 */

import { z } from "zod";

// ─── The shapes a schedule takes ───────────────────────────────────────────

export const SCHEDULE_KINDS = [
  "daily",
  "days_of_week",
  "times_per_week",
  "weekly",
  "as_needed",
] as const;
export type ScheduleKind = (typeof SCHEDULE_KINDS)[number];

/** 0 = Sunday, matching `Date.prototype.getUTCDay`. */
export const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export type Schedule =
  | { kind: "daily" }
  | { kind: "days_of_week"; days: number[] }
  | { kind: "times_per_week"; count: number }
  | { kind: "weekly" }
  | { kind: "as_needed" };

/**
 * Stored across three columns rather than one jsonb.
 *
 * jsonb would take any shape, including `{kind:"days_of_week"}` with no days,
 * and nothing would complain until a member's Monday quietly stopped
 * appearing. Three typed columns plus a CHECK constraint means the database
 * refuses that row.
 */
export type ScheduleColumns = {
  scheduleKind: string;
  scheduleDays: number[] | null;
  scheduleCount: number | null;
};

export const scheduleSchema: z.ZodType<Schedule> = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("daily") }),
  z.object({
    kind: z.literal("days_of_week"),
    days: z.array(z.number().int().min(0).max(6)).min(1).max(7),
  }),
  z.object({
    kind: z.literal("times_per_week"),
    count: z.number().int().min(1).max(7),
  }),
  z.object({ kind: z.literal("weekly") }),
  z.object({ kind: z.literal("as_needed") }),
]) as z.ZodType<Schedule>;

export function scheduleToColumns(s: Schedule): ScheduleColumns {
  return {
    scheduleKind: s.kind,
    scheduleDays: s.kind === "days_of_week" ? dedupeSorted(s.days) : null,
    scheduleCount: s.kind === "times_per_week" ? s.count : null,
  };
}

/** Unknown or half-written rows read as daily rather than throwing at a member. */
export function scheduleFromColumns(c: Partial<ScheduleColumns>): Schedule {
  switch (c.scheduleKind) {
    case "days_of_week": {
      const days = dedupeSorted(c.scheduleDays ?? []);
      return days.length ? { kind: "days_of_week", days } : { kind: "daily" };
    }
    case "times_per_week":
      return { kind: "times_per_week", count: Math.max(1, Math.min(7, c.scheduleCount ?? 3)) };
    case "weekly":
      return { kind: "weekly" };
    case "as_needed":
      return { kind: "as_needed" };
    default:
      return { kind: "daily" };
  }
}

function dedupeSorted(days: number[]): number[] {
  return Array.from(
    new Set(days.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)),
  ).sort((a, b) => a - b);
}

/** "Mon, Wed and Sat" — what a member reads, never the enum value. */
export function describeSchedule(s: Schedule): string {
  switch (s.kind) {
    case "daily":
      return "Every day";
    case "weekly":
      return "Once a week";
    case "as_needed":
      return "When you need it";
    case "times_per_week":
      return `${s.count}× a week`;
    case "days_of_week": {
      const names = s.days.map((d) => WEEKDAY_LABELS[d]);
      if (names.length === 7) return "Every day";
      if (names.length === 1) return `${names[0]} only`;
      return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
    }
  }
}

/**
 * How many times a week this asks for, when it asks for a number at all.
 *
 * Null for `as_needed`, which is the whole point of `as_needed` — a habit that
 * has no quota cannot be behind on one.
 */
export function weeklyQuota(s: Schedule): number | null {
  switch (s.kind) {
    case "daily":
      return 7;
    case "days_of_week":
      return s.days.length;
    case "times_per_week":
      return s.count;
    case "weekly":
      return 1;
    case "as_needed":
      return null;
  }
}

// ─── Expectation ───────────────────────────────────────────────────────────

export type Expectation = "scheduled" | "open" | "off";

/**
 * The window a phase is in force for.
 *
 * `endsOn` is inclusive and may be null (an ongoing phase). `closedOn` is the
 * last day a *superseded* phase applied — set when a target changed or the
 * member paused, and the reason last month still grades against last month's
 * contract.
 */
export type PhaseWindow = {
  startsOn: string; // YYYY-MM-DD
  endsOn?: string | null;
  closedOn?: string | null;
  status?: string;
};

/**
 * Should this habit appear on this date, and does the date count?
 *
 * Dates are the member's own local calendar dates as strings, never Date
 * objects — a `Date` carries a timezone that this question does not have, and
 * comparing them is how a member in Bali loses a day.
 */
export function expectedOn(
  schedule: Schedule,
  window: PhaseWindow,
  onDate: string,
): Expectation {
  if (onDate < window.startsOn) return "off";
  if (window.endsOn && onDate > window.endsOn) return "off";
  if (window.closedOn && onDate > window.closedOn) return "off";
  // A paused habit is off, not missed. Three days paused is three days that
  // never appear rather than three days of failure — see the note on resume
  // in trackedHabits.ts.
  if (window.status === "paused" || window.status === "cancelled") return "off";

  switch (schedule.kind) {
    case "daily":
      return "scheduled";
    case "days_of_week":
      return schedule.days.includes(weekdayOf(onDate)) ? "scheduled" : "off";
    case "times_per_week":
    case "weekly":
    case "as_needed":
      return "open";
  }
}

/** Weekday of a YYYY-MM-DD, computed without ever building a local Date. */
export function weekdayOf(onDate: string): number {
  const [y, m, d] = onDate.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Inclusive day count between two YYYY-MM-DD dates. Day 1 is `from` itself. */
export function dayNumber(from: string, onDate: string): number {
  return daysBetween(from, onDate) + 1;
}

export function daysBetween(from: string, to: string): number {
  const [y1, m1, d1] = from.split("-").map(Number);
  const [y2, m2, d2] = to.split("-").map(Number);
  const a = Date.UTC(y1, m1 - 1, d1);
  const b = Date.UTC(y2, m2 - 1, d2);
  return Math.round((b - a) / 86_400_000);
}

export function addDays(onDate: string, n: number): string {
  const [y, m, d] = onDate.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

/**
 * "Day 8 of 21" — derived from the phase, never stored.
 *
 * A stored counter is a counter that has to be incremented by something, and
 * the something is a cron job that didn't run on the day the server restarted.
 */
export function phaseDay(
  window: PhaseWindow,
  onDate: string,
): { day: number; of: number | null } | null {
  if (onDate < window.startsOn) return null;
  const day = dayNumber(window.startsOn, onDate);
  const of = window.endsOn ? dayNumber(window.startsOn, window.endsOn) : null;
  if (of !== null && day > of) return { day: of, of };
  return { day, of };
}
