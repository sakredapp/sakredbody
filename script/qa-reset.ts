/**
 * Return the QA branch to genuine zero.
 *
 * ── Why this exists rather than a hand-typed DROP ──────────────────────────
 *
 * Because the from-zero proof is only worth something if "zero" is real. A
 * failed baseline leaves objects behind; the tempting next move is to drop the
 * one thing that broke and rerun, and what that proves is that the repository
 * can build a database *given the parts of it that already exist* — which is
 * exactly the illusion production had been maintaining for months.
 *
 * So: wipe, and rerun the whole file from nothing.
 *
 * ── What it refuses ───────────────────────────────────────────────────────
 *
 * Every guard `qa-target.ts` already holds — the opt-in flag, the QA-only
 * variable name, the production ref, equality with the application's own
 * connection string — plus two that only a live connection can ask:
 *
 *   · a `users` table containing an address outside `@sakred.local` is a
 *     database with people in it, whatever the environment claims;
 *   · rows with no QA account to own them are of unknown provenance, and
 *     dropping data whose origin nobody can state is not a thing a script
 *     should decide by itself.
 *
 * There is no --force. If this refuses, the answer is to look at what is in
 * there.
 */
import pg from "pg";
import { looksLikeRealMembers, requireQaTarget } from "./qa-target.js";

const url = requireQaTarget(process.env);
const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();

const refuse = async (reason: string): Promise<never> => {
  await client.end();
  console.error(`\n✗ refusing to reset — ${reason}\n`);
  process.exit(1);
};

const tables = (
  await client.query<{ tablename: string }>(
    "select tablename from pg_tables where schemaname='public' order by 1",
  )
).rows.map((r) => r.tablename);

if (tables.length === 0) {
  console.log("✓ already empty");
  await client.end();
  process.exit(0);
}

let emails: string[] = [];
if (tables.includes("users")) {
  emails = (await client.query<{ email: string }>("select email from public.users where email is not null")).rows
    .map((r) => r.email);
  if (looksLikeRealMembers(emails)) {
    await refuse(`public.users holds ${emails.length} address(es), and at least one is not a QA fixture`);
  }
}

/*
  Row counts across every table, exactly rather than from the planner's
  estimate — a stale `reltuples` reading zero is precisely the wrong way to
  decide a database is safe to drop.
*/
const counts = await client.query<{ tablename: string; n: string }>(
  `select tablename, (xpath('/row/c/text()',
     query_to_xml(format('select count(*) c from public.%I', tablename), false, true, '')))[1]::text::bigint n
   from pg_tables where schemaname='public'`,
);
const populated = counts.rows.filter((r) => Number(r.n) > 0);
const totalRows = populated.reduce((n, r) => n + Number(r.n), 0);

if (totalRows > 0 && emails.length === 0) {
  await refuse(
    `${totalRows} row(s) across ${populated.length} table(s) with no QA account to own them — ` +
      populated.map((r) => `${r.tablename}:${r.n}`).join(", "),
  );
}

console.log(
  `\n  · ${tables.length} table(s), ${totalRows} row(s)` +
    (emails.length ? `, ${emails.length} QA account(s)` : "") +
    "\n  · dropping",
);

await client.query("begin");
await client.query(
  `do $$
   declare r record;
   begin
     for r in select tablename from pg_tables where schemaname='public' loop
       execute format('drop table if exists public.%I cascade', r.tablename);
     end loop;
     for r in
       select p.oid::regprocedure::text sig
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and p.oid not in (
           select d.objid from pg_depend d join pg_extension e on e.oid = d.refobjid where d.deptype = 'e'
         )
     loop
       execute format('drop function if exists %s cascade', r.sig);
     end loop;
   end $$;`,
);
await client.query("commit");

const left = await client.query<{ n: string }>(
  "select count(*)::text n from pg_tables where schemaname='public'",
);
await client.end();

if (Number(left.rows[0].n) !== 0) {
  console.error(`\n✗ ${left.rows[0].n} table(s) survived the drop\n`);
  process.exit(1);
}
console.log("✓ genuine zero\n");
