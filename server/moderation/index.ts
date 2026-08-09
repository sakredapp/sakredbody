/**
 * Moderation — reporting, blocking, and the queue.
 *
 * `blockedBy` is exported and used by the community reads. It is the single
 * place that answers "who is this member not seeing", for the same reason
 * `visibleChannelIds` is the single place that answers "which rooms can they
 * open" — the last time a rule like that was written twice, the second copy
 * dropped the admin bypass and nobody could share a win.
 */

import { db } from "../db.js";
import { eq } from "drizzle-orm";
import { userBlocks } from "../../shared/schema.js";

/**
 * The ids this member has blocked.
 *
 * Returns an array rather than a Set because every caller feeds it straight
 * into a SQL `not in`, and drizzle wants a list. Empty is the common case and
 * callers must skip the filter entirely rather than emit `not in ()`, which is
 * a syntax error in Postgres.
 */
export async function blockedBy(userId: string): Promise<string[]> {
  const rows = await db
    .select({ blockedId: userBlocks.blockedId })
    .from(userBlocks)
    .where(eq(userBlocks.blockerId, userId));
  return rows.map((r) => r.blockedId);
}

export { registerModerationRoutes } from "./routes.js";
