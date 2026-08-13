/**
 * Writing a terrain check-in.
 *
 * ── One writer, because there are now two doors ───────────────────────────
 *
 * A member reaches this from Restore, on their own, because they felt like
 * saying how they are. They also reach it from a question their coach asked. Two
 * doors, one room: the same seven signals, the same one row per member per local
 * day, the same upsert.
 *
 * Written as a function rather than duplicated in the second route because the
 * duplicate would be the fifth copy of a decision this codebase has already paid
 * for twice — the conflict target, and the rule that answering again edits today
 * rather than appending a second observation. When those drift, a coach and a
 * member read different numbers for the same morning and neither can tell which
 * is real.
 */

import { and, eq } from "drizzle-orm";
import { db, type Tx } from "../db.js";
import {
  terrainCheckins,
  type TerrainCheckinInput,
} from "../../shared/models/terrainSignals.js";
import { habitEventOnCommit } from "./log.js";

/**
 * Record how somebody is, for one day.
 *
 * Returns the canonical row — the whole point being that both callers get the
 * *same* row, so a request can point at it without copying anything out.
 */
export async function saveCheckin(opts: {
  userId: string;
  /** Already resolved to the member's own local date by the caller. */
  onDate: string;
  values: TerrainCheckinInput;
  /**
   * Supplied when saving is one step of a larger all-or-nothing change.
   *
   * Completing a coach's request is three writes — the answer, the request's
   * completion, the coach's notification — and they are one fact. Without this
   * they were three independent commits, and a failure between the first and
   * second left Sarah's answer saved against a request still marked open: she
   * would be asked the same question again, and Nick would never learn she had
   * replied.
   */
  tx?: Tx;
}) {
  // `onDate` is settled by the caller; taking it from the body here too would
  // give a client two ways to name a day and one of them would win.
  const { onDate: _fromBody, ...values } = opts.values;

  const conn = opts.tx ?? db;
  const [row] = await conn
    .insert(terrainCheckins)
    .values({ userId: opts.userId, onDate: opts.onDate, ...values })
    .onConflictDoUpdate({
      target: [terrainCheckins.userId, terrainCheckins.onDate],
      set: { ...values, updatedAt: new Date() },
    })
    .returning();

  // The date, never the answers. A 1/5 in a log line is health data in whatever
  // aggregates the logs. Held until commit when this is part of a larger
  // change, so a rolled-back completion does not announce itself.
  habitEventOnCommit(opts.tx ?? null, "terrain.checkin", {
    subjectId: opts.userId,
    onDate: opts.onDate,
  });
  return row;
}

/** Today's row for this member, if they have made one. */
export async function checkinOn(userId: string, onDate: string) {
  const [row] = await db
    .select()
    .from(terrainCheckins)
    .where(and(eq(terrainCheckins.userId, userId), eq(terrainCheckins.onDate, onDate)))
    .limit(1);
  return row ?? null;
}
