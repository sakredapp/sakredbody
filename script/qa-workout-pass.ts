/**
 * A workout means what it meant, keeps its shape, and can be done again.
 *
 * ── The three defects this is the regression for ──────────────────────────
 *
 * 1. `70` on a dumbbell bench had no recorded meaning. Per hand and altogether
 *    are a factor of two apart in every derived number, and the Room published
 *    the result of guessing.
 *
 * 2. The first fix put that meaning on `exercises`, where correcting it today
 *    would have rewritten what a workout six months ago is supposed to have
 *    weighed. It now lives on `session_exercises`, snapshotted when a movement
 *    enters a session, and NULL there means the workout was never asked.
 *
 * 3. Starting a saved workout called `begin(name)` — it created a session with
 *    the right title and none of the movements. The feature looked missing
 *    because it silently did nothing.
 *
 * ── Why this is not a unit test ───────────────────────────────────────────
 *
 * The arithmetic is covered without a database in script/test-load.ts. What
 * cannot be covered there is which column the queries actually read, whether
 * the snapshot is taken on insert, and whether a start really lands with its
 * composition. Only driving the endpoints against a real database proves any
 * of that — the same lesson the walkthrough taught three times: code existing
 * is not the application executing it.
 *
 * ── The negative controls ─────────────────────────────────────────────────
 *
 * "Nothing changed" passes trivially when nothing was tried. So every
 * historical-truth assertion is paired with a change that *does* move the
 * number, and the harness fails if the two look the same.
 *
 *   Terminal 1:  npm run build && script/qa-serve.sh
 *   Terminal 2:  set -a && . ./.env.qa && set +a && SAKRED_QA=1 \
 *                npx tsx script/qa-workout-pass.ts
 */

import pg from "pg";
import { resolveQaTarget } from "./qa-target.js";

const BASE = process.env.QA_BASE_URL ?? "http://127.0.0.1:5199";
const PASSWORD = process.env.QA_PASSWORD ?? "SakredQA!2026";

/* This harness writes training rows. Same gate as every other one that does:
   it must be QA, proven four ways, before anything is created. */
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
  check(
    name,
    JSON.stringify(got) === JSON.stringify(want),
    `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`,
  );

let jar = "";

/* Secure cookies under NODE_ENV=production, which is how the QA server runs.
   Over plain http on loopback Express would refuse to set one at all. */
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
const post = (p: string, b?: unknown) => call(p, { method: "POST", body: JSON.stringify(b ?? {}) });
const patch = (p: string, b: unknown) => call(p, { method: "PATCH", body: JSON.stringify(b) });
const del = (p: string) => call(p, { method: "DELETE" });

async function json<T>(res: Response): Promise<T> {
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`${res.status} ${res.url}: ${text.slice(0, 200)}`);
  }
}

const DB = "chest-supported-dumbbell-row"; // dumbbell, both arms, per_limb
const BB = "barbell-bench-press"; // barbell, total
const ONE_ARM = "alternating-dumbbell-curl"; // dumbbell, one side at a time
const TAG = "QA — workout pass";

console.log(`\nA workout means what it meant — ${BASE}\n`);

const client = new pg.Client({ connectionString: target.url });
await client.connect();

/**
 * Sweep first, in case a previous run died mid-way.
 *
 * A run that throws between creating a session and deleting it leaves rows in
 * the QA member's history, and the next harness to count finds a number nobody
 * can explain. Bounded by this fixture's own tag so it can never reach
 * anything another harness made. Every stateful harness owns its own setup and
 * teardown.
 */
async function sweep(): Promise<number> {
  const { rows } = await client.query<{ id: string }>(
    "select id from workout_sessions where title like $1",
    [`${TAG}%`],
  );
  for (const { id } of rows) {
    const { rows: posts } = await client.query<{ id: string }>(
      "select id from community_messages where shared_session_id = $1",
      [id],
    );
    for (const p of posts) {
      await client.query("delete from message_reactions where message_id = $1", [p.id]);
      await client.query("delete from community_messages where id = $1", [p.id]);
    }
    await client.query("delete from training_observations where session_id = $1", [id]);
    await client.query("delete from workout_sets where session_id = $1", [id]);
    await client.query("delete from session_exercises where session_id = $1", [id]);
    await client.query("delete from workout_sessions where id = $1", [id]);
  }
  const { rows: saved } = await client.query<{ id: string }>(
    "select id from member_workouts where name like $1",
    [`${TAG}%`],
  );
  for (const { id } of saved) {
    await client.query("delete from member_workout_exercises where member_workout_id = $1", [id]);
    await client.query("delete from member_workouts where id = $1", [id]);
  }
  // The catalogue is shared and this harness edits one row of it on purpose.
  // Put it back whatever happened.
  await client.query("update exercises set load_entry = 'per_limb' where id = $1", [DB]);
  return rows.length + saved.length;
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

type Session = { id: string };
type Movement = { exerciseId: string; loadEntry: string | null; supersetGroup: string | null; name: string };
type Card = {
  movements: { exerciseId: string; supersetGroup: string | null; topWeightKg: number | null }[];
  volumeKg: number | null;
};

/**
 * One open workout per member — clear whatever is there before starting.
 *
 * A loop, not a single delete. Nothing has ever enforced one unfinished
 * session per member at the database level; the open-session route returns the
 * *newest*, so an older one is unreachable through the app and still blocks a
 * start. Production has held five. Bounded so a route that stops deleting
 * fails the harness rather than hanging it.
 */
async function clearOpen(): Promise<void> {
  for (let i = 0; i < 10; i++) {
    const open = await json<{ session: { id: string } | null }>(
      await call("/api/training/sessions/open"),
    );
    if (!open.session) return;
    const res = await del(`/api/training/sessions/${open.session.id}`);
    if (res.status !== 200) throw new Error(`could not clear ${open.session.id}: ${res.status}`);
  }
  throw new Error("still an open workout after ten deletes");
}

async function start(body: Record<string, unknown>): Promise<Session> {
  await clearOpen();
  const res = await post("/api/training/sessions", body);
  if (res.status !== 201) throw new Error(`start ${res.status}: ${await res.text()}`);
  return json<Session>(res);
}

const add = async (id: string, exerciseId: string, supersetWith?: string) =>
  json<{ exercises: Movement[] }>(
    await post(`/api/training/sessions/${id}/exercises`, {
      exerciseId,
      ...(supersetWith ? { supersetWith } : {}),
    }),
  );

/* Weights go in as the member enters them, in their own unit. The QA member
   is on kg here so the assertions read as the numbers the endpoints store. */
const logSet = (id: string, exerciseId: string, weight: number, reps: number) =>
  post(`/api/training/sessions/${id}/sets`, { exerciseId, weight, unit: "kg", reps });

/**
 * The card the Room would publish, taken now.
 *
 * There is no read-only endpoint for it, and that is deliberate: a published
 * card is a snapshot written into the message, never re-derived. So this
 * publishes and reads the snapshot back, which is the executed path — and it
 * means the immutability rule is exercised at the same time as the arithmetic:
 * a card taken before a change and one taken after are two different rows, and
 * the first never moves.
 */
async function cardFor(sessionId: string): Promise<Card> {
  const res = await post(`/api/training/sessions/${sessionId}/share`, { caption: "" });
  if (res.status !== 201) throw new Error(`share ${res.status}: ${await res.text()}`);
  const { messageId } = await json<{ messageId: string }>(res);
  const { rows } = await client.query<{ shared_workout: Card }>(
    "select shared_workout from community_messages where id = $1",
    [messageId],
  );
  return rows[0].shared_workout;
}

const composition = (id: string) =>
  client
    .query<{ exercise_id: string; load_entry: string | null; superset_group: string | null }>(
      "select exercise_id, load_entry, superset_group from session_exercises where session_id = $1 order by position",
      [id],
    )
    .then((r) => r.rows);

// ─── 1. A new session records what its numbers mean ───────────────────────

console.log("A movement entering a session records what its numbers will mean\n");

const s1 = await start({ title: `${TAG} — recorded` });
await add(s1.id, DB);
await add(s1.id, BB);

{
  const rows = await composition(s1.id);
  eq("the dumbbell row records 'per limb'", rows.find((r) => r.exercise_id === DB)?.load_entry, "per_limb");
  eq("the barbell row records 'total'", rows.find((r) => r.exercise_id === BB)?.load_entry, "total");
}

await logSet(s1.id, DB, 30, 8);
await logSet(s1.id, BB, 100, 5);
await post(`/api/training/sessions/${s1.id}/finish`, { shareWithCoach: false });

{
  const card = await cardFor(s1.id);
  // 30 in each hand for 8, plus 100 on the bar for 5.
  eq("the card counts both hands", card.volumeKg, 30 * 8 * 2 + 100 * 5);
  eq(
    "and still shows the number the member entered",
    card.movements.find((m) => m.exerciseId === DB)?.topWeightKg,
    30,
  );
}

// ─── 2. Correcting the catalogue does not rewrite that workout ────────────

console.log("Changing a movement's setting cannot reach a finished workout\n");

const beforeEdit = await cardFor(s1.id);
await client.query("update exercises set load_entry = 'total' where id = $1", [DB]);
{
  const card = await cardFor(s1.id);
  eq(
    "the finished session's volume is unchanged by the catalogue edit",
    card.volumeKg,
    30 * 8 * 2 + 100 * 5,
  );
}

/* The negative control. If the reading really is what the card is computed
   from, changing the *session's* row must move the number — otherwise the
   assertion above is passing because nothing is being read at all. */
await client.query(
  "update session_exercises set load_entry = 'total' where session_id = $1 and exercise_id = $2",
  [s1.id, DB],
);
{
  const card = await cardFor(s1.id);
  eq("changing the session's own reading does move it", card.volumeKg, 30 * 8 + 100 * 5);
  eq(
    "and the card published before any of it says what it said",
    beforeEdit.volumeKg,
    30 * 8 * 2 + 100 * 5,
  );
}
await client.query(
  "update session_exercises set load_entry = 'per_limb' where session_id = $1 and exercise_id = $2",
  [s1.id, DB],
);
await client.query("update exercises set load_entry = 'per_limb' where id = $1", [DB]);

// ─── 3. A workout that was never asked keeps its arithmetic ───────────────

console.log("A workout logged before the question keeps the number it always had\n");

/* A pre-migration session, made by removing the recorded reading — which is
   exactly what every row in the database looked like before this shipped. */
await client.query("update session_exercises set load_entry = null where session_id = $1", [s1.id]);
{
  const card = await cardFor(s1.id);
  eq("it publishes weight × reps, as it always did", card.volumeKg, 30 * 8 + 100 * 5);
}

const legacy = await json<{ sessions: { id: string; sets: { loadEntry: string | null }[] }[] }>(
  await call("/api/training/sessions"),
);
{
  const mine = legacy.sessions.find((x) => x.id === s1.id);
  check(
    "and history reports no reading rather than inventing one",
    !!mine && mine.sets.every((x) => x.loadEntry === null),
  );
}

await client.query("update session_exercises set load_entry = 'per_limb' where session_id = $1 and exercise_id = $2", [s1.id, DB]);
await client.query("update session_exercises set load_entry = 'total' where session_id = $1 and exercise_id = $2", [s1.id, BB]);

// ─── 4. One side at a time is twice, never four times ─────────────────────

console.log("A one-armed movement is counted twice, not four times\n");

const s2 = await start({ title: `${TAG} — one arm` });
await add(s2.id, ONE_ARM);
await logSet(s2.id, ONE_ARM, 15, 10);
await post(`/api/training/sessions/${s2.id}/finish`, { shareWithCoach: false });
{
  const card = await cardFor(s2.id);
  eq("15 a side for 10, done both sides", card.volumeKg, 15 * 10 * 2);
  check("and not quadrupled", card.volumeKg !== 15 * 10 * 4);
}

// ─── 5. A member can correct the reading, for this session only ───────────

console.log("The member can say what their number means, and only for today\n");

const s3 = await start({ title: `${TAG} — override` });
await add(s3.id, DB);
await patch(`/api/training/sessions/${s3.id}/exercises/${DB}`, { loadEntry: "total" });
{
  const rows = await composition(s3.id);
  eq("this session now reads it as one load", rows[0].load_entry, "total");
  const { rows: cat } = await client.query<{ load_entry: string }>(
    "select load_entry from exercises where id = $1",
    [DB],
  );
  eq("the catalogue is untouched", cat[0].load_entry, "per_limb");
  const older = await composition(s1.id);
  eq(
    "and so is the workout finished ten seconds ago",
    older.find((r) => r.exercise_id === DB)?.load_entry,
    "per_limb",
  );
}

// ─── 6. Supersets, made findable and kept ─────────────────────────────────

console.log("A superset can be made from one movement, and survives being saved\n");

/* The discoverability defect was that pairing required two movements to
   already exist. The add-and-pair path is one request. */
await add(s3.id, BB, DB);
{
  const rows = await composition(s3.id);
  const groups = rows.map((r) => r.superset_group);
  check(
    "adding a movement can pair it in the same request",
    rows.length === 2 && !!groups[0] && groups[0] === groups[1],
  );
}

await logSet(s3.id, DB, 30, 8);
await logSet(s3.id, BB, 60, 8);
await post(`/api/training/sessions/${s3.id}/finish`, { shareWithCoach: false });

{
  const card = await cardFor(s3.id);
  const groups = card.movements.map((m) => m.supersetGroup);
  check(
    "the Room card carries the pairing",
    groups.length === 2 && !!groups[0] && groups[0] === groups[1],
  );
}

// ─── 7. Keeping a workout, and doing it again ─────────────────────────────

console.log("A finished workout can be kept, and a kept workout starts with its movements\n");

const kept = await json<{ id: string; name: string }>(
  await post(`/api/training/sessions/${s3.id}/save-as-workout`, { name: `${TAG} — kept` }),
);
check("the session is kept as a workout", !!kept.id);

{
  const { rows } = await client.query<{ exercise_id: string; superset_group: string | null; target_sets: number }>(
    "select exercise_id, superset_group, target_sets from member_workout_exercises where member_workout_id = $1 order by order_index",
    [kept.id],
  );
  eq("both movements are in it", rows.map((r) => r.exercise_id), [DB, BB]);
  check(
    "and so is the pairing",
    rows.length === 2 && !!rows[0].superset_group && rows[0].superset_group === rows[1].superset_group,
  );
  eq("the sets performed become the plan", rows.map((r) => r.target_sets), [1, 1]);
}

{
  const again = await post(`/api/training/sessions/${s3.id}/save-as-workout`, {});
  const body = await json<{ alreadySaved?: boolean }>(again);
  check("keeping it twice says so rather than making a second copy", body.alreadySaved === true);
}

const started = await start({ fromWorkoutId: kept.id });
{
  const rows = await composition(started.id);
  eq("starting it brings every movement", rows.map((r) => r.exercise_id), [DB, BB]);
  /* Indexed defensively. The defect this asserts against is a start that
     copies *nothing*, and a harness that throws on `rows[1]` reports a stack
     trace where it should report which rule was broken. */
  check(
    "with the pairing intact",
    rows.length === 2 && !!rows[0].superset_group && rows[0].superset_group === rows[1].superset_group,
  );
  check("and a group key of its own, not the template's", !!rows[0]?.superset_group);
  eq("it records what its numbers mean, from the catalogue as it stands now",
    rows.find((r) => r.exercise_id === DB)?.load_entry, "per_limb");

  const { rows: sets } = await client.query<{ n: string }>(
    "select count(*) as n from workout_sets where session_id = $1",
    [started.id],
  );
  eq("and nothing that was lifted last time", sets[0].n, "0");

  const open = await json<{ session: { title: string | null } | null }>(
    await call("/api/training/sessions/open"),
  );
  eq("it is named after the workout", open.session?.title, `${TAG} — kept`);
}

{
  /* A variation without losing what it varies from. The pairing is part of
     the shape, so it is copied; provenance is not, because a copy was saved
     from a workout rather than from a session. */
  const copy = await json<{ id: string; name: string }>(
    await post(`/api/training/workouts/${kept.id}/duplicate`, {}),
  );
  check("a saved workout can be copied", copy.name === `${TAG} — kept (copy)`, copy.name);
  const { rows } = await client.query<{ exercise_id: string; superset_group: string | null }>(
    "select exercise_id, superset_group from member_workout_exercises where member_workout_id = $1 order by order_index",
    [copy.id],
  );
  eq("with its movements", rows.map((r) => r.exercise_id), [DB, BB]);
  check(
    "and its pairing",
    rows.length === 2 && !!rows[0].superset_group && rows[0].superset_group === rows[1].superset_group,
  );
  const { rows: prov } = await client.query<{ source_session_id: string | null }>(
    "select source_session_id from member_workouts where id = $1",
    [copy.id],
  );
  eq("but not the provenance of the session it was not saved from", prov[0].source_session_id, null);
  await client.query("delete from member_workout_exercises where member_workout_id = $1", [copy.id]);
  await client.query("delete from member_workouts where id = $1", [copy.id]);
}

// ─── 8. Repeating a session directly ──────────────────────────────────────

console.log("Yesterday's session can be done again without filing a template\n");

const repeated = await start({ repeatSessionId: s3.id });
{
  const rows = await composition(repeated.id);
  eq("the composition is copied", rows.map((r) => r.exercise_id), [DB, BB]);
  const { rows: sets } = await client.query<{ n: string }>(
    "select count(*) as n from workout_sets where session_id = $1",
    [repeated.id],
  );
  eq("and none of the performance", sets[0].n, "0");
}

/* Nothing to repeat is refused rather than started empty — the same defect,
   wearing a different name. */
await clearOpen();
{
  const bare = await client.query<{ id: string }>(
    `insert into workout_sessions (user_id, on_date, title, finished_at)
     values ('qa-member', current_date, $1, now()) returning id`,
    [`${TAG} — nothing in it`],
  );
  const res = await post("/api/training/sessions", { repeatSessionId: bare.rows[0].id });
  eq("a session with no movements refuses to be repeated", res.status, 400);
  const res2 = await post(`/api/training/sessions/${bare.rows[0].id}/save-as-workout`, {});
  eq("and refuses to be saved as a workout", res2.status, 400);
  const open = await json<{ session: unknown }>(await call("/api/training/sessions/open"));
  eq("and no empty session is left running", open.session, null);
}

// ─── 9. History says which of these can be done again ─────────────────────

console.log("History offers Repeat only where there is something to repeat\n");

{
  const hist = await json<{
    sessions: { id: string; movements?: number; practiceMovements?: number; savedWorkoutId?: string | null }[];
  }>(await call("/api/training/sessions"));

  const structured = hist.sessions.find((x) => x.id === s3.id);
  eq("a built session reports its movements", structured?.movements, 2);
  eq("none of which are a class", structured?.practiceMovements, 0);
  eq("and it knows it has been kept", structured?.savedWorkoutId, kept.id);

  const empty = hist.sessions.find((x) => x.movements === 0);
  check("a session with no composition reports none", empty === undefined || empty.movements === 0);
}

// ─── Teardown ─────────────────────────────────────────────────────────────

await clearOpen();
const cleaned = await sweep();
console.log(`\n  cleaned up ${cleaned} fixture(s)\n`);
await client.end();

if (failures.length) {
  console.error("✗ workout pass\n");
  for (const f of failures) console.error(`    ${f}`);
  console.error("");
  process.exit(1);
}
console.log(`✓ ${passed} workout-pass assertions\n`);
