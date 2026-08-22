/**
 * Coming back, at every checkpoint the walkthrough declares.
 *
 * ── What is actually being tested ─────────────────────────────────────────
 *
 * Not "does the tour remember the step number". That was never the hard part.
 * The hard part is that a lesson happens somewhere — inside Build, inside the
 * More sheet, inside a workout with a movement and a logged set in it — and a
 * member who takes a phone call comes back to an app that has none of that.
 * Restoring the step and not the screen produces a panel explaining RPE over a
 * dashboard with no sets on it: nothing errors, and it is nonsense.
 *
 * `restore.ts` has computed that state per step since the walkthrough was
 * written and, until this pass, nothing read it. So this drives the real app:
 * for every step, write the progress a paused member would have, reload the
 * page — a genuine app-state destruction, not a state change — and assert the
 * reconstruction from the running DOM.
 *
 * ── The denominator ───────────────────────────────────────────────────────
 *
 * Every step in the tour. Not eleven, not a number from an old prompt: a
 * checkpoint is anywhere a member can be paused, and they can be paused
 * anywhere. `SAKRED_INTRO.steps.length` is the count, and it moves when the
 * walkthrough does.
 *
 *   Terminal 1:  npm run build && DATABASE_URL=$SAKREDBODY_QA_DATABASE_URL \
 *                SESSION_SECRET=… PORT=5199 NODE_ENV=production node dist/index.cjs
 *   Terminal 2:  set -a && . ./.env.qa && set +a && npx tsx script/qa-resume.ts
 */

import pg from "pg";
import { Browser } from "./cdp.js";
import { SAKRED_INTRO } from "../client/src/lib/tour/sakredIntro.js";
import { restoreSpecFor } from "../client/src/lib/tour/restore.js";
import { progressKey } from "../client/src/lib/tour/progress.js";

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

const steps = SAKRED_INTRO.steps;
console.log(`\nResume — ${steps.length} checkpoints, one per lesson · ${BASE}\n`);

type World = {
  step: string | null;
  section: string | null;
  path: string;
  moreOpen: boolean;
  workoutOpen: boolean;
  anchorVisible: boolean;
  haloed: boolean;
  panel: boolean;
  degraded: boolean;
  movements: number;
  sets: number;
  lastTime: number;
};

const WORLD = (anchor: string | null) => `
  const sized = (sel) => [...document.querySelectorAll(sel)].some(e => {
    const r = e.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  });
  return {
    step: document.querySelector('[data-testid="tour-overlay"]')?.getAttribute("data-tour-step") ?? null,
    section: document.documentElement.getAttribute("data-tour-section"),
    path: location.pathname,
    moreOpen: sized('[data-tour-id="more-sheet"]'),
    workoutOpen: sized('[data-testid="workout-sheet"]'),
    anchorVisible: ${anchor ? `sized('[data-tour-id=${JSON.stringify(anchor)}]')` : "true"},
    haloed: !!document.querySelector('[data-testid="tour-halo"]'),
    panel: !!document.querySelector('[data-testid="tour-panel"]'),
    degraded: !!document.querySelector('[data-testid="button-tour-continue-degraded"]'),
    movements: document.querySelectorAll('[data-tour-id="workout-set-row"]').length,
    sets: document.querySelectorAll('[data-testid^="logged-set-"]').length,
    lastTime: document.querySelectorAll('[data-tour-id="workout-last-time"]').length,
  };
`;

/**
 * Destroy the app and bring it back paused on this step.
 *
 * ── Why the record *and* the flag ─────────────────────────────────────────
 *
 * The paused record is written exactly as `pause` writes it, so `resumeAt`
 * lands on this step — that half is the product's own logic and is covered
 * without a browser in script/test-resume.ts. What cannot be covered there is
 * the reconstruction, and it only runs when the tour actually mounts, which
 * needs a start: automatic start is off until rollout, so the run is forced
 * from the same step the record names. The two agree by construction here, and
 * the assertion that they agree without the flag belongs to the pass that
 * turns rollout on.
 *
 * A full reload rather than a state change, because that is the event being
 * modelled: a force-quit, an OS reclaim, a phone call long enough for iOS to
 * discard the process. The paused record is written the way `pause` writes it
 * — the step id and the lessons already done — so nothing here depends on a
 * shape the product does not produce.
 */
async function resumeAt(index: number): Promise<World> {
  const step = steps[index];
  const record = {
    tourId: SAKRED_INTRO.id,
    version: SAKRED_INTRO.version,
    stepId: step.id,
    completed: steps.slice(0, index).map((s) => s.id),
    completedAt: null,
  };
  await b.evaluate(`
    for (const k of Object.keys(localStorage)) if (k.startsWith("sakred.tour")) localStorage.removeItem(k);
    localStorage.setItem(${JSON.stringify(progressKey(SAKRED_INTRO.id, SAKRED_INTRO.version))}, ${JSON.stringify(JSON.stringify(record))});
    localStorage.setItem("sakred.tour.replay", ${JSON.stringify(JSON.stringify({ from: step.id }))});
    return true;
  `);
  await b.goto(`${BASE}/member`);
  await b.waitFor(`!!document.querySelector('[data-testid="tour-overlay"]')`, `the overlay at ${step.id}`, 30_000);
  await b.settle();
  /* Reconstruction opens sheets, which animate, and headless renders no
     compositor frames — so finish them rather than measuring a keyframe. */
  await b.evaluate(`document.getAnimations().forEach(a => { try { a.finish(); } catch {} }); return true;`);
  await b.evaluate(`return new Promise(r => setTimeout(() => r(true), 700));`);
  /*
    Then wait for the lesson's subject the way the overlay does. Terrain is
    computed on request and Build's day card is a query; measuring the frame
    the overlay mounted on measures a screen still arriving, which reads as a
    reconstruction failure and is a harness that did not wait.
  */
  if (step.anchor) {
    try {
      await b.waitFor(
        `[...document.querySelectorAll('[data-tour-id=${JSON.stringify(step.anchor)}]')].some(e => {
           const r = e.getBoundingClientRect();
           return r.width > 0 && r.height > 0;
         })`,
        `${step.anchor} after resuming`,
        8_000,
      );
    } catch {
      /* Reported below. */
    }
  }
  await b.evaluate(`document.getAnimations().forEach(a => { try { a.finish(); } catch {} }); return true;`);
  await b.evaluate(`return new Promise(r => setTimeout(() => r(true), 400));`);
  return b.evaluate<World>(WORLD(step.anchor ?? null));
}

for (let i = 0; i < steps.length; i++) {
  const step = steps[i];
  const spec = restoreSpecFor(step);
  const w = await resumeAt(i);

  check(`${step.id}: comes back on the same lesson`, w.step === step.id, `${w.step}`);
  check(`${step.id}: on the route it belongs to`, w.path === spec.route, w.path);

  if (spec.section) {
    check(`${step.id}: with the app on ${spec.section}`, w.section === spec.section, `${w.section}`);
  }
  if (spec.sheet === "more") {
    check(`${step.id}: with the More sheet open`, w.moreOpen);
  }
  if (spec.workout) {
    check(`${step.id}: with the workout in front`, w.workoutOpen);
  }
  if (spec.rehearsal) {
    check(`${step.id}: with ${spec.rehearsal.movements} movement(s) in it`,
      w.movements === spec.rehearsal.movements, `${w.movements}`);
    if (spec.rehearsal.lastTime) {
      check(`${step.id}: and the example of last time`, w.lastTime > 0, `${w.lastTime}`);
    }
  }

  check(`${step.id}: with a panel to read`, w.panel);
  if (step.anchor) {
    check(`${step.id}: and its subject on screen`, w.anchorVisible || w.degraded,
      w.degraded ? "degraded" : "absent");
    check(`${step.id}: pointed at rather than described`, w.haloed || w.degraded,
      w.degraded ? "degraded" : "no halo");
  }
  check(`${step.id}: not degraded on arrival`, !w.degraded);
}

await b.close();

// ─── And none of it reached the database ─────────────────────────────────

{
  const client = new pg.Client({ connectionString: process.env.SAKREDBODY_QA_DATABASE_URL });
  await client.connect();
  const { rows: [me] } = await client.query<{ id: string }>(
    "select id from users where email = $1", ["qa.member@sakred.local"],
  );
  const { rows: [state] } = await client.query<{ sessions: string; sets: string; open: string }>(`
    select (select count(*) from workout_sessions where user_id = $1) as sessions,
           (select count(*) from workout_sets ws join workout_sessions s on s.id = ws.session_id where s.user_id = $1) as sets,
           (select count(*) from workout_sessions where user_id = $1 and finished_at is null) as open`,
    [me.id],
  );
  await client.end();
  console.log(`  after ${steps.length} reconstructions: ${state.sessions} sessions, ${state.sets} sets, ${state.open} open`);
  check("no reconstruction wrote a session", state.open === "0", `${state.open} left open`);
  check("and the seed is untouched", state.sessions === "2" && state.sets === "11",
    `${state.sessions} sessions, ${state.sets} sets`);
}

if (failures.length) {
  console.error(`\n✗ resume — ${failures.length} of ${passed + failures.length}\n`);
  for (const f of failures) console.error(`    ${f}`);
  console.error("");
  process.exit(1);
}
console.log(`\n✓ ${passed} resume assertions across ${steps.length} checkpoints\n`);
