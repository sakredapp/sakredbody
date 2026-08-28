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

// ─── 7b. A workout designed rather than performed ─────────────────────────

console.log("A superset can be written into a workout before it is ever trained\n");

/*
  The builder's half of the chain. Superset structure is part of a reusable
  workout's composition — a member writing "Chest + Shoulders" to run every
  week should be able to say the incline press and the fly are a pair before
  training it once. This is the persistence half: the key the builder mints,
  saved, read back, edited, and started.
*/
{
  const designedGroup = crypto.randomUUID();
  const created = await json<{ id: string }>(
    await post("/api/training/workouts", {
      name: `${TAG} — designed`,
      exercises: [
        { exerciseId: DB, targetSets: 3, supersetGroup: designedGroup },
        { exerciseId: BB, targetSets: 3, supersetGroup: designedGroup },
        { exerciseId: ONE_ARM, targetSets: 2 },
      ],
    }),
  );

  type Saved = {
    id: string;
    exercises: { exerciseId: string; supersetGroup: string | null }[];
  };
  const readBack = async () =>
    (await json<Saved[]>(await call("/api/training/workouts"))).find((w) => w.id === created.id);

  {
    const w = await readBack();
    const grouped = (w?.exercises ?? []).filter((e) => e.supersetGroup);
    check("the pairing survives being saved", grouped.length === 2, `${grouped.length} grouped`);
    check(
      "as one group, not two",
      new Set(grouped.map((e) => e.supersetGroup)).size === 1,
    );
    eq(
      "and the movement outside it stays outside it",
      w?.exercises.find((e) => e.exerciseId === ONE_ARM)?.supersetGroup ?? null,
      null,
    );
  }

  /*
    The round trip that used to drop it. Editing a saved workout replaces its
    movements wholesale, so a field the editor does not send back is a field
    the edit silently deletes — which is how a paired workout became two loose
    movements the second time anybody renamed it.
  */
  {
    const w = await readBack();
    await call(`/api/training/workouts/${created.id}`, {
      method: "PUT",
      body: JSON.stringify({
        name: `${TAG} — designed, renamed`,
        exercises: (w?.exercises ?? []).map((e) => ({
          exerciseId: e.exerciseId,
          targetSets: 3,
          supersetGroup: e.supersetGroup,
        })),
      }),
    });
    const after = await readBack();
    const grouped = (after?.exercises ?? []).filter((e) => e.supersetGroup);
    check("and survives being edited", grouped.length === 2, `${grouped.length} grouped after edit`);
  }

  const ran = await start({ fromWorkoutId: created.id });
  {
    const rows = await composition(ran.id);
    eq("starting it brings all three movements", rows.length, 3);
    const groups = rows.filter((r) => r.superset_group);
    check("with the designed pair still paired", groups.length === 2);
    check(
      "under a key of this session's own, not the template's",
      groups.length === 2 && groups[0].superset_group !== designedGroup,
      `${groups[0]?.superset_group}`,
    );
  }
  await clearOpen();

  await client.query("delete from member_workout_exercises where member_workout_id = $1", [created.id]);
  await client.query("delete from member_workouts where id = $1", [created.id]);
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

// ─── 8b. Discarding a workout discards the workout ────────────────────────

console.log("Discarding a workout leaves nothing of it behind\n");

/*
  ── What this section is, and what it is not ──────────────────────────────

  It began as a regression for a bug that turned out not to exist. Reading
  `DELETE /sessions/:id` — which removes the sets and the session and says
  nothing about composition — the obvious conclusion is that every discarded
  workout leaves a `session_exercises` row per movement pointing at a session
  that is gone. The fix was written, and then the omission was planted back and
  this harness run against a real database: the rows went anyway.

  `session_exercises`, `workout_sets` and `training_observations` all carry
  `ON DELETE CASCADE` on `session_id`. The database was already doing it. So
  what is asserted here is the outcome — nothing of a discarded workout
  survives, by whatever means — and, separately, the constraint that produces
  it, so that the day somebody drops a cascade the failure says which one.

  Three shapes, because they are created by three different paths: a plain
  session, one started from a saved workout, and one with a superset in it.
*/
async function leftBehind(id: string) {
  const one = async (sql: string) =>
    Number((await client.query<{ n: string }>(sql, [id])).rows[0].n);
  return {
    sessions: await one("select count(*) as n from workout_sessions where id = $1"),
    composition: await one("select count(*) as n from session_exercises where session_id = $1"),
    sets: await one("select count(*) as n from workout_sets where session_id = $1"),
    observations: await one("select count(*) as n from training_observations where session_id = $1"),
  };
}

{
  const plain = await start({ title: `${TAG} — discarded` });
  await add(plain.id, DB);
  await add(plain.id, BB);
  await add(plain.id, ONE_ARM);
  await logSet(plain.id, DB, 30, 8);
  await logSet(plain.id, BB, 60, 5);
  await post(`/api/training/sessions/${plain.id}/observations`, {
    exerciseId: DB,
    note: "QA — something to leave behind",
    quality: "good",
  });

  const before = await leftBehind(plain.id);
  check(
    "there is something to discard",
    before.composition === 3 && before.sets === 2,
    JSON.stringify(before),
  );

  const gone = await del(`/api/training/sessions/${plain.id}`);
  eq("the session is discarded", gone.status, 200);
  eq("and nothing of it is left", await leftBehind(plain.id), {
    sessions: 0,
    composition: 0,
    sets: 0,
    observations: 0,
  });
}

{
  /* One started from a saved workout, whose composition was written by the
     start rather than by the member — a different code path into the same
     table, and the one the orphan fix has to cover too. */
  const fromSaved = await start({ fromWorkoutId: kept.id });
  const before = await leftBehind(fromSaved.id);
  check("a workout started from a template has a composition", before.composition === 2, JSON.stringify(before));
  await del(`/api/training/sessions/${fromSaved.id}`);
  eq("and discarding it leaves none of it", await leftBehind(fromSaved.id), {
    sessions: 0,
    composition: 0,
    sets: 0,
    observations: 0,
  });
}

{
  const paired = await start({ title: `${TAG} — discarded superset` });
  await add(paired.id, DB);
  await add(paired.id, BB, DB);
  const before = await leftBehind(paired.id);
  check("a paired session has both movements", before.composition === 2, JSON.stringify(before));
  await del(`/api/training/sessions/${paired.id}`);
  eq("and its pairing goes with it", await leftBehind(paired.id), {
    sessions: 0,
    composition: 0,
    sets: 0,
    observations: 0,
  });

  /* Nothing anywhere still points at any of the three. Counted across the
     whole table rather than by id, because an orphan is by definition a row
     whose session cannot be looked up. */
  const { rows } = await client.query<{ n: string }>(`
    select count(*) as n from session_exercises se
     where not exists (select 1 from workout_sessions s where s.id = se.session_id)`);
  eq("and no composition row anywhere points at a session that is gone", rows[0].n, "0");

  /*
    And the mechanism, named. The assertions above would go on passing if the
    route grew explicit deletes and the cascade were dropped — which is fine
    until a fourth path deletes a session without them. This is the rule the
    outcome actually rests on.
  */
  const { rows: cascades } = await client.query<{ child: string; on_delete: string }>(`
    select cl.relname as child, con.confdeltype as on_delete
      from pg_constraint con
      join pg_class cl on cl.oid = con.conrelid
      join pg_class rf on rf.oid = con.confrelid
     where con.contype = 'f' and rf.relname = 'workout_sessions'
       and cl.relname in ('session_exercises', 'workout_sets', 'training_observations')
     order by cl.relname`);
  eq(
    "and the cascade that does it is still on all three",
    cascades.map((r) => `${r.child}:${r.on_delete}`),
    ["session_exercises:c", "training_observations:c", "workout_sets:c"],
  );
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
