/**
 * What a member is actually on today, fully resolved.
 *
 * ── Why this exists rather than three components each working it out ──────
 *
 * "Is this habit due today" has six inputs: the phase window, the schedule,
 * whether it's paused, the member's timezone, whether a fixed phase has run
 * out, and whether it started yet. "What's the number today" has four more:
 * the health metric, the entries, the precedence rule, and the unit the habit
 * is expressed in.
 *
 * Ten inputs is a thing you implement once. Implemented twice — once on Home
 * and once in the coach portal — the two implementations agree for about a
 * month, and then one screen calls Wednesday a missed day and the other says
 * it was never scheduled, and both are reading the same rows.
 *
 * So the API returns resolved objects and the clients are renderers. A React
 * component asking `h.progressLabel` cannot get the arithmetic wrong; a React
 * component handed `target`, `entries` and `healthDays` eventually will.
 */

import { and, eq, inArray, gte, lte, desc, sql } from "drizzle-orm";
import { db } from "../db.js";
import {
  trackedHabits,
  trackedHabitPhases,
  habitEntries,
  trackedHabitLinks,
} from "../../shared/models/trackedHabits.js";
import { routineHabits } from "../../shared/models/coaching.js";
import { healthDays } from "../../shared/models/health.js";
import {
  scheduleFromColumns,
  describeSchedule,
  expectedOn,
  phaseDay,
  weeklyQuota,
  type Expectation,
  type Schedule,
} from "../../shared/models/habitSchedule.js";
import {
  resolveDailyValue,
  progressStateOf,
  describeProgress,
  manualFallbackAllowed,
  defaultEntryOp,
  aggregationOf,
  type ProgressState,
  type ValueSource,
} from "../../shared/models/habitMeasurement.js";
import { itemTypeOf, unitFor, type ItemType } from "../../shared/models/habitTracking.js";

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

/**
 * Everything a member is on, resolved for one of their local dates.
 *
 * Four queries regardless of how many habits: the rows, their entries, their
 * health values, their context links. The obvious shape — resolve each habit
 * in a loop — is 4n queries on a screen that loads on every app open.
 */
export async function resolveDay(userId: string, onDate: string): Promise<ResolvedHabit[]> {
  const rows = await db
    .select({
      tracked: trackedHabits,
      phase: trackedHabitPhases,
      habit: routineHabits,
    })
    .from(trackedHabits)
    .innerJoin(
      trackedHabitPhases,
      and(
        eq(trackedHabitPhases.trackedHabitId, trackedHabits.id),
        eq(trackedHabitPhases.status, "active"),
      ),
    )
    .innerJoin(routineHabits, eq(routineHabits.id, trackedHabits.routineHabitId))
    .where(and(eq(trackedHabits.userId, userId), inArray(trackedHabits.status, ["active", "paused"])))
    .orderBy(trackedHabits.orderIndex, trackedHabits.createdAt);

  if (rows.length === 0) return [];

  const trackedIds = rows.map((r) => r.tracked.id);
  const metrics = Array.from(
    new Set(rows.map((r) => r.habit.healthMetric).filter((m): m is string => Boolean(m))),
  );

  const [entries, health, links] = await Promise.all([
    db
      .select()
      .from(habitEntries)
      .where(
        and(
          eq(habitEntries.userId, userId),
          eq(habitEntries.onDate, onDate),
          inArray(habitEntries.trackedHabitId, trackedIds),
        ),
      )
      .orderBy(habitEntries.createdAt),
    metrics.length
      ? db
          .select({ metric: healthDays.metric, value: healthDays.value })
          .from(healthDays)
          .where(
            and(
              eq(healthDays.userId, userId),
              eq(healthDays.onDate, onDate),
              inArray(healthDays.metric, metrics),
            ),
          )
      : Promise.resolve([] as { metric: string; value: number }[]),
    db
      .select()
      .from(trackedHabitLinks)
      .where(inArray(trackedHabitLinks.trackedHabitId, trackedIds)),
  ]);

  const byTracked = new Map<string, typeof entries>();
  for (const e of entries) {
    const list = byTracked.get(e.trackedHabitId) ?? [];
    list.push(e);
    byTracked.set(e.trackedHabitId, list);
  }
  const healthBy = new Map(health.map((h) => [h.metric, h.value]));
  const linksBy = new Map<string, { type: string; id: string }[]>();
  for (const l of links) {
    const list = linksBy.get(l.trackedHabitId) ?? [];
    list.push({ type: l.contextType, id: l.contextId });
    linksBy.set(l.trackedHabitId, list);
  }

  return rows.map((r) =>
    resolveRow({
      tracked: r.tracked,
      phase: r.phase,
      habit: r.habit,
      onDate,
      entries: byTracked.get(r.tracked.id) ?? [],
      healthValue: r.habit.healthMetric ? (healthBy.get(r.habit.healthMetric) ?? null) : null,
      contexts: linksBy.get(r.tracked.id) ?? [],
    }),
  );
}

/**
 * The pure part, exported so tests can drive it without a database.
 *
 * Everything above this is fetching. Everything a screen depends on is here.
 */
export function resolveRow(input: {
  tracked: typeof trackedHabits.$inferSelect;
  phase: typeof trackedHabitPhases.$inferSelect;
  habit: typeof routineHabits.$inferSelect;
  onDate: string;
  entries: readonly { value: number; op: string; kind: string }[];
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
    awaitingReview: Boolean(
      phase.endsOn && onDate > phase.endsOn && phase.status === "active",
    ),
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
 * The phase that was in force on a given date — which is not always the
 * active one.
 *
 * This is the query that makes history honest. Logging a missed day last week
 * has to attach to last week's contract, and grading last week has to read
 * last week's target, or the app decides somebody failed at a number they were
 * never given.
 */
export async function phaseOnDate(userId: string, trackedHabitId: string, onDate: string) {
  const [row] = await db
    .select()
    .from(trackedHabitPhases)
    .where(
      and(
        eq(trackedHabitPhases.userId, userId),
        eq(trackedHabitPhases.trackedHabitId, trackedHabitId),
        lte(trackedHabitPhases.startsOn, onDate),
        sql`(${trackedHabitPhases.closedOn} IS NULL OR ${trackedHabitPhases.closedOn} >= ${onDate})`,
        sql`(${trackedHabitPhases.endsOn} IS NULL OR ${trackedHabitPhases.endsOn} >= ${onDate})`,
      ),
    )
    .orderBy(desc(trackedHabitPhases.startsOn))
    .limit(1);
  return row ?? null;
}

// ─── History ───────────────────────────────────────────────────────────────

export type HistoryDay = {
  onDate: string;
  expected: Expectation;
  value: number;
  target: number | null;
  progressState: ProgressState;
  source: ValueSource;
};

/**
 * One habit over a date range, each day graded against the contract that was
 * live *that* day.
 *
 * This is where the whole architecture pays for itself. There is no snapshot
 * table and no effective-dated join: entries already carry their phase, so
 * grouping by phase gives the right target for free.
 */
export async function resolveHistory(
  userId: string,
  trackedHabitId: string,
  from: string,
  to: string,
): Promise<HistoryDay[]> {
  const [tracked] = await db
    .select({ tracked: trackedHabits, habit: routineHabits })
    .from(trackedHabits)
    .innerJoin(routineHabits, eq(routineHabits.id, trackedHabits.routineHabitId))
    .where(and(eq(trackedHabits.id, trackedHabitId), eq(trackedHabits.userId, userId)))
    .limit(1);
  if (!tracked) return [];

  const [phases, entries, health] = await Promise.all([
    db
      .select()
      .from(trackedHabitPhases)
      .where(
        and(
          eq(trackedHabitPhases.trackedHabitId, trackedHabitId),
          eq(trackedHabitPhases.userId, userId),
        ),
      )
      .orderBy(trackedHabitPhases.startsOn),
    db
      .select()
      .from(habitEntries)
      .where(
        and(
          eq(habitEntries.trackedHabitId, trackedHabitId),
          gte(habitEntries.onDate, from),
          lte(habitEntries.onDate, to),
        ),
      )
      .orderBy(habitEntries.createdAt),
    tracked.habit.healthMetric
      ? db
          .select({ onDate: healthDays.onDate, value: healthDays.value })
          .from(healthDays)
          .where(
            and(
              eq(healthDays.userId, userId),
              eq(healthDays.metric, tracked.habit.healthMetric),
              gte(healthDays.onDate, from),
              lte(healthDays.onDate, to),
            ),
          )
      : Promise.resolve([] as { onDate: string; value: number }[]),
  ]);

  const entriesBy = new Map<string, typeof entries>();
  for (const e of entries) {
    const list = entriesBy.get(e.onDate) ?? [];
    list.push(e);
    entriesBy.set(e.onDate, list);
  }
  const healthBy = new Map(health.map((h) => [h.onDate, h.value]));

  const out: HistoryDay[] = [];
  for (let d = from; d <= to; d = nextDay(d)) {
    const phase = phases.find(
      (p) =>
        p.startsOn <= d &&
        (!p.closedOn || p.closedOn >= d) &&
        (!p.endsOn || p.endsOn >= d),
    );
    if (!phase) {
      out.push({
        onDate: d,
        expected: "off",
        value: 0,
        target: null,
        progressState: "none",
        source: "none",
      });
      continue;
    }
    const schedule = scheduleFromColumns({
      scheduleKind: phase.scheduleKind,
      scheduleDays: phase.scheduleDays ?? null,
      scheduleCount: phase.scheduleCount ?? null,
    });
    const target = phase.target ?? tracked.habit.defaultTarget ?? null;
    const resolved = resolveDailyValue({
      trackingType: tracked.habit.trackingType,
      healthMetric: tracked.habit.healthMetric,
      healthValue: healthBy.get(d) ?? null,
      entries: entriesBy.get(d) ?? [],
    });
    out.push({
      onDate: d,
      expected: expectedOn(
        schedule,
        { startsOn: phase.startsOn, endsOn: phase.endsOn, closedOn: phase.closedOn, status: phase.status },
        d,
      ),
      value: resolved.value,
      target,
      progressState: progressStateOf(tracked.habit.trackingType, resolved.value, target),
      source: resolved.source,
    });
  }
  return out;
}

function nextDay(d: string): string {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, day + 1)).toISOString().slice(0, 10);
}

/** Re-exported so a route never reaches past the domain layer for a rule. */
export { aggregationOf };
