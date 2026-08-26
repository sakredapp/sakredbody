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
 *
 * ── The selectors, and why they are spelled out ───────────────────────────
 *
 * The first draft of this probe looked for `[data-testid^="log-set-"]` and
 * treated each hit as a row. `log-set-<movement>` is the *commit button* — a
 * `<button>` with no inputs inside it — so "every input in this row is empty"
 * was `[].every(…)`, which is `true`, on an element that could never have
 * held a value. A probe like that reports the defect it is looking for on a
 * correct screen, and reports nothing at all on a broken one.
 *
 * The entry row is `[data-tour-id="workout-set-row"]`, and it carries
 * `data-tour-instance` naming which row it is: `log-set-<movement>` while
 * entering, `save-set-<set>` while correcting one already logged. Only the
 * first is a draft; the second is a member editing history, and counting it
 * would be counting the wrong thing.
 */
import { Browser } from "./cdp.js";

/*
  Everything under `movement-` in the picker that is not a movement. The rows
  themselves are `movement-<slug>` — `movement-barbell-bench-press`, not a
  UUID, which is what an earlier version of this waited fifteen seconds for.
*/
const NOT_A_MOVEMENT = String.raw`/^movement-(search|show-all|create|group-|category-)/`;

const BASE = process.env.SAKRED_QA_BASE ?? "http://127.0.0.1:5199";

const failures: string[] = [];
const notes: string[] = [];
const check = (name: string, ok: boolean, detail = "") => {
  if (!ok) failures.push(detail ? `${name} — ${detail}` : name);
  else notes.push(`✓ ${name}`);
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

/* ── What the member can see under each movement ──────────────────────── */

type Seen = {
  id: string;
  name: string;
  logged: number;
  /** An entry row for *this* movement — not an edit-in-place on a logged set. */
  draft: boolean;
  /**
   * …with at least one measure still empty, so it reads as a set in progress.
   *
   * Not "every box is empty". The weight deliberately carries to the next set
   * — it is usually the same weight — so a stranded draft row shows `135` and
   * an empty reps box. That is exactly the row the complaint describes, and an
   * all-boxes-empty test walks straight past it: with the defect planted on
   * purpose to check this harness could see it, that assertion passed.
   */
  unfilled: boolean;
  boxes: number;
  addSet: boolean;
};

const LOOK = `
  const out = [];
  for (const el of document.querySelectorAll('[data-testid^="workout-movement-"]')) {
    const id = el.getAttribute("data-testid").replace("workout-movement-", "");
    const row = el.querySelector('[data-tour-id="workout-set-row"][data-tour-instance^="log-set-"]');
    const boxes = row ? [...row.querySelectorAll("input")] : [];
    out.push({
      id,
      name: (el.querySelector("p") || { textContent: "" }).textContent.trim().slice(0, 28),
      logged: el.querySelectorAll('[data-testid^="logged-set-"]').length,
      draft: !!row,
      unfilled: !!row && boxes.length > 0 && boxes.some((i) => !i.value),
      boxes: boxes.length,
      addSet: !!el.querySelector('[data-testid^="add-set-"]'),
    });
  }
  return JSON.stringify(out);
`;
const look = async (): Promise<Seen[]> => JSON.parse(await b.evaluate<string>(LOOK)) as Seen[];
const say = (s: Seen[]) =>
  s.map((m) => `${m.name}: ${m.logged} logged${m.draft ? `, draft(${m.boxes} boxes, ${m.unfilled ? "unfilled" : "complete"})` : ""}${m.addSet ? ", +Add set" : ""}`).join(" · ");

/* ── The flow ─────────────────────────────────────────────────────────── */

await tap('[data-tour-id="nav-build"]');
/*
  Waited on Build's own content, not on the section attribute.

  `AnimatePresence mode="wait"` does not mount the incoming section until the
  outgoing one has finished leaving, so `data-tour-section` says "build" while
  the screen is still Home — and this then looked for a start control among
  Home's five pillars and reported that Build had none.
*/
await b.waitFor(
  `!!document.querySelector('[data-tour-id="build-start-session"], [data-testid="button-start-session"]')`,
  "Build's own content",
  20_000,
);

const started = await tap('[data-tour-id="build-start-session"], [data-testid="button-start-session"]');
check("a workout can be started", started, "no reachable start control");
if (!started) {
  console.error("  what Build offered: " + (await b.evaluate<string>(`
    return [...document.querySelectorAll("button")].slice(0, 24)
      .map(e => (e.getAttribute("data-testid") || e.getAttribute("data-tour-id") || "-") + ":" + e.textContent.trim().slice(0, 24))
      .join(" | ");`)));
}
/*
  One run out of five so far has arrived here and found no workout sheet after
  twenty seconds. I have not reproduced it and will not name a cause I cannot
  show, so this says what was on screen instead of failing mute — the next
  occurrence should identify itself rather than needing this same afternoon
  spent on it again.
*/
try {
  await b.waitFor(
    `!!document.querySelector('[data-testid="workout-sheet"], [data-tour-id="workout-add-exercise"]')`,
    "the workout",
    20_000,
  );
} catch (e) {
  console.error("  no workout sheet. what was on screen: " + (await b.evaluate<string>(`
    return "path=" + location.pathname
      + " section=" + document.documentElement.getAttribute("data-tour-section")
      + " tour=" + !!document.querySelector('[data-testid="tour-overlay"]')
      + " buttons=" + [...document.querySelectorAll("button")].slice(0, 16)
          .map(e => (e.getAttribute("data-testid") || "-") + ":" + e.textContent.trim().slice(0, 18)).join(",");`)));
  throw e;
}

/**
 * Add a movement by searching for it, the way a member does.
 *
 * Not by picking the first row in the list: with no group or category chosen
 * the picker narrows to "what you said you do", and a QA account that has
 * said it does nothing gets an empty list. The earlier run read that as "the
 * picker offers no movements" when what it meant was "this member has no
 * stated modalities". Typing bypasses the narrowing, and is also the gesture
 * the complaint describes.
 */
async function addMovement(name: string): Promise<string | null> {
  const before = (await look()).map((m) => m.id);
  if (!(await tap('[data-tour-id="workout-add-exercise"], [data-testid="add-movement"], [data-testid^="next-exercise-"]'))) return null;
  await b.waitFor(`!!document.querySelector('[data-testid="movement-search"]')`, "the picker", 15_000);
  await b.evaluate(`
    const el = document.querySelector('[data-testid="movement-search"]');
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), "value").set.call(el, ${JSON.stringify(name)});
    el.dispatchEvent(new Event("input", { bubbles: true }));
    return true;`);
  await b.settle();
  await b.waitFor(
    `[...document.querySelectorAll('[data-testid^="movement-"]')].some(e => !${NOT_A_MOVEMENT}.test(e.getAttribute("data-testid")))`,
    `a result for "${name}"`,
    15_000,
  );
  const picked = await b.evaluate<boolean>(`
    const rows = [...document.querySelectorAll('[data-testid^="movement-"]')]
      .filter(e => !${NOT_A_MOVEMENT}.test(e.getAttribute("data-testid")));
    const exact = rows.find(e => e.textContent.trim().toLowerCase().startsWith(${JSON.stringify(name.toLowerCase())}));
    const el = exact || rows[0];
    if (!el) return false;
    el.scrollIntoView({ block: "center" });
    el.click();
    return true;`);
  if (!picked) return null;
  await b.waitFor(
    `document.querySelectorAll('[data-testid^="workout-movement-"]').length > ${before.length}`,
    `${name} to land in the workout`,
    15_000,
  );
  const now = await look();
  return now.map((m) => m.id).find((id) => !before.includes(id)) ?? null;
}

/**
 * Fill one movement's entry row and press its own commit button.
 *
 * Opening the row first when it is closed is not harness convenience — it is
 * the product's behaviour and half the answer to the complaint. A committed
 * set closes the row, so a second set is asked for with `+ Add set`. The
 * first version of this assumed the row stayed open, failed to find it, and
 * would have been read as "the second set won't log".
 */
async function logSet(id: string, weight: number, reps: number): Promise<void> {
  const open = await b.evaluate<boolean>(
    `return !!document.querySelector('[data-tour-id="workout-set-row"][data-tour-instance="log-set-${id}"]');`,
  );
  if (!open) {
    await tap(`[data-testid="add-set-${id}"]`);
    await b
      .waitFor(
        `!!document.querySelector('[data-tour-id="workout-set-row"][data-tour-instance="log-set-${id}"]')`,
        "the entry row to reopen",
        8_000,
      )
      .catch(() => undefined);
  }
  const ok = await b.evaluate<boolean>(`
    const set = (el, v) => {
      Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), "value").set.call(el, v);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    };
    const row = document.querySelector('[data-tour-id="workout-set-row"][data-tour-instance="log-set-${id}"]');
    if (!row) return false;
    const boxes = [...row.querySelectorAll("input")];
    if (boxes.length > 1) { set(boxes[0], "${weight}"); set(boxes[1], "${reps}"); }
    else if (boxes.length === 1) { set(boxes[0], "${reps}"); }
    else return false;
    return true;`);
  if (!ok) { failures.push(`could not reach the entry row for ${id}`); return; }
  await b.settle();
  const sets = await b.evaluate<number>(`return document.querySelectorAll('[data-testid^="logged-set-"]').length;`);
  await tap(`[data-testid="log-set-${id}"]`);
  await b
    .waitFor(`document.querySelectorAll('[data-testid^="logged-set-"]').length > ${sets}`, "the set to land", 15_000)
    .catch(() => failures.push(`the set did not commit on ${id}`));
}

const A = await addMovement("Barbell Bench Press");
check("a movement can be added", A !== null);

if (A) {
  await b.waitFor(
    `!!document.querySelector('[data-tour-id="workout-set-row"][data-tour-instance="log-set-${A}"]')`,
    "the entry row",
    15_000,
  ).catch(() => undefined);

  const fresh = await look();
  check(
    "a movement with nothing under it opens its entry row",
    fresh.find((m) => m.id === A)?.draft === true,
    say(fresh),
  );

  await logSet(A, 135, 8);
  await logSet(A, 135, 6);
  const after = await look();
  notes.push(`after two sets — ${say(after)}`);

  const a2 = after.find((m) => m.id === A);
  check("both sets are logged", a2?.logged === 2, say(after));
  check(
    "logging a set closes the entry row rather than leaving an empty one behind",
    a2?.draft === false,
    say(after),
  );
  check("and offers Add set instead", a2?.addSet === true, say(after));

  /* Now the flow the complaint describes: move on, and look back. */
  const B = await addMovement("Back Squat");
  check("a second movement can be added", B !== null);
  if (B) {
    await b.settle();
    const both = await look();
    notes.push(`with a second movement — ${say(both)}`);

    /*
      The movement being worked on may keep its ready field — that is what it
      is for. The one left behind may not.
    */
    check(
      "a movement you have moved on from shows no unfinished set row",
      both.find((m) => m.id === A)?.unfilled !== true,
      say(both),
    );
    check(
      "at most one movement is being entered at a time",
      both.filter((m) => m.draft).length <= 1,
      say(both),
    );
    check(
      "and it is the one just added",
      both.find((m) => m.draft)?.id === B,
      say(both),
    );

    /* Scroll back to A the way a member would, and look again. */
    await b.evaluate(`
      const el = document.querySelector('[data-testid="workout-movement-${A}"]');
      if (el) el.scrollIntoView({ block: "center" });
      return true;`);
    await b.settle();
    const back = await look();
    check(
      "and it still looks finished when you scroll back to it",
      back.find((m) => m.id === A)?.unfilled !== true && back.find((m) => m.id === A)?.logged === 2,
      say(back),
    );
  }

  /* Leave nothing running for the next harness. */
  await tap('[data-testid="button-discard-session"], [data-testid="discard-session"]');
  await b.settle();
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
