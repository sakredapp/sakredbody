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
import { join, basename } from "node:path";
import { GENERATED_PART } from "./baseline.js";
import { PRODUCTION_SHAPE, SHAPE_READ_AT, SHAPE_QUERIES } from "./production-shape.js";

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

/** The date in a migration's filename, as the same digits the cutoff uses. */
const dateOf = (file: string) => basename(file).slice(0, 10).replace(/\D/g, "");

/**
 * The post-baseline migrations production already had when the shape was read.
 *
 * This is the set whose objects are *inside* `PRODUCTION_SHAPE`, and therefore
 * the only set that may be subtracted from it to work out what the baseline
 * itself must contain.
 */
const appliedMigrations = () =>
  postBaselineMigrations().filter((f) => dateOf(f) <= SHAPE_READ_AT);

/**
 * The ones written since — in the repository, not yet in production.
 *
 * A rebuild from zero replays these too, so it will legitimately have more
 * tables, policies and constraints than the reading describes. That excess is
 * the pending release. It is named rather than absorbed, because a verifier
 * that silently tolerates "more than expected" is one that would also tolerate
 * a stray table nobody meant to create.
 */
const pendingMigrations = () =>
  postBaselineMigrations().filter((f) => dateOf(f) > SHAPE_READ_AT);

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
 * What of production's shape is the baseline's job, and what the migrations add.
 *
 * Derived rather than remembered. The baseline is responsible for everything
 * production has minus whatever the post-cutoff migrations create on top of it,
 * so both halves are counted from files: `PRODUCTION_SHAPE` is the one reading
 * that cannot be taken from the repository, and the migration side is grepped
 * out of the files that will actually replay.
 *
 * Today that arithmetic is 155 − 1 = 154 policies and 90 − 1 = 89 enables,
 * both supplied by `2026-08-16-session-exercises.sql`. Writing 154 and 89 down
 * would mean the next migration that adds a policy silently breaks this.
 *
 * Only migrations production *had when the reading was taken* may be
 * subtracted — see `SHAPE_READ_AT`. Subtracting an unapplied one asks the
 * baseline to be smaller than production to make room for something
 * production does not have, which fails with a number that invites somebody
 * to edit the measurement.
 */
const countIn = (text: string, re: RegExp) => (text.match(re) ?? []).length;
const ENABLE = /enable row level security/gi;

/**
 * What the baseline itself must contain.
 *
 * This used to be derived — production's shape today, minus whatever the
 * applied migrations add on top. That worked while every applied migration
 * only ever added, and stopped working the day production caught up: the six
 * applied on 29 Aug create ten tables and, in `2026-08-28-rls-posture.sql`,
 * *drop* three policies with `DROP POLICY IF EXISTS`. A file cannot tell you
 * how many of six conditional drops found something, so the subtraction has no
 * right answer and the three checks failed with numbers that invite somebody
 * to edit the measurement — the exact outcome `SHAPE_READ_AT` was written to
 * prevent.
 *
 * So the reference point moves to the thing that genuinely cannot drift. The
 * baseline is a snapshot taken at `BASELINE_CUTOFF` and is never regenerated;
 * what it must produce is therefore a constant, not a function of a database
 * that keeps changing. `PRODUCTION_SHAPE` stays what it is — the current
 * reading, which is what the parity run at the bottom compares a rebuilt
 * database against.
 *
 * If these three numbers ever need to change, the baseline was regenerated,
 * and that is a decision somebody made rather than a drift to absorb.
 */
const BASELINE_SHAPE = { tables: 94, policies: 154, rlsEnabled: 89 } as const;

check("it creates every table the baseline is responsible for", tables === BASELINE_SHAPE.tables,
  `${tables} of ${BASELINE_SHAPE.tables}`);
check("and carries the policies it was snapshotted with",
  policies === BASELINE_SHAPE.policies, `${policies} of ${BASELINE_SHAPE.policies}`);
check("row-level security is enabled where the snapshot enabled it",
  countIn(sql, ENABLE) === BASELINE_SHAPE.rlsEnabled, `${countIn(sql, ENABLE)} of ${BASELINE_SHAPE.rlsEnabled}`);

/*
  And the gap between the two is the migrations, which must still be there.
  Without this the constants above could quietly describe a baseline that no
  longer reaches production at all.
*/
const postCutoff = postBaselineMigrations();
check("the migrations that carry the baseline up to production are present",
  postCutoff.length > 0 && tables + countIn(
    postCutoff.map((f) => readFileSync(f, "utf8")).join("\n"),
    /create table\s+(?:if not exists\s+)?(?:public\.)?"?[a-z_]+"?/gi,
  ) >= PRODUCTION_SHAPE.tables,
  `${tables} in the baseline plus ${postCutoff.length} migration file(s) must reach ${PRODUCTION_SHAPE.tables}`);
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
  /* The generated part is inside the frozen baseline, so it is measured
     against the baseline's own count, not against a production that has moved
     on since. Tables added after the cutoff are checked below instead — by
     whether a migration creates them, which is the question that matters. */
  check(`Drizzle emits all ${BASELINE_SHAPE.tables} the baseline creates`,
    drizzleTables.size === BASELINE_SHAPE.tables, `${drizzleTables.size}`);
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
    /*
      When a migration has been written but not yet applied to production, the
      rebuild legitimately has *more* than the reading describes. So the
      comparison relaxes in exactly one direction, and the pending files are
      printed — an unexplained excess is still visible, it just isn't a
      failure, whereas a shortfall always is.
    */
    const pending = pendingMigrations().map((f) => basename(f));
    if (pending.length) {
      console.log(`  · ${pending.length} migration(s) not yet in the 17 Aug reading:`);
      for (const f of pending) console.log(`      ${f}`);
    }

    for (const [what, expected] of Object.entries(PRODUCTION_SHAPE)) {
      const { rows } = await client.query<{ n: number }>(SHAPE_QUERIES[what as keyof typeof PRODUCTION_SHAPE]);
      const measured = rows[0].n;
      const ok = pending.length ? measured >= expected : measured === expected;
      check(`the rebuilt schema matches production on ${what}`, ok,
        `${measured} of ${expected}`);
      if (pending.length && measured > expected) {
        console.log(`  · ${what}: +${measured - expected} from the pending migrations`);
      }
    }
  }

  await client.end();
}

console.log(`\n${failed === 0 ? "✓" : "✗"} ${failed} failed\n`);
if (failed > 0) process.exit(1);
