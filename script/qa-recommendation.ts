/**
 * Sakred wrote down what it recommended, and the member could answer it.
 *
 * ── Why this is not a unit test ───────────────────────────────────────────
 *
 * The contract is covered without a database in script/test-recommendation.ts,
 * and that file proves the recorder is *called*. It cannot prove the row lands,
 * that re-reading the same screen does not create a second one, that a thumb
 * survives a refresh, or that a dismissal reaches the recommendation it
 * refuses. All four of those are the difference between a learning loop and a
 * module that compiles.
 *
 * This repository has shipped four modules that existed, compiled, were
 * imported and passed their tests while the application never executed them.
 * The recorder is exactly that shape of thing.
 *
 *   Terminal 1:  npm run build && DATABASE_URL=$SAKREDBODY_QA_DATABASE_URL \
 *                SESSION_SECRET=… PORT=5199 NODE_ENV=production node dist/index.cjs
 *   Terminal 2:  set -a && . ./.env.qa && set +a && npx tsx script/qa-recommendation.ts
 *
 * ── What it refuses to do ─────────────────────────────────────────────────
 *
 * Seed. The QA member already has two sessions, three exercises and eleven
 * sets, and every recommendation here is one the real engine made from that
 * real history. Nothing in this file writes a training row, and the seed is
 * counted at the end to prove it.
 */

import pg from "pg";
import { resolveQaTarget } from "./qa-target.js";

const BASE = process.env.QA_BASE_URL ?? "http://127.0.0.1:5199";
const PASSWORD = process.env.QA_PASSWORD ?? "SakredQA!2026";

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

let jar = "";
const PROXIED = { "x-forwarded-proto": "https" };

async function call(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${BASE}${path}`, {
    ...init,
    redirect: "manual",
    headers: {
      ...PROXIED,
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...(init.headers ?? {}),
      ...(jar ? { cookie: jar } : {}),
    },
  });
}
async function json<T>(res: Response): Promise<T> {
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`${res.status} ${res.url}: ${text.slice(0, 200)}`);
  }
}

type Handle = { recommendationId?: string; feedback?: { verdict: string; reason: string | null } | null };
type Suggestion = Handle & { category: string; label: string; side: string };
type Today = { date: string; suggestions: Suggestion[] };
type Terrain = Handle & { lean: string; headline: string };

console.log(`\nWhat Sakred recommended, recorded — ${BASE}\n`);

const client = new pg.Client({ connectionString: target.url });
await client.connect();

const countRecs = async (userId: string, onDate: string) =>
  Number(
    (
      await client.query<{ n: string }>(
        "select count(*) n from recommendation_events where user_id = $1 and on_date = $2",
        [userId, onDate],
      )
    ).rows[0]!.n,
  );

// ─── Sign in ──────────────────────────────────────────────────────────────

let userId = "";
{
  const res = await fetch(`${BASE}/api/login`, {
    method: "POST",
    redirect: "manual",
    headers: { ...PROXIED, "content-type": "application/json" },
    body: JSON.stringify({ email: "qa.member@sakred.local", password: PASSWORD }),
  });
  jar = (res.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
  check("the QA member signs in", res.status === 200 && !!jar, `status ${res.status}`);
  const me = await json<{ id: string }>(await call("/api/auth/user"));
  userId = me.id;
  check("…and is identified", !!userId);
}
if (!userId) {
  console.error("\n✗ cannot continue without a session\n");
  await client.end();
  process.exit(1);
}

// ─── 1. Opening Today records what it advised ─────────────────────────────

let today: Today;
{
  today = await json<Today>(await call("/api/today"));
  check("Today answers", Array.isArray(today.suggestions) && today.suggestions.length > 0);

  const withIds = today.suggestions.filter((s) => !!s.recommendationId);
  check(
    "every option carries the id of the recommendation it is",
    withIds.length === today.suggestions.length,
    `${withIds.length}/${today.suggestions.length}`,
  );

  const { rows } = await client.query<{ recommendation_type: string; recommendation_key: string; brain_version: string; decision_logic_version: string; model_provider: string | null; reason_codes: string[] }>(
    `select recommendation_type, recommendation_key, brain_version, decision_logic_version,
            model_provider, reason_codes
       from recommendation_events
      where user_id = $1 and on_date = $2 and recommendation_type = 'today_option'`,
    [userId, today.date],
  );
  check("…and each landed in the database", rows.length === today.suggestions.length, `${rows.length} rows`);
  check(
    "…keyed by the category that was suggested",
    today.suggestions.every((s) => rows.some((r) => r.recommendation_key === s.category)),
  );
  check("…stamped with the brain that produced it", rows.every((r) => !!r.brain_version));
  check(
    "…and the engine's own decision version",
    rows.every((r) => r.decision_logic_version.startsWith("today@")),
    rows.map((r) => r.decision_logic_version).join(", "),
  );

  /*
    The audit's finding, asserted against a real row rather than a constant.
    A provider appearing here means either a model reached the member path or
    the record is lying about what produced the advice.
  */
  check(
    "…claiming no model, because none produced it",
    rows.every((r) => r.model_provider === null),
  );

  check("…and naming its grounds", rows.every((r) => Array.isArray(r.reason_codes) && r.reason_codes.length > 0));

  /*
    The privacy rule the whole reason-code design exists for. A row that
    carried "You slept 5h 10m against your usual 7h 20m" would have put a
    health measurement into a table no health policy is looking at.
  */
  const numeric = rows.flatMap((r) => r.reason_codes).filter((c) => /\d/.test(c));
  check("…and no measurement is written down with them", numeric.length === 0, numeric.join(", "));
}

// ─── 2. Reading it again is the same recommendation, not another ──────────

{
  const before = await countRecs(userId, today.date);
  await call("/api/today");
  await call("/api/today");
  const after = await countRecs(userId, today.date);
  check(
    "opening Today three times records three recommendations, not nine",
    before === after,
    `${before} → ${after}`,
  );

  const { rows } = await client.query<{ created_at: string; last_shown_at: string }>(
    `select created_at, last_shown_at from recommendation_events
      where user_id = $1 and on_date = $2 and recommendation_type = 'today_option' limit 1`,
    [userId, today.date],
  );
  check(
    "…and the re-read is visible as a re-read",
    rows.length === 1 && new Date(rows[0]!.last_shown_at) > new Date(rows[0]!.created_at),
  );
}

// ─── 3. Terrain records where it is read, and only there ──────────────────

{
  const terrain = await json<Terrain>(await call("/api/terrain/today"));
  const { rows } = await client.query<{ surface: string }>(
    `select surface from recommendation_events
      where user_id = $1 and on_date = $2 and recommendation_type = 'terrain_direction'`,
    [userId, today.date],
  );

  if (terrain.lean === "unknown") {
    check("an unreadable terrain records nothing", rows.length === 0, `${rows.length} rows`);
  } else {
    check("the terrain direction is recorded", rows.length === 1, `${rows.length} rows`);
    check("…on the surface the member reads it on", rows.every((r) => r.surface === "terrain"));
    check("…and handed back so it can be answered", !!terrain.recommendationId);
  }

  /* A member scrolling their own history is not being recommended anything. */
  const past = today.date.slice(0, 8) + "01";
  const beforeHistory = await countRecs(userId, past);
  await call(`/api/terrain/today?date=${past}`);
  const afterHistory = await countRecs(userId, past);
  check(
    "reading a past day records nothing against that day",
    beforeHistory === afterHistory,
    `${beforeHistory} → ${afterHistory}`,
  );
}

// ─── 4. A thumb is recorded, changeable, and reversible ───────────────────

const graded = today.suggestions[0]!;
{
  const id = graded.recommendationId!;

  const up = await call(`/api/recommendations/${id}/feedback`, {
    method: "PUT",
    body: JSON.stringify({ verdict: "helpful" }),
  });
  check("👍 is accepted", up.status === 200, `status ${up.status}`);

  const stored = async () =>
    (
      await client.query<{ verdict: string; reason: string | null }>(
        "select verdict, reason from recommendation_feedback where recommendation_id = $1 and user_id = $2",
        [id, userId],
      )
    ).rows;

  check("…and stored", (await stored())[0]?.verdict === "helpful");

  const down = await call(`/api/recommendations/${id}/feedback`, {
    method: "PUT",
    body: JSON.stringify({ verdict: "not_helpful", reason: "too_difficult" }),
  });
  check("changing your mind is accepted", down.status === 200);
  const changed = await stored();
  check("…and replaces the verdict rather than joining it", changed.length === 1, `${changed.length} rows`);
  check("…carrying the reason", changed[0]?.reason === "too_difficult", String(changed[0]?.reason));

  /*
    The one that would be easy to get wrong. Somebody who changes 👎 "too
    difficult" to 👍 has not left a complaint behind, and carrying the reason
    forward would attach it to an endorsement.
  */
  await call(`/api/recommendations/${id}/feedback`, {
    method: "PUT",
    body: JSON.stringify({ verdict: "helpful" }),
  });
  check("…and a reason does not survive the verdict it explained", (await stored())[0]?.reason === null);

  /* It comes back on the next read, so the control is not amnesiac. */
  const again = await json<Today>(await call("/api/today"));
  const same = again.suggestions.find((s) => s.recommendationId === id);
  check("the verdict is returned with the recommendation", same?.feedback?.verdict === "helpful",
    JSON.stringify(same?.feedback));

  const gone = await call(`/api/recommendations/${id}/feedback`, { method: "DELETE" });
  check("taking it back is accepted", gone.status === 204, `status ${gone.status}`);
  check("…and removes the row", (await stored()).length === 0);
}

// ─── 5. Somebody else's recommendation is not found ───────────────────────

{
  const { rows } = await client.query<{ id: string }>(
    "select id from recommendation_events where user_id <> $1 limit 1",
    [userId],
  );
  if (rows.length === 0) {
    console.log("  (no other member's recommendation on this branch to probe with)");
  } else {
    const res = await call(`/api/recommendations/${rows[0]!.id}/feedback`, {
      method: "PUT",
      body: JSON.stringify({ verdict: "helpful" }),
    });
    /*
      404 and never 403. A 403 confirms the id exists, which turns an id space
      into an oracle for whether somebody else was recommended something.
    */
    check("another member's recommendation answers 404", res.status === 404, `status ${res.status}`);
  }

  const nonsense = await call(`/api/recommendations/00000000-0000-0000-0000-000000000000/feedback`, {
    method: "PUT",
    body: JSON.stringify({ verdict: "helpful" }),
  });
  check("…and so does one that never existed", nonsense.status === 404, `status ${nonsense.status}`);

  const bad = await call(`/api/recommendations/${graded.recommendationId}/feedback`, {
    method: "PUT",
    body: JSON.stringify({ verdict: "sort_of" }),
  });
  check("a verdict outside the two is refused", bad.status === 400, `status ${bad.status}`);
}

// ─── 6. Tapping it is acceptance; refusing it is a dismissal ──────────────

{
  const id = graded.recommendationId!;
  /*
    Compared as text, not as a Date. `pg` hands back a Date object for a
    timestamptz, and two Dates for the same instant are never `===` — an
    identity comparison here would have reported the idempotence guard broken
    when it was working, which is the kind of false alarm that gets a real
    assertion deleted.
  */
  const stamp = async (col: "accepted_at" | "dismissed_at") => {
    const v = (
      await client.query<{ v: Date | null }>(
        `select ${col} v from recommendation_events where id = $1`,
        [id],
      )
    ).rows[0]!.v;
    return v === null ? null : new Date(v).toISOString();
  };

  check("nothing is accepted before it is tapped", (await stamp("accepted_at")) === null);
  const acc = await call(`/api/recommendations/${id}/accepted`, { method: "POST" });
  check("tapping it is accepted", acc.status === 204, `status ${acc.status}`);
  const acceptedAt = await stamp("accepted_at");
  check("…and stamped", acceptedAt !== null);

  /* Opening the same card twice is not accepting it twice. */
  await call(`/api/recommendations/${id}/accepted`, { method: "POST" });
  check("…once", (await stamp("accepted_at")) === acceptedAt);

  check("nothing is dismissed before it is refused", (await stamp("dismissed_at")) === null);
  const dis = await call("/api/today/dismiss", {
    method: "POST",
    body: JSON.stringify({ category: graded.category, scope: "today" }),
  });
  check("'not today' is accepted", dis.status === 204, `status ${dis.status}`);
  await new Promise((r) => setTimeout(r, 300));
  check("…and reaches the recommendation it refuses", (await stamp("dismissed_at")) !== null);

  // Put the member back as they were.
  await client.query(
    "delete from suggestion_dismissals where user_id = $1 and category = $2",
    [userId, graded.category],
  );
  await client.query(
    "update recommendation_events set accepted_at = null, dismissed_at = null where id = $1",
    [id],
  );
}

// ─── 7. Doing the thing credits the recommendation to do it ──────────────

/*
  The only fixture this file creates, and it exists because completion
  attribution is the half of the loop that cannot be proved any other way: it
  runs inside the finish handler, after the response is decided, against
  categories derived from the session's own sets.

  Swept at both ends. A run that dies in the middle leaves a session in the QA
  member's history and the seed count at the bottom stops meaning anything.
*/
const FIXTURE_TITLE = "QA — recommendation attribution";

async function sweepFixture(): Promise<number> {
  const { rows } = await client.query<{ id: string }>(
    "select id from workout_sessions where title = $1 and user_id = $2",
    [FIXTURE_TITLE, userId],
  );
  for (const { id } of rows) {
    await client.query("delete from workout_sets where session_id = $1", [id]);
    await client.query("delete from session_exercises where session_id = $1", [id]);
    await client.query("delete from workout_sessions where id = $1", [id]);
  }
  return rows.length;
}

const swept = await sweepFixture();
if (swept) console.log(`  swept ${swept} fixture(s) left by an earlier run`);

{
  /* An exercise in a category Sakred actually suggested this morning. */
  const categories = today.suggestions.map((s) => s.category);
  const { rows: movement } = await client.query<{ id: string; category: string }>(
    "select id, category from exercises where category = any($1) limit 1",
    [categories],
  );

  if (movement.length === 0) {
    console.log(`  (no catalogue movement in ${categories.join(", ")} — attribution not exercised)`);
  } else {
    const { id: exerciseId, category } = movement[0]!;
    const target = today.suggestions.find((s) => s.category === category)!;
    const recId = target.recommendationId!;

    const completedAt = async () =>
      (
        await client.query<{ v: Date | null }>(
          "select completed_at v from recommendation_events where id = $1",
          [recId],
        )
      ).rows[0]!.v;

    check("nothing is completed before anything is done", (await completedAt()) === null);

    const started = await json<{ id: string }>(
      await call("/api/training/sessions", {
        method: "POST",
        body: JSON.stringify({ title: FIXTURE_TITLE }),
      }),
    );
    check("a session starts", !!started.id);

    const set = await call(`/api/training/sessions/${started.id}/sets`, {
      method: "POST",
      body: JSON.stringify({ exerciseId, reps: 8, weightKg: 20 }),
    });
    check("a set is logged", set.status < 300, `status ${set.status}`);

    const fin = await call(`/api/training/sessions/${started.id}/finish`, {
      method: "POST",
      body: JSON.stringify({}),
    });
    check("the session finishes", fin.status < 300, `status ${fin.status}`);

    /* The credit is fire-and-forget after the response — give it a moment. */
    await new Promise((r) => setTimeout(r, 600));
    check(
      `finishing a ${category} session credits the ${category} recommendation`,
      (await completedAt()) !== null,
    );

    /*
      The negative control. Without it, "the recommendation was credited"
      passes just as well if attribution stamps everything it can reach.
    */
    const others = today.suggestions.filter((s) => s.category !== category);
    const strayed = (
      await client.query<{ n: string }>(
        `select count(*) n from recommendation_events
          where id = any($1) and completed_at is not null`,
        [others.map((s) => s.recommendationId)],
      )
    ).rows[0]!.n;
    check(
      "…and credits nothing else",
      Number(strayed) === 0,
      `${strayed} of ${others.length} unrelated recommendations were stamped`,
    );

    await client.query(
      "update recommendation_events set completed_at = null where id = $1",
      [recId],
    );
  }
}

const left = await sweepFixture();
check("the fixture session is removed", left <= 1, `${left} left`);

// ─── 8. The member's own record is exactly as it was ──────────────────────

{
  const one = async (sql: string) =>
    Number((await client.query<{ n: string }>(sql, [userId])).rows[0]!.n);
  const sessions = await one("select count(*) n from workout_sessions where user_id = $1");
  const sets = await one(
    "select count(*) n from workout_sets ws join workout_sessions s on s.id = ws.session_id where s.user_id = $1",
  );
  const open = await one(
    "select count(*) n from workout_sessions where user_id = $1 and finished_at is null",
  );
  const feedback = await one("select count(*) n from recommendation_feedback where user_id = $1");

  check("the QA member still has their two sessions", sessions === 2, String(sessions));
  check("…and their eleven sets", sets === 11, String(sets));
  check("…and nothing left open", open === 0, String(open));
  check("…and no feedback left behind by this run", feedback === 0, String(feedback));
}

await client.end();

if (failures.length) {
  console.error("\n✗ recommendation events, executed\n");
  for (const f of failures) console.error(`    ${f}`);
  console.error("");
  process.exit(1);
}
console.log(`\n✓ ${passed} executed recommendation assertions passed\n`);
