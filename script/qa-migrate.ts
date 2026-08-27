/**
 * Apply one migration to the QA branch, and then look.
 *
 *   SAKRED_QA=1 npx tsx script/qa-migrate.ts supabase/<file>.sql
 *
 * Goes through `resolveQaTarget`, so every refusal that protects the seeding
 * harness protects this too — there is no path from partial configuration to a
 * usable connection, and production is refused by ref and by equality with
 * whatever the application is configured to use.
 *
 * Whole file, one transaction, forward-only: one bad column rolls all of it
 * back rather than leaving half a schema. And it verifies afterwards rather
 * than trusting the success response, because RLS-on-with-zero-policies is the
 * failure that looks exactly like success.
 */
import { readFileSync } from "node:fs";
import pg from "pg";
import { resolveQaTarget } from "./qa-target.js";

/*
  The env comes from the caller, exactly as it does for qa-seed. No dotenv
  read of `.env.qa` from inside the script: a file this script loads for
  itself is a fifth way for the wrong connection string to arrive, and the
  guard below is only as good as the set of ways it has to cover.
*/
const file = process.argv[2];
if (!file) {
  console.error("usage: qa-migrate.ts supabase/<file>.sql");
  process.exit(1);
}

const target = resolveQaTarget(process.env);
if (!target.ok) {
  console.error(`\n✗ refusing to run: ${target.reason}\n`);
  process.exit(1);
}

const sql = readFileSync(file, "utf8");
const client = new pg.Client({ connectionString: target.url });
await client.connect();

try {
  await client.query("BEGIN");
  await client.query(sql);
  await client.query("COMMIT");
  console.log(`applied ${file}`);
} catch (err) {
  await client.query("ROLLBACK");
  console.error(`\n✗ ${file} rolled back\n\n    ${(err as Error).message}\n`);
  await client.end();
  process.exit(1);
}

/**
 * What is actually there now. Never what the statement said it did.
 *
 * The tables this file names, rather than a pattern.
 *
 * This was `tablename LIKE 'recommendation%'`, which was correct for the one
 * migration it was written alongside and silently correct for no other: run
 * against the goals migration it printed the recommendation tables and said
 * nothing at all about the four that had just been created. A verification
 * step that reports on the wrong tables is worse than none, because the output
 * looks like a check that passed.
 */
const named = [
  ...new Set([
    ...Array.from(sql.matchAll(/CREATE TABLE IF NOT EXISTS (\w+)/gi)).map((m) => m[1]),
    ...Array.from(sql.matchAll(/ALTER TABLE (?:IF EXISTS )?(\w+)/gi)).map((m) => m[1]),
  ]),
];
if (named.length === 0) {
  console.error("\n✗ nothing to verify — this file names no table to look at\n");
  await client.end();
  process.exit(1);
}

const { rows } = await client.query(
  `SELECT t.tablename,
          t.rowsecurity,
          (SELECT count(*) FROM pg_policies p WHERE p.tablename = t.tablename) AS policies,
          (SELECT count(*) FROM information_schema.columns c WHERE c.table_name = t.tablename) AS columns,
          (SELECT count(*) FROM pg_indexes i WHERE i.tablename = t.tablename) AS indexes
     FROM pg_tables t
    WHERE t.schemaname = 'public'
      AND t.tablename = ANY($1::text[])
    ORDER BY t.tablename`,
  [named],
);
console.table(rows);

/* A table the file creates and the database does not have is the failure this
   whole step exists for, and it is silent in a row count. */
const missing = named.filter((t) => !rows.some((r) => r.tablename === t));
if (missing.length) {
  console.error(`\n✗ named but not present afterwards: ${missing.join(", ")}\n`);
  await client.end();
  process.exit(1);
}

await client.end();
