/**
 * What a workout is made of, and what happened the last time it was made of it.
 *
 * ── Two questions that used to have no answer ─────────────────────────────
 *
 * "Which movements are in this session?" was answered by looking at the sets,
 * which cannot see a movement chosen a minute ago and not yet performed. And
 * "what did I lift last time?" was answered by nothing at all — the endpoint
 * that exists, `GET /exercises/:id/history`, returns an estimated-1RM series,
 * which is the right answer to a question about months and the wrong answer to
 * a question about last Tuesday. It had no caller for that reason.
 *
 * Both belong together here because the workout screen asks them in one breath:
 * it needs the list, in order, with what each movement is, and beside each one
 * the numbers the member is about to try to match.
 */

import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db.js";
import {
  exercises,
  sessionExercises,
  trainingObservations,
  workoutSessions,
  workoutSets,
  displayWeight,
  type PriorPerformance,
  type WeightUnit,
} from "../../shared/schema.js";

/**
 * A movement in a session, with enough of the catalogue attached to draw its
 * row.
 *
 * The exercise columns travel with it for the same reason they travel with a
 * logged set: a screen that has to wait on a second request to learn whether a
 * movement takes weight draws it wrong first.
 */
export type SessionMovement = {
  id: string;
  exerciseId: string;
  name: string;
  category: string;
  trackingType: string;
  takesLoad: boolean;
  unilateral: boolean;
  /**
   * What the number in the weight box meant in this session. Null when the
   * workout predates the question — see `session_exercises.load_entry`.
   */
  loadEntry: string | null;
  position: number;
  supersetGroup: string | null;
  habitExerciseId: string | null;
};

/**
 * What a set's own workout said its numbers meant.
 *
 * A correlated subquery rather than a join, so any of the six readbacks that
 * already select from `workout_sets` can add one line and get the session's
 * own interpretation instead of the catalogue's current setting. The unique
 * index on `(session_id, exercise_id)` makes it an index lookup and makes the
 * single row unambiguous.
 *
 * Null when the session predates the column — the arithmetic that answers
 * that is in `loadShape`, and it is the arithmetic this product already used.
 *
 * ── The outer table is named, not interpolated as a column ───────────────
 *
 * `${workoutSets}.session_id`, not `${workoutSets.sessionId}`. Drizzle renders
 * a column reference inside a *selected* expression unqualified — the first
 * version of this emitted `where se.session_id = "session_id"`, which Postgres
 * resolves against the innermost table in scope. That is `se`, so the
 * correlation became `se.session_id = se.session_id`: always true, every row
 * of the table returned, and every query using it failing at runtime with
 * "more than one row returned by a subquery used as an expression".
 *
 * It typechecked, it read correctly, and it was wrong on the first request.
 * script/qa-workout-pass.ts is what found it; nothing without a database
 * could have.
 */
export const setLoadEntry = sql<string | null>`(
  select se.load_entry
    from ${sessionExercises} se
   where se.session_id = ${workoutSets}.session_id
     and se.exercise_id = ${workoutSets}.exercise_id
)`;

/**
 * Put a movement in the session, or leave it where it already is.
 *
 * `onConflictDoNothing` rather than a select-then-insert: two taps on Add — or
 * a set logged by an older client that does not know this table exists — must
 * not be able to produce a second row or a 500. The unique index is what makes
 * that safe, and it is the same index the set-to-composition join relies on.
 *
 * Position is appended, computed in the statement rather than read first, so
 * two devices adding movements at the same moment cannot both claim the same
 * place in the list.
 */
export async function ensureSessionExercise(
  sessionId: string,
  exerciseId: string,
  habitExerciseId?: string | null,
): Promise<void> {
  await db
    .insert(sessionExercises)
    .values({
      sessionId,
      exerciseId,
      habitExerciseId: habitExerciseId ?? null,
      /*
        What the weight box means, copied now rather than joined later.

        The catalogue setting can change; what this workout meant cannot. Read
        in the same statement that inserts the row so there is no window in
        which a movement is in a session with no recorded interpretation, and
        so two devices adding the same movement cannot record two different
        ones — `onConflictDoNothing` keeps the first.
      */
      loadEntry: sql<string>`(
        select load_entry from ${exercises} where id = ${exerciseId}
      )`,
      position: sql<number>`(
        select coalesce(max(position), -1) + 1
        from ${sessionExercises}
        where session_id = ${sessionId}
      )`,
    })
    .onConflictDoNothing();
}

/** The session's movements, in the order the member arranged them. */
export async function compositionFor(sessionId: string): Promise<SessionMovement[]> {
  const rows = await db
    .select({
      id: sessionExercises.id,
      exerciseId: sessionExercises.exerciseId,
      name: exercises.name,
      category: exercises.category,
      trackingType: exercises.trackingType,
      takesLoad: exercises.takesLoad,
      unilateral: exercises.unilateral,
      /* This session's reading, not the catalogue's current one. Null for
         anything logged before the column existed — see the schema note. */
      loadEntry: sessionExercises.loadEntry,
      position: sessionExercises.position,
      supersetGroup: sessionExercises.supersetGroup,
      habitExerciseId: sessionExercises.habitExerciseId,
    })
    .from(sessionExercises)
    .innerJoin(exercises, eq(sessionExercises.exerciseId, exercises.id))
    .where(eq(sessionExercises.sessionId, sessionId))
    .orderBy(asc(sessionExercises.position), asc(sessionExercises.createdAt));

  return rows as SessionMovement[];
}

/** Take a movement out, with everything logged under it. */
export async function removeSessionExercise(
  sessionId: string,
  exerciseId: string,
): Promise<{ removed: number }> {
  const removed = await db
    .delete(workoutSets)
    .where(and(eq(workoutSets.sessionId, sessionId), eq(workoutSets.exerciseId, exerciseId)))
    .returning({ id: workoutSets.id });

  await db
    .delete(sessionExercises)
    .where(
      and(eq(sessionExercises.sessionId, sessionId), eq(sessionExercises.exerciseId, exerciseId)),
    );

  return { removed: removed.length };
}

/**
 * A workout's shape, with nothing in it that was performed.
 *
 * The one type that a saved workout, a finished session and a prescribed habit
 * all reduce to, so "start this again" is one code path rather than three that
 * drift. Sets, reps, loads, RPE and notes are deliberately not here: repeating
 * a workout means doing it again, not being handed last week's numbers as
 * though they were today's.
 */
export type PlannedMovement = {
  exerciseId: string;
  supersetGroup: string | null;
  habitExerciseId?: string | null;
};

/**
 * Fill a new session with the movements it is supposed to contain.
 *
 * ── Why it takes a transaction ───────────────────────────────────────────
 *
 * The defect this replaces created the session and copied nothing, so a member
 * tapping a saved workout got its name, a running timer and an empty screen —
 * the app appearing to have lost the workout they had just chosen. The fix is
 * not "also copy the movements"; it is that a session and its intended
 * composition are one fact. Either both exist or the start fails and says so.
 * A caller that inserted the session first and then called this would have
 * reintroduced exactly the window it exists to close, which is why there is no
 * pool-taking version of it.
 *
 * ── Superset keys are minted here ────────────────────────────────────────
 *
 * The plan's keys are only a statement of which movements travel together. New
 * uuids per session keep a group's identity local to the workout it happened
 * in, so nothing can ever join two sessions' movements into one bracket.
 */
export async function fillSessionComposition(
  tx: { insert: typeof db.insert },
  sessionId: string,
  plan: readonly PlannedMovement[],
): Promise<number> {
  if (plan.length === 0) return 0;

  const minted = new Map<string, string>();
  const groupFor = (key: string | null): string | null => {
    if (!key) return null;
    const existing = minted.get(key);
    if (existing) return existing;
    const fresh = crypto.randomUUID();
    minted.set(key, fresh);
    return fresh;
  };

  await tx.insert(sessionExercises).values(
    plan.map((m, i) => ({
      sessionId,
      exerciseId: m.exerciseId,
      habitExerciseId: m.habitExerciseId ?? null,
      position: i,
      supersetGroup: groupFor(m.supersetGroup),
      // The same snapshot `ensureSessionExercise` takes. A movement arriving
      // from a template still records what its numbers will mean *today*,
      // read from the catalogue as it stands now — see the schema note.
      loadEntry: sql<string>`(select load_entry from ${exercises} where id = ${m.exerciseId})`,
    })),
  );

  return plan.length;
}

/**
 * Correct what the weight box means, for this workout.
 *
 * ── Session-scoped, deliberately ─────────────────────────────────────────
 *
 * The catalogue's setting is not touched. A member saying "actually I'm
 * entering this per hand today" is telling us about today; rewriting the
 * movement would reach every *future* session silently, and rewriting past
 * sessions is the thing this whole column exists to make impossible.
 *
 * ── One reading per movement per session ─────────────────────────────────
 *
 * Not per set. A member who changes it after three sets is correcting a
 * mistake in how they were entering the number, not describing a change in
 * what they were doing — so the whole movement re-reads, and the screen says
 * so before they confirm. Per-set semantics would make "what did this
 * movement weigh" a question with no single answer, and every reader of it
 * would have to learn to ask per row.
 */
export async function setSessionLoadEntry(
  sessionId: string,
  exerciseId: string,
  loadEntry: string,
): Promise<void> {
  await db
    .update(sessionExercises)
    .set({ loadEntry })
    .where(
      and(eq(sessionExercises.sessionId, sessionId), eq(sessionExercises.exerciseId, exerciseId)),
    );
}

/**
 * Pair two movements, or unpair one.
 *
 * The member says "superset with the incline press"; they do not say "assign
 * group 4f3c…". So the group is resolved here: joining a movement that is
 * already in a group joins that group, and joining one that is not creates a
 * group holding both. Passing `null` for the partner leaves the group, and a
 * group left holding a single movement is dissolved — a superset of one is a
 * set, and leaving the key behind would draw a bracket around nothing.
 */
export async function pairSessionExercise(
  sessionId: string,
  exerciseId: string,
  partnerExerciseId: string | null,
): Promise<void> {
  const rows = await db
    .select({
      exerciseId: sessionExercises.exerciseId,
      supersetGroup: sessionExercises.supersetGroup,
    })
    .from(sessionExercises)
    .where(eq(sessionExercises.sessionId, sessionId));

  const mine = rows.find((r) => r.exerciseId === exerciseId);
  if (!mine) return;
  const previous = mine.supersetGroup;
  let joined: string | null = null;

  if (partnerExerciseId === null) {
    await db
      .update(sessionExercises)
      .set({ supersetGroup: null })
      .where(
        and(eq(sessionExercises.sessionId, sessionId), eq(sessionExercises.exerciseId, exerciseId)),
      );
  } else {
    const partner = rows.find((r) => r.exerciseId === partnerExerciseId);
    if (!partner) return;

    joined = partner.supersetGroup ?? crypto.randomUUID();
    await db
      .update(sessionExercises)
      .set({ supersetGroup: joined })
      .where(
        and(
          eq(sessionExercises.sessionId, sessionId),
          inArray(sessionExercises.exerciseId, [exerciseId, partnerExerciseId]),
        ),
      );
  }

  // Whatever the movement just left, if it is now a group of one, is not a
  // superset any more. Compared against the group it joined, not against the
  // partner's id — those are different kinds of thing and confusing them would
  // leave a bracket drawn around a single movement.
  if (previous && previous !== joined) await dissolveIfAlone(sessionId, previous);
}

async function dissolveIfAlone(sessionId: string, group: string): Promise<void> {
  const left = await db
    .select({ exerciseId: sessionExercises.exerciseId })
    .from(sessionExercises)
    .where(
      and(eq(sessionExercises.sessionId, sessionId), eq(sessionExercises.supersetGroup, group)),
    );
  if (left.length > 1) return;
  await db
    .update(sessionExercises)
    .set({ supersetGroup: null })
    .where(
      and(eq(sessionExercises.sessionId, sessionId), eq(sessionExercises.supersetGroup, group)),
    );
}

/**
 * What was done last time, for each of these movements.
 *
 * ── Two queries, not one per movement ─────────────────────────────────────
 *
 * A chest session has seven movements and this is asked on the way into a
 * workout, on a phone, in a gym. Seven round trips would be seven chances to
 * draw a screen half-populated. `DISTINCT ON` picks the most recent qualifying
 * session per exercise in one pass, and the second query fetches those sets.
 *
 * ── What qualifies ────────────────────────────────────────────────────────
 *
 * A *finished* session, belonging to this member, that is not the one they are
 * standing in. Unfinished sessions are excluded deliberately: a workout
 * abandoned halfway is not a performance to match, and one that is still
 * running is the one being performed now. The current session is excluded by id
 * rather than by date, because training the same movement twice in a day is
 * ordinary and the first half should not become "last time" for the second.
 */
export async function priorPerformanceFor(
  userId: string,
  exerciseIds: readonly string[],
  excludeSessionId: string | null,
  unit: WeightUnit,
): Promise<Record<string, PriorPerformance>> {
  if (exerciseIds.length === 0) return {};

  const latest = await db.execute<{
    exercise_id: string;
    session_id: string;
    on_date: string;
  }>(sql`
    SELECT DISTINCT ON (ws.exercise_id)
           ws.exercise_id, ws.session_id, s.on_date
    FROM workout_sets ws
    JOIN workout_sessions s ON s.id = ws.session_id
    WHERE s.user_id = ${userId}
      AND s.finished_at IS NOT NULL
      AND ws.exercise_id IN (${sql.join(
        exerciseIds.map((id) => sql`${id}`),
        sql`, `,
      )})
      ${excludeSessionId ? sql`AND s.id <> ${excludeSessionId}` : sql``}
    ORDER BY ws.exercise_id, s.on_date DESC, s.finished_at DESC
  `);

  const found = latest.rows ?? [];
  if (found.length === 0) return {};

  // How the movement is performed, which is a property of the movement and not
  // of the day it was performed on — so unlike `load_entry` this is right to
  // read from the catalogue.
  const shapes = await db
    .select({ id: exercises.id, unilateral: exercises.unilateral })
    .from(exercises)
    .where(inArray(exercises.id, found.map((r) => r.exercise_id)));
  const unilateralOf = new Map(shapes.map((r) => [r.id, r.unilateral]));

  const sets = await db
    .select({
      sessionId: workoutSets.sessionId,
      exerciseId: workoutSets.exerciseId,
      setIndex: workoutSets.setIndex,
      reps: workoutSets.reps,
      durationSeconds: workoutSets.durationSeconds,
      distanceM: workoutSets.distanceM,
      weightKg: workoutSets.weightKg,
      rpe: workoutSets.rpe,
      isWarmup: workoutSets.isWarmup,
      /* So "70 × 8 lb" beside today's row can say whether that was 70 in each
         hand. Read from the session it happened in, never from the catalogue. */
      loadEntry: setLoadEntry,
    })
    .from(workoutSets)
    .where(
      and(
        inArray(
          workoutSets.sessionId,
          found.map((r) => r.session_id),
        ),
        inArray(
          workoutSets.exerciseId,
          found.map((r) => r.exercise_id),
        ),
      ),
    )
    .orderBy(asc(workoutSets.setIndex));

  const out: Record<string, PriorPerformance> = {};
  for (const row of found) {
    const mine = sets.filter(
      (s) => s.sessionId === row.session_id && s.exerciseId === row.exercise_id,
    );
    if (mine.length === 0) continue;
    out[row.exercise_id] = {
      exerciseId: row.exercise_id,
      onDate: row.on_date,
      // One interpretation per movement per session, which is what the column
      // is — taking it off the first set is reading the session's row.
      loadEntry: mine[0].loadEntry ?? null,
      unilateral: unilateralOf.get(row.exercise_id) ?? false,
      sets: mine.map((s) => ({
        reps: s.reps,
        durationSeconds: s.durationSeconds,
        distanceM: s.distanceM,
        weight: s.weightKg == null ? null : displayWeight(s.weightKg, unit),
        rpe: s.rpe,
        isWarmup: s.isWarmup,
      })),
    };
  }
  return out;
}

/**
 * The most recent thing the member said about each of these movements.
 *
 * Read here rather than joined into the screen's own memory query because the
 * reference sentence beside a movement depends on it: "start lighter and let
 * the warm-up decide" is only reasonable if somebody actually reported
 * something, and a screen that has to assemble that from two sources will
 * eventually assemble it from one.
 */
export async function recentConcernsFor(
  userId: string,
  exerciseIds: readonly string[],
): Promise<Record<string, { quality: string | null; side: string | null; onDate: string }>> {
  if (exerciseIds.length === 0) return {};

  const rows = await db
    .select({
      exerciseId: trainingObservations.exerciseId,
      quality: trainingObservations.quality,
      side: trainingObservations.side,
      onDate: trainingObservations.onDate,
    })
    .from(trainingObservations)
    .where(
      and(
        eq(trainingObservations.userId, userId),
        inArray(trainingObservations.exerciseId, [...exerciseIds]),
      ),
    )
    .orderBy(desc(trainingObservations.onDate));

  const out: Record<string, { quality: string | null; side: string | null; onDate: string }> = {};
  for (const r of rows) {
    if (!r.exerciseId || out[r.exerciseId]) continue;
    out[r.exerciseId] = { quality: r.quality, side: r.side, onDate: r.onDate };
  }
  return out;
}

/** Every session this member owns, for the ownership predicates above. */
export async function ownsSession(userId: string, sessionId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: workoutSessions.id })
    .from(workoutSessions)
    .where(and(eq(workoutSessions.id, sessionId), eq(workoutSessions.userId, userId)));
  return !!row;
}
