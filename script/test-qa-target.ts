/**
 * The harness must not be able to seed production, including when it is
 * configured wrongly by somebody in a hurry.
 *
 * These are written as the mistakes rather than as the rules, because the rule
 * always looks obviously sufficient and the mistake is what actually happens:
 * one variable set and not the other, a connection string pasted from the
 * clipboard, a fallback that seemed harmless because "it will never be unset".
 *
 * Seeding the wrong database is not a recoverable class of error here. The
 * fixtures are workouts, health days and Room posts — rows that become
 * indistinguishable from a member's own record on arrival, and that Terrain
 * then computes from. So every check is proven to refuse on its own, with
 * everything else configured correctly.
 */

import {
  PRODUCTION_REF,
  QA_OPT_IN_VAR,
  QA_URL_VAR,
  looksLikeRealMembers,
  resolveQaTarget,
  sameTarget,
} from "./qa-target.js";

let passed = 0;
const failures: string[] = [];

function check(name: string, ok: boolean, detail = "") {
  if (ok) passed++;
  else failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
}

const QA_URL = "postgresql://postgres:pw@db.qabranchref123.supabase.co:5432/postgres";
const PROD_URL = `postgresql://postgres:pw@db.${PRODUCTION_REF}.supabase.co:5432/postgres`;

/** Everything set correctly. The control — without this the rest proves nothing. */
const good: Record<string, string | undefined> = {
  [QA_OPT_IN_VAR]: "1",
  [QA_URL_VAR]: QA_URL,
  NODE_ENV: "test",
};

check("a fully configured QA target is accepted", resolveQaTarget(good).ok);

function refuses(name: string, env: Record<string, string | undefined>, expect: RegExp) {
  const verdict = resolveQaTarget(env);
  check(name, !verdict.ok && expect.test(verdict.ok ? "" : verdict.reason),
    verdict.ok ? "ACCEPTED" : verdict.reason);
}

// ── Each check refuses on its own ────────────────────────────────────────

refuses(
  "no opt-in flag is a refusal, even with a perfectly good QA url",
  { ...good, [QA_OPT_IN_VAR]: undefined },
  /opt-in/,
);
refuses(
  "the flag must be exactly 1 — not 'true', not 'yes'",
  { ...good, [QA_OPT_IN_VAR]: "true" },
  /opt-in/,
);
refuses(
  "a production NODE_ENV is a refusal however else it is configured",
  { ...good, NODE_ENV: "production" },
  /NODE_ENV/,
);
refuses(
  "the production project ref is refused by host",
  { ...good, [QA_URL_VAR]: PROD_URL },
  /production project/,
);
refuses("a non-postgres url is refused", { ...good, [QA_URL_VAR]: "https://example.com" }, /postgres/);

/*
  The one that catches the realistic mistake.

  Somebody puts the connection string they already have into .env.qa, because
  it is the one on their clipboard. The ref check above catches that for this
  project. This catches it for any project, including one nobody thought to
  name — which is what makes it worth having as well as, not instead of.
*/
refuses(
  "a QA url identical to the app's own DATABASE_URL is refused",
  { ...good, [QA_URL_VAR]: QA_URL, DATABASE_URL: QA_URL },
  /same database as DATABASE_URL/,
);
refuses(
  "and identical to SAKREDBODY_DATABASE_URL",
  { ...good, [QA_URL_VAR]: QA_URL, SAKREDBODY_DATABASE_URL: QA_URL },
  /same database as SAKREDBODY_DATABASE_URL/,
);

/*
  Same instance, written two different ways. Pooled and direct URLs to one
  database differ in credentials and query string, so a whole-string comparison
  would let exactly the case above through.
*/
check(
  "the same database written two ways is recognised as the same database",
  sameTarget(
    "postgresql://postgres:one@db.ref.supabase.co:5432/postgres",
    "postgresql://postgres.ref:two@db.ref.supabase.co:6543/postgres?pgbouncer=true",
  ),
);
check(
  "and two genuinely different databases are not",
  !sameTarget(
    "postgresql://postgres:pw@db.aaa.supabase.co:5432/postgres",
    "postgresql://postgres:pw@db.bbb.supabase.co:5432/postgres",
  ),
);

// ── No substitution, ever ────────────────────────────────────────────────

/*
  The fallback is the whole bug. It turns "QA is not configured" into "use
  whatever is configured", and what is configured is production. Asserted as
  behaviour rather than by reading the source, because a fallback added later
  would read perfectly reasonably in a diff.
*/
refuses(
  "an unset QA url is never substituted from DATABASE_URL",
  { ...good, [QA_URL_VAR]: undefined, DATABASE_URL: PROD_URL },
  new RegExp(`${QA_URL_VAR} is not set`),
);
refuses(
  "nor from SAKREDBODY_DATABASE_URL",
  { ...good, [QA_URL_VAR]: undefined, SAKREDBODY_DATABASE_URL: PROD_URL },
  new RegExp(`${QA_URL_VAR} is not set`),
);

/*
  Half-configured is the state this exists for. Neither half alone may resolve.
*/
refuses(
  "the flag alone resolves nothing",
  { [QA_OPT_IN_VAR]: "1", DATABASE_URL: PROD_URL },
  new RegExp(`${QA_URL_VAR} is not set`),
);
refuses(
  "and the url alone resolves nothing",
  { [QA_URL_VAR]: QA_URL },
  /opt-in/,
);
check(
  "an empty environment resolves nothing at all",
  !resolveQaTarget({}).ok,
);

// ── The runtime line ─────────────────────────────────────────────────────

/*
  Configuration can be wrong in ways nobody predicted. A database with real
  people in it is recognisable regardless of what the environment claims.
*/
check("an empty database is fine — that is a fresh branch", !looksLikeRealMembers([]));
check(
  "a database holding only fixtures is fine",
  !looksLikeRealMembers([
    "qa.member@sakred.local",
    "qa.coach@sakred.local",
    "QA.Admin@Sakred.Local",
  ]),
);
check(
  "one real address is enough to refuse the whole target",
  looksLikeRealMembers(["qa.member@sakred.local", "someone@gmail.com"]),
);
check(
  "and a lookalike domain does not pass as a fixture",
  looksLikeRealMembers(["qa.member@sakred.local.example.com"]),
);

// ─── Result ──────────────────────────────────────────────────────────────

if (failures.length) {
  console.error("\n✗ qa target\n");
  for (const f of failures) console.error(`    ${f}`);
  console.error("");
  process.exit(1);
}
console.log(`✓ ${passed} qa target assertions passed`);
