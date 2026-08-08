/**
 * Wins — awarding.
 *
 * `awardWins()` is called after anything that could have earned one: a habit
 * toggle, a routine settling to complete. It is deliberately safe to call as
 * often as you like — every insert is `ON CONFLICT DO NOTHING` against
 * `uq_wins (user_id, kind, subject_id)`, so the tenth call on day 30 awards
 * nothing new.
 *
 * That idempotence is load-bearing, not defensive. The alternative is a caller
 * having to know whether a win was already given, which means reading before
 * writing, which races with itself the moment two tabs are open.
 */

import { db } from "../db.js";
import { and, eq, sql, desc } from "drizzle-orm";
import {
  wins,
  habits,
  users,
  userRoutines,
  wellnessRoutines,
  STREAK_MILESTONES,
  winHeadline,
  winCaption,
  type WinKind,
  type Win,
} from "../../shared/schema.js";
import { memberToday } from "../coaching/enrollment.js";
import { track } from "../telemetry/index.js";

/** Write one, unless it's already been earned. Returns it only if it's new. */
async function award(opts: {
  userId: string;
  kind: WinKind;
  subjectId: string | null;
  props: Record<string, unknown>;
  onDate: string;
}): Promise<Win | null> {
  const { userId, kind, subjectId, props, onDate } = opts;

  const [created] = await db
    .insert(wins)
    .values({
      userId,
      kind,
      subjectId,
      // Copy is resolved at award time and stored, so a protocol renamed next
      // month doesn't rewrite what somebody was congratulated for.
      title: winHeadline(kind, props),
      subtitle: winCaption(kind, props),
      props,
      onDate,
    })
    .onConflictDoNothing()
    .returning();

  if (created) {
    track("win.earned", {
      userId,
      surface: "engine",
      subjectId: created.id,
      onDate,
      props: { kind, ...props },
    });
  }

  return created ?? null;
}

/**
 * Award anything this member has just earned.
 *
 * Returns only what is newly earned, so a caller can decide whether to say
 * something. An empty array is the normal case and costs three cheap queries.
 */
export async function awardWins(userId: string): Promise<Win[]> {
  const onDate = await memberToday(userId);
  const earned: Win[] = [];

  const [me] = await db
    .select({ streak: users.currentStreak })
    .from(users)
    .where(eq(users.id, userId));

  // ── First step ───────────────────────────────────────────────────────────
  const [anyDone] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(habits)
    .where(and(eq(habits.userId, userId), eq(habits.completed, true)));

  if (Number(anyDone?.n ?? 0) > 0) {
    const win = await award({
      userId,
      kind: "first_step",
      subjectId: null,
      props: {},
      onDate,
    });
    if (win) earned.push(win);
  }

  // ── Streak milestones ────────────────────────────────────────────────────
  //
  // Every milestone at or below the current streak, not just the one exactly
  // matched. A member who opens the app after a week away and completes three
  // days at once should not skip past 7 without being told.
  const streak = me?.streak ?? 0;
  for (const milestone of STREAK_MILESTONES) {
    if (streak < milestone) break;
    const win = await award({
      userId,
      kind: "streak",
      subjectId: String(milestone),
      props: { days: milestone },
      onDate,
    });
    if (win) earned.push(win);
  }

  // ── Finished protocols ───────────────────────────────────────────────────
  //
  // Read from the enrollment's own status rather than counting habits: the
  // engine already decides when a routine is complete, and re-deciding it here
  // would be a second implementation of the same rule that could disagree.
  const completed = await db
    .select({
      enrollment: userRoutines,
      routineName: wellnessRoutines.name,
      durationDays: wellnessRoutines.durationDays,
    })
    .from(userRoutines)
    .leftJoin(wellnessRoutines, eq(wellnessRoutines.id, userRoutines.routineId))
    .where(and(eq(userRoutines.userId, userId), eq(userRoutines.status, "completed")))
    .orderBy(desc(userRoutines.startDate));

  for (const row of completed) {
    const win = await award({
      userId,
      kind: "routine_complete",
      subjectId: row.enrollment.id,
      props: {
        routineName: row.routineName ?? "Protocol",
        routineId: row.enrollment.routineId,
        days: row.durationDays ?? null,
        startDate: row.enrollment.startDate,
        endDate: row.enrollment.endDate,
      },
      onDate,
    });
    if (win) earned.push(win);
  }

  return earned;
}

export { registerWinRoutes } from "./routes.js";
