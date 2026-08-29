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

/*
  Refuse a file that manages its own transaction.

  A `COMMIT;` in the middle of a migration closes the transaction opened below
  around the whole file, so everything after it — which is where the
  verification block lives — runs committed. Demonstrated on QA: a file shaped
  that way, whose verification raises, is reported here as "rolled back" while
  the table it created is still there afterwards. That is the one failure mode
  this runner exists to make impossible, so it is refused rather than
  documented.
*/
if (/^\s*(BEGIN|COMMIT|ROLLBACK)\s*;/im.test(sql)) {
  console.error(`
✗ ${file} opens or closes its own transaction

    A COMMIT inside the file ends the one this runner opens around it, and the
    verification after it then cannot roll anything back. Remove the BEGIN and
    COMMIT; the caller wraps the whole file.
`);
  process.exit(1);
}
const client = new pg.Client({ connectionString: target.url });

/*
  Show what the file says about itself.

  Every migration here ends in a DO block that re-reads the database and
  RAISEs on anything it does not like, and the interesting half of that is the
  NOTICE at the end — how many rows it touched, how many were already right.
  Those went to a channel nobody was listening on, so a migration that had
  something to report reported it into the void.
*/
client.on("notice", (n) => {
  if (n.message) console.log(`  ${n.message}`);
});
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
/*
  A migration that changes no table's shape still has to be verified.

  This exited 1 on any file that neither created nor altered a table — so
  2026-08-29-reply-count.sql, which drops a trigger and repairs a column's
  values, applied cleanly and was reported as a failure. An operator reading
  that would reasonably stop and roll something back that was fine.

  What such a file does have is its own DO block, which re-reads the database
  and RAISEs. That ran inside the transaction above: if it had objected,
  nothing would have been committed and we would not be here. So it counts,
  and is said out loud rather than assumed.
*/
const selfVerifies = /DO \$\$[\s\S]*RAISE EXCEPTION/i.test(sql);
if (named.length === 0) {
  if (!selfVerifies) {
    console.error("\n✗ nothing to verify — this file names no table to look at, and checks nothing itself\n");
    await client.end();
    process.exit(1);
  }
  console.log("\n  no table changed shape; the file's own checks ran inside the transaction and raised nothing\n");
  await client.end();
  process.exit(0);
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
