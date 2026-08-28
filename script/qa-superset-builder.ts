/**
 * A superset can be written into a workout before it is ever trained.
 *
 * ── Why the builder needed this ──────────────────────────────────────────
 *
 * Pairing existed only inside a running workout, so the structure of a
 * reusable workout could be *kept* but not *designed*: a member writing
 * "Chest + Shoulders" to run every week had to start it, pair the movements
 * mid-session, finish, and save it back before the template knew that the
 * incline press and the fly go together. Superset structure is composition,
 * not something only discovered while training.
 *
 * ── Why this is a browser and not another API test ───────────────────────
 *
 * script/qa-workout-pass.ts already proves the chain from the *key* onwards —
 * saved, read back, edited without being dropped, started under a fresh key.
 * What it cannot prove is that a person can produce that key: that the control
 * is reachable, that it is offered when there is only one movement to pair,
 * and that the result is legible on the row afterwards without reopening
 * anything. That is what was missing before, and it is a screen's answer.
 *
 *   Terminal 1:  npm run build && script/qa-serve.sh
 *   Terminal 2:  npx tsx script/qa-superset-builder.ts
 */

import { Browser, assertFreshBuild } from "./cdp.js";
import { Portal } from "./portal.js";

assertFreshBuild();

const BASE = process.env.SAKRED_QA_BASE ?? "http://127.0.0.1:5199";
const NAME = "QA — designed superset";

const failures: string[] = [];
const notes: string[] = [];
const check = (name: string, ok: boolean, detail = "") => {
  if (!ok) failures.push(detail ? `${name} — ${detail}` : name);
  else notes.push(`✓ ${name}`);
};

/* Slug, and the words somebody would actually type to find it. Derived from
   the slug in the first draft of this file, which does not work: the catalogue
   holds "Chest-Supported Dumbbell Row" and a search for "chest supported"
   matches nothing. */
const A = { id: "chest-supported-dumbbell-row", find: "Chest-Supported" };
const B = { id: "barbell-bench-press", find: "Barbell Bench" };

const b = new Browser();
await b.launch();
await b.headers({ "X-Forwarded-Proto": "https" });
await b.viewport(393, 852);

const portal = new Portal(b, BASE);
await portal.login();
await portal.dismissTour();

const tap = (selector: string) => portal.tapSelector(selector);
const testid = (id: string) => `[data-testid="${id}"]`;

/** Whatever an earlier run left. This harness owns its own setup. */
const swept = await b.evaluate<number>(`
  const res = await fetch("/api/training/workouts", { credentials: "include" });
  if (!res.ok) return 0;
  let gone = 0;
  for (const w of await res.json()) {
    if (!String(w.name || "").startsWith(${JSON.stringify(NAME)})) continue;
    const del = await fetch("/api/training/workouts/" + w.id, { method: "DELETE", credentials: "include" });
    if (del.ok) gone++;
  }
  const open = await fetch("/api/training/sessions/open", { credentials: "include" });
  const body = open.ok ? await open.json() : { session: null };
  if (body.session) await fetch("/api/training/sessions/" + body.session.id, { method: "DELETE", credentials: "include" });
  return gone;
`);

console.log(`\nA superset, designed rather than discovered — ${BASE}\n`);
if (swept) console.log(`  swept ${swept} workout(s) left by an earlier run`);

check("Build opens", await portal.openSection("build"), portal.lastFailure);
/* Twice if need be. Opening a dialog is a two-step gesture whose first step is
   not reliable from every starting point — the same reason Portal.openSection
   retries — and a harness that flakes here reports "the builder never opened"
   about a builder that opens perfectly well by hand. */
const builderOpen = await portal.tapUntil(
  testid("build-new-workout"),
  `!!document.querySelector(${JSON.stringify(testid("workout-name"))})`,
  "the builder",
  3,
);
check("the builder opens", builderOpen, portal.lastFailure);
if (!builderOpen) {
  await b.close();
  console.error("\n✗ the builder never opened\n");
  process.exit(1);
}

await b.evaluate(`
  const box = document.querySelector(${JSON.stringify(testid("workout-name"))});
  Object.getOwnPropertyDescriptor(Object.getPrototypeOf(box), "value").set.call(box, ${JSON.stringify(NAME)});
  box.dispatchEvent(new Event("input", { bubbles: true }));
  return true;
`);

/** Add one movement through the picker, by its slug. */
async function add(m: { id: string; find: string }): Promise<boolean> {
  /*
    Every wait here returns rather than throws, and the whole gesture is tried
    twice.

    The picker searches the catalogue over the network and renders when the
    answer lands, so on a loaded machine the row can be a second later than a
    fixed timeout allows. A `waitFor` that throws turns that into a stack trace
    from inside a helper, which says nothing about supersets — the subject of
    this file — and reads as a product failure. Reported, it says which step
    was slow.
  */
  const settle = (condition: string, what: string, ms = 15_000) =>
    b.waitFor(condition, what, ms).then(() => true).catch(() => false);

  for (let attempt = 0; attempt < 2; attempt++) {
    if (!(await tap(testid("builder-add-movement")))) {
      lastAddFailure = `Add a movement: ${portal.lastFailure}`;
      continue;
    }
    if (!(await settle(`!!document.querySelector('[data-testid="movement-search"]')`, "the picker"))) {
      lastAddFailure = "the picker never opened";
      continue;
    }
    await b.evaluate(`
      const box = document.querySelector('[data-testid="movement-search"]');
      Object.getOwnPropertyDescriptor(Object.getPrototypeOf(box), "value").set.call(box, ${JSON.stringify(m.find)});
      box.dispatchEvent(new Event("input", { bubbles: true }));
      return true;
    `);
    if (!(await settle(`!!document.querySelector(${JSON.stringify(testid(`movement-${m.id}`))})`, `${m.find} in the picker`))) {
      lastAddFailure = `"${m.find}" never appeared in the picker`;
      await tap(testid("movement-picker-done"));
      continue;
    }
    if (!(await tap(testid(`movement-${m.id}`)))) {
      lastAddFailure = `${m.id}: ${portal.lastFailure}`;
      continue;
    }
    /* The picker stays up after a pick — deliberately, so several movements can
       be added in one visit. So it has to be closed to get back to the list,
       which is also where the pairing control lives. */
    if (!(await tap(testid("movement-picker-done")))) {
      lastAddFailure = `Done: ${portal.lastFailure}`;
      continue;
    }
    if (await settle(`!!document.querySelector(${JSON.stringify(testid("workout-name"))})`, "the builder list", 10_000)) {
      return true;
    }
    lastAddFailure = "the builder list never came back";
  }
  return false;
}

/** Why the last `add` gave up, so a failure names the step rather than the file. */
let lastAddFailure = "";

check("the first movement is added", await add(A), lastAddFailure);

/*
  Offered with one movement in the list, which is the moment it is wanted —
  somebody adds the press *thinking* of the fly. Before this it said nothing
  at all until a second movement existed.
*/
check(
  "a lone movement says how to pair it rather than hiding the idea",
  await b.evaluate<boolean>(`
    return [...document.querySelectorAll("p")].some(p => p.textContent.includes("Add another movement to superset"));
  `),
);

check("the second movement is added", await add(B), lastAddFailure);
check("and 'Superset with…' is now offered", await tap(testid(`builder-pair-${A.id}`)));
check("naming the other movement pairs them", await tap(testid(`builder-pair-with-${B.id}`)));

const labels = () =>
  b.evaluate<Record<string, string>>(`
    const out = {};
    for (const el of document.querySelectorAll('[data-testid^="builder-superset-"]')) {
      out[el.getAttribute("data-testid").replace("builder-superset-", "")] = el.textContent.trim();
    }
    return out;
  `);

{
  const seen = await labels();
  check("the pair is drawn as A1 and A2", seen[A.id] === "A1" && seen[B.id] === "A2", JSON.stringify(seen));
}

const before = await b.evaluate<{ name: string; disabled: boolean; present: boolean }>(`
  const box = document.querySelector('[data-testid="workout-name"]');
  const save = document.querySelector('[data-testid="workout-save"]');
  return { name: box ? box.value : "(no field)", disabled: save ? save.disabled : true, present: !!save };
`);
check("the name reached the field", before.name === NAME, JSON.stringify(before));
check("and Save is offered", before.present && !before.disabled, JSON.stringify(before));
check("it is saved", await tap(testid("workout-save")), portal.lastFailure);
/* Waited on the server's answer rather than on the list re-rendering: a save
   that is refused leaves the dialog open and the list unchanged, and "the row
   never appeared" is the least useful way to be told about it. */
const appeared = await b
  .waitFor(
    `(await (await fetch("/api/training/workouts", { credentials: "include" })).json())
       .some(w => w.name === ${JSON.stringify(NAME)})`,
    "the workout to reach the server",
    15_000,
  )
  .then(() => true)
  .catch(() => false);
check("the save is accepted", appeared, await b.evaluate<string>(`
  const err = [...document.querySelectorAll('[role="status"], .text-destructive')].map(e => e.textContent.trim()).filter(Boolean);
  return err.join(" | ") || "no message on screen";
`));
if (!appeared) {
  await b.close();
  console.error("\n✗ the workout was never saved\n");
  for (const f of failures) console.error(`    ${f}`);
  console.error("");
  for (const n of notes) console.error(`    · ${n}`);
  console.error("");
  process.exit(1);
}
await b.waitFor(
  `[...document.querySelectorAll('[data-testid^="saved-workout-"]')].some(e => e.textContent.includes(${JSON.stringify(NAME)}))`,
  "the saved workout in the list",
  15_000,
);

const saved = await b.evaluate<{ id: string; grouped: number; keys: number }>(`
  const res = await fetch("/api/training/workouts", { credentials: "include" });
  const list = await res.json();
  const w = list.find(x => x.name === ${JSON.stringify(NAME)});
  if (!w) return { id: "", grouped: 0, keys: 0 };
  const grouped = w.exercises.filter(e => e.supersetGroup);
  return { id: w.id, grouped: grouped.length, keys: new Set(grouped.map(e => e.supersetGroup)).size };
`);
check("the server kept the pairing", saved.grouped === 2 && saved.keys === 1, JSON.stringify(saved));

// ── Reopen it, and the pairing is still on the row ────────────────────────

check("the saved workout reopens", await tap(`[data-testid="saved-workout-${saved.id}"] button[aria-label="Edit"]`));
await b.waitFor(`!!document.querySelector(${JSON.stringify(testid("workout-name"))})`, "the builder again", 15_000);
{
  const seen = await labels();
  check("and it is still A1 and A2 when reopened", seen[A.id] === "A1" && seen[B.id] === "A2", JSON.stringify(seen));
}

/* Unpairing is the other half of being able to design it. */
check("the pair can be broken", await tap(testid(`builder-unpair-${A.id}`)));
check("and then nothing is lettered", Object.keys(await labels()).length === 0, JSON.stringify(await labels()));
check("pairing again", await tap(testid(`builder-pair-${A.id}`)) && (await tap(testid(`builder-pair-with-${B.id}`))));
check("re-saves", await tap(testid("workout-save")));

/*
  Wait for the dialog to actually be gone, not for a moment to pass.
  Radix keeps its overlay mounted through the closing animation, and an
  overlay is exactly what a hit test finds instead of the button underneath —
  so "start-workout never became reachable" was a report about a dialog that
  had been dismissed and had not finished leaving.
*/
await b.waitFor(
  `!document.querySelector('[role="dialog"]') &&
   !document.querySelector(${JSON.stringify(testid("workout-name"))})`,
  "the builder to close",
  15_000,
);

// ── Start it, and the session shows the same thing ───────────────────────

await b.waitFor(
  `!!document.querySelector('[data-testid="start-workout-${saved.id}"]')`,
  "the saved workout's start button",
  15_000,
);
const started = await portal.tapUntil(
  testid(`start-workout-${saved.id}`),
  `!!document.querySelector('[data-testid="workout-sheet"]')`,
  "the workout sheet",
  3,
);
check("the saved workout starts", started, portal.lastFailure);

const drew = await b
  .waitFor(
    `!!document.querySelector('[data-testid="workout-movement-${A.id}"]')`,
    "the workout, with its movements in it",
    20_000,
  )
  .then(() => true)
  .catch(() => false);
check(
  "and it arrives with its movements, not just its name",
  drew,
  await b.evaluate<string>(`
    const sheet = document.querySelector('[data-testid="workout-sheet"]');
    const movements = [...document.querySelectorAll('[data-testid^="workout-movement-"]')]
      .map(e => e.getAttribute("data-testid"));
    return (sheet ? "sheet up, " : "no sheet, ") + movements.length + " movement(s): " + movements.join(", ");
  `),
);

{
  const seen = await b.evaluate<Record<string, string>>(`
    const out = {};
    for (const el of document.querySelectorAll('[data-testid^="superset-label-"]')) {
      out[el.getAttribute("data-testid").replace("superset-label-", "")] = el.textContent.trim();
    }
    return out;
  `);
  check("the running workout draws the same A1 / A2", seen[A.id] === "A1" && seen[B.id] === "A2", JSON.stringify(seen));
}

const session = await b.evaluate<{ movements: number; grouped: number; sameKey: boolean; keyIsFresh: boolean }>(`
  const res = await fetch("/api/training/sessions/open", { credentials: "include" });
  const { session } = await res.json();
  const ex = session?.exercises ?? [];
  const grouped = ex.filter(e => e.supersetGroup);
  const saved = await (await fetch("/api/training/workouts", { credentials: "include" })).json();
  const w = saved.find(x => x.name === ${JSON.stringify(NAME)});
  const templateKey = (w?.exercises ?? []).map(e => e.supersetGroup).find(Boolean) ?? null;
  return {
    movements: ex.length,
    grouped: grouped.length,
    sameKey: new Set(grouped.map(e => e.supersetGroup)).size === 1,
    keyIsFresh: grouped.length > 0 && grouped[0].supersetGroup !== templateKey,
  };
`);
check("both movements came with it", session.movements === 2, JSON.stringify(session));
check("still paired", session.grouped === 2 && session.sameKey, JSON.stringify(session));
check("under a key belonging to this session, not the template", session.keyIsFresh);

// ── Teardown ─────────────────────────────────────────────────────────────

const cleaned = await b.evaluate<boolean>(`
  const open = await fetch("/api/training/sessions/open", { credentials: "include" });
  const body = await open.json();
  if (body.session) await fetch("/api/training/sessions/" + body.session.id, { method: "DELETE", credentials: "include" });
  const list = await (await fetch("/api/training/workouts", { credentials: "include" })).json();
  for (const w of list) {
    if (String(w.name || "").startsWith(${JSON.stringify(NAME)})) {
      await fetch("/api/training/workouts/" + w.id, { method: "DELETE", credentials: "include" });
    }
  }
  const after = await (await fetch("/api/training/sessions/open", { credentials: "include" })).json();
  return !after.session;
`);
check("nothing is left running for the next harness", cleaned);

await b.close();

if (failures.length) {
  console.error("✗ the superset could not be designed\n");
  for (const f of failures) console.error(`    ${f}`);
  console.error("");
  for (const n of notes) console.error(`    · ${n}`);
  console.error("");
  process.exit(1);
}
console.log("✓ a superset can be designed, saved, reopened and started");
for (const n of notes) console.log(`    ${n}`);
console.log("");
