/**
 * A post about a workout says what it said.
 *
 * ── The defect this is the regression for ─────────────────────────────────
 *
 * The Room card was rendered from `workout_sets` on every read. Correcting a
 * set in the private training log therefore rewrote the public post, silently
 * and retroactively — including posts other people had already replied to. A
 * member could not have discovered this: nothing in the Room said the card had
 * changed, because as far as the Room was concerned nothing had.
 *
 * So this is deliberately not a unit test of the snapshot builder. The
 * arithmetic is covered without a database in script/test-room-share.ts. What
 * cannot be covered there is the thing that was actually wrong: that the read
 * path went back to live rows. Only driving the real endpoints against a real
 * database proves it does not any more, which is the same lesson the
 * walkthrough taught three times — code existing is not the application
 * executing it.
 *
 * ── The negative control ──────────────────────────────────────────────────
 *
 * "The card did not change" passes trivially if the edit did not happen. So
 * the canonical history is read back too, and the test fails if the training
 * log looks the same afterwards. The assertion is that the two diverged.
 *
 *   Terminal 1:  npm run build && DATABASE_URL=$SAKREDBODY_QA_DATABASE_URL \
 *                SESSION_SECRET=… PORT=5199 NODE_ENV=production node dist/index.cjs
 *   Terminal 2:  set -a && . ./.env.qa && set +a && npx tsx script/qa-room-share.ts
 */

import pg from "pg";
import { resolveQaTarget } from "./qa-target.js";

const BASE = process.env.QA_BASE_URL ?? "http://127.0.0.1:5199";
const PASSWORD = process.env.QA_PASSWORD ?? "SakredQA!2026";

/* The fixtures below write training rows. Same gate as every other harness
   that does: it must be QA, proven four ways, before anything is created. */
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
const eq = (name: string, got: unknown, want: unknown) =>
  check(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

let jar = "";

/*
  The session cookie is `secure` under NODE_ENV=production, which is how the
  QA server runs — the point of QA is the real configuration. Over plain http
  on a loopback port Express would refuse to set it at all, so every request
  carries the proxy header the deployed app sits behind. Without this the
  login succeeds, returns the member, and hands back nothing to be logged in
  with.
*/
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
const post = (path: string, body: unknown) =>
  call(path, { method: "POST", body: JSON.stringify(body ?? {}) });
const patch = (path: string, body: unknown) =>
  call(path, { method: "PATCH", body: JSON.stringify(body) });

async function json<T>(res: Response): Promise<T> {
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`${res.status} ${res.url}: ${text.slice(0, 200)}`);
  }
}

const FIXTURE_TITLE = "QA — share immutability";

console.log(`\nThe Room remembers what was published — ${BASE}\n`);

/**
 * Sweep first, in case a previous run died mid-way.
 *
 * A run that throws between creating the workout and deleting it leaves a
 * session in the QA member's history, and the next harness to count rows finds
 * a number nobody can explain. Cleaning at the start rather than only at the
 * end means the mess is bounded by the fixture's own title even when the run
 * that made it never reached its last line.
 */
const client = new pg.Client({ connectionString: target.url });
await client.connect();

async function sweep(): Promise<number> {
  const { rows } = await client.query<{ id: string }>(
    "select id from workout_sessions where title = $1", [FIXTURE_TITLE],
  );
  for (const { id } of rows) {
    const { rows: posts } = await client.query<{ id: string }>(
      "select id from community_messages where shared_session_id = $1", [id],
    );
    for (const post of posts) {
      await client.query("delete from message_reactions where message_id = $1", [post.id]);
      await client.query("delete from community_messages where id = $1", [post.id]);
    }
    await client.query("delete from workout_sets where session_id = $1", [id]);
    await client.query("delete from session_exercises where session_id = $1", [id]);
    await client.query("delete from workout_sessions where id = $1", [id]);
  }
  return rows.length;
}

const swept = await sweep();
if (swept) console.log(`  swept ${swept} fixture(s) left by an earlier run`);

// ─── Sign in ──────────────────────────────────────────────────────────────

{
  const res = await fetch(`${BASE}/api/login`, {
    method: "POST",
    redirect: "manual",
    headers: { ...PROXIED, "content-type": "application/json" },
    body: JSON.stringify({ email: "qa.member@sakred.local", password: PASSWORD }),
  });
  jar = (res.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
  check("the QA member signs in", res.status === 200 && !!jar, `status ${res.status}`);
  if (!jar) process.exit(1);
}

// ─── A workout to share ───────────────────────────────────────────────────

type Card = {
  sessionId: string;
  title: string | null;
  movements: { exerciseId: string; name: string; sets: number; reps: number | null; topWeightKg: number | null }[];
  volumeKg: number | null;
  publishedAt: string;
};

const catalogue = await json<{ id: string; name: string }[]>(await call("/api/training/exercises"));
const first = catalogue[0];
const second = catalogue.find((e) => e.id !== first.id)!;
check("the movement catalogue answers", !!first && !!second, `${catalogue.length} movements`);

const session = await json<{ id: string }>(
  await post("/api/training/sessions", { title: FIXTURE_TITLE }),
);
await post(`/api/training/sessions/${session.id}/exercises`, { exerciseId: first.id });
const logged = await json<{ set?: { id: string }; id?: string }>(
  await post(`/api/training/sessions/${session.id}/sets`, {
    exerciseId: first.id,
    reps: 5,
    weight: 100,
    unit: "kg",
  }),
);
const setId = logged.set?.id ?? logged.id;
check("a set was logged and has an id", !!setId, JSON.stringify(logged).slice(0, 160));
await post(`/api/training/sessions/${session.id}/finish`, {});

// ─── Publish it ───────────────────────────────────────────────────────────

const shared = await json<{ messageId: string }>(
  await post(`/api/training/sessions/${session.id}/share`, { caption: "QA fixture" }),
);
check("the workout was shared to the Room", !!shared.messageId, JSON.stringify(shared).slice(0, 160));

const readCard = async (): Promise<Card | null> => {
  const thread = await json<{ id: string; workout: Card | null }[]>(
    await call(`/api/community/threads/${shared.messageId}`),
  );
  return thread.find((m) => m.id === shared.messageId)?.workout ?? null;
};

const published = await readCard();
check("the post carries a workout card", !!published, JSON.stringify(published).slice(0, 200));
eq("published with the weight that was lifted", published?.movements[0]?.topWeightKg, 100);
eq("and the volume that was done", published?.volumeKg, 500);
check("and it is stamped with when it was published", !!published?.publishedAt, String(published?.publishedAt));

// ─── Now correct the private log, the way a member would ─────────────────

const edited = await patch(`/api/training/sets/${setId}`, { reps: 8, weight: 300, unit: "kg" });
check("the member corrects the set", edited.status === 200, `status ${edited.status}`);
await post(`/api/training/sessions/${session.id}/exercises`, { exerciseId: second.id });
await post(`/api/training/sessions/${session.id}/sets`, {
  exerciseId: second.id,
  reps: 10,
  weight: 50,
  unit: "kg",
});

/* The negative control: prove the training log really moved, so that "the
   card did not change" is a fact about the card and not about the edit. */
type HistorySet = { exerciseId: string; weightKg: number; reps: number | null };
const history = await json<{ sessions: { id: string; sets: HistorySet[] }[] }>(
  await call("/api/training/sessions"),
);
const canonical = history.sessions.find((s) => s.id === session.id);
const topKg = Math.max(0, ...(canonical?.sets ?? []).map((x) => x.weightKg));
const movementsNow = new Set((canonical?.sets ?? []).map((x) => x.exerciseId)).size;
check("the training log really did move", topKg === 300 && movementsNow === 2,
  `top ${topKg}kg across ${movementsNow} movement(s)`);

const afterEdit = await readCard();
eq("the Room card is unchanged by the correction", afterEdit, published);

// ─── And by deleting the training entirely ───────────────────────────────

const removed = await call(`/api/training/sessions/${session.id}`, { method: "DELETE" });
check("the member deletes the workout", removed.status === 200 || removed.status === 204,
  `status ${removed.status}`);

const afterDelete = await readCard();
eq("the post still says what it said", afterDelete, published);

{
  const { rows } = await client.query(
    "select shared_session_id, shared_workout is not null as has_snapshot from community_messages where id = $1",
    [shared.messageId],
  );
  eq("provenance is released with the training", rows[0]?.shared_session_id, null);
  eq("the published copy is not", rows[0]?.has_snapshot, true);
}

// ─── A tombstone shows no lift ───────────────────────────────────────────

const deleted = await call(`/api/community/messages/${shared.messageId}`, { method: "DELETE" });
check("the member deletes their post", deleted.status === 200 || deleted.status === 204,
  `status ${deleted.status}`);
eq("and the card goes with the words", await readCard(), null);

// ─── Leave QA as it was found ────────────────────────────────────────────

await client.query("delete from message_reactions where message_id = $1", [shared.messageId]);
await client.query("delete from community_messages where id = $1", [shared.messageId]);
await client.query("delete from workout_sets where session_id = $1", [session.id]);
await client.query("delete from session_exercises where session_id = $1", [session.id]);
await client.query("delete from workout_sessions where id = $1", [session.id]);
const { rows: [left] } = await client.query<{ sessions: string; messages: string }>(`
  select (select count(*) from workout_sessions) as sessions,
         (select count(*) from community_messages) as messages`);
console.log(`  left behind: ${left.sessions} sessions, ${left.messages} messages`);
await client.end();

if (failures.length) {
  console.error("\n✗ room share immutability\n");
  for (const f of failures) console.error(`    ${f}`);
  console.error("");
  process.exit(1);
}
console.log(`\n✓ ${passed} assertions — a published workout is not a live query\n`);
