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

// ─── Events a transaction has earned but not yet kept ──────────────────────

/**
 * An event says what happened. A statement inside an open transaction has not
 * happened yet — it is a proposal the database is still free to refuse.
 *
 * Today the gap between those two is a misleading log line. It stops being
 * harmless the moment anything acts on an event: a rolled-back activation would
 * push "Nick updated your plan" to somebody whose plan never changed, and no
 * amount of correctness in the database undoes a notification already on a lock
 * screen. So the ordering is fixed here, before there is anything downstream to
 * get it wrong:
 *
 *     what became true   →   what happened   →   what a person is told
 *
 * Held against the transaction object itself, in a WeakMap, so a connection
 * that dies without either committing or rolling back takes its unpublished
 * events with it rather than leaking them into the next request.
 */
const pending = new WeakMap<object, { event: string; fields: Fields }[]>();

/**
 * Emit — or hold, if a transaction is still deciding.
 *
 * With no transaction this is `habitEvent`, because a single autocommitted
 * statement has already succeeded by the time this is reached.
 */
export function habitEventOnCommit(
  tx: object | null | undefined,
  event: string,
  fields: Fields = {},
): void {
  if (!tx) {
    habitEvent(event, fields);
    return;
  }
  const held = pending.get(tx);
  if (held) held.push({ event, fields });
  else pending.set(tx, [{ event, fields }]);
}

/**
 * Publish what a transaction earned. Only ever called after `commit` returned.
 *
 * The timestamp is stamped here rather than at the mutation, which is the
 * honest one: it is when the change became true, not when it was attempted.
 */
export function publishPending(tx: object): void {
  const held = pending.get(tx);
  pending.delete(tx);
  for (const e of held ?? []) habitEvent(e.event, e.fields);
}

/** Drop what a rolled-back transaction did not earn. */
export function discardPending(tx: object): void {
  pending.delete(tx);
}

/** How many events a transaction is holding. For tests — nothing reads this. */
export function pendingCount(tx: object): number {
  return pending.get(tx)?.length ?? 0;
}

/** A refusal is an event. A permission wall nobody can see is a silent bug. */
export function habitDenied(
  event: string,
  fields: Fields & { actorId?: string; subjectId?: string },
): void {
  habitEvent(`denied.${event}`, fields);
}
