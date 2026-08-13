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
    if (opened) publishPending(opened);
    return result;
  } catch (err) {
    if (opened) discardPending(opened);
    throw err;
  }
}
