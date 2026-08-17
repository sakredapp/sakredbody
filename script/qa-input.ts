/**
 * What one physical gesture is allowed to do.
 *
 * ── The finding this exists because of ────────────────────────────────────
 *
 * A double tap on Continue was measured in the browser, and the DOM timeline
 * said something nobody had guessed:
 *
 *     1307ms  pointerdown  button-tour-continue   step=welcome
 *     1308ms  click        button-tour-continue   step=welcome
 *     1309ms  pointerdown  DIV                    step=home
 *     1310ms  click        DIV                    step=home
 *
 * One millisecond apart, so no timing guard was ever the deciding factor. The
 * second half of the gesture landed on a DIV because React had already
 * re-rendered and the panel changed height, moving the button out from under
 * the finger.
 *
 * That is luck, not safety. The same gesture on a transition where the panel
 * height happens not to change lands on the new Continue and skips a lesson —
 * and on a transition where the new step highlights a real control near that
 * coordinate, it lands on the product itself. The member never chose to tap
 * Build; their finger was still coming up from tapping Continue.
 *
 * ── Four different questions ──────────────────────────────────────────────
 *
 *   A  the same finger, twice, in the same place        physical gesture
 *   B  Continue, then the new Continue where it now is  logical skip
 *   C  Continue, then the real control it just lit      must stay immediate
 *   D  does any transition put something interactive
 *      under the old Continue coordinate                the hazard survey
 *
 * A and B are different failures and neither replaces the other. D is not a
 * test of behaviour at all — it is a measurement of exposure, and it is the
 * one that says whether this is a theoretical problem or a live one.
 */

import { Browser } from "./cdp.js";
import { SAKRED_INTRO } from "../client/src/lib/tour/sakredIntro.js";

const BASE = process.env.QA_BASE_URL ?? "http://127.0.0.1:5199";
const PASSWORD = process.env.QA_PASSWORD ?? "SakredQA!2026";

let passed = 0;
const failures: string[] = [];
const check = (name: string, ok: boolean, detail = "") => {
  if (ok) passed++;
  else failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
};

type Pt = { x: number; y: number };
const b = new Browser();
await b.launch();
await b.headers({ "X-Forwarded-Proto": "https" });

async function login(): Promise<void> {
  await b.viewport(393, 852);
  await b.goto(`${BASE}/login`);
  await b.waitFor("document.querySelectorAll('input').length >= 2", "the login form", 25_000);
  await b.evaluate(`
    const set = (el, v) => {
      Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), "value").set.call(el, v);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    };
    const [e, p] = document.querySelectorAll("input");
    set(e, "qa.member@sakred.local"); set(p, ${JSON.stringify(PASSWORD)});
    return true;
  `);
  await b.settle();
  const r = await b.evaluate<Pt>(`
    const q = [...document.querySelectorAll("button")].find(x => x.textContent.trim() === "Sign In").getBoundingClientRect();
    return { x: q.x + q.width / 2, y: q.y + q.height / 2 };
  `);
  await b.clickAt(r.x, r.y);
  await b.waitFor("location.pathname === '/member'", "the portal", 25_000);
}

async function startTour(): Promise<void> {
  await b.evaluate(`
    for (const k of Object.keys(localStorage)) if (k.startsWith("sakred.tour")) localStorage.removeItem(k);
    return true;
  `);
  await b.goto(`${BASE}/member?tour=replay`);
  await b.waitFor(`!!document.querySelector('[data-testid="tour-overlay"]')`, "the tour overlay", 25_000);
  await b.settle();
}

const stepId = () =>
  b.evaluate<string | null>(
    `return document.querySelector('[data-testid="tour-overlay"]')?.getAttribute("data-tour-step") ?? null;`,
  );

const continueAt = () =>
  b.evaluate<Pt | null>(`
    const el = document.querySelector('[data-testid="button-tour-continue"]');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  `);

/**
 * Everything a stray tap could plausibly have changed.
 *
 * Asserting only on the step index would have called today's DIV-swallowed
 * gesture a pass while a real control fired underneath it.
 */
const SIGNATURE = `
  return JSON.stringify({
    path: location.pathname,
    section: document.documentElement.getAttribute("data-tour-section"),
    sheets: document.querySelectorAll('[role="dialog"]').length,
    theme: document.documentElement.dataset.theme,
  });
`;

const indexOf = (id: string | null) => SAKRED_INTRO.steps.findIndex((s) => s.id === id);

console.log(`\nInput invariants — ${BASE}\n`);
await login();

// ─── A. The same finger, twice, in the same place ────────────────────────

await startTour();
{
  const before = await stepId();
  const at = await continueAt();
  const sigBefore = await b.evaluate<string>(SIGNATURE);
  if (!at) {
    check("A: the first step offers Continue", false, "no continue button");
  } else {
    await b.clickAt(at.x, at.y);
    await b.clickAt(at.x, at.y);
    await b.settle();
    await b.settle();
    const after = await stepId();
    const sigAfter = await b.evaluate<string>(SIGNATURE);
    const moved = indexOf(after) - indexOf(before);
    check("A: one physical double-tap satisfies one lesson", moved === 1,
      `${before} → ${after} (moved ${moved})`);
    /* The half of this that today's luck was hiding. */
    check("A: and changes nothing else in the app", sigBefore === sigAfter,
      `${sigBefore} → ${sigAfter}`);
  }
}

// ─── B. The new Continue, wherever it moved to ───────────────────────────

await startTour();
{
  const before = await stepId();
  const first = await continueAt();
  if (!first) {
    check("B: the first step offers Continue", false, "no continue button");
  } else {
    await b.clickAt(first.x, first.y);
    await b.settle();
    /*
      Re-resolve rather than reuse the coordinate. This deliberately removes
      the layout luck that made A pass, and asks the question A cannot: if the
      next Continue *were* under the finger, would anything stop it?
    */
    const second = await continueAt();
    const mid = await stepId();
    if (second) await b.clickAt(second.x, second.y);
    await b.settle();
    await b.settle();
    const after = await stepId();
    const moved = indexOf(after) - indexOf(before);
    check("B: a re-targeted rapid Continue does not skip a second lesson", moved === 1,
      `${before} → ${mid} → ${after} (moved ${moved})`);
  }
}

// ─── D. Does any transition put something under the old finger? ──────────

/*
  Not a behaviour test. A survey of exposure across the whole walkthrough: for
  each transition, what is under the coordinate the Continue button occupied a
  frame ago? A button or a link there is a gesture that can fall through into
  the product.
*/
await startTour();
{
  const hazards: string[] = [];
  let transitions = 0;
  for (let i = 0; i < SAKRED_INTRO.steps.length; i++) {
    const from = await stepId();
    const at = await continueAt();
    if (!at) break;
    await b.clickAt(at.x, at.y);
    await b.settle();
    const to = await stepId();
    if (!to || to === from) break;
    transitions++;
    const under = await b.evaluate<{ tag: string; testid: string | null; interactive: boolean }>(`
      const el = document.elementFromPoint(${at.x}, ${at.y});
      if (!el) return { tag: "none", testid: null, interactive: false };
      const act = el.closest('button, a, [role="button"], input, select, textarea, [data-tour-id]');
      return {
        tag: el.tagName,
        testid: act ? (act.getAttribute("data-testid") ?? act.getAttribute("data-tour-id") ?? act.tagName) : null,
        interactive: !!act,
      };
    `);
    if (under.interactive) hazards.push(`${from}→${to}: ${under.testid}`);
  }
  console.log(`  surveyed ${transitions} transitions for what sits under the released finger`);
  check("D: no transition leaves an interactive control under the old Continue",
    hazards.length === 0, hazards.slice(0, 8).join("; "));
}

await b.close();

if (failures.length) {
  console.error("\n✗ input invariants\n");
  for (const f of failures) console.error(`    ${f}`);
  console.error("");
  process.exit(1);
}
console.log(`\n✓ ${passed} input assertions passed\n`);
