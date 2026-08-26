/**
 * Does a finished movement still look unfinished?
 *
 * ── Why this exists alongside the database proof ──────────────────────────
 *
 * `workout_sets_measure_chk` makes a blank set impossible to persist, and QA
 * holds none. That answers "is bad data being saved". It does not answer the
 * complaint, which was visual: *after I finish a movement it looks like
 * another blank set is sitting there*. An ephemeral client draft can do that
 * with no database row anywhere near it.
 *
 * So this walks the flow a member walks and looks at what is on screen:
 *
 *     start a workout → movement A → log a set → log another
 *     → add movement B → come back and look at A
 *
 * The rule it holds: a movement nobody is currently entering shows its
 * completed sets and nothing that could be mistaken for one. A ready entry
 * field on the movement being worked on is fine — that is the point of it —
 * but a numbered row with empty boxes under a movement you have moved on from
 * says "you are not done here", and it is wrong.
 */
import { Browser } from "./cdp.js";

const BASE = process.env.SAKRED_QA_BASE ?? "http://127.0.0.1:5199";

const failures: string[] = [];
const notes: string[] = [];
const check = (name: string, ok: boolean, detail = "") => {
  if (!ok) failures.push(detail ? `${name} — ${detail}` : name);
};

const b = new Browser();
await b.launch();
await b.headers({ "X-Forwarded-Proto": "https" });
await b.viewport(393, 852);

await b.goto(`${BASE}/login`);
await b.waitFor("document.querySelectorAll('input').length >= 2", "the login form", 25_000);
await b.evaluate(
  `const set=(el,v)=>{Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el),"value").set.call(el,v);el.dispatchEvent(new Event("input",{bubbles:true}));};` +
    `const [e,p]=document.querySelectorAll("input");set(e,"qa.member@sakred.local");set(p,"SakredQA!2026");return true;`,
);
await b.settle();
const signIn = await b.evaluate<{ x: number; y: number }>(
  `const q=[...document.querySelectorAll("button")].find(x=>x.textContent.trim()==="Sign In").getBoundingClientRect();return {x:q.x+q.width/2,y:q.y+q.height/2};`,
);
await b.clickAt(signIn.x, signIn.y);
await b.waitFor("location.pathname === '/member'", "the portal", 25_000);

/** Tap whatever is reachable, hit-tested, by testid or tour id. */
async function tap(selector: string): Promise<boolean> {
  const at = await b.evaluate<{ x: number; y: number } | null>(`
    for (const el of document.querySelectorAll(${JSON.stringify(selector)})) {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      const x = r.x + r.width / 2, y = r.y + r.height / 2;
      if (y < 0 || y > innerHeight || x < 0 || x > innerWidth) { el.scrollIntoView({ block: "center" }); }
      const rr = el.getBoundingClientRect();
      const xx = rr.x + rr.width / 2, yy = rr.y + rr.height / 2;
      const hit = document.elementFromPoint(xx, yy);
      if (hit && (hit === el || el.contains(hit) || hit.contains(el))) return { x: xx, y: yy };
    }
    return null;`);
  if (!at) return false;
  await b.clickAt(at.x, at.y);
  await b.settle();
  return true;
}

/*
   The walkthrough auto-starts for an account that has not finished it, and it
   mounts a second or so after the portal does — so a dismissal attempted the
   instant we arrive finds nothing, returns happily, and every tap afterwards
   lands on a scrim that appeared later.
*/
await b
  .waitFor(`!!document.querySelector('[data-testid="tour-overlay"]')`, "the walkthrough", 8_000)
  .catch(() => undefined);
for (let i = 0; i < 4; i++) {
  if (!(await tap('[data-testid="button-tour-pause"]'))) break;
  await b.settle();
}
await b
  .waitFor(`!document.querySelector('[data-testid="tour-overlay"]')`, "the walkthrough to close", 8_000)
  .catch(() => undefined);

/**
 * What a member would count as a set under this movement.
 *
 * Deliberately generous about what looks like one: a logged row, and any
 * numbered row carrying empty number boxes. The second is the thing under
 * test, and defining it narrowly would be defining the defect away.
 */
const LOOK = `
  const groups = [];
  for (const el of document.querySelectorAll('[data-testid^="log-set-"]')) {
    groups.push(el.getAttribute("data-testid").replace("log-set-", ""));
  }
  const logged = [...document.querySelectorAll('[data-testid^="logged-set-"]')].length;
  const openRows = [...document.querySelectorAll('[data-testid^="log-set-"]')].map((el) => {
    const inputs = [...el.querySelectorAll("input")];
    return {
      movement: el.getAttribute("data-testid").replace("log-set-", ""),
      empty: inputs.every((i) => !i.value),
      inputs: inputs.length,
    };
  });
  const addButtons = [...document.querySelectorAll('[data-testid^="add-set-"]')]
    .map((e) => e.getAttribute("data-testid").replace("add-set-", ""));
  return JSON.stringify({ logged, openRows, addButtons, groups });
`;

type Look = {
  logged: number;
  openRows: { movement: string; empty: boolean; inputs: number }[];
  addButtons: string[];
  groups: string[];
};
const look = async (): Promise<Look> => JSON.parse(await b.evaluate<string>(LOOK)) as Look;

/* ── The flow ─────────────────────────────────────────────────────────── */

await tap('[data-tour-id="nav-build"]');
await b.waitFor(`document.documentElement.getAttribute("data-tour-section") === "build"`, "Build", 15_000);

/* An open session from an earlier run would start this mid-workout. */
if (!(await tap('[data-testid="button-start-session"], [data-tour-id="build-start-session"]'))) {
  check("a workout can be started", false, "no start control found");
}
await b.waitFor(`!!document.querySelector('[data-testid="workout-sheet"], [data-tour-id="workout-add-exercise"]')`, "the workout", 20_000);

async function addMovement(which: number): Promise<boolean> {
  if (!(await tap('[data-tour-id="workout-add-exercise"], [data-testid="add-movement"]'))) return false;
  await b.waitFor(`document.querySelectorAll('[data-testid^="pick-exercise-"]').length > 0`, "the picker", 15_000).catch(() => undefined);
  return b.evaluate<boolean>(`
    const all = [...document.querySelectorAll('[data-testid^="pick-exercise-"]')];
    const el = all[${which}];
    if (!el) return false;
    el.scrollIntoView({ block: "center" });
    el.click();
    return true;`);
}

async function logSet(reps: number, weight: number): Promise<void> {
  await b.evaluate(`
    const set = (el, v) => {
      Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), "value").set.call(el, v);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    };
    const row = document.querySelector('[data-testid^="log-set-"]');
    const inputs = [...row.querySelectorAll("input")];
    if (inputs.length > 1) { set(inputs[0], "${weight}"); set(inputs[1], "${reps}"); }
    else set(inputs[0], "${reps}");
    return true;`);
  await b.settle();
  await b.evaluate(`
    const row = document.querySelector('[data-testid^="log-set-"]');
    const commit = row.parentElement.querySelector('button[aria-label], button');
    (row.querySelector("button") || commit).click();
    return true;`);
  await b.settle();
  await b.settle();
}

const added = await addMovement(0);
check("a movement can be added", added);
if (added) {
  await b.waitFor(`document.querySelectorAll('[data-testid^="log-set-"]').length > 0`, "the entry row", 15_000).catch(() => undefined);

  const fresh = await look();
  check("a movement with nothing under it opens its entry row", fresh.openRows.length >= 1,
    JSON.stringify(fresh));

  await logSet(8, 100);
  await logSet(6, 100);
  const after = await look();
  notes.push(`after two sets: ${after.logged} logged, ${after.openRows.length} open row(s), add-set on [${after.addButtons.join(",")}]`);

  check(
    "logging a set closes the entry row rather than leaving an empty one behind",
    after.openRows.filter((r) => r.empty).length === 0,
    JSON.stringify(after.openRows),
  );
  check("and offers Add set instead", after.addButtons.length >= 1, JSON.stringify(after.addButtons));

  /* Now the flow the complaint describes: move on, and look back. */
  const second = await addMovement(1);
  check("a second movement can be added", second);
  if (second) {
    await b.settle();
    const both = await look();
    notes.push(`with a second movement: ${both.logged} logged, open rows ${JSON.stringify(both.openRows)}`);
    /*
      The movement being worked on may keep its ready field — that is what it
      is for. The one left behind may not.
    */
    const stale = both.openRows.filter((r) => r.empty && r.movement !== both.openRows[both.openRows.length - 1]?.movement);
    check(
      "a movement you have moved on from shows no empty set row",
      stale.length === 0,
      `${JSON.stringify(stale)} — full state ${JSON.stringify(both.openRows)}`,
    );
    check(
      "at most one movement is being entered at a time",
      both.openRows.filter((r) => r.empty).length <= 1,
      JSON.stringify(both.openRows),
    );
  }

  /* Leave nothing running for the next harness. */
  await tap('[data-testid="button-discard-session"], [data-testid="discard-session"]');
  await tap('[data-testid="confirm-discard"]');
}

await b.close();

if (failures.length) {
  console.error("\n✗ the workout still looks unfinished\n");
  for (const f of failures) console.error(`    ${f}`);
  console.error("");
  for (const n of notes) console.error(`    · ${n}`);
  console.error("");
  process.exit(1);
}
console.log("\n✓ a finished movement does not look unfinished");
for (const n of notes) console.log(`    ${n}`);
