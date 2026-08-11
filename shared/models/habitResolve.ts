/**
 * One habit, one day, fully worked out.
 *
 * ── Why this is in shared/ and not in server/ ─────────────────────────────
 *
 * Nothing in here touches a database, and that is the point twice over. It
 * means the rules can be tested without a connection — the assertions that
 * matter most ("a target raised in week three does not fail week one") should
 * not need Postgres to be reachable to run. And it means the client can use
 * the same functions when it needs to reason locally, without a second
 * implementation forming.
 *
 * The server's resolve.ts is the fetching half: four queries, then this.
 *
 * ── Why the inputs are structural ─────────────────────────────────────────
 *
 * Plain object shapes rather than Drizzle's inferred row types, so this file
 * imports no ORM and a test can hand it a literal. The shapes are narrower
 * than the tables on purpose — everything this needs and nothing it doesn't.
 */

import {
  scheduleFromColumns,
  describeSchedule,
  expectedOn,
  phaseDay,
  weeklyQuota,
  type Expectation,
  type Schedule,
} from "./habitSchedule.js";
import {
  resolveDailyValue,
  progressStateOf,
  describeProgress,
  manualFallbackAllowed,
  defaultEntryOp,
  type ProgressState,
  type ValueSource,
  type Entry,
} from "./habitMeasurement.js";
import { itemTypeOf, unitFor, type ItemType } from "./habitTracking.js";

export type TrackedInput = {
  id: string;
  emphasis: string;
  status: string;
};

export type PhaseInput = {
  id: string;
  status: string;
  target: number | null;
  phaseType: string;
  startsOn: string;
  endsOn?: string | null;
  closedOn?: string | null;
  scheduleKind: string;
  scheduleDays?: number[] | null;
  scheduleCount?: number | null;
  recommendedTime?: string | null;
  source: string;
  memberReason?: string | null;
};

export type CatalogueInput = {
  id: string;
  title: string;
  shortDescription?: string | null;
  icon?: string | null;
  trackingType: string;
  defaultTarget?: number | null;
  healthMetric?: string | null;
  polarityStrength: string;
  loadClass?: string | null;
  recommendedTime?: string | null;
};

export type ResolvedHabit = {
  trackedHabitId: string;
  routineHabitId: string;
  phaseId: string;

  title: string;
  shortDescription: string | null;
  emphasis: string;
  icon: string | null;

  itemType: ItemType;
  trackingType: string;
  unit: string | null;
  /** 'add' for cumulative habits, 'set' for observed ones. The client obeys it. */
  entryOp: "add" | "set";

  target: number | null;
  currentValue: number;
  progressState: ProgressState;
  progressLabel: string;
  valueSource: ValueSource;

  expected: Expectation;
  schedule: Schedule;
  scheduleLabel: string;
  weeklyQuota: number | null;
  recommendedTime: string | null;

  phaseType: string;
  phaseSource: string;
  phaseDay: number | null;
  phaseLength: number | null;
  /** A fixed phase past its last day, still open. The member owes it an answer. */
  awaitingReview: boolean;
  memberReason: string | null;

  healthBacked: boolean;
  healthMetric: string | null;
  manualFallbackAllowed: boolean;
  /** The phone could have answered this and didn't — permission, or no sync yet. */
  healthMissing: boolean;

  loadClass: string | null;
  polarityStrength: string;
  /** 'plan' | 'cohort' | 'retreat' memberships. A habit can be in several. */
  contexts: { type: string; id: string }[];
};

export function resolveRow(input: {
  tracked: TrackedInput;
  phase: PhaseInput;
  habit: CatalogueInput;
  onDate: string;
  entries: readonly Entry[];
  healthValue: number | null;
  contexts: { type: string; id: string }[];
}): ResolvedHabit {
  const { tracked, phase, habit, onDate } = input;

  const schedule = scheduleFromColumns({
    scheduleKind: phase.scheduleKind,
    scheduleDays: phase.scheduleDays ?? null,
    scheduleCount: phase.scheduleCount ?? null,
  });

  // A paused *relationship* pauses every phase under it. The status lives on
  // the tracked habit because pausing is about the member, not the contract.
  const window = {
    startsOn: phase.startsOn,
    endsOn: phase.endsOn ?? null,
    closedOn: phase.closedOn ?? null,
    status: tracked.status === "paused" ? "paused" : phase.status,
  };

  const expected = expectedOn(schedule, window, onDate);
  const day = phaseDay(window, onDate);

  // The phase's own number first, the catalogue default only when the phase
  // never carried one — which is the boolean case, where there is nothing to
  // aim at anyway.
  const target = phase.target ?? habit.defaultTarget ?? null;

  const resolved = resolveDailyValue({
    trackingType: habit.trackingType,
    healthMetric: habit.healthMetric,
    healthValue: input.healthValue,
    entries: input.entries,
  });

  return {
    trackedHabitId: tracked.id,
    routineHabitId: habit.id,
    phaseId: phase.id,

    title: habit.title,
    shortDescription: habit.shortDescription ?? null,
    emphasis: tracked.emphasis,
    icon: habit.icon ?? null,

    itemType: itemTypeOf(habit.trackingType, habit.healthMetric),
    trackingType: habit.trackingType,
    unit: unitFor(habit.trackingType),
    entryOp: defaultEntryOp(habit.trackingType),

    target,
    currentValue: resolved.value,
    progressState: progressStateOf(habit.trackingType, resolved.value, target),
    progressLabel: describeProgress(habit.trackingType, resolved.value, target),
    valueSource: resolved.source,

    expected,
    schedule,
    scheduleLabel: describeSchedule(schedule),
    weeklyQuota: weeklyQuota(schedule),
    recommendedTime: phase.recommendedTime ?? habit.recommendedTime ?? null,

    phaseType: phase.phaseType,
    phaseSource: phase.source,
    phaseDay: day?.day ?? null,
    phaseLength: day?.of ?? null,
    awaitingReview: Boolean(phase.endsOn && onDate > phase.endsOn && phase.status === "active"),
    memberReason: phase.memberReason ?? null,

    healthBacked: Boolean(habit.healthMetric),
    healthMetric: habit.healthMetric ?? null,
    manualFallbackAllowed: manualFallbackAllowed(habit.healthMetric),
    healthMissing: resolved.healthExpectedButMissing,

    loadClass: habit.loadClass ?? null,
    polarityStrength: habit.polarityStrength,
    contexts: input.contexts,
  };
}

/**
 * How a week went for a habit whose schedule is a quota rather than a set of
 * days.
 *
 * "3× a week" cannot be graded a day at a time — that is the whole difference
 * between `scheduled` and `open`. This counts the days that actually landed
 * against the quota, and returns null when there is no quota to be behind on.
 */
export function weekAdherence(
  schedule: Schedule,
  days: readonly { expected: Expectation; progressState: ProgressState }[],
): { done: number; of: number } | null {
  const quota = weeklyQuota(schedule);
  if (quota === null) return null;
  const done = days.filter(
    (d) => d.expected !== "off" && (d.progressState === "met" || d.progressState === "over"),
  ).length;
  return { done, of: quota };
}
