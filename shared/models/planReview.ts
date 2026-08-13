/**
 * What activating this plan would actually do, and whether it should.
 *
 * ── Why the review is computed once, here ─────────────────────────────────
 *
 * A coach approves a screen that says "Protein 140g → 165g". If the review and
 * the activation work that out separately, the screen is a prediction rather
 * than a description, and the day they disagree is the day somebody approves
 * one thing and a member is asked to do another. So this produces the plan of
 * record, the screen renders it, and activation executes exactly it.
 *
 * ── On the safety check, and what it honestly is ──────────────────────────
 *
 * The catalogue carries `load_class`, `priority_level`, `terrain_fit` and
 * `max_per_week`, and `shared/models/loadClass.ts` already knows what a load
 * class costs. Those are canonical and populated, so the checks below use them
 * and invent nothing.
 *
 * `habit_relations` — the `requires`/`conflicts` table — exists and is
 * **empty**. It is still consulted, because it is the canonical place for that
 * question and wiring it now means a relation added later is enforced without
 * anybody remembering to come back. But it currently finds nothing, and a
 * review that printed "no conflicts found" on the strength of an empty table
 * would be a check-shaped reassurance. So `relationsDeclared` is reported, and
 * the screen says which questions were actually asked.
 *
 * A human coach does not get a bypass. The rules that govern what Sakred
 * suggests govern what a coach may activate, because the member's body does not
 * know the difference.
 */

import { loadClassMeta, stressLoadOf, type LoadClass } from "./loadClass.js";

export type PlanIntent = "add" | "change" | "end";

/** One catalogue practice, as much of it as the review needs. */
export type ReviewHabit = {
  id: string;
  title: string;
  emphasis: string | null;
  trackingType: string;
  defaultTarget: number | null;
  loadClass: string | null;
  terrainFit: string | null;
  maxPerWeek: number | null;
  priorityLevel: string | null;
};

/** What the member is on right now, per catalogue habit. */
export type LiveContract = {
  routineHabitId: string;
  trackedHabitId: string;
  target: number | null;
  scheduleKind: string;
  scheduleCount: number | null;
};

export type PlanItemIntent = {
  routineHabitId: string;
  intent: PlanIntent;
  target: number | null;
  schedule: { kind: string; days?: number[]; count?: number } | null;
};

/** A line on the review screen. */
export type PlanChange = {
  routineHabitId: string;
  title: string;
  /** What activation will do — resolved against reality, not trusted. */
  action: "add" | "change" | "end" | "keep";
  /** Populated for `change`, so the screen can say 140g → 165g. */
  from: string | null;
  to: string | null;
};

export type PlanFinding = {
  /** `block` refuses activation. `warn` is shown and does not. */
  level: "block" | "warn";
  /** Which practice raised it, where there is one. */
  routineHabitId: string | null;
  message: string;
};

export type PlanReview = {
  changes: PlanChange[];
  findings: PlanFinding[];
  /** True when nothing blocks. Warnings do not stop a human deciding. */
  canActivate: boolean;
  /**
   * Which questions were actually asked. The screen says this out loud rather
   * than implying a clean bill of health it did not earn.
   */
  checked: {
    catalogueLimits: boolean;
    terrainFit: boolean;
    stressLoad: boolean;
    /** False while `habit_relations` is empty — see the note above. */
    declaredConflicts: boolean;
  };
};

function targetLabel(h: ReviewHabit, target: number | null, unitOf: (h: ReviewHabit) => string) {
  if (h.trackingType === "boolean") return "done";
  if (target == null) return "—";
  return `${target}${unitOf(h)}`;
}

/**
 * How many times a week a schedule asks for something.
 *
 * `days_of_week` is however many days are named; `times_per_week` is its count;
 * daily is seven. Needed because the catalogue states its ceiling per week and
 * a coach expresses frequency three different ways.
 */
export function weeklyFrequency(
  schedule: { kind: string; days?: number[]; count?: number } | null,
): number {
  if (!schedule) return 7;
  if (schedule.kind === "days_of_week") return schedule.days?.length ?? 0;
  if (schedule.kind === "times_per_week") return schedule.count ?? 0;
  return 7;
}

export function reviewPlan(input: {
  items: readonly PlanItemIntent[];
  catalogue: readonly ReviewHabit[];
  live: readonly LiveContract[];
  /** The reading from `terrainFor`, unchanged. Null when nothing has synced. */
  terrainLean: "restore" | "build" | "either" | "unknown" | null;
  /** Load classes the member is already carrying, from their live habits. */
  carryingLoadClasses: readonly (string | null)[];
  /** Pairs the catalogue declares incompatible. Empty today; consulted anyway. */
  declaredConflicts: readonly { habitId: string; relatedHabitId: string; note: string | null }[];
  unitOf?: (h: ReviewHabit) => string;
}): PlanReview {
  const unitOf = input.unitOf ?? (() => "");
  const byId = new Map(input.catalogue.map((h) => [h.id, h]));
  const liveBy = new Map(input.live.map((l) => [l.routineHabitId, l]));

  const changes: PlanChange[] = [];
  const findings: PlanFinding[] = [];

  for (const item of input.items) {
    const habit = byId.get(item.routineHabitId);
    if (!habit) {
      findings.push({
        level: "block",
        routineHabitId: item.routineHabitId,
        message: "That practice is no longer in the catalogue.",
      });
      continue;
    }

    const current = liveBy.get(item.routineHabitId) ?? null;

    /**
     * The action is resolved against what is actually true, never taken from
     * the client. A coach who adds a practice the member already keeps means
     * "change", and honouring the literal `add` would create a second standing
     * habit and split their history in two.
     */
    let action: PlanChange["action"];
    if (item.intent === "end") {
      action = current ? "end" : "keep";
    } else if (!current) {
      action = "add";
    } else {
      const sameTarget = (current.target ?? null) === (item.target ?? habit.defaultTarget ?? null);
      const sameSchedule =
        weeklyFrequency(item.schedule) ===
        weeklyFrequency({ kind: current.scheduleKind, count: current.scheduleCount ?? undefined });
      action = sameTarget && sameSchedule ? "keep" : "change";
    }

    changes.push({
      routineHabitId: habit.id,
      title: habit.title,
      action,
      from: current ? targetLabel(habit, current.target, unitOf) : null,
      to:
        action === "end"
          ? null
          : targetLabel(habit, item.target ?? habit.defaultTarget ?? null, unitOf),
    });

    if (action === "end" || action === "keep") continue;

    /**
     * The catalogue's own ceiling. A hard block, because it is not a judgement
     * call — the practice itself says how often it may be done, and a coach
     * asking for more is asking for something the catalogue defines as wrong.
     */
    if (habit.maxPerWeek != null) {
      const asked = weeklyFrequency(item.schedule);
      if (asked > habit.maxPerWeek) {
        findings.push({
          level: "block",
          routineHabitId: habit.id,
          message: `${habit.title} is ${asked}× a week here. The catalogue caps it at ${habit.maxPerWeek}.`,
        });
      }
    }

    /**
     * Terrain fit. A warning, not a block: a coach may have a reason, and the
     * reading is about this week rather than the fortnight the plan covers.
     */
    if (
      habit.terrainFit &&
      habit.terrainFit !== "either" &&
      input.terrainLean &&
      input.terrainLean !== "either" &&
      input.terrainLean !== "unknown" &&
      habit.terrainFit !== input.terrainLean
    ) {
      findings.push({
        level: "warn",
        routineHabitId: habit.id,
        message: `${habit.title} suits a ${habit.terrainFit} week. Their terrain is currently asking for ${input.terrainLean}.`,
      });
    }
  }

  /**
   * Stacked adaptive stressors on a body that is already short.
   *
   * `stressLoadOf` is the canonical function and this is the first thing to
   * call it — it was written for exactly this and has been sitting unused. The
   * count is of what would be *added*, on top of what is already carried.
   */
  const adding = changes
    .filter((c) => c.action === "add" || c.action === "change")
    .map((c) => byId.get(c.routineHabitId)?.loadClass ?? null);

  const newStressors = adding.filter((c) => c === "adaptive-stressor").length;
  const carriedStressors = input.carryingLoadClasses.filter(
    (c) => c === "adaptive-stressor",
  ).length;
  const total = newStressors + carriedStressors;

  if (newStressors > 0 && input.terrainLean === "restore") {
    findings.push({
      level: "warn",
      routineHabitId: null,
      message:
        total > 1
          ? `This adds ${newStressors} adaptive ${newStressors === 1 ? "stressor" : "stressors"} to ${carriedStressors} already running, while their terrain is asking for recovery.`
          : "This adds an adaptive stressor while their terrain is asking for recovery.",
    });
  } else if (total >= 3) {
    findings.push({
      level: "warn",
      routineHabitId: null,
      message: `That is ${total} adaptive stressors running at once. They compete for the same recovery.`,
    });
  }

  /**
   * Declared conflicts. A block — the catalogue is stating these two together
   * are wrong, which is not the coach's call to make item by item.
   *
   * Empty today. Wired anyway so the first relation somebody declares is
   * enforced without a second visit to this file.
   */
  const inPlan = new Set(
    changes.filter((c) => c.action !== "end" && c.action !== "keep").map((c) => c.routineHabitId),
  );
  for (const rel of input.declaredConflicts) {
    if (inPlan.has(rel.habitId) && inPlan.has(rel.relatedHabitId)) {
      const a = byId.get(rel.habitId)?.title ?? "one practice";
      const b = byId.get(rel.relatedHabitId)?.title ?? "another";
      findings.push({
        level: "block",
        routineHabitId: rel.habitId,
        message: rel.note ?? `${a} and ${b} are not run together.`,
      });
    }
  }

  return {
    changes,
    findings,
    canActivate: !findings.some((f) => f.level === "block"),
    checked: {
      catalogueLimits: input.catalogue.some((h) => h.maxPerWeek != null),
      terrainFit: input.terrainLean !== null && input.terrainLean !== "unknown",
      stressLoad: true,
      declaredConflicts: input.declaredConflicts.length > 0,
    },
  };
}

/** The classes a set of live habits is carrying, for the load check. */
export function loadClassesOf(habits: readonly { loadClass: string | null }[]): string[] {
  return habits.map((h) => h.loadClass).filter((c): c is string => Boolean(c));
}

/** Re-exported so callers do not reach past this module for the same numbers. */
export { stressLoadOf, loadClassMeta };
export type { LoadClass };
