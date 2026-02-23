/**
 * Enrollment Engine — Core algorithm for enrolling users in routines
 *
 * Steps:
 *   1. Pause existing active routine
 *   2. Generate idempotency key (SHA-256)
 *   3. Insert enrollment record
 *   4. Update user profile
 *   5. Fetch & filter habit templates
 *   6. Schedule habits (day-by-day loop)
 *   7. Rollback on failure
 *   8. Reconciliation on app load
 */

import crypto from "crypto";
import { db } from "../db.js";
import { eq, and, sql, count } from "drizzle-orm";
import {
  users,
  wellnessRoutines,
  routineHabits,
  habitRoutineAssignments,
  userRoutines,
  habits,
  type WellnessRoutine,
  type RoutineHabit,
  type UserRoutine,
  type Habit,
} from "../../shared/schema.js";

import {
  formatLocalDateString,
  parseLocalDate,
  addDays,
  daysBetween,
} from "../../shared/utils/dates.js";

function generateIdempotencyKey(
  userId: string,
  routineId: string,
  startDate: string,
  intensity: string
): string {
  return crypto
    .createHash("sha256")
    .update(`${userId}:${routineId}:${startDate}:${intensity}`)
    .digest("hex");
}

// ─── Step 5: Fetch & Filter Habit Templates ───────────────────────────────

async function fetchFilteredHabits(
  routineId: string,
  intensity: "lite" | "intense"
): Promise<RoutineHabit[]> {
  // 1. Direct FK habits (routine_habits.routine_id = routineId)
  const directHabits = await db
    .select()
    .from(routineHabits)
    .where(eq(routineHabits.routineId, routineId));

  // 2. Junction-table habits (habit_routine_assignments)
  const junctionRows = await db
    .select({ habitId: habitRoutineAssignments.habitId })
    .from(habitRoutineAssignments)
    .where(eq(habitRoutineAssignments.routineId, routineId));

  let junctionHabits: RoutineHabit[] = [];
  if (junctionRows.length > 0) {
    const junctionIds = junctionRows.map((r) => r.habitId);
    // Fetch each habit by ID (small set, typically < 50)
    const results = await Promise.all(
      junctionIds.map((id) =>
        db.select().from(routineHabits).where(eq(routineHabits.id, id))
      )
    );
    junctionHabits = results.flat();
  }

  // 3. Merge + deduplicate by id
  const merged = new Map<string, RoutineHabit>();
  for (const h of [...directHabits, ...junctionHabits]) {
    merged.set(h.id, h);
  }

  // 4. Filter by intensity
  //    lite → only lite habits
  //    intense → all habits (lite + intense)
  const allHabits = Array.from(merged.values());
  if (intensity === "lite") {
    return allHabits.filter((h) => h.intensity === "lite");
  }
  return allHabits; // intense gets everything
}

// ─── Step 6: Schedule Habits ──────────────────────────────────────────────

async function scheduleHabits(
  userId: string,
  enrollmentId: string,
  habitTemplates: RoutineHabit[],
  startDate: Date,
  durationDays: number
): Promise<void> {
  const rows: Array<{
    userId: string;
    userRoutineId: string;
    routineHabitId: string;
    title: string;
    description: string | null;
    cadence: string;
    completed: boolean;
    scheduledDate: string;
    dayNumber: number;
    isFromRoutine: boolean;
  }> = [];

  for (let dayNumber = 1; dayNumber <= durationDays; dayNumber++) {
    const currentDate = addDays(startDate, dayNumber - 1);
    const dateStr = formatLocalDateString(currentDate);

    for (const habit of habitTemplates) {
      // Day range check
      const dayStart = habit.dayStart ?? 1;
      const dayEnd = habit.dayEnd ?? durationDays;
      if (dayNumber < dayStart || dayNumber > dayEnd) continue;

      // Cadence check
      if (habit.cadence === "as-needed") continue; // don't pre-schedule
      if (habit.cadence === "weekly") {
        if ((dayNumber - dayStart) % 7 !== 0) continue;
      }
      // 'daily' → always include

      rows.push({
        userId,
        userRoutineId: enrollmentId,
        routineHabitId: habit.id,
        title: habit.title,
        description: habit.shortDescription || habit.description || null,
        cadence: habit.cadence,
        completed: false,
        scheduledDate: dateStr,
        dayNumber,
        isFromRoutine: true,
      });
    }
  }

  if (rows.length === 0) return;

  // Batch insert — Postgres handles up to ~65k params; typical routine
  // produces 14 days × 10 habits = 140 rows, well within limits.
  // Insert in chunks of 500 to be safe.
  const CHUNK_SIZE = 500;
  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE);
    await db.insert(habits).values(chunk);
  }
}

// ─── Main Enrollment Function ─────────────────────────────────────────────

export interface EnrollmentInput {
  userId: string;
  routineId: string;
  startDate: string; // ISO date string "2026-03-01"
  intensity: "lite" | "intense";
}

export interface EnrollmentResult {
  enrollment: UserRoutine;
  habitsScheduled: number;
  alreadyEnrolled: boolean;
}

export async function enrollInRoutine(
  input: EnrollmentInput
): Promise<EnrollmentResult> {
  const { userId, routineId, startDate, intensity } = input;

  // ── Step 2: Idempotency check ──────────────────────────────────────────
  const clientRequestId = generateIdempotencyKey(userId, routineId, startDate, intensity);

  const [existing] = await db
    .select()
    .from(userRoutines)
    .where(eq(userRoutines.clientRequestId, clientRequestId));

  if (existing) {
    return { enrollment: existing, habitsScheduled: 0, alreadyEnrolled: true };
  }

  // ── Validate routine exists ────────────────────────────────────────────
  const [routine] = await db
    .select()
    .from(wellnessRoutines)
    .where(eq(wellnessRoutines.id, routineId));

  if (!routine) {
    throw new Error(`Routine not found: ${routineId}`);
  }

  // ── Step 1: Pause existing active routine ──────────────────────────────
  await db
    .update(userRoutines)
    .set({ status: "paused", updatedAt: new Date() })
    .where(and(eq(userRoutines.userId, userId), eq(userRoutines.status, "active")));

  // ── Step 3: Insert enrollment record ───────────────────────────────────
  const start = parseLocalDate(startDate);
  const end = addDays(start, routine.durationDays);

  const [enrollment] = await db
    .insert(userRoutines)
    .values({
      userId,
      routineId,
      startDate: formatLocalDateString(start),
      endDate: formatLocalDateString(end),
      status: "active",
      intensity,
      clientRequestId,
    })
    .returning();

  try {
    // ── Step 4: Update user profile ────────────────────────────────────────
    await db
      .update(users)
      .set({
        activeRoutineId: routineId,
        routineIntensity: intensity,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));

    // ── Step 5: Fetch & filter habit templates ─────────────────────────────
    const habitTemplates = await fetchFilteredHabits(routineId, intensity);

    // ── Step 6: Schedule habits ────────────────────────────────────────────
    await scheduleHabits(
      userId,
      enrollment.id,
      habitTemplates,
      start,
      routine.durationDays
    );

    // Count what was scheduled
    const [{ total }] = await db
      .select({ total: count() })
      .from(habits)
      .where(eq(habits.userRoutineId, enrollment.id));

    return {
      enrollment,
      habitsScheduled: Number(total),
      alreadyEnrolled: false,
    };
  } catch (error) {
    // ── Step 7: Rollback on failure ──────────────────────────────────────
    console.error("Enrollment scheduling failed, rolling back:", error);

    // Delete the enrollment record
    await db.delete(userRoutines).where(eq(userRoutines.id, enrollment.id));

    // Delete any partially inserted habits
    await db.delete(habits).where(eq(habits.userRoutineId, enrollment.id));

    // Restore user profile — find their most recent active routine (if any)
    const [previousActive] = await db
      .select()
      .from(userRoutines)
      .where(and(eq(userRoutines.userId, userId), eq(userRoutines.status, "paused")));

    await db
      .update(users)
      .set({
        activeRoutineId: previousActive?.routineId ?? null,
        routineIntensity: previousActive?.intensity ?? "lite",
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));

    // Re-activate the paused routine if one was found
    if (previousActive) {
      await db
        .update(userRoutines)
        .set({ status: "active", updatedAt: new Date() })
        .where(eq(userRoutines.id, previousActive.id));
    }

    throw error; // re-throw so the route handler sends an error response
  }
}

// ─── Step 8: Reconciliation ──────────────────────────────────────────────

export async function reconcileHabits(
  userId: string,
  userRoutineId: string
): Promise<{ reconciled: boolean; habitsAdded: number }> {
  const today = formatLocalDateString();

  // Check if any habits exist for today
  const [{ total }] = await db
    .select({ total: count() })
    .from(habits)
    .where(
      and(
        eq(habits.userId, userId),
        eq(habits.userRoutineId, userRoutineId),
        eq(habits.scheduledDate, today)
      )
    );

  if (Number(total) > 0) {
    return { reconciled: false, habitsAdded: 0 };
  }

  // Fetch the enrollment to get routine details
  const [enrollment] = await db
    .select()
    .from(userRoutines)
    .where(eq(userRoutines.id, userRoutineId));

  if (!enrollment || enrollment.status !== "active") {
    return { reconciled: false, habitsAdded: 0 };
  }

  // The routine should have habits if today falls within start_date..end_date
  const startDate = parseLocalDate(enrollment.startDate);
  const endDate = parseLocalDate(enrollment.endDate);
  const todayDate = parseLocalDate(today);

  if (todayDate < startDate || todayDate > endDate) {
    return { reconciled: false, habitsAdded: 0 };
  }

  // Re-run scheduling for the missing day
  const intensity = (enrollment.intensity as "lite" | "intense") || "lite";
  const habitTemplates = await fetchFilteredHabits(enrollment.routineId, intensity);
  const dayNumber = daysBetween(todayDate, startDate) + 1;

  // Schedule just today's habits
  let added = 0;
  for (const habit of habitTemplates) {
    const dayStart = habit.dayStart ?? 1;
    const dayEnd = habit.dayEnd ?? daysBetween(endDate, startDate);
    if (dayNumber < dayStart || dayNumber > dayEnd) continue;
    if (habit.cadence === "as-needed") continue;
    if (habit.cadence === "weekly" && (dayNumber - dayStart) % 7 !== 0) continue;

    // Check if this specific habit already exists for today (duplicate guard)
    const [existingHabit] = await db
      .select({ id: habits.id })
      .from(habits)
      .where(
        and(
          eq(habits.userId, userId),
          eq(habits.routineHabitId, habit.id),
          eq(habits.scheduledDate, today)
        )
      );

    if (existingHabit) continue;

    await db.insert(habits).values({
      userId,
      userRoutineId,
      routineHabitId: habit.id,
      title: habit.title,
      description: habit.shortDescription || habit.description || null,
      cadence: habit.cadence,
      completed: false,
      scheduledDate: today,
      dayNumber,
      isFromRoutine: true,
    });
    added++;
  }

  return { reconciled: added > 0, habitsAdded: added };
}

// ─── Pause / Abandon Routine ─────────────────────────────────────────────

export async function pauseRoutine(userId: string): Promise<UserRoutine | null> {
  const [updated] = await db
    .update(userRoutines)
    .set({ status: "paused", updatedAt: new Date() })
    .where(and(eq(userRoutines.userId, userId), eq(userRoutines.status, "active")))
    .returning();

  if (updated) {
    await db
      .update(users)
      .set({ activeRoutineId: null, updatedAt: new Date() })
      .where(eq(users.id, userId));
  }

  return updated || null;
}

export async function abandonRoutine(userId: string): Promise<UserRoutine | null> {
  const [updated] = await db
    .update(userRoutines)
    .set({ status: "abandoned", updatedAt: new Date() })
    .where(and(eq(userRoutines.userId, userId), eq(userRoutines.status, "active")))
    .returning();

  if (updated) {
    await db
      .update(users)
      .set({ activeRoutineId: null, updatedAt: new Date() })
      .where(eq(users.id, userId));
  }

  return updated || null;
}
