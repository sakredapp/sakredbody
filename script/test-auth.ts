/**
 * Auth — the two functions where a mistake is silent and total.
 *
 * There were no tests on this file at all, which is how it shipped with a
 * password verifier that killed the process when handed a hash it didn't
 * recognise. That crash is the first case below: before the fix, this suite
 * did not report a failure, it took the test runner down with it.
 *
 * Everything here is pure — no database, no session, no network.
 *
 * Run: tsx script/test-auth.ts
 */

import { hashPassword, verifyPassword } from "../server/auth/password.js";
import { THROTTLE } from "../shared/models/security.js";
import { isAdult } from "../server/auth/age.js";
import { readFileSync } from "node:fs";

/** A file with its prose removed, so a comment cannot satisfy a grep for the
    rule it explains. Same trick as test-media-privacy.ts. */
const code = (p: string) =>
  readFileSync(p, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

let passed = 0;
let failed = 0;

function check(name: string, cond: boolean, detail?: string) {
  if (cond) {
    passed++;
  } else {
    failed++;
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

async function main() {
  console.log("\nA hash we don't recognise is a failed login, not an outage\n");

  // Each of these used to reach Buffer.from(undefined) or timingSafeEqual
  // with mismatched lengths, both of which throw from inside scrypt's
  // callback — where no try/catch in the route can reach them.
  const malformed: Array<[string, string]> = [
    ["empty string", ""],
    ["no separator", "justsomething"],
    ["bcrypt hash", "$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy"],
    ["salt but no key", "abc123:"],
    ["key but no salt", ":deadbeef"],
    ["non-hex key of the right length", "abc:" + "z".repeat(128)],
    ["hex key of the wrong length", "abc:" + "ab".repeat(16)],
    ["only a colon", ":"],
    ["null-ish text", "null"],
  ];

  for (const [label, stored] of malformed) {
    let threw: string | null = null;
    let result: boolean | null = null;
    try {
      result = await verifyPassword("whatever", stored);
    } catch (err) {
      threw = err instanceof Error ? err.message : String(err);
    }
    check(`${label} → false, no throw`, threw === null && result === false, threw ?? `returned ${result}`);
  }

  console.log("\nA real hash still works\n");

  const hash = await hashPassword("correct horse battery staple");
  check("round-trips", await verifyPassword("correct horse battery staple", hash) === true);
  check("wrong password is false", await verifyPassword("Correct horse battery staple", hash) === false);
  check("empty password is false", await verifyPassword("", hash) === false);
  check("shape is salt:key", /^[0-9a-f]{32}:[0-9a-f]{128}$/.test(hash), hash.slice(0, 20));

  // Same password twice must not produce the same stored value, or the hash
  // column tells an attacker which members share a password.
  const again = await hashPassword("correct horse battery staple");
  check("salted per call", hash !== again);
  check("both verify", await verifyPassword("correct horse battery staple", again) === true);

  console.log("\nA long passphrase is not silently truncated\n");

  const long = "a".repeat(500) + "-tail";
  const longHash = await hashPassword(long);
  check("500+ chars round-trips", await verifyPassword(long, longHash) === true);
  check(
    "differs only in the tail → false",
    await verifyPassword("a".repeat(500) + "-tale", longHash) === false,
  );

  console.log("\nThrottle limits are sane\n");

  check("an email gets fewer tries than an IP", THROTTLE.emailMax < THROTTLE.ipMax);
  check("more than one try allowed", THROTTLE.emailMax > 1);
  check("few enough to stop guessing", THROTTLE.emailMax <= 10);
  check("the window is long enough to be a window", THROTTLE.windowMs >= 60_000);
  check("a lockout ends on its own", THROTTLE.lockMs > 0 && THROTTLE.lockMs <= 60 * 60 * 1000);

  console.log("\nThe age gate counts years, not year numbers\n");

  // Fixed "now" so these assertions mean the same thing in 2027.
  const now = new Date("2026-08-09T12:00:00Z");

  // The case a year subtraction gets wrong. 2026 - 2008 is 18, and this
  // person is seventeen for another four months.
  check("birthday not yet reached this year is under 18", !isAdult("2008-12-25", now));
  check("birthday already passed this year is 18", isAdult("2008-03-01", now));
  check("exactly 18 today is allowed", isAdult("2008-08-09", now));
  check("one day short of 18 is refused", !isAdult("2008-08-10", now));

  check("plainly old enough", isAdult("1985-06-14", now));
  check("plainly too young", !isAdult("2015-01-01", now));

  // A future date is a broken form, not a very young member.
  check("a birth date in the future is refused", !isAdult("2030-01-01", now));

  // new Date("2026-02-31") rolls forward to March rather than throwing, so
  // the check has to round-trip the string rather than trust the parse.
  check("an impossible date is refused", !isAdult("2008-02-31", now));
  check("a malformed date is refused", !isAdult("09/08/2008", now));
  check("an empty date is refused", !isAdult("", now));

  // ── "I could not check" is not "you are not signed in" ──────────────────
  console.log("\nA connection that died is not a member who is signed out\n");

  /*
    The defect: one Vercel function holds a `pg.Pool` across invocations, and
    between them Supabase's pooler reclaims the seat. `pg` finds out when
    something tries to use the client, so the first query after an idle stretch
    throws and the second succeeds on a fresh one. `bearerAuth` swallowed that
    and fell through unauthenticated, so from a phone it read as "the first tap
    on Start Session said Unauthorized and the second one worked".

    401 is a claim about the member and the client acts on it. This is a claim
    about the server. Read from the file rather than remembered, with its prose
    stripped, because the comment explaining the rule would otherwise satisfy
    a grep for it — that has happened here before.
  */
  const bearer = code("server/auth/bearerAuth.ts");

  check(
    "a lookup that fails answers 503, not 401",
    /status\(503\)/.test(bearer),
  );
  check(
    "and never falls through to unauthenticated",
    !/catch\s*\{\s*\}/.test(bearer),
    "an empty catch is how a database error became a signed-out member",
  );
  check("it says to try again", /Retry-After/.test(bearer));
  check(
    "a dead pooled connection is retried once before that",
    /auth\.token_lookup_retry/.test(bearer),
  );
  check(
    "the failure is logged as an infrastructure event",
    /auth\.token_lookup_failed/.test(bearer),
  );
  check(
    "a missing token still reaches the ordinary 401",
    /if \(!row\) return next\(\);/.test(bearer),
  );
  check(
    "and so does an expired one",
    /expiresAt\.getTime\(\) <= Date\.now\(\)/.test(bearer) &&
      /\.catch\(\(\) => \{\}\)/.test(bearer),
    "deleting an expired token must not be able to turn a 401 into a 503",
  );

  /* The other half of the fix, at the pool: our own idle clients are closed
     well inside the window in which the pooler reclaims them, so the request
     after an idle stretch opens a connection rather than finding a dead one. */
  const dbModule = code("server/db.ts");
  check("the pool closes its own idle connections", /idleTimeoutMillis/.test(dbModule));
  check("and keeps the live ones alive", /keepAlive: true/.test(dbModule));

  check(
    "503 has member-facing wording of its own",
    /503:/.test(code("shared/models/labels.ts")),
  );

  // ── The contract, executed ──────────────────────────────────────────────
  console.log("\nA failed lookup is answered as a failed lookup\n");

  /*
    The checks above read the file. These run it.

    The behaviour that matters cannot be produced against a real database: QA
    cannot make Supabase's pooler reclaim a seat on demand, and a test that
    waits for one never runs. So the token read is a parameter — see
    `bearerAuthWith` — and it is driven here by a reader that fails once, one
    that always fails, and one that answers.

    `DATABASE_URL` is set to a string that is never dialled: `server/db.ts`
    refuses to load without one, and `new Pool` opens nothing until a query is
    issued. Every path exercised below has its reader and its delete injected,
    so none is.
  */
  process.env.DATABASE_URL ??= "postgres://unused@127.0.0.1:1/unused";
  const { bearerAuthWith } = await import("../server/auth/bearerAuth.js");

  type Answer = { status: number | null; body: unknown; nexted: boolean; userId?: string };

  /** Run the middleware over one request and report what it did. */
  async function run(
    read: (hash: string) => Promise<any[]>,
    header?: string,
  ): Promise<Answer> {
    const session: Record<string, unknown> = {};
    const answer: Answer = { status: null, body: null, nexted: false };
    const req: any = { session, headers: header ? { authorization: header } : {}, path: "/api/training/sessions" };
    const res: any = {
      setHeader() {},
      status(code: number) { answer.status = code; return res; },
      json(body: unknown) { answer.body = body; return res; },
    };
    await bearerAuthWith(read, async () => {})(req, res, () => {
      answer.nexted = true;
      answer.userId = session.userId as string | undefined;
    });
    return answer;
  }

  const LIVE = [{ id: "t1", userId: "member-1", expiresAt: new Date(Date.now() + 86_400_000), lastUsedAt: new Date() }];
  const DEAD = () => Promise.reject(new Error("Connection terminated unexpectedly"));

  /* One failure then an answer — the shape of a reclaimed pooler seat. */
  {
    let calls = 0;
    const flaky = () => (++calls === 1 ? DEAD() : Promise.resolve(LIVE));
    const a = await run(flaky, "Bearer good-token");
    check("a connection that dies once is retried", calls === 2, `${calls} call(s)`);
    check("and the member stays signed in", a.nexted && a.userId === "member-1", JSON.stringify(a));
    check("with no status written at all", a.status === null, String(a.status));
  }

  /* Both attempts fail. This is the one that used to become a 401. */
  {
    const a = await run(DEAD, "Bearer good-token");
    check("a database that cannot be reached answers 503", a.status === 503, String(a.status));
    check("never 401", a.status !== 401);
    check("and does not pass the request on as anonymous", !a.nexted);
    check(
      "saying something a member can read",
      typeof (a.body as any)?.message === "string" && /try that again/i.test((a.body as any).message),
      JSON.stringify(a.body),
    );
  }

  /* And the failures that really are the member's. */
  {
    const a = await run(async () => [], "Bearer no-such-token");
    check("a token nobody knows falls through to the ordinary 401", a.nexted && !a.userId);
    check("rather than a 503", a.status === null);
  }
  {
    const expired = [{ ...LIVE[0], expiresAt: new Date(Date.now() - 1000) }];
    const a = await run(async () => expired, "Bearer stale-token");
    check("an expired token does too", a.nexted && !a.userId, JSON.stringify(a));
  }
  {
    const a = await run(async () => { throw new Error("should not be called"); });
    check("and a request with no credential never asks the database", a.nexted && !a.userId);
  }

  console.log(`\n${failed === 0 ? "✓" : "✗"} ${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
