/**
 * The real authentication path, driven the way a browser drives it.
 *
 * ── Why hash verification was not enough ──────────────────────────────────
 *
 * The seed proves `verifyPassword` accepts the hashes it writes. That is a
 * claim about one function. It says nothing about whether the login route
 * finds the user, whether a session is created, whether the cookie comes back
 * with usable attributes, whether the next request is recognised, or whether
 * logging out actually destroys anything — and every one of those has been a
 * real bug in a real product.
 *
 * So this talks to a running server over HTTP: POST /api/login, keep the
 * cookie jar, and go through the front door for everything after.
 *
 *   Terminal 1:  DATABASE_URL=$SAKREDBODY_QA_DATABASE_URL \
 *                SESSION_SECRET=… PORT=5199 npm run dev
 *   Terminal 2:  npx tsx script/qa-auth-matrix.ts
 *
 * ── On 404 where you would expect 403 ─────────────────────────────────────
 *
 * Deliberate, and documented at server/habits/authz.ts:27 — answering 403 to
 * "show me this member" confirms the member exists. The refusal is the same
 * shape whether the id is somebody else's or invented, which is the point.
 *
 * ── On admin reaching a coach route ───────────────────────────────────────
 *
 * Also deliberate: `canCoachAccessMember` grants on the named capability
 * `superviseCoaching`, which admin holds. Worth stating out loud because the
 * private progress photos being built next are specified the other way — admin
 * alone must NOT imply access to those — and two rules that look alike and are
 * not need to be visible rather than inferred.
 */

const BASE = process.env.QA_BASE_URL ?? "http://127.0.0.1:5199";
const PASSWORD = process.env.QA_PASSWORD ?? "SakredQA!2026";

let passed = 0;
const failures: string[] = [];
const check = (name: string, got: unknown, want: unknown) => {
  if (got === want) passed++;
  else failures.push(`${name} — got ${String(got)}, want ${String(want)}`);
};

/** One cookie jar per person, because that is what a browser has. */
const jars = new Map<string, string>();

/*
  The session cookie is `secure` under NODE_ENV=production, which is how
  script/qa-serve.sh runs it — the point of QA is the real configuration. Over
  plain http on a loopback port Express refuses to set it at all, so every
  request carries the proxy header the deployed app sits behind.

  Without this every login here succeeds, returns the member, and hands back
  nothing to be logged in with — and all twenty-eight assertions below fail as
  401s, which reads exactly like a broken authorization matrix. The other
  harnesses that drive this server have carried the header since they were
  written; this one never did.
*/
const PROXIED = { "x-forwarded-proto": "https" };

async function call(who: string | null, path: string, init: RequestInit = {}): Promise<Response> {
  const cookie = who ? jars.get(who) : undefined;
  return fetch(`${BASE}${path}`, {
    ...init,
    redirect: "manual",
    headers: { ...PROXIED, ...(init.headers ?? {}), ...(cookie ? { cookie } : {}) },
  });
}

async function login(who: string): Promise<Response> {
  const res = await fetch(`${BASE}/api/login`, {
    method: "POST",
    redirect: "manual",
    headers: { ...PROXIED, "content-type": "application/json" },
    body: JSON.stringify({ email: `qa.${who}@sakred.local`, password: PASSWORD }),
  });
  const setCookie = res.headers.getSetCookie?.() ?? [];
  const jar = setCookie.map((c) => c.split(";")[0]).join("; ");
  if (jar) jars.set(who, jar);
  return res;
}

const status = async (who: string | null, path: string) => (await call(who, path)).status;

// ─── Nothing is reachable logged out ─────────────────────────────────────

check("a protected route refuses with no session", await status(null, "/api/auth/user"), 401);
check("and so does a coach route", await status(null, "/api/coach/members/qa-member/habits"), 401);

// ─── Everybody logs in through the same door ─────────────────────────────

for (const who of ["member", "fresh", "coach", "admin"]) {
  const res = await login(who);
  check(`qa.${who} logs in`, res.status, 200);
  check(`qa.${who} is given a session cookie`, jars.has(who), true);

  const me = await call(who, "/api/auth/user");
  check(`qa.${who} is recognised on the next request`, me.status, 200);
  check(`and recognised as themselves`, (await me.json()).email, `qa.${who}@sakred.local`);

  /* A second call on the same jar: the session persists rather than the login
     response having simply echoed the body back. */
  check(`qa.${who}'s session survives a reload`, await status(who, "/api/auth/user"), 200);
}

const wrong = await fetch(`${BASE}/api/login`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ email: "qa.member@sakred.local", password: "not-the-password" }),
});
check("a wrong password is refused", wrong.status, 401);

// ─── Roles ───────────────────────────────────────────────────────────────

check("admin reaches an admin route", await status("admin", "/api/admin/routines"), 200);
check("a coach does not", await status("coach", "/api/admin/routines"), 403);
check("a member does not", await status("member", "/api/admin/routines"), 403);

// ─── The coaching relationship, which is narrower than the role ──────────

check("an assigned coach reaches their client's habits",
  await status("coach", "/api/coach/members/qa-member/habits"), 200);
check("and their client's terrain",
  await status("coach", "/api/coach/members/qa-member/terrain"), 200);
check("a coach cannot reach a member they are not assigned to",
  await status("coach", "/api/coach/members/qa-fresh/habits"), 404);
check("a member cannot reach another member",
  await status("fresh", "/api/coach/members/qa-member/habits"), 404);
check("a member reaching their own id through the coach path is themselves",
  await status("member", "/api/coach/members/qa-member/habits"), 200);
check("an id that belongs to nobody refuses identically",
  await status("coach", "/api/coach/members/qa-member-2/habits"), 404);
check("admin reaches it through superviseCoaching, not through being admin",
  await status("admin", "/api/coach/members/qa-member/habits"), 200);

// ─── The member's own side ───────────────────────────────────────────────

check("a member sees their coach", await status("member", "/api/coaching/my-coach"), 200);
check("and their plan", await status("member", "/api/coaching/plan"), 200);

// ─── Logging out destroys the session, not just the cookie ───────────────

await call("member", "/api/logout", { method: "POST" });
check("the session is gone after logout", await status("member", "/api/auth/user"), 401);

if (failures.length) {
  console.error("\n✗ QA auth matrix\n");
  for (const f of failures) console.error(`    ${f}`);
  console.error("");
  process.exit(1);
}
console.log(`\n✓ ${passed} auth assertions passed against ${BASE}\n`);
