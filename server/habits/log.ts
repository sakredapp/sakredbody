/**
 * Structured events for the habit loop.
 *
 * End-to-end means knowing when it stops being end-to-end. A phase that fails
 * to open, a health metric that never resolves, a coach hitting a permission
 * wall — none of those throw anywhere a person will see, and all of them look
 * from the member's side like the app quietly not working.
 *
 * ── What must never appear here ───────────────────────────────────────────
 *
 * No values. Not a weight, not a step count, not a sleep duration, not a
 * member's note. Health data in a log line is health data in whatever
 * aggregates the logs, retained for however long that system retains, readable
 * by everyone with access to it — a disclosure obligation acquired by accident
 * in exchange for a debugging convenience.
 *
 * Ids, dates, counts and outcomes are enough to trace any failure in here. If
 * a bug genuinely needs the number, that is a question for the database, under
 * whatever access controls the database has, not for a log search.
 */

type Fields = Record<string, string | number | boolean | null | undefined>;

/** Values are dropped, not redacted — a `[redacted]` key still says one existed. */
const FORBIDDEN = new Set(["value", "target", "note", "email", "name", "reason", "coachNote"]);

export function habitEvent(event: string, fields: Fields = {}): void {
  const safe: Fields = {};
  for (const [k, v] of Object.entries(fields)) {
    if (FORBIDDEN.has(k)) continue;
    safe[k] = v;
  }
  console.log(JSON.stringify({ at: new Date().toISOString(), event, ...safe }));
}

/** A refusal is an event. A permission wall nobody can see is a silent bug. */
export function habitDenied(
  event: string,
  fields: Fields & { actorId?: string; subjectId?: string },
): void {
  habitEvent(`denied.${event}`, fields);
}
