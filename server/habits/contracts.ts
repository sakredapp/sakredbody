/**
 * Writing contracts.
 *
 * Every mutation in here is transactional, and that is not defensive
 * programming — it is the only thing standing between the architecture and the
 * exact failure it was designed to prevent.
 *
 * Reconfiguration is two statements: close the old phase, open the new one. If
 * the first succeeds and the second doesn't, the member now has a habit with
 * no live contract — it vanishes from their home screen with no error anywhere
 * and no way to tell it apart from a habit they removed. If both succeed but
 * the close is skipped, they have two active phases with different targets, and
 * from there nothing downstream can say what they were asked to do. The unique
 * partial index catches the second case; the transaction catches the first.
 *
 * Every writer here also takes the actor from the authenticated server context.
 * `assignedByUserId` is never read from a request body — a coach id in a JSON
 * payload is a coach id an attacker chose.
 */

import { and, eq, desc, sql } from "drizzle-orm";
import { db } from "../db.js";
import {
  trackedHabits,
  trackedHabitPhases,
  habitEntries,
  habitProposals,
  type HabitConfig,
} from "../../shared/models/trackedHabits.js";
import { routineHabits } from "../../shared/models/coaching.js";
import {
  scheduleToColumns,
  scheduleFromColumns,
  addDays,
} from "../../shared/models/habitSchedule.js";
import { defaultEntryOp, manualFallbackAllowed } from "../../shared/models/habitMeasurement.js";
import { habitEvent } from "./log.js";

export class ContractError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Config as the columns a phase stores, with the catalogue supplying defaults. */
function phaseColumns(
  habit: typeof routineHabits.$inferSelect,
  config: HabitConfig | undefined,
  today: string,
) {
  const schedule = config?.schedule ?? { kind: "daily" as const };
  const cols = scheduleToColumns(schedule);

  const target =
    habit.trackingType === "boolean"
      ? null
      : (config?.target ?? habit.defaultTarget ?? null);

  if (habit.trackingType !== "boolean" && target == null) {
    throw new ContractError(400, "This habit needs a number to aim at.");
  }

  const phaseType = config?.phaseType ?? "ongoing";
  return {
    target,
    phaseType,
    // Never trusted from the body beyond "not in the past": a start date the
    // client picked in 1970 would back-date a contract over history it never
    // covered.
    startsOn: config?.startsOn && config.startsOn >= today ? config.startsOn : today,
    durationDays: phaseType === "fixed" ? (config?.durationDays ?? null) : null,
    scheduleKind: cols.scheduleKind,
    scheduleDays: cols.scheduleDays,
    scheduleCount: cols.scheduleCount,
    recommendedTime: config?.recommendedTime ?? habit.recommendedTime ?? null,
    memberReason: config?.memberReason ?? null,
    coachNote: config?.coachNote ?? null,
  };
}

async function habitOrThrow(tx: Tx, routineHabitId: string) {
  const [habit] = await tx
    .select()
    .from(routineHabits)
    .where(eq(routineHabits.id, routineHabitId))
    .limit(1);
  if (!habit) throw new ContractError(404, "No such habit.");
  if (!habit.emphasis) {
    throw new ContractError(
      400,
      "That habit hasn't been given a direction yet, so it has no list to go on.",
    );
  }
  return habit;
}

// ─── Adding ────────────────────────────────────────────────────────────────

/**
 * Put a member on a habit.
 *
 * Idempotent by design: a member who already tracks Morning Light and is then
 * assigned it by their coach gets one tracked habit, not two. The second call
 * returns the existing relationship rather than erroring, because from the
 * caller's point of view the desired state is already true.
 */
export async function addTrackedHabit(opts: {
  subjectId: string;
  routineHabitId: string;
  config?: HabitConfig;
  today: string;
  actorId: string;
  source: "member" | "coach" | "plan" | "retreat" | "cohort";
}) {
  return db.transaction(async (tx) => {
    const habit = await habitOrThrow(tx, opts.routineHabitId);

    const [existing] = await tx
      .select()
      .from(trackedHabits)
      .where(
        and(
          eq(trackedHabits.userId, opts.subjectId),
          eq(trackedHabits.routineHabitId, opts.routineHabitId),
          sql`${trackedHabits.status} <> 'archived'`,
        ),
      )
      .limit(1);

    if (existing) {
      const [live] = await tx
        .select()
        .from(trackedHabitPhases)
        .where(
          and(
            eq(trackedHabitPhases.trackedHabitId, existing.id),
            eq(trackedHabitPhases.status, "active"),
          ),
        )
        .limit(1);
      if (live) {
        habitEvent("tracked.duplicate", { subjectId: opts.subjectId, trackedHabitId: existing.id });
        return { tracked: existing, phase: live, created: false };
      }
      // Tracked but with nothing live — a paused or completed habit being
      // picked back up. Resume rather than creating a second relationship.
      const phase = await insertPhase(tx, {
        trackedHabitId: existing.id,
        userId: opts.subjectId,
        habit,
        config: opts.config,
        today: opts.today,
        source: opts.source,
        actorId: opts.actorId,
      });
      await tx
        .update(trackedHabits)
        .set({ status: "active", updatedAt: new Date() })
        .where(eq(trackedHabits.id, existing.id));
      return { tracked: { ...existing, status: "active" }, phase, created: false };
    }

    const [{ next }] = await tx
      .select({ next: sql<number>`coalesce(max(${trackedHabits.orderIndex}), -1) + 1` })
      .from(trackedHabits)
      .where(
        and(eq(trackedHabits.userId, opts.subjectId), eq(trackedHabits.emphasis, habit.emphasis!)),
      );

    const [tracked] = await tx
      .insert(trackedHabits)
      .values({
        userId: opts.subjectId,
        routineHabitId: opts.routineHabitId,
        emphasis: habit.emphasis!,
        status: "active",
        firstAddedBy: opts.source === "member" ? "member" : "coach",
        firstAddedByUserId: opts.actorId,
        orderIndex: Number(next) || 0,
      })
      .returning();

    const phase = await insertPhase(tx, {
      trackedHabitId: tracked.id,
      userId: opts.subjectId,
      habit,
      config: opts.config,
      today: opts.today,
      source: opts.source,
      actorId: opts.actorId,
    });

    habitEvent("tracked.added", {
      subjectId: opts.subjectId,
      trackedHabitId: tracked.id,
      phaseId: phase.id,
      source: opts.source,
    });
    return { tracked, phase, created: true };
  });
}

async function insertPhase(
  tx: Tx,
  o: {
    trackedHabitId: string;
    userId: string;
    habit: typeof routineHabits.$inferSelect;
    config?: HabitConfig;
    today: string;
    source: string;
    actorId: string;
  },
) {
  const cols = phaseColumns(o.habit, o.config, o.today);
  const [phase] = await tx
    .insert(trackedHabitPhases)
    .values({
      trackedHabitId: o.trackedHabitId,
      userId: o.userId,
      routineHabitId: o.habit.id,
      status: "active",
      source: o.source,
      // From the server's own notion of who is calling, never from the body.
      assignedByUserId: o.source === "member" ? null : o.actorId,
      ...cols,
    })
    .returning();
  return phase;
}

// ─── Reconfiguring ─────────────────────────────────────────────────────────

/**
 * Change what somebody is being asked to do, without changing what they were
 * asked to do yesterday.
 *
 * The old phase closes on the day before the new one starts. Entries already
 * written under it keep pointing at it, so week one still grades against
 * week one's target — permanently, and with no snapshot logic anywhere.
 */
export async function reconfigure(opts: {
  subjectId: string;
  trackedHabitId: string;
  config: HabitConfig;
  today: string;
  actorId: string;
  source: "member" | "coach" | "plan" | "retreat" | "cohort";
}) {
  return db.transaction(async (tx) => {
    const [tracked] = await tx
      .select()
      .from(trackedHabits)
      .where(
        and(eq(trackedHabits.id, opts.trackedHabitId), eq(trackedHabits.userId, opts.subjectId)),
      )
      .limit(1);
    if (!tracked) throw new ContractError(404, "Not found");

    const habit = await habitOrThrow(tx, tracked.routineHabitId);
    const [live] = await tx
      .select()
      .from(trackedHabitPhases)
      .where(
        and(
          eq(trackedHabitPhases.trackedHabitId, tracked.id),
          eq(trackedHabitPhases.status, "active"),
        ),
      )
      .limit(1);

    const startsOn =
      opts.config.startsOn && opts.config.startsOn >= opts.today
        ? opts.config.startsOn
        : opts.today;

    if (live) {
      // Closing the day before the new contract begins, and never before the
      // day the old one started — a same-day reconfiguration would otherwise
      // produce closed_on < starts_on, which the CHECK constraint refuses and
      // which would mean a phase that covered no days at all.
      const closedOn = maxDate(live.startsOn, addDays(startsOn, -1));
      await tx
        .update(trackedHabitPhases)
        .set({ status: "superseded", closedOn, closedAt: new Date() })
        .where(eq(trackedHabitPhases.id, live.id));
    }

    const phase = await insertPhase(tx, {
      trackedHabitId: tracked.id,
      userId: opts.subjectId,
      habit,
      config: { ...opts.config, startsOn },
      today: opts.today,
      source: opts.source,
      actorId: opts.actorId,
    });

    await tx
      .update(trackedHabits)
      .set({ status: "active", updatedAt: new Date() })
      .where(eq(trackedHabits.id, tracked.id));

    habitEvent("phase.reconfigured", {
      subjectId: opts.subjectId,
      trackedHabitId: tracked.id,
      fromPhaseId: live?.id ?? null,
      phaseId: phase.id,
      source: opts.source,
    });
    return phase;
  });
}

function maxDate(a: string, b: string) {
  return a > b ? a : b;
}

// ─── Pause, resume, complete, remove ───────────────────────────────────────

/**
 * Pause.
 *
 * The phase closes the day before the pause, so the paused days are `off`
 * rather than missed. A member who steps away for three days comes back to
 * three blank days, not three failures — which is the difference between a
 * tracker that helps and one people quietly stop opening.
 */
export async function pauseTracked(opts: {
  subjectId: string;
  trackedHabitId: string;
  today: string;
}) {
  return db.transaction(async (tx) => {
    const [live] = await tx
      .select()
      .from(trackedHabitPhases)
      .where(
        and(
          eq(trackedHabitPhases.trackedHabitId, opts.trackedHabitId),
          eq(trackedHabitPhases.userId, opts.subjectId),
          eq(trackedHabitPhases.status, "active"),
        ),
      )
      .limit(1);

    if (live) {
      await tx
        .update(trackedHabitPhases)
        .set({
          status: "paused",
          closedOn: maxDate(live.startsOn, addDays(opts.today, -1)),
          closedAt: new Date(),
        })
        .where(eq(trackedHabitPhases.id, live.id));
    }
    const [tracked] = await tx
      .update(trackedHabits)
      .set({ status: "paused", updatedAt: new Date() })
      .where(
        and(eq(trackedHabits.id, opts.trackedHabitId), eq(trackedHabits.userId, opts.subjectId)),
      )
      .returning();
    if (!tracked) throw new ContractError(404, "Not found");
    habitEvent("tracked.paused", { subjectId: opts.subjectId, trackedHabitId: tracked.id });
    return tracked;
  });
}

/**
 * Resume, on the configuration they were last on.
 *
 * A new phase rather than reopening the old one, because the gap is a real
 * fact about their history: the old contract genuinely stopped applying, and
 * an adherence number that spans the pause would be counting days nobody was
 * asked about.
 */
export async function resumeTracked(opts: {
  subjectId: string;
  trackedHabitId: string;
  today: string;
  actorId: string;
}) {
  return db.transaction(async (tx) => {
    const [tracked] = await tx
      .select()
      .from(trackedHabits)
      .where(
        and(eq(trackedHabits.id, opts.trackedHabitId), eq(trackedHabits.userId, opts.subjectId)),
      )
      .limit(1);
    if (!tracked) throw new ContractError(404, "Not found");

    const [previous] = await tx
      .select()
      .from(trackedHabitPhases)
      .where(eq(trackedHabitPhases.trackedHabitId, tracked.id))
      .orderBy(desc(trackedHabitPhases.startsOn), desc(trackedHabitPhases.createdAt))
      .limit(1);

    const [phase] = await tx
      .insert(trackedHabitPhases)
      .values({
        trackedHabitId: tracked.id,
        userId: opts.subjectId,
        routineHabitId: tracked.routineHabitId,
        status: "active",
        target: previous?.target ?? null,
        // Resuming a fixed phase resumes it as ongoing: the original 21 days
        // were 21 consecutive days, and silently restarting the count would
        // claim they did something they didn't.
        phaseType: "ongoing",
        startsOn: opts.today,
        durationDays: null,
        scheduleKind: previous?.scheduleKind ?? "daily",
        scheduleDays: previous?.scheduleDays ?? null,
        scheduleCount: previous?.scheduleCount ?? null,
        recommendedTime: previous?.recommendedTime ?? null,
        source: previous?.source ?? "member",
        assignedByUserId: previous?.assignedByUserId ?? null,
        memberReason: previous?.memberReason ?? null,
      })
      .returning();

    await tx
      .update(trackedHabits)
      .set({ status: "active", updatedAt: new Date() })
      .where(eq(trackedHabits.id, tracked.id));

    habitEvent("tracked.resumed", {
      subjectId: opts.subjectId,
      trackedHabitId: tracked.id,
      phaseId: phase.id,
    });
    return phase;
  });
}

/** A fixed phase reaching its last day. The member says what happens next. */
export async function completePhase(opts: {
  subjectId: string;
  trackedHabitId: string;
  /** 'stop' finishes the habit; 'continue' opens an ongoing phase on the same terms. */
  then: "stop" | "continue";
  today: string;
  actorId: string;
}) {
  return db.transaction(async (tx) => {
    const [live] = await tx
      .select()
      .from(trackedHabitPhases)
      .where(
        and(
          eq(trackedHabitPhases.trackedHabitId, opts.trackedHabitId),
          eq(trackedHabitPhases.userId, opts.subjectId),
          eq(trackedHabitPhases.status, "active"),
        ),
      )
      .limit(1);
    if (!live) throw new ContractError(404, "Nothing to finish");

    await tx
      .update(trackedHabitPhases)
      .set({
        status: "completed",
        closedOn: live.endsOn ?? opts.today,
        closedAt: new Date(),
      })
      .where(eq(trackedHabitPhases.id, live.id));

    if (opts.then === "stop") {
      await tx
        .update(trackedHabits)
        .set({ status: "completed", updatedAt: new Date() })
        .where(eq(trackedHabits.id, opts.trackedHabitId));
      habitEvent("phase.completed", {
        subjectId: opts.subjectId,
        trackedHabitId: opts.trackedHabitId,
        phaseId: live.id,
        then: "stop",
      });
      return null;
    }

    const startsOn = maxDate(opts.today, addDays(live.endsOn ?? opts.today, 1));
    const [next] = await tx
      .insert(trackedHabitPhases)
      .values({
        trackedHabitId: opts.trackedHabitId,
        userId: opts.subjectId,
        routineHabitId: live.routineHabitId,
        status: "active",
        target: live.target,
        phaseType: "ongoing",
        startsOn,
        scheduleKind: live.scheduleKind,
        scheduleDays: live.scheduleDays,
        scheduleCount: live.scheduleCount,
        recommendedTime: live.recommendedTime,
        source: live.source,
        assignedByUserId: live.assignedByUserId,
        memberReason: live.memberReason,
      })
      .returning();

    habitEvent("phase.completed", {
      subjectId: opts.subjectId,
      trackedHabitId: opts.trackedHabitId,
      phaseId: live.id,
      then: "continue",
      nextPhaseId: next.id,
    });
    return next;
  });
}

/**
 * Remove.
 *
 * Archived, never deleted. A member who drops cold exposure in March should
 * still see that they did it in February — deleting the rows would quietly
 * revise their own history, and picking it up again in April would look like
 * an unrelated decision rather than the return it is.
 */
export async function removeTracked(opts: {
  subjectId: string;
  trackedHabitId: string;
  today: string;
}) {
  return db.transaction(async (tx) => {
    const [live] = await tx
      .select()
      .from(trackedHabitPhases)
      .where(
        and(
          eq(trackedHabitPhases.trackedHabitId, opts.trackedHabitId),
          eq(trackedHabitPhases.userId, opts.subjectId),
          eq(trackedHabitPhases.status, "active"),
        ),
      )
      .limit(1);
    if (live) {
      await tx
        .update(trackedHabitPhases)
        .set({
          status: "cancelled",
          closedOn: maxDate(live.startsOn, addDays(opts.today, -1)),
          closedAt: new Date(),
        })
        .where(eq(trackedHabitPhases.id, live.id));
    }
    const [tracked] = await tx
      .update(trackedHabits)
      .set({ status: "archived", updatedAt: new Date() })
      .where(
        and(eq(trackedHabits.id, opts.trackedHabitId), eq(trackedHabits.userId, opts.subjectId)),
      )
      .returning();
    if (!tracked) throw new ContractError(404, "Not found");
    habitEvent("tracked.removed", { subjectId: opts.subjectId, trackedHabitId: tracked.id });
    return tracked;
  });
}

// ─── Logging ───────────────────────────────────────────────────────────────

/**
 * Record what somebody did.
 *
 * The phase is looked up by *date*, not taken as "the active one" — logging a
 * missed day from last week has to attach to last week's contract, or the
 * entry grades against a target that didn't exist yet.
 */
export async function logEntry(opts: {
  subjectId: string;
  trackedHabitId: string;
  onDate: string;
  value: number;
  op?: "add" | "set";
  kind?: "manual" | "override";
  note?: string | null;
  actorId: string;
}) {
  const [row] = await db
    .select({ tracked: trackedHabits, habit: routineHabits })
    .from(trackedHabits)
    .innerJoin(routineHabits, eq(routineHabits.id, trackedHabits.routineHabitId))
    .where(
      and(eq(trackedHabits.id, opts.trackedHabitId), eq(trackedHabits.userId, opts.subjectId)),
    )
    .limit(1);
  if (!row) throw new ContractError(404, "Not found");

  const phase = await phaseInForce(opts.subjectId, opts.trackedHabitId, opts.onDate);
  if (!phase) {
    throw new ContractError(
      409,
      "There was no plan in place for that day, so there's nothing to log against it.",
    );
  }

  const kind = opts.kind ?? "manual";
  if (kind !== "override" && row.habit.healthMetric && !manualFallbackAllowed(row.habit.healthMetric)) {
    throw new ContractError(
      400,
      "That one is measured by your phone. Entering it by hand would be inventing a number.",
    );
  }

  const [entry] = await db
    .insert(habitEntries)
    .values({
      userId: opts.subjectId,
      trackedHabitId: opts.trackedHabitId,
      phaseId: phase.id,
      onDate: opts.onDate,
      value: opts.value,
      op: opts.op ?? defaultEntryOp(row.habit.trackingType),
      kind,
      note: opts.note ?? null,
      createdByUserId: opts.actorId,
    })
    .returning();

  habitEvent("entry.logged", {
    subjectId: opts.subjectId,
    trackedHabitId: opts.trackedHabitId,
    phaseId: phase.id,
    onDate: opts.onDate,
    kind,
    byCoach: opts.actorId !== opts.subjectId,
  });
  return entry;
}

async function phaseInForce(userId: string, trackedHabitId: string, onDate: string) {
  const [row] = await db
    .select()
    .from(trackedHabitPhases)
    .where(
      and(
        eq(trackedHabitPhases.userId, userId),
        eq(trackedHabitPhases.trackedHabitId, trackedHabitId),
        sql`${trackedHabitPhases.startsOn} <= ${onDate}`,
        sql`(${trackedHabitPhases.closedOn} IS NULL OR ${trackedHabitPhases.closedOn} >= ${onDate})`,
        sql`(${trackedHabitPhases.endsOn} IS NULL OR ${trackedHabitPhases.endsOn} >= ${onDate})`,
      ),
    )
    .orderBy(desc(trackedHabitPhases.startsOn))
    .limit(1);
  return row ?? null;
}

// ─── Proposals ─────────────────────────────────────────────────────────────

/**
 * Accept.
 *
 * One transaction turns a suggestion into a contract: the tracked habit if
 * there isn't one, the phase carrying the proposed configuration, and the
 * proposal marked accepted with a pointer to what it produced. Half of that is
 * a member who agreed to something the app has no record of asking them.
 *
 * A member who already tracks the habit gets a reconfiguration onto the
 * proposed terms rather than a second copy of it on their list.
 */
export async function acceptProposal(opts: {
  subjectId: string;
  proposalId: string;
  today: string;
  actorId: string;
}) {
  return db.transaction(async (tx) => {
    const [proposal] = await tx
      .select()
      .from(habitProposals)
      .where(
        and(
          eq(habitProposals.id, opts.proposalId),
          eq(habitProposals.userId, opts.subjectId),
          eq(habitProposals.status, "proposed"),
        ),
      )
      .limit(1);
    if (!proposal) throw new ContractError(404, "Not found");

    const habit = await habitOrThrow(tx, proposal.routineHabitId);
    const config: HabitConfig = {
      target: proposal.target,
      phaseType: proposal.phaseType as "ongoing" | "fixed",
      durationDays: proposal.durationDays,
      recommendedTime: proposal.recommendedTime,
      memberReason: proposal.reason,
      schedule: scheduleFromColumns({
        scheduleKind: proposal.scheduleKind,
        scheduleDays: proposal.scheduleDays ?? null,
        scheduleCount: proposal.scheduleCount ?? null,
      }),
    };

    let [tracked] = await tx
      .select()
      .from(trackedHabits)
      .where(
        and(
          eq(trackedHabits.userId, opts.subjectId),
          eq(trackedHabits.routineHabitId, proposal.routineHabitId),
          sql`${trackedHabits.status} <> 'archived'`,
        ),
      )
      .limit(1);

    if (tracked) {
      const [live] = await tx
        .select()
        .from(trackedHabitPhases)
        .where(
          and(
            eq(trackedHabitPhases.trackedHabitId, tracked.id),
            eq(trackedHabitPhases.status, "active"),
          ),
        )
        .limit(1);
      if (live) {
        await tx
          .update(trackedHabitPhases)
          .set({
            status: "superseded",
            closedOn: maxDate(live.startsOn, addDays(opts.today, -1)),
            closedAt: new Date(),
          })
          .where(eq(trackedHabitPhases.id, live.id));
      }
      await tx
        .update(trackedHabits)
        .set({ status: "active", updatedAt: new Date() })
        .where(eq(trackedHabits.id, tracked.id));
    } else {
      const [{ next }] = await tx
        .select({ next: sql<number>`coalesce(max(${trackedHabits.orderIndex}), -1) + 1` })
        .from(trackedHabits)
        .where(
          and(
            eq(trackedHabits.userId, opts.subjectId),
            eq(trackedHabits.emphasis, proposal.emphasis),
          ),
        );
      [tracked] = await tx
        .insert(trackedHabits)
        .values({
          userId: opts.subjectId,
          routineHabitId: proposal.routineHabitId,
          emphasis: proposal.emphasis,
          status: "active",
          firstAddedBy: "coach",
          firstAddedByUserId: proposal.proposedByUserId,
          orderIndex: Number(next) || 0,
        })
        .returning();
    }

    const phase = await insertPhase(tx, {
      trackedHabitId: tracked.id,
      userId: opts.subjectId,
      habit,
      config,
      today: opts.today,
      // The coach wrote these terms even though the member agreed to them.
      source: "coach",
      actorId: proposal.proposedByUserId ?? opts.actorId,
    });

    await tx
      .update(habitProposals)
      .set({ status: "accepted", respondedAt: new Date(), resultingPhaseId: phase.id })
      .where(eq(habitProposals.id, proposal.id));

    habitEvent("proposal.accepted", {
      subjectId: opts.subjectId,
      proposalId: proposal.id,
      trackedHabitId: tracked.id,
      phaseId: phase.id,
    });
    return { proposal, tracked, phase };
  });
}

export async function declineProposal(opts: { subjectId: string; proposalId: string }) {
  const [row] = await db
    .update(habitProposals)
    .set({ status: "declined", respondedAt: new Date() })
    .where(
      and(
        eq(habitProposals.id, opts.proposalId),
        eq(habitProposals.userId, opts.subjectId),
        eq(habitProposals.status, "proposed"),
      ),
    )
    .returning();
  if (!row) throw new ContractError(404, "Not found");
  habitEvent("proposal.declined", {
    subjectId: opts.subjectId,
    proposalId: row.id,
    routineHabitId: row.routineHabitId,
  });
  return row;
}
