/**
 * What this member has said about their training lately.
 *
 * One reader, so that Build, the workout screen and Restore cannot come to
 * different conclusions about the same sentence — which is the failure this
 * codebase has already had twice, once between the terrain read and readiness,
 * and once between the two things counting a member's week.
 *
 * The judgement about *whether* a note is worth saying back, and *how*, lives
 * in `shared/models/trainingMemory.ts` and stays testable without a database.
 * This is the query.
 */

import { and, desc, eq, gte } from "drizzle-orm";
import { db } from "../db.js";
import { exercises, trainingObservations } from "../../shared/schema.js";
import {
  MEMORY_WINDOW_DAYS,
  isNotable,
  type Observation,
} from "../../shared/models/trainingMemory.js";
import { addDaysToString } from "../../shared/utils/dates.js";

/**
 * The notable observations inside the memory window, newest first.
 *
 * Joined to the catalogue on the way out, because matching "a single-leg
 * hinge" to "a B-stance RDL" is done on `pattern` and `category` — the columns
 * that exist precisely so two movements asking the same question of the body
 * can be recognised as such.
 *
 * A left join: an observation about a movement that has since left the
 * catalogue is still something the member said, and dropping it would make the
 * record quietly incomplete.
 */
export async function trainingMemory(userId: string, today: string): Promise<Observation[]> {
  const rows = await db
    .select({
      exerciseId: trainingObservations.exerciseId,
      note: trainingObservations.note,
      quality: trainingObservations.quality,
      side: trainingObservations.side,
      onDate: trainingObservations.onDate,
      exerciseName: exercises.name,
      pattern: exercises.pattern,
      category: exercises.category,
    })
    .from(trainingObservations)
    .leftJoin(exercises, eq(exercises.id, trainingObservations.exerciseId))
    .where(
      and(
        eq(trainingObservations.userId, userId),
        gte(trainingObservations.onDate, addDaysToString(today, -MEMORY_WINDOW_DAYS)),
      ),
    )
    .orderBy(desc(trainingObservations.onDate));

  /**
   * Filtered here rather than in SQL, so that "what counts as notable" has one
   * definition — including the red-flag scan, which reads the member's sentence
   * and cannot be expressed as a column predicate.
   */
  return rows.filter(isNotable);
}
