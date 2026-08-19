/**
 * Three doors, one room — checked by opening them.
 *
 * The help portal is reachable from More, from Settings and from the Library,
 * and the whole point of that is that they are the same destination. A source
 * check can say all three call `setSection("help")`; only a browser can say
 * that pressing them puts a member in front of the portal, with the state of
 * their walkthrough on it.
 *
 *   Terminal 1:  npm run build && DATABASE_URL=$SAKREDBODY_QA_DATABASE_URL \
 *                SESSION_SECRET=… PORT=5199 NODE_ENV=production node dist/index.cjs
 *   Terminal 2:  npx tsx script/qa-help.ts
 */

import { Browser } from "./cdp.js";
import { SAKRED_INTRO } from "../client/src/lib/tour/sakredIntro.js";

const BASE = process.env.QA_BASE_URL ?? "http://127.0.0.1:5199";
const PASSWORD = process.env.QA_PASSWORD ?? "SakredQA!2026";

let passed = 0;
const failures: string[] = [];
const check = (name: string, ok: boolean, detail = "") => {
  if (ok) return void passed++;
  failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
  console.log(`    ✗ ${name}${detail ? ` — ${detail}` : ""}`);
};

const b = new Browser();
await b.launch();
await b.headers({ "X-Forwarded-Proto": "https" });
await b.viewport(393, 852, true);

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
const signIn = await b.evaluate<{ x: number; y: number }>(`
  const q = [...document.querySelectorAll("button")].find(x => x.textContent.trim() === "Sign In").getBoundingClientRect();
  return { x: q.x + q.width / 2, y: q.y + q.height / 2 };
`);
await b.clickAt(signIn.x, signIn.y);
await b.waitFor("location.pathname === '/member'", "the portal", 25_000);

console.log(`\nHow to Use Sakred — ${BASE}\n`);

/** A real tap at real coordinates, on whatever carries this attribute. */
async function tapAttr(attr: string, value: string): Promise<boolean> {
  /*
    Wait for it to have a size, not merely to exist.

    `waitFor` returns the instant a node appears in the document, which is a
    frame before it has been laid out — so a control that is perfectly reachable
    measured 0×0 and this file reported the navigation as missing. Existence and
    reachability are different questions and only one of them is worth asking.
  */
  const deadline = Date.now() + 4_000;
  let at: { x: number; y: number } | null = null;
  while (Date.now() < deadline && !at) {
    at = await sizedCentre(attr, value);
    if (!at) await b.evaluate(`return new Promise(r => setTimeout(() => r(true), 120));`);
  }
  if (!at) return false;
  await b.clickAt(at.x, at.y);
  await b.settle();
  await b.evaluate(`document.getAnimations().forEach(a => { try { a.finish(); } catch {} }); return true;`);
  await b.evaluate(`return new Promise(r => setTimeout(() => r(true), 450));`);
  return true;
}

/**
 * The centre of the one a member can see.
 *
 * Not `querySelector`. The More sheet's rows exist twice — once for the phone
 * bar and once for the wider layout — and the hidden copy is first in document
 * order, so "the first match" is a 0×0 node and every door in this file
 * reported itself missing. Same rule the walkthrough's resolver follows, and
 * for the same reason.
 */
function sizedCentre(attr: string, value: string): Promise<{ x: number; y: number } | null> {
  return b.evaluate<{ x: number; y: number } | null>(`
    const all = [...document.querySelectorAll('[${attr}=${JSON.stringify(value)}]')];
    const el = all.find(e => {
      const r = e.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });
    if (!el) return null;
    el.scrollIntoView({ block: "center" });
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return null;
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  `);
}

const tap = (testId: string) => tapAttr("data-testid", testId);
const tapTour = (tourId: string) => tapAttr("data-tour-id", tourId);

const onPortal = () =>
  b.evaluate<boolean>(`return !!document.querySelector('[data-testid="help-portal"]');`);

/** Back to a known screen, with the More sheet open. */
async function openMore(): Promise<boolean> {
  await b.goto(`${BASE}/member`);
  await b.waitFor(`!!document.querySelector('[data-tour-id="nav-more"]')`, "the navigation", 25_000);
  await b.settle();
  if (!(await tapTour("nav-more"))) return false;
  /*
    The sheet keeps its rows mounted while closed, so "the row exists" proves
    nothing about a member being able to reach it — a click dispatched at a
    hidden node would pass this whole file while the door was unreachable by
    hand. Waiting for the sheet to be open, and tapping at coordinates, is the
    difference.
  */
  try {
    await b.waitFor(
      `[...document.querySelectorAll('[data-tour-id="nav-more-help"]')].some(e => {
         const r = e.getBoundingClientRect();
         return r.width > 0 && r.height > 0;
       })`,
      "the More sheet to open",
      6_000,
    );
    return true;
  } catch {
    return false;
  }
}

// ─── Door one: More ───────────────────────────────────────────────────────

check("the More sheet opens", await openMore());
check("More lists How to Use Sakred", await tapTour("nav-more-help"), "no row for it");
check("and it opens the portal", await onPortal());

// ─── Door two: Settings ───────────────────────────────────────────────────

await openMore();
check("Settings is reachable", await tapTour("nav-more-settings"));
check("Settings offers Help & walkthrough", await tap("button-settings-help"), "no help row");
check("and it opens the same portal", await onPortal());

// ─── Door three: the Library ──────────────────────────────────────────────

await openMore();
check("the Library is reachable", await tapTour("nav-more-library"));
check("the Library offers it too", await tap("button-library-help"), "no help row");
check("and it is the same portal again", await onPortal());

// ─── What the portal says ─────────────────────────────────────────────────

{
  const seen = await b.evaluate<{ chapters: number; replay: boolean; resume: boolean; text: string }>(`
    return {
      chapters: document.querySelectorAll('[data-testid^="help-chapter-"]').length,
      replay: !!document.querySelector('[data-testid="button-help-replay"]'),
      resume: !!document.querySelector('[data-testid="button-help-resume"]'),
      text: (document.querySelector('[data-testid="help-start"]')?.textContent ?? "").slice(0, 200),
    };
  `);
  const objectives = new Set(SAKRED_INTRO.steps.map((s) => s.objective).filter(Boolean));
  check("every chapter of the walkthrough is listed", seen.chapters === objectives.size,
    `${seen.chapters} of ${objectives.size}`);
  check("the walkthrough can be replayed from here", seen.replay);
  check("and nothing is offered to resume when nothing is paused", !seen.resume, seen.text);
  check("the portal says replaying changes nothing", /changes nothing/.test(seen.text),
    seen.text);
}

// ─── Both atmospheres ─────────────────────────────────────────────────────

for (const theme of ["dark", "light"]) {
  await b.evaluate(`document.documentElement.dataset.theme = ${JSON.stringify(theme)}; return true;`);
  await b.evaluate(`return new Promise(r => setTimeout(() => r(true), 250));`);
  const readable = await b.evaluate<boolean>(`
    const el = document.querySelector('[data-testid="help-portal"]');
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return r.width > 100 && r.height > 100;
  `);
  check(`the portal renders in ${theme}`, readable);
}
await b.evaluate(`document.documentElement.dataset.theme = "dark"; return true;`);

await b.close();

if (failures.length) {
  console.error("\n✗ help portal\n");
  for (const f of failures) console.error(`    ${f}`);
  console.error("");
  process.exit(1);
}
console.log(`\n✓ ${passed} help portal assertions — three doors, one room\n`);
