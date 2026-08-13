import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "../shared/schema.js";
import { publishPending, discardPending } from "./habits/log.js";

const { Pool } = pg;

const connectionString = process.env.SAKREDBODY_DATABASE_URL || process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "Database URL not configured. Set SAKREDBODY_DATABASE_URL or DATABASE_URL environment variable.",
  );
}

export const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
});
export const db = drizzle(pool, { schema });

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * A transaction that also owns when its events become real.
 *
 * `db.transaction` alone cannot: the callback returns before `commit` does, so
 * anything emitted inside it is announcing a change the database has not yet
 * agreed to. Here the events are held against `tx` and released only once
 * `db.transaction` itself resolves — and dropped if it throws.
 *
 * Every write that participates in a larger change should reach the database
 * through this rather than `db.transaction` directly.
 */
export async function transactionally<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  let opened: Tx | undefined;
  try {
    const result = await db.transaction(async (tx) => {
      opened = tx;
      return fn(tx);
    });
    if (opened) {
      publishPending(opened);
      await runAfterCommit(opened);
    }
    return result;
  } catch (err) {
    if (opened) {
      discardPending(opened);
      discardAfterCommit(opened);
    }
    throw err;
  }
}

// ─── Work a transaction has earned, to be done once it commits ─────────────

/**
 * The same rule as the event queue in habits/log.ts, for the case where the
 * consequence is not a log line but an act.
 *
 * A log line about a change that never happened is misleading. A *push* about a
 * change that never happened is on somebody's lock screen, and no rollback
 * reaches it. So anything that leaves the building waits here until the
 * database has agreed to the change that justifies it:
 *
 *     what became true   →   what happened   →   what a person is told
 *
 * Held against the transaction object in a WeakMap for the same reason the
 * events are: a connection that dies without committing takes its unrun work
 * with it rather than leaking it into the next request.
 *
 * ── These failures cannot fail the request ────────────────────────────────
 *
 * By the time this runs the transaction has committed and the caller is owed
 * its result. Throwing here would report failure for work that succeeded, and
 * would tempt a caller into retrying a write that is already durable. A push
 * that does not arrive is a worse day than one that does; it is not a reason to
 * tell the coach their message failed to send.
 */
const afterCommit = new WeakMap<object, Array<() => Promise<void>>>();

/** Queue work that must not happen unless this transaction commits. */
export function onCommit(tx: object, fn: () => Promise<void>): void {
  const held = afterCommit.get(tx);
  if (held) held.push(fn);
  else afterCommit.set(tx, [fn]);
}

/**
 * Run what a transaction earned. Only ever called after `commit` returned.
 *
 * Sequential rather than `Promise.all`: these are outbound network calls, the
 * counts are small, and one slow send should not be able to make a second one
 * look like a timeout.
 */
async function runAfterCommit(tx: object): Promise<void> {
  const held = afterCommit.get(tx);
  afterCommit.delete(tx);
  for (const fn of held ?? []) {
    try {
      await fn();
    } catch (err) {
      // Not `trackError`: telemetry imports this module, so reaching back for it
      // would be an import cycle — a startup failure traded for a log line.
      console.error(
        JSON.stringify({
          at: new Date().toISOString(),
          event: "aftercommit.failed",
          message: err instanceof Error ? err.message : String(err),
        }),
      );
    }
  }
}

/** Drop what a rolled-back transaction did not earn. */
export function discardAfterCommit(tx: object): void {
  afterCommit.delete(tx);
}

/** How much work a transaction is holding. For tests — nothing reads this. */
export function afterCommitCount(tx: object): number {
  return afterCommit.get(tx)?.length ?? 0;
}
