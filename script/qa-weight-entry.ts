/**
 * A member types a weight, with the keys.
 *
 * ── The defect this is the regression for ─────────────────────────────────
 *
 * From a phone, mid-workout: "i cant type ny numbers".
 *
 * The weight, reps, seconds and RPE boxes were `<input type="number">`. That
 * control sanitises its own value before React sees it, so a controlled input
 * is told "" for anything the browser judges invalid — and the state becomes
 * "", and the box redraws empty. The clearest way in is a keypad whose decimal
 * separator is a comma: press it once and the field starts clearing itself.
 *
 * ── Why nothing caught it ─────────────────────────────────────────────────
 *
 * Because nothing in the suite had ever typed into that box. `qa-workout-pass`
 * logs its sets through `POST /api/training/sessions/:id/sets` — correct for
 * what it tests, and it never touches the input. And `Portal.type` sets
 * `el.value` through the native setter and dispatches `input`, which is how
 * every other harness fills a field: it reproduces what React ends up with,
 * never what a key does on the way there. A box that refuses every keystroke
 * passes both.
 *
 * So this one presses keys. `Input.dispatchKeyEvent` with the character on the
 * keyDown, and no separate `char` event — a `char` dispatched on its own is
 * inserted whatever the page decides, which is how a similar assertion in
 * qa-room-defects was caught measuring CDP rather than the product.
 *
 *   Terminal 1:  npm run build && script/qa-serve.sh
 *   Terminal 2:  set -a && . ./.env.qa && set +a && npx tsx script/qa-weight-entry.ts
 */
import { Browser, assertFreshBuild } from "./cdp.js";
import { Portal } from "./portal.js";
import { resolveQaTarget } from "./qa-target.js";

assertFreshBuild();

const BASE = process.env.QA_BASE_URL ?? process.env.SAKRED_QA_BASE ?? "http://127.0.0.1:5199";
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
const eq = (name: string, got: unknown, want: unknown) =>
  check(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

console.log(`\nTyping a weight, with the keys — ${BASE}\n`);

const b = new Browser();
await b.launch();
const p = new Portal(b, BASE);
await b.headers({ "x-forwarded-proto": "https" });
await b.viewport(393, 852, true);
await p.login("qa.member@sakred.local", PASSWORD);
await p.dismissTour();

/**
 * One press of one key, the way a keyboard sends it.
 *
 * The virtual key code has to be the real one. `".".charCodeAt(0)` is 46,
 * which is VK_DELETE — sending that as the period's key code made Chrome
 * delete a character instead of typing one, and the harness reported "705"
 * as though the product had eaten the decimal point. The punctuation codes
 * are the OEM ones: 190 for the period, 188 for the comma.
 */
const VK: Record<string, { code: string; vk: number }> = {
  ".": { code: "Period", vk: 190 },
  ",": { code: "Comma", vk: 188 },
};
async function press(ch: string) {
  const { code, vk } = VK[ch] ?? { code: `Digit${ch}`, vk: ch.charCodeAt(0) };
  await b.send("Input.dispatchKeyEvent", {
    type: "keyDown", key: ch, code, text: ch, unmodifiedText: ch,
    windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk,
  });
  await b.send("Input.dispatchKeyEvent", {
    type: "keyUp", key: ch, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk,
  });
}
const typeKeys = async (s: string) => {
  for (const ch of s) await press(ch);
  await b.settle();
};

/* A live workout with one loaded movement, set up through the API so the screen
   under test is exactly the one a member has after tapping Start. */
const setup = await b.evaluate<string>(`
  const open = await fetch("/api/training/sessions/open", { credentials: "include" });
  const body = open.ok ? await open.json() : { session: null };
  if (body.session) await fetch("/api/training/sessions/" + body.session.id, { method: "DELETE", credentials: "include" });
  const ex = await (await fetch("/api/training/exercises", { credentials: "include" })).json();
  const lift = ex.find(e => e.takesLoad) || ex[0];
  const s = await (await fetch("/api/training/sessions", {
    method: "POST", credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: "QA — weight entry" }),
  })).json();
  await fetch("/api/training/sessions/" + s.id + "/exercises", {
    method: "POST", credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ exerciseId: lift.id }),
  });
  return JSON.stringify({ session: s.id, movement: lift.name });
`);
const { session, movement } = JSON.parse(setup) as { session: string; movement: string };
check("a workout is running", !!session, setup);
console.log(`  ${movement}`);

await b.reload();
await p.dismissTour();
check("Build opens", await p.openSection("build"), p.lastFailure);
await b.settle();
check(
  "the running workout is on screen",
  await p.waitFor(`!!document.querySelector('[data-testid="active-workout-bar"]')`, "the active workout bar"),
  p.lastFailure,
);
check("and it opens", await p.tapSelector('[data-testid="active-workout-bar"]'), p.lastFailure);
await b.settle();

const WEIGHT = `document.querySelector('input[aria-label^="Weight"]')`;
const REPS = `document.querySelector('input[aria-label="Reps"]')`;
check("the weight box is there", await p.waitFor(`!!${WEIGHT}`, "the weight box"), p.lastFailure);

/*
  Not `type="number"`. This is the assertion that would have caught the report
  directly, and it is cheap: the control that sanitises its own value must not
  be the one a member types a weight into.
*/
const kind = await b.evaluate<{ type: string; inputMode: string }>(`
  const i = ${WEIGHT};
  return { type: i.type, inputMode: i.inputMode };
`);
eq("the weight box is not one that rewrites what it is given", kind.type, "text");
eq("and it still raises a numeric keypad", kind.inputMode, "decimal");

const at = await b.evaluate<{ x: number; y: number }>(`
  const r = ${WEIGHT}.getBoundingClientRect();
  return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
`);
await b.clickAt(at.x, at.y);
await b.settle();
check(
  "tapping it puts the cursor in it",
  await b.evaluate<boolean>(`return document.activeElement === ${WEIGHT}`),
  "the tap did not focus the box — a member would see no keyboard",
);

await typeKeys("70");
eq("two digits go in and stay in", await b.evaluate<string>(`return ${WEIGHT}.value`), "70");

await typeKeys(".5");
eq("and a decimal point does too", await b.evaluate<string>(`return ${WEIGHT}.value`), "70.5");

/*
  The comma. On most of the world's keypads this is the decimal separator, and
  `type="number"` treats it as invalid input — which is the shortest path to
  "the box keeps clearing itself".
*/
await b.evaluate(`
  const i = ${WEIGHT};
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
  set.call(i, ""); i.dispatchEvent(new Event("input", { bubbles: true }));
  i.focus();
  return true;
`);
await typeKeys("82,5");
eq("a comma is taken as the decimal point it is", await b.evaluate<string>(`return ${WEIGHT}.value`), "82.5");

/* Reps, whole numbers, same keys. */
const repsAt = await b.evaluate<{ x: number; y: number }>(`
  const r = ${REPS}.getBoundingClientRect();
  return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
`);
await b.clickAt(repsAt.x, repsAt.y);
await b.settle();
await typeKeys("8");
eq("reps take digits", await b.evaluate<string>(`return ${REPS}.value`), "8");
await typeKeys(".5");
eq("and refuse a decimal point, because half a rep is not a thing",
   await b.evaluate<string>(`return ${REPS}.value`), "85");

/* And the set that was typed can actually be logged. */
const logged = await p.tapSelector('[data-tour-id="workout-set-row"] button');
check("the typed set commits", logged, p.lastFailure);
await b.settle();

/* Teardown, from inside the page: the session cookie lives there, and a bare
   fetch from node is anonymous — which answered 401 and left the fixture. */
const gone = await b.evaluate<number>(`
  const r = await fetch("/api/training/sessions/${session}", { method: "DELETE", credentials: "include" });
  return r.status;
`);
check("the fixture workout is cleaned up", gone === 200, `DELETE answered ${gone}`);

await b.close();

if (failures.length) {
  console.error(`\n✗ ${failures.length} failed\n`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  console.error("");
  process.exit(1);
}
console.log(`\n✓ ${passed} weight-entry assertions — typed, not set\n`);
