/**
 * Taking the copy of a workout that goes to the Room.
 *
 * ── Why this runs once, at publish time ───────────────────────────────────
 *
 * It used to run on every read. `community_messages.shared_session_id` pointed
 * at the real session and the card was rebuilt from `workout_sets` whenever
 * anybody scrolled past it, so that correcting a set corrected the post.
 *
 * The consequence was that a member editing their private training log
 * silently rewrote a public conversation. Fix a typo in Tuesday's squat and
 * the post from Tuesday, and the eight replies to it, are now about a
 * different lift. Nobody edited the post; nobody was told it changed; there is
 * no version of it that says what was said.
 *
 * So this builds a presentation once, the message stores it, and the read path
 * does not come back here at all. `shared_session_id` stays as provenance —
 * which training this was, and how "is this mine" is answered.
 *
 * ── What a share is not allowed to carry ──────────────────────────────────
 *
 * Everything a member said privately. The session's `note` is theirs — it is
 * where "shoulder felt wrong again" goes — and so are per-set notes, RPE, and
 * whether they went to failure. None of it is selected below.
 *
 * That is a deliberate narrowing rather than an oversight: a member sharing a
 * lift is saying "I did this", not opening their training diary, and a share
 * that quietly published their discomfort notes would be the kind of surprise
 * nobody forgives. Health measurements, Terrain reasons and Training Memory
 * are not reachable from here at all, which is the strongest form of the same
 * rule — and now that the result is written down rather than re-derived, the
 * narrowing is frozen with it. A later version of this file cannot
 * retroactively widen what an old post published.
 *
 * The caption they type is separate, in the message body, where they can see
 * exactly what they wrote.
 */

import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "../db.js";
import { exercises, sessionExercises, workoutSessions, workoutSets } from "../../shared/schema.js";
import {
  type CompositionRow,
  type SessionRow,
  type SetRow,
  type SharedMovement,
  type SharedWorkout,
  summarise,
} from "../../shared/models/community.js";

export type { SharedMovement, SharedWorkout };
export { summarise };

/**
 * The card for one session, as of now.
 *
 * Null when the session has gone. Callers treat that as "there is nothing to
 * publish" rather than posting an empty card — a share of nothing is not a
 * share.
 */
export async function publishedWorkout(
  sessionId: string,
  publishedAt = new Date().toISOString(),
): Promise<SharedWorkout | null> {
  const [session] = await db
    .select({
      id: workoutSessions.id,
      title: workoutSessions.title,
      onDate: workoutSessions.onDate,
      durationMinutes: workoutSessions.durationMinutes,
    })
    .from(workoutSessions)
    .where(eq(workoutSessions.id, sessionId));
  if (!session) return null;

  const composition = await db
    .select({
      exerciseId: sessionExercises.exerciseId,
      supersetGroup: sessionExercises.supersetGroup,
      name: exercises.name,
      /*
        Read here because the volume on the card cannot be computed without
        them, and computing it wrong is worse than not publishing it: the
        card said "5,361 kg moved" on a session whose dumbbell work was
        entered per hand and counted once.

        Read from `session_exercises`, which recorded it when the movement
        entered that workout, and never from the catalogue: a member changing
        how a movement is entered today must not change the number on a card
        published in March. Null means the session predates the question, and
        the card then publishes the total it always published.
      */
      loadEntry: sessionExercises.loadEntry,
      unilateral: sql<boolean>`coalesce(${exercises.unilateral}, false)`,
    })
    .from(sessionExercises)
    .leftJoin(exercises, eq(exercises.id, sessionExercises.exerciseId))
    .where(eq(sessionExercises.sessionId, sessionId))
    .orderBy(asc(sessionExercises.position), asc(sessionExercises.createdAt));

  /*
    Warm-ups are excluded here rather than filtered afterwards, matching every
    other derived number in the product — counting a ramp toward volume makes
    a light day look heavy.
  */
  const sets = await db
    .select({
      exerciseId: workoutSets.exerciseId,
      reps: workoutSets.reps,
      weightKg: workoutSets.weightKg,
    })
    .from(workoutSets)
    .where(and(eq(workoutSets.sessionId, sessionId), eq(workoutSets.isWarmup, false)));

  return summarise(session, composition, sets, publishedAt);
}

/**
 * Whether this member may share this session — which is only ever their own.
 *
 * Checked at post time rather than at render time, so a message can never
 * exist that points at somebody else's training.
 */
export async function ownsSession(userId: string, sessionId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: workoutSessions.id })
    .from(workoutSessions)
    .where(and(eq(workoutSessions.id, sessionId), eq(workoutSessions.userId, userId)))
    .limit(1);
  return !!row;
}
