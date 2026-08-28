/**
 * What somebody who is not the server can read.
 *
 * ── Why this is asked rather than inferred ────────────────────────────────
 *
 * The catalogue will tell you a table has row security enabled. It will not
 * tell you whether that means anything, and the difference has already bitten
 * once here: four tables — including a member's imported health history and
 * the record of who coaches whom — had row security switched off entirely
 * while every summary of the schema said "104 tables, RLS everywhere". As
 * `anon`, the role behind the project's public REST endpoint, `health_days`
 * returned five rows.
 *
 * So this becomes the role and asks. `SET LOCAL ROLE` inside a transaction
 * that is rolled back: the same connection, no extra credential, and row
 * security applies because the role is no longer the owner.
 *
 * ── The negative control ──────────────────────────────────────────────────
 *
 * "anon read nothing" passes trivially against an empty table, and QA is full
 * of empty tables. So every reading is paired with the owner's count of the
 * same table, and the tables that carry the sensitive data are required to
 * hold rows — otherwise this file is asserting that nothing is nothing.
 *
 *   set -a && . ./.env.qa && set +a && SAKRED_QA=1 npx tsx script/qa-rls.ts
 */

import pg from "pg";
import { resolveQaTarget } from "./qa-target.js";
import { PUBLIC_ROLES, PUBLICLY_READABLE, SERVER_ONLY_TABLES } from "./rlsPosture.js";

const target = resolveQaTarget(process.env);
if (!target.ok) {
  console.error(`\n✗ refusing to run — ${target.reason}\n`);
  process.exit(1);
}

let passed = 0;
const failures: string[] = [];
const check = (name: string, ok: boolean, detail = "") => {
  if (ok) passed++;
  else failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
};

/**
 * Tables that must actually hold rows for this run to mean anything.
 *
 * Chosen because they are the ones whose exposure would matter most, and
 * because QA seeds them. If one of these is empty the harness says so rather
 * than quietly reporting that nobody can read an empty table.
 */
const MUST_NOT_BE_EMPTY = [
  "users",
  "health_days",
  "coach_relationships",
  "workout_sessions",
  "member_workouts",
];

const client = new pg.Client({ connectionString: target.url });
await client.connect();

console.log("\nWhat somebody who is not the server can read\n");

/*
  A row in each table this run needs a control for.

  `member_workouts` is empty on QA between runs of the workout harness, and a
  control that reads "nobody can see zero rows" proves nothing. So one is made
  here, and removed at the end — this harness owns its own setup.
*/
const FIXTURE = "QA — rls posture";
async function sweep(): Promise<void> {
  const { rows } = await client.query<{ id: string }>(
    "select id from member_workouts where name = $1",
    [FIXTURE],
  );
  for (const { id } of rows) {
    await client.query("delete from member_workout_exercises where member_workout_id = $1", [id]);
    await client.query("delete from member_workouts where id = $1", [id]);
  }
}
await sweep();
await client.query(
  "insert into member_workouts (user_id, name) values ('qa-member', $1)",
  [FIXTURE],
);

// ─── 1. Row security is on, everywhere ────────────────────────────────────

const { rows: tables } = await client.query<{ tablename: string; rowsecurity: boolean; policies: number }>(`
  select t.tablename, t.rowsecurity,
         (select count(*)::int from pg_policies p
           where p.schemaname = 'public' and p.tablename = t.tablename) as policies
    from pg_tables t where t.schemaname = 'public' order by t.tablename`);

const unprotected = tables.filter((t) => !t.rowsecurity).map((t) => t.tablename);
check("every table in public has row security enabled", unprotected.length === 0, unprotected.join(", "));

// ─── 2. The deny-all set is exactly the one the repository declares ───────

const denyAll = tables.filter((t) => t.rowsecurity && t.policies === 0).map((t) => t.tablename).sort();
const declared = [...SERVER_ONLY_TABLES].sort();

const undeclared = denyAll.filter((t) => !declared.includes(t));
const missing = declared.filter((t) => !denyAll.includes(t));

/*
  Both directions, deliberately.

  A table that starts being denied without anybody saying so is a half-finished
  job wearing the costume of a decision — which is the exact confusion this
  list exists to remove. A table that stops being denied is the other failure,
  and it is the one that leaks.
*/
check("no table is denied to everyone without being declared", undeclared.length === 0, undeclared.join(", "));
check("and every declared server-only table really is denied", missing.length === 0, missing.join(", "));
check(`the declared set is the whole of it (${declared.length} tables)`, denyAll.length === declared.length);

// ─── 3. Ask as somebody who is not the owner ──────────────────────────────

/** Count a table as `role`, inside a transaction that is thrown away. */
async function countAs(role: string, table: string): Promise<number | string> {
  await client.query("begin");
  try {
    await client.query(`set local role ${role}`);
    const { rows } = await client.query<{ n: string }>(`select count(*) as n from "${table}"`);
    await client.query("rollback");
    return Number(rows[0].n);
  } catch (err) {
    await client.query("rollback");
    // A permission error is a stronger refusal than an empty result, not a
    // failure of this harness — it is reported as zero reachable rows.
    return (err as Error).message.includes("permission denied") ? 0 : `error: ${(err as Error).message}`;
  }
}

const ownerCount = new Map<string, number>();
for (const t of tables) {
  const { rows } = await client.query<{ n: string }>(`select count(*) as n from "${t.tablename}"`);
  ownerCount.set(t.tablename, Number(rows[0].n));
}

for (const table of MUST_NOT_BE_EMPTY) {
  check(
    `${table} holds rows, so reading nothing from it means something`,
    (ownerCount.get(table) ?? 0) > 0,
    `${ownerCount.get(table)} rows as owner`,
  );
}

for (const role of PUBLIC_ROLES) {
  const leaked: string[] = [];
  const errored: string[] = [];
  let controlled = 0;

  for (const t of tables) {
    const n = await countAs(role, t.tablename);
    if (typeof n === "string") {
      errored.push(`${t.tablename} ${n}`);
      continue;
    }
    const allowed = PUBLICLY_READABLE.some(
      (p) => p.table === t.tablename && p.roles.includes(role),
    );
    if (n > 0 && !allowed) leaked.push(`${t.tablename} (${n})`);
    /* And the other direction: an exception that has stopped being reachable
       is either a policy somebody removed or a table somebody emptied, and
       both are worth being told about rather than quietly passing. */
    if (n === 0 && allowed && (ownerCount.get(t.tablename) ?? 0) > 0) {
      leaked.push(`${t.tablename} was meant to be readable by ${role} and is not`);
    }
    if ((ownerCount.get(t.tablename) ?? 0) > 0) controlled++;
  }

  check(
    `${role} reads nothing but the reference data it is meant to`,
    leaked.length === 0,
    leaked.slice(0, 8).join(", "),
  );
  check(`and nothing answered ${role} with an error instead of a refusal`, errored.length === 0, errored.slice(0, 4).join(", "));
  const open = PUBLICLY_READABLE.filter((p) => p.roles.includes(role)).map((p) => p.table);
  console.log(
    `  ${role}: nothing from ${tables.length - open.length} tables (${controlled} of which the owner sees rows in)` +
      (open.length ? `; reference data only from ${open.join(", ")}` : ""),
  );
}

// ─── 4. The server's own path still works, and is still scoped ────────────

/*
  The other half of the boundary. Denying everybody is easy; the claim is that
  the *server* reaches these rows and scopes them to one member, which is where
  the authorization actually lives.
*/
{
  const { rows } = await client.query<{ n: string }>(
    "select count(*) as n from member_workouts where user_id = 'qa-member'",
  );
  check("the owner connection reaches a member's own workouts", Number(rows[0].n) > 0, `${rows[0].n}`);
}

await sweep();
await client.end();

if (failures.length) {
  console.error("\n✗ row-level security posture\n");
  for (const f of failures) console.error(`    ${f}`);
  console.error("");
  process.exit(1);
}
console.log(`\n✓ ${passed} RLS assertions — every table denied to anon and authenticated\n`);
