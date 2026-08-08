/**
 * Enrollment Engine
 *
 * One rule about days, one function that materialises them, and an explicit
 * lifecycle. See docs/ENGINE-AUDIT.md for what this replaces.
 *
 *   scheduled ──(start date arrives)──► active ──(end date passes)──► completed
 *       │                                 │  ▲
 *       │                            pause│  │resume
 *       └──────────► abandoned ◄──────────┴──┘
 *
 * Two invariants the rest of the code may rely on:
 *
 *   1. A member has at most one `active` and at most one `scheduled`
 *      enrollment. Enforced by partial unique indexes, not by convention.
 *   2. Every `habits` row for a day exists before that day is read. Enrollment
 *      materialises the whole run up front, so there is no cron and no
 *      client-side top-up — and therefore no window where today is empty.
 */

import crypto from "crypto";
import { db } from "../db.js";
import { eq, and, gt, gte, inArray, sql, count, desc, asc } from "drizzle-orm";
import {
  users,
  wellnessRoutines,
  routineHabits,
  habitRoutineAssignments,
  userRoutines,
  habits,
  userRemovedHabits,
  type RoutineHabit,
  type UserRoutine,
} from "../../shared/schema.js";

import { templateRunsOnDay } from "../../shared/utils/schedule.js";
import {
  todayInZone,
  parseLocalDate,
  formatLocalDateString,
  addDays,
  addDaysToString,
  daysBetweenStrings,
  routineDayNumber,
} from "../../shared/utils/dates.js";

// ─── Templates for a routine ──────────────────────────────────────────────

/**
 * Both links are read and merged: `routine_habits.routine_id` (the habit's home
 * routine) and `habit_routine_assignments` (the real many-to-many). The macro
 * app read one in the enrol preview and the other in its generator, so a habit
 * attached only through the junction previewed but never appeared.
 */
async function fetchFilteredHabits(
  routineId: string,
  intensity: "lite" | "intense",
  userId: string,
): Promise<RoutineHabit[]> {
  const [direct, junctionRows] = await Promise.all([
    db.select().from(routineHabits).where(eq(routineHabits.routineId, routineId)),
    db
      .select({ habitId: habitRoutineAssignments.habitId })
      .from(habitRoutineAssignments)
      .where(eq(habitRoutineAssignments.routineId, routineId)),
  ]);

  let junction: RoutineHabit[] = [];
  const junctionIds = junctionRows.map((r) => r.habitId);
  if (junctionIds.length > 0) {
    // One query, not one per id.
    junction = await db.select().from(routineHabits).where(inArray(routineHabits.id, junctionIds));
  }

  const merged = new Map<string, RoutineHabit>();
  for (const h of [...direct, ...junction]) merged.set(h.id, h);

  // Habits the member has explicitly removed stay removed.
  const tombstones = await db
    .select({
      routineHabitId: userRemovedHabits.routineHabitId,
      title: userRemovedHabits.title,
    })
    .from(userRemovedHabits)
    .where(eq(userRemovedHabits.userId, userId));

  const removedIds = new Set(tombstones.map((t) => t.routineHabitId).filter(Boolean));
  const removedTitles = new Set(
    tombstones.filter((t) => !t.routineHabitId).map((t) => (t.title ?? "").toLowerCase()),
  );

  let all = Array.from(merged.values()).filter(
    (h) => !removedIds.has(h.id) && !removedTitles.has(h.title.toLowerCase()),
  );

  // Intensity is additive: lite gets lite only, intense gets everything.
  if (intensity === "lite") all = all.filter((h) => h.intensity === "lite");

  return all;
}

// ─── Materialisation ──────────────────────────────────────────────────────

/**
 * Write the habit rows for a date range of a routine.
 *
 * `ON CONFLICT DO NOTHING` is load-bearing, not defensive. A habit is unique
 * per (user, template, date) — see supabase/habit-identity.sql — and there are
 * legitimate collisions: a standalone habit the member already added from the
 * same template, and a resume that overlaps rows already present. Both used to
 * be duplicate rows and would now be a 500.
 *
 * Identity is the template id, never the title. `routine_habits.title` is
 * editable, and keying on it meant a rename inserted a parallel series instead
 * of matching the existing one — the member saw the habit twice, the day could
 * never read as complete, and the streak broke from an edit nobody thought was
 * destructive.
 */
async function materialise(opts: {
  userId: string;
  enrollmentId: string;
  templates: RoutineHabit[];
  startDate: string;
  durationDays: number;
  fromDate?: string;
}): Promise<number> {
  const { userId, enrollmentId, templates, startDate, durationDays, fromDate } = opts;

  const firstDay = fromDate ? Math.max(1, routineDayNumber(startDate, fromDate)) : 1;

  const rows = [];
  for (let dayNumber = firstDay; dayNumber <= durationDays; dayNumber++) {
    const scheduledDate = addDaysToString(startDate, dayNumber - 1);
    for (const habit of templates) {
      if (!templateRunsOnDay(habit, dayNumber, durationDays)) continue;
      rows.push({
        userId,
        userRoutineId: enrollmentId,
        routineHabitId: habit.id,
        title: habit.title,
        description: habit.shortDescription || habit.description || null,
        cadence: habit.cadence,
        completed: false,
        scheduledDate,
        dayNumber,
        isFromRoutine: true,
      });
    }
  }

  if (rows.length === 0) return 0;

  let written = 0;
  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const inserted = await db
      .insert(habits)
      .values(rows.slice(i, i + CHUNK))
      .onConflictDoNothing()
      .returning({ id: habits.id });
    written += inserted.length;
  }
  return written;
}

/** Clear a routine's not-yet-done rows from a date forward. Never touches history. */
async function clearFutureHabits(enrollmentId: string, fromDate: string): Promise<number> {
  const deleted = await db
    .delete(habits)
    .where(
      and(
        eq(habits.userRoutineId, enrollmentId),
        gte(habits.scheduledDate, fromDate),
        eq(habits.completed, false),
      ),
    )
    .returning({ id: habits.id });
  return deleted.length;
}

// ─── Timezone helper ──────────────────────────────────────────────────────

export async function memberToday(userId: string): Promise<string> {
  const [user] = await db
    .select({ timezone: users.timezone })
    .from(users)
    .where(eq(users.id, userId));
  return todayInZone(user?.timezone);
}

// ─── Lifecycle settlement ─────────────────────────────────────────────────

/**
 * Move a member's enrollments to where the calendar says they should be.
 *
 * Called at the top of every read path. This is what replaces the macro app's
 * hourly cron: nothing here needs to run on a schedule, because nobody can
 * observe a stale status without going through a handler that settles it
 * first.
 *
 * Idempotent, and cheap when there is nothing to do.
 */
export async function settleRoutines(
  userId: string,
  today?: string,
): Promise<{ activated: number; completed: number }> {
  const day = today ?? (await memberToday(userId));

  const enrollments = await db
    .select()
    .from(userRoutines)
    .where(
      and(
        eq(userRoutines.userId, userId),
        inArray(userRoutines.status, ["scheduled", "active"]),
      ),
    );

  let activated = 0;
  let completed = 0;

  // A routine whose last day has passed is over. Do this before activating, so
  // a finished routine frees the single-active slot for one starting today.
  for (const e of enrollments) {
    if (e.status === "active" && day > e.endDate) {
      await db
        .update(userRoutines)
        .set({ status: "completed", updatedAt: new Date() })
        .where(eq(userRoutines.id, e.id));
      completed++;
    }
  }

  const due = enrollments
    .filter((e) => e.status === "scheduled" && day >= e.startDate)
    .sort((a, b) => a.startDate.localeCompare(b.startDate));

  if (due.length > 0) {
    const starting = due[0];

    // Anything still running gives way to the routine whose day has come.
    await db
      .update(userRoutines)
      .set({ status: "paused", pausedAt: day, updatedAt: new Date() })
      .where(and(eq(userRoutines.userId, userId), eq(userRoutines.status, "active")));

    const [routine] = await db
      .select()
      .from(wellnessRoutines)
      .where(eq(wellnessRoutines.id, starting.routineId));

    if (routine) {
      const templates = await fetchFilteredHabits(
        starting.routineId,
        (starting.intensity as "lite" | "intense") ?? "lite",
        userId,
      );
      await materialise({
        userId,
        enrollmentId: starting.id,
        templates,
        startDate: starting.startDate,
        durationDays: routine.durationDays,
      });
    }

    await db
      .update(userRoutines)
      .set({ status: "active", updatedAt: new Date() })
      .where(eq(userRoutines.id, starting.id));

    await db
      .update(users)
      .set({
        activeRoutineId: starting.routineId,
        routineIntensity: starting.intensity,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));

    activated++;
  }

  // Clear the pointer on the profile if nothing is running any more.
  if (completed > 0 && activated === 0) {
    const [stillActive] = await db
      .select({ id: userRoutines.id })
      .from(userRoutines)
      .where(and(eq(userRoutines.userId, userId), eq(userRoutines.status, "active")));
    if (!stillActive) {
      await db
        .update(users)
        .set({ activeRoutineId: null, updatedAt: new Date() })
        .where(eq(users.id, userId));
    }
  }

  return { activated, completed };
}

/** The member's current enrollment, after settling. At most one by constraint. */
export async function getActiveEnrollment(userId: string): Promise<UserRoutine | null> {
  const [active] = await db
    .select()
    .from(userRoutines)
    .where(and(eq(userRoutines.userId, userId), eq(userRoutines.status, "active")))
    .orderBy(desc(userRoutines.createdAt))
    .limit(1);
  return active ?? null;
}

// ─── Enroll ───────────────────────────────────────────────────────────────

function idempotencyKey(userId: string, routineId: string, startDate: string, intensity: string) {
  return crypto
    .createHash("sha256")
    .update(`${userId}:${routineId}:${startDate}:${intensity}`)
    .digest("hex");
}

export interface EnrollmentInput {
  userId: string;
  routineId: string;
  startDate: string; // "YYYY-MM-DD" in the member's zone
  intensity: "lite" | "intense";
}

export interface EnrollmentResult {
  enrollment: UserRoutine;
  habitsScheduled: number;
  alreadyEnrolled: boolean;
}

export async function enrollInRoutine(input: EnrollmentInput): Promise<EnrollmentResult> {
  const { userId, routineId, intensity } = input;
  const today = await memberToday(userId);
  const startDate = input.startDate;

  if (startDate < today) {
    throw new Error("Start date cannot be in the past");
  }

  const clientRequestId = idempotencyKey(userId, routineId, startDate, intensity);

  const [existing] = await db
    .select()
    .from(userRoutines)
    .where(eq(userRoutines.clientRequestId, clientRequestId));

  // Only a live enrollment counts as a duplicate. Re-running a protocol you
  // finished or abandoned is a normal thing to want, and the old code's key
  // made that permanently impossible.
  if (existing && ["scheduled", "active", "paused"].includes(existing.status)) {
    return { enrollment: existing, habitsScheduled: 0, alreadyEnrolled: true };
  }

  const [routine] = await db
    .select()
    .from(wellnessRoutines)
    .where(eq(wellnessRoutines.id, routineId));
  if (!routine) throw new Error(`Routine not found: ${routineId}`);

  const isFuture = startDate > today;
  // Inclusive: a 21-day routine starting the 1st ends on the 21st.
  const endDate = addDaysToString(startDate, routine.durationDays - 1);

  // Make room. A future start displaces the queue, not what's running now.
  if (isFuture) {
    await db
      .update(userRoutines)
      .set({ status: "abandoned", updatedAt: new Date() })
      .where(and(eq(userRoutines.userId, userId), eq(userRoutines.status, "scheduled")));
  } else {
    await db
      .update(userRoutines)
      .set({ status: "paused", pausedAt: today, updatedAt: new Date() })
      .where(and(eq(userRoutines.userId, userId), eq(userRoutines.status, "active")));
  }

  const [enrollment] = await db
    .insert(userRoutines)
    .values({
      userId,
      routineId,
      startDate,
      endDate,
      status: isFuture ? "scheduled" : "active",
      intensity,
      // A re-run reuses the key, so clear it off the stale row first.
      clientRequestId,
    })
    .onConflictDoUpdate({
      target: userRoutines.clientRequestId,
      set: {
        startDate,
        endDate,
        status: isFuture ? "scheduled" : "active",
        intensity,
        pausedAt: null,
        updatedAt: new Date(),
      },
    })
    .returning();

  try {
    // A scheduled routine materialises on its start day, in settleRoutines.
    if (isFuture) {
      return { enrollment, habitsScheduled: 0, alreadyEnrolled: false };
    }

    await db
      .update(users)
      .set({ activeRoutineId: routineId, routineIntensity: intensity, updatedAt: new Date() })
      .where(eq(users.id, userId));

    const templates = await fetchFilteredHabits(routineId, intensity, userId);
    const written = await materialise({
      userId,
      enrollmentId: enrollment.id,
      templates,
      startDate,
      durationDays: routine.durationDays,
    });

    return { enrollment, habitsScheduled: written, alreadyEnrolled: false };
  } catch (error) {
    console.error("Enrollment scheduling failed, rolling back:", error);

    // habits cascade from user_routines, so one delete is enough.
    await db.delete(userRoutines).where(eq(userRoutines.id, enrollment.id));

    // Bring back the routine this one displaced — the most recently paused,
    // not an arbitrary historical one.
    const [previous] = await db
      .select()
      .from(userRoutines)
      .where(and(eq(userRoutines.userId, userId), eq(userRoutines.status, "paused")))
      .orderBy(desc(userRoutines.updatedAt))
      .limit(1);

    if (previous) {
      await db
        .update(userRoutines)
        .set({ status: "active", pausedAt: null, updatedAt: new Date() })
        .where(eq(userRoutines.id, previous.id));
    }

    await db
      .update(users)
      .set({
        activeRoutineId: previous?.routineId ?? null,
        routineIntensity: previous?.intensity ?? "lite",
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));

    throw error;
  }
}

// ─── Pause / resume / abandon ─────────────────────────────────────────────

/**
 * Pause: stop serving habits from today forward, and remember when.
 *
 * The old implementation flipped the status and left every future row in
 * place, so a paused routine kept issuing habits daily.
 */
export async function pauseRoutine(userId: string): Promise<UserRoutine | null> {
  const today = await memberToday(userId);
  const active = await getActiveEnrollment(userId);
  if (!active) return null;

  await clearFutureHabits(active.id, today);

  const [updated] = await db
    .update(userRoutines)
    .set({ status: "paused", pausedAt: today, updatedAt: new Date() })
    .where(eq(userRoutines.id, active.id))
    .returning();

  await db
    .update(users)
    .set({ activeRoutineId: null, updatedAt: new Date() })
    .where(eq(users.id, userId));

  return updated ?? null;
}

/**
 * Resume: pick the routine back up, giving back the days spent paused.
 *
 * A 21-day protocol paused on day 8 for a fortnight still owes 14 days, so
 * end_date shifts forward by the gap rather than the member losing the tail.
 * Days already completed stay completed — only the remaining ones are rewritten.
 */
export async function resumeRoutine(
  userId: string,
  enrollmentId?: string,
): Promise<{ enrollment: UserRoutine; habitsScheduled: number } | null> {
  const today = await memberToday(userId);

  const [paused] = await db
    .select()
    .from(userRoutines)
    .where(
      and(
        eq(userRoutines.userId, userId),
        eq(userRoutines.status, "paused"),
        ...(enrollmentId ? [eq(userRoutines.id, enrollmentId)] : []),
      ),
    )
    .orderBy(desc(userRoutines.updatedAt))
    .limit(1);

  if (!paused) return null;

  const [routine] = await db
    .select()
    .from(wellnessRoutines)
    .where(eq(wellnessRoutines.id, paused.routineId));
  if (!routine) return null;

  // Whatever is running now steps aside — the single-active index would
  // otherwise reject the update outright.
  await db
    .update(userRoutines)
    .set({ status: "paused", pausedAt: today, updatedAt: new Date() })
    .where(and(eq(userRoutines.userId, userId), eq(userRoutines.status, "active")));

  const gap = paused.pausedAt ? Math.max(0, daysBetweenStrings(today, paused.pausedAt)) : 0;
  const newStart = addDaysToString(paused.startDate, gap);
  const newEnd = addDaysToString(newStart, routine.durationDays - 1);

  // Rewrite the remainder against the shifted window.
  await clearFutureHabits(paused.id, today);

  const templates = await fetchFilteredHabits(
    paused.routineId,
    (paused.intensity as "lite" | "intense") ?? "lite",
    userId,
  );

  const written = await materialise({
    userId,
    enrollmentId: paused.id,
    templates,
    startDate: newStart,
    durationDays: routine.durationDays,
    fromDate: today,
  });

  const [updated] = await db
    .update(userRoutines)
    .set({
      status: "active",
      startDate: newStart,
      endDate: newEnd,
      pausedAt: null,
      updatedAt: new Date(),
    })
    .where(eq(userRoutines.id, paused.id))
    .returning();

  await db
    .update(users)
    .set({
      activeRoutineId: paused.routineId,
      routineIntensity: paused.intensity,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));

  return { enrollment: updated, habitsScheduled: written };
}

export async function abandonRoutine(userId: string): Promise<UserRoutine | null> {
  const today = await memberToday(userId);
  const active = await getActiveEnrollment(userId);
  if (!active) return null;

  await clearFutureHabits(active.id, today);

  const [updated] = await db
    .update(userRoutines)
    .set({ status: "abandoned", updatedAt: new Date() })
    .where(eq(userRoutines.id, active.id))
    .returning();

  await db
    .update(users)
    .set({ activeRoutineId: null, updatedAt: new Date() })
    .where(eq(users.id, userId));

  return updated ?? null;
}

// ─── Habit removal ────────────────────────────────────────────────────────

/**
 * Remove a habit from the member's days, for good.
 *
 * Two steps, and the first is what makes it stick: without a tombstone, the
 * next resume or re-enrol re-materialises exactly what was just deleted.
 * History is left alone — completed days are a record.
 */
export async function removeHabitSeries(
  userId: string,
  opts: { routineHabitId?: string | null; title?: string | null; userRoutineId?: string | null },
): Promise<{ removed: number }> {
  const today = await memberToday(userId);
  const { routineHabitId = null, title = null, userRoutineId = null } = opts;

  if (!routineHabitId && !title) {
    throw new Error("Need a habit template or a title to remove");
  }

  await db
    .insert(userRemovedHabits)
    .values({ userId, userRoutineId, routineHabitId, title })
    .onConflictDoNothing();

  const deleted = await db
    .delete(habits)
    .where(
      and(
        eq(habits.userId, userId),
        gte(habits.scheduledDate, today),
        eq(habits.completed, false),
        routineHabitId ? eq(habits.routineHabitId, routineHabitId) : eq(habits.title, title!),
      ),
    )
    .returning({ id: habits.id });

  return { removed: deleted.length };
}

/** Undo a removal, so the member can put a habit back. */
export async function restoreHabitSeries(
  userId: string,
  opts: { routineHabitId?: string | null; title?: string | null },
): Promise<{ restored: number }> {
  const { routineHabitId = null, title = null } = opts;

  await db
    .delete(userRemovedHabits)
    .where(
      and(
        eq(userRemovedHabits.userId, userId),
        routineHabitId
          ? eq(userRemovedHabits.routineHabitId, routineHabitId)
          : eq(userRemovedHabits.title, title!),
      ),
    );

  // Put it back into the days that remain of whatever is running.
  const active = await getActiveEnrollment(userId);
  if (!active) return { restored: 0 };

  const today = await memberToday(userId);
  const [routine] = await db
    .select()
    .from(wellnessRoutines)
    .where(eq(wellnessRoutines.id, active.routineId));
  if (!routine) return { restored: 0 };

  const templates = (
    await fetchFilteredHabits(
      active.routineId,
      (active.intensity as "lite" | "intense") ?? "lite",
      userId,
    )
  ).filter((h) => (routineHabitId ? h.id === routineHabitId : h.title === title));

  if (templates.length === 0) return { restored: 0 };

  const restored = await materialise({
    userId,
    enrollmentId: active.id,
    templates,
    startDate: active.startDate,
    durationDays: routine.durationDays,
    fromDate: today,
  });

  return { restored };
}

// ─── Reconciliation ───────────────────────────────────────────────────────

/**
 * Repair a live routine that is missing rows for today onward.
 *
 * Enrollment materialises everything up front, so this should be a no-op. It
 * exists because "should be" is not a guarantee: a partial failure, a hand-run
 * DELETE, or a restore can leave a hole, and a member with an empty day has no
 * way to fix it themselves.
 */
export async function reconcileHabits(
  userId: string,
  userRoutineId: string,
): Promise<{ reconciled: boolean; habitsAdded: number }> {
  const today = await memberToday(userId);

  const [enrollment] = await db
    .select()
    .from(userRoutines)
    .where(eq(userRoutines.id, userRoutineId));

  if (!enrollment || enrollment.status !== "active") {
    return { reconciled: false, habitsAdded: 0 };
  }
  if (today < enrollment.startDate || today > enrollment.endDate) {
    return { reconciled: false, habitsAdded: 0 };
  }

  const [routine] = await db
    .select()
    .from(wellnessRoutines)
    .where(eq(wellnessRoutines.id, enrollment.routineId));
  if (!routine) return { reconciled: false, habitsAdded: 0 };

  const templates = await fetchFilteredHabits(
    enrollment.routineId,
    (enrollment.intensity as "lite" | "intense") ?? "lite",
    userId,
  );

  // ON CONFLICT DO NOTHING makes this safe to run against days that are
  // already complete — only genuine holes get filled.
  const added = await materialise({
    userId,
    enrollmentId: enrollment.id,
    templates,
    startDate: enrollment.startDate,
    durationDays: routine.durationDays,
    fromDate: today,
  });

  return { reconciled: added > 0, habitsAdded: added };
}
