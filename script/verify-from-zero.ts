/**
 * Can this repository rebuild its own database?
 *
 * ── The question that had never been asked ────────────────────────────────
 *
 * On 16 Aug 2026 the answer was no, and nothing said so. Production had 93
 * tables; the tracked migrations could create 32. `users`, `workout_sessions`,
 * `exercises`, `habits`, `workout_sets` and `retreats` had no creating
 * statement anywhere. The schema lived only in the running database, because
 * `drizzle-kit push` diffs against what is already there and applies.
 *
 * This is the test that will notice next time. Point it at an EMPTY database —
 * never production, and the guard below refuses if the target has rows — and
 * it applies the baseline, applies every post-cutoff migration, then compares
 * the result to what the repository says the schema should be.
 *
 *   DATABASE_URL=postgres://…/qa npm run db:verify-from-zero
 *
 * Without a DATABASE_URL it still checks what it can offline: that the
 * baseline exists, that its parts assemble, and that the cutoff is recorded.
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { GENERATED_PART } from "./baseline.js";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const BASELINE = join(ROOT, "supabase/schema-baseline.sql");

/** Everything at or before this migration is inside the baseline already. */
export const BASELINE_CUTOFF = "20260815212610";

/**
 * Migration files newer than the baseline cutoff.
 *
 * Named by date, so lexical order is chronological — which is only true
 * because the convention has been kept, and is asserted by the offline checks
 * above rather than assumed here.
 */
function postBaselineMigrations(): string[] {
  const dir = join(ROOT, "supabase");
  return readdirSync(dir)
    .filter((f) => f.endsWith(".sql") && f !== "schema-baseline.sql")
    .filter((f) => /^\d{4}-\d{2}-\d{2}/.test(f))
    .filter((f) => f.replace(/\D/g, "") > BASELINE_CUTOFF.slice(0, 8))
    .sort()
    .map((f) => join(dir, f));
}

let failed = 0;
const check = (name: string, ok: boolean, detail?: string) => {
  if (!ok) {
    failed++;
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
};

console.log("\nThe repository can describe its own database\n");

check("the baseline exists", existsSync(BASELINE));
const sql = existsSync(BASELINE) ? readFileSync(BASELINE, "utf8") : "";
const tables = (sql.match(/CREATE TABLE/g) ?? []).length;
const policies = (sql.match(/CREATE POLICY/g) ?? []).length;

/**
 * What production holds, and what of it is the baseline's job.
 *
 * Read from production on 17 Aug 2026: 94 tables, 155 policies, 90 tables with
 * RLS on, 6 functions of our own. The baseline accounts for all but one of
 * each, and the one is `session_exercises` — created, secured and given its
 * single policy by the post-cutoff migration that replays on top. So:
 *
 *     baseline 94 tables · 154 policies · 89 enables
 *   + 2026-08-16-session-exercises.sql          +1 policy · +1 enable
 *   = production 94 · 155 · 90
 *
 * The table count matches without the migration because part 02 is generated
 * from `shared/schema.ts` as it stands today rather than as it stood at the
 * cutoff — the migration's `create table if not exists` then finds it already
 * there and adds only what Drizzle cannot say.
 */
check("it creates every table production has", tables === 94, `${tables} of 94`);
check("and carries every policy the baseline is responsible for", policies === 154, `${policies} of 154`);
check("row-level security is enabled where production enables it",
  (sql.match(/ENABLE ROW LEVEL SECURITY/g) ?? []).length === 89);
check("the helper functions the policies need are present",
  /FUNCTION public\.is_sakred_admin/.test(sql) && /FUNCTION public\.can_see_channel/.test(sql));
check("the cutoff rule is written down, not remembered",
  /PRE-BASELINE HISTORY/.test(sql) && sql.includes(BASELINE_CUTOFF));

/**
 * ── Parity, which is the check that would have caught all of this ─────────
 *
 * The baseline and `shared/schema.ts` must describe the same set of tables.
 * They disagreed by four: coaching_plans, coaching_plan_items,
 * coaching_checkin_requests and notifications were defined in Drizzle, used by
 * the server and applied to production — but their modules were never
 * re-exported from schema.ts, the one file drizzle-kit reads. So `generate`
 * could not emit them and `push` regarded them as tables nobody had asked for,
 * which is one confirmation prompt away from dropping live coaching data.
 *
 * The allowlist below is for tables that genuinely cannot be modelled in
 * Drizzle. It is empty, and adding to it should require an argument.
 */
const NON_DRIZZLE_TABLES: readonly string[] = [];

{
  /*
    Named by the assembler rather than spelled out here. The part was 01 until
    the functions had to move ahead of the policies, and a second copy of the
    filename is a second thing to forget.
  */
  const drizzlePart = join(ROOT, "supabase/baseline", GENERATED_PART);
  const drizzleTables = new Set(
    [...readFileSync(drizzlePart, "utf8").matchAll(/^CREATE TABLE "([a-z_]+)"/gm)].map((m) => m[1]),
  );
  const baselineTables = new Set(
    [...sql.matchAll(/CREATE TABLE (?:IF NOT EXISTS )?(?:public\.)?"?([a-z_]+)"?/g)].map((m) => m[1]),
  );
  const missing = [...baselineTables].filter(
    (t) => !drizzleTables.has(t) && !NON_DRIZZLE_TABLES.includes(t),
  );
  check("every baseline table is in the Drizzle schema", missing.length === 0, missing.join(", "));
  check("and the allowlist is still empty", NON_DRIZZLE_TABLES.length === 0,
    NON_DRIZZLE_TABLES.join(", "));
  check("Drizzle emits all 94", drizzleTables.size === 94, `${drizzleTables.size}`);
}

/**
 * ── And the same parity in the other direction ────────────────────────────
 *
 * The block above asks whether every table the baseline creates is modelled.
 * It cannot ask the question that matters from here on, which is whether every
 * table the *code* models can actually be created — the baseline is a snapshot
 * at a cutoff and will not grow again, so a table added to Drizzle tomorrow is
 * absent from it by design.
 *
 * Without this check the repository would quietly lose the ability it just
 * regained, one new table at a time: `session_exercises` exists in
 * `shared/models/training.ts`, the server selects from it, and if nobody had
 * written the migration then a rebuild from zero would produce a database the
 * application cannot run against. That is the original failure exactly, and it
 * would have taken one commit to reintroduce.
 *
 * Two things are required of every modelled table, and they are different
 * requirements:
 *
 *   · it is reachable from `shared/schema.ts`, which is the only file
 *     drizzle-kit reads — a model nobody re-exports is invisible to `generate`
 *     and looks like a stray table to `push`;
 *   · it is created by the baseline, or by a migration in `supabase/` written
 *     after the cutoff.
 */
{
  const models = join(ROOT, "shared/models");
  const modelFiles = readdirSync(models).filter((f) => f.endsWith(".ts"));

  const manifest = readFileSync(join(ROOT, "shared/schema.ts"), "utf8");
  const exported = new Set(
    [...manifest.matchAll(/from\s+"\.\/models\/([a-zA-Z]+)\.js"/g)].map((m) => `${m[1]}.ts`),
  );

  /** Every migration in supabase/, baseline included, as one body of text. */
  const migrations = readdirSync(join(ROOT, "supabase"))
    .filter((f) => f.endsWith(".sql"))
    .map((f) => readFileSync(join(ROOT, "supabase", f), "utf8"))
    .join("\n");
  const creatable = new Set(
    [...migrations.matchAll(/create table\s+(?:if not exists\s+)?(?:public\.)?"?([a-z_]+)"?/gi)].map(
      (m) => m[1],
    ),
  );

  const unreachable: string[] = [];
  const uncreatable: string[] = [];
  let modelled = 0;

  for (const file of modelFiles) {
    const tables = [...readFileSync(join(models, file), "utf8").matchAll(/pgTable\(\s*"([a-z_]+)"/g)]
      .map((m) => m[1]);
    if (tables.length === 0) continue;
    modelled += tables.length;
    if (!exported.has(file)) unreachable.push(`${file} (${tables.join(", ")})`);
    for (const t of tables) if (!creatable.has(t)) uncreatable.push(t);
  }

  check("there are models to check", modelled > 80, `${modelled} tables`);
  check("every model is re-exported from schema.ts", unreachable.length === 0,
    unreachable.join("; "));
  check("and every modelled table has SQL that creates it", uncreatable.length === 0,
    uncreatable.join(", "));
}

/*
  ── The live path ─────────────────────────────────────────────────────────

  Deliberately not `DATABASE_URL`. That variable is what the application uses,
  and a reconstruction tool that reads it is one mistyped shell away from
  applying a schema baseline over production. It reads the QA-only variable
  through `requireQaTarget`, which refuses on five independent grounds before
  a connection is opened at all.

  Two more refusals live here, after connecting, because configuration can be
  right and the target still wrong: a database with tables in it is not empty,
  and a database with people in it is not QA.
*/
if (process.env.SAKRED_QA !== "1") {
  console.log(
    "\n  · Offline checks only. Set SAKRED_QA=1 and SAKREDBODY_QA_DATABASE_URL\n" +
      "    (see .env.qa) to rebuild the QA branch from zero and prove parity.",
  );
} else {
  const { requireQaTarget, looksLikeRealMembers } = await import("./qa-target.js");
  const pg = (await import("pg")).default;

  const url = requireQaTarget(process.env);
  const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();

  const existing = await client.query(
    "select tablename from pg_tables where schemaname = 'public' order by tablename",
  );

  if (existing.rowCount > 0) {
    /*
      Refusing to reconstruct over a database that already has something in it.
      "Apply the baseline anyway" is how a QA database quietly diverges from
      what the repository says, and the whole point of this script is that the
      repository can produce the schema from nothing.
    */
    const hasUsers = existing.rows.some((r) => r.tablename === "users");
    if (hasUsers) {
      const emails = await client.query("select email from users limit 200");
      check(
        "the target holds no real people",
        !looksLikeRealMembers(emails.rows.map((r) => String(r.email))),
        "found an address outside @sakred.local — this is not a QA database",
      );
    }
    console.log(`\n  · Target already has ${existing.rowCount} tables. Not reconstructing over it.`);
    console.log("    Reset the branch to prove reconstruction from zero.");
  } else {
    const files = [BASELINE, ...postBaselineMigrations()];
    console.log(`\n  · Empty target. Applying ${files.length} file(s) from the repository.`);

    for (const file of files) {
      const name = file.split("/").pop();
      try {
        /*
          Whole-file, in a transaction, the same way the Management API runs
          these. A migration that half-applies is worse than one that fails:
          the second is a clear error, the first is a schema nobody can
          reproduce from a commit.
        */
        await client.query("begin");
        await client.query(readFileSync(file, "utf8"));
        await client.query("commit");
      } catch (err) {
        await client.query("rollback").catch(() => undefined);
        check(`applying ${name}`, false, String((err as Error).message).split("\n")[0]);
        break;
      }
    }

    const after = await client.query(
      "select count(*)::int n from pg_tables where schemaname = 'public'",
    );
    const rls = await client.query(
      "select count(*)::int n from pg_tables t where t.schemaname='public' and exists (select 1 from pg_class c join pg_namespace ns on ns.oid=c.relnamespace where ns.nspname='public' and c.relname=t.tablename and c.relrowsecurity)",
    );
    const pol = await client.query("select count(*)::int n from pg_policies where schemaname='public'");
    const fns = await client.query(
      "select count(*)::int n from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace where ns.nspname='public'",
    );

    console.log(
      `    rebuilt: ${after.rows[0].n} tables · ${rls.rows[0].n} with RLS · ` +
        `${pol.rows[0].n} policies · ${fns.rows[0].n} functions`,
    );

    check("the rebuilt schema has every table the baseline creates", after.rows[0].n >= tables,
      `${after.rows[0].n} of ${tables}`);
    /*
      RLS on with zero policies is normally the failure that looks like
      success — a table nobody can read, which reads in the app as "the data is
      gone". On these eleven it is the intended posture: they are reached only
      through the server's service-role connection, which bypasses RLS, so
      enabled-with-no-policy is a closed door to every anon and authenticated
      client. `session_exercises` states the same thing explicitly with a
      `using (false)` policy, which is the clearer spelling of it.

      Read from production 17 Aug 2026 and identical there, so the check is
      parity rather than a wish: a twelfth appearing means somebody enabled RLS
      and forgot the policy, and a disappearance means one of these opened up.
    */
    const CLOSED_TO_CLIENTS: readonly string[] = [
      "auth_tokens", "coaching_attachments", "coaching_checkin_requests",
      "coaching_plan_items", "coaching_plans", "member_workout_exercises",
      "member_workouts", "notifications", "password_reset_tokens",
      "push_tokens", "support_requests",
    ];
    const naked = await client.query(
      "select t.tablename from pg_tables t join pg_class c on c.relname=t.tablename join pg_namespace ns on ns.oid=c.relnamespace and ns.nspname='public' where t.schemaname='public' and c.relrowsecurity and not exists (select 1 from pg_policies p where p.schemaname='public' and p.tablename=t.tablename)",
    );
    const found = naked.rows.map((r) => r.tablename as string).sort();
    const unexpected = found.filter((t) => !CLOSED_TO_CLIENTS.includes(t));
    const opened = CLOSED_TO_CLIENTS.filter((t) => !found.includes(t));
    check("no table has RLS enabled and no policy by accident", unexpected.length === 0,
      unexpected.join(", "));
    check("and the ones deliberately closed to clients are still closed", opened.length === 0,
      opened.join(", "));

    /*
      ── The rules, not just the shape ────────────────────────────────────

      Counting tables was never enough and the first green run proved it: 94
      tables, 90 with RLS, 155 policies — and 18 foreign keys where production
      has 99, 12 CHECK constraints where production has 116, no
      `uniq_open_workout_per_member`, and neither trigger. A database that
      accepts rows production refuses is the most expensive kind of test
      environment, because everything passes.

      Read from production 17 Aug 2026. A figure that moves means production
      gained something the repository has not been told about, which is the
      original failure and is worth failing for.
    */
    const PRODUCTION = {
      "foreign keys": [
        99,
        "select count(*)::int n from pg_constraint c join pg_class t on t.oid=c.conrelid join pg_namespace ns on ns.oid=t.relnamespace where ns.nspname='public' and c.contype='f'",
      ],
      "CHECK constraints": [
        116,
        "select count(*)::int n from pg_constraint c join pg_class t on t.oid=c.conrelid join pg_namespace ns on ns.oid=t.relnamespace where ns.nspname='public' and c.contype='c'",
      ],
      indexes: [325, "select count(*)::int n from pg_indexes where schemaname='public'"],
      columns: [1008, "select count(*)::int n from information_schema.columns where table_schema='public'"],
      triggers: [
        2,
        "select count(*)::int n from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace ns on ns.oid=c.relnamespace where ns.nspname='public' and not t.tgisinternal",
      ],
    } as const;

    for (const [what, [expected, q]] of Object.entries(PRODUCTION)) {
      const { rows } = await client.query<{ n: number }>(q as string);
      check(`the rebuilt schema has production's ${what}`, rows[0].n === expected,
        `${rows[0].n} of ${expected}`);
    }
  }

  await client.end();
}

console.log(`\n${failed === 0 ? "✓" : "✗"} ${failed} failed\n`);
if (failed > 0) process.exit(1);
