/**
 * The walkthrough moves the page once, and then leaves it alone.
 *
 * ── The defect this is the gate for ───────────────────────────────────────
 *
 * Recorded on the real Restore transition at 393×852: the lesson spent its one
 * scroll at 496ms against a document that was still growing at 2277ms. Restore's
 * history and memory panels resolve after the lesson has committed, each one
 * pushing the highlighted card further down, and the member watched the thing
 * they had just been told to look at slide 52px out from under its own halo.
 *
 * Nothing about that is visible in a screenshot, in a static check, or in any
 * single frame. It is two seconds long. So this drives the real product, waits
 * for the lesson to say it has settled, and then watches.
 *
 * ── Why it reports what it could not check ────────────────────────────────
 *
 * A gate that cannot run must say so. If the content never grows during the
 * window, this proves nothing about holding — it proves the page was quiet —
 * and reporting that as a pass is how a suite stays green through six days of
 * a broken product. So the run fails unless it actually observed both a settle
 * and a shift worth absorbing.
 */
import { Browser } from "./cdp.js";
import { TourDriver } from "./tour-driver.js";
import { MAX_DIRECTED } from "../client/src/lib/tour/motion.js";

const BASE = process.env.SAKRED_QA_BASE ?? "http://127.0.0.1:5199";

/** How far the spotlighted control may move after the lesson says it settled. */
const DRIFT_ALLOWED = 4;

type Sample = {
  t: number;
  scroll: number;
  docH: number;
  targetTop: number | null;
  phase: string | null;
  side: string | null;
  scrolls: number;
  /** Which lesson the overlay is on. See `held`, below. */
  step: string | null;
};

type Lesson = {
  /** The step to stop on, and the anchor its halo sits over. */
  step: string;
  anchor: string;
  /** Steps to walk through before the one under test. */
  reach: string;
};

/*
  Two lessons, chosen because they fail differently. Restore opens onto a
  screen whose content arrives over the following two seconds; Build's opens
  onto one that is largely already there. A hold that only works on the noisy
  one is a hold that happens to work.
*/
const LESSONS: Lesson[] = [
  { step: "restore-practice", anchor: "restore-practice", reach: "restore" },
  { step: "build-today", anchor: "build-today", reach: "build" },
];

const failures: string[] = [];
const notes: string[] = [];
function check(name: string, ok: boolean, detail = "") {
  if (!ok) failures.push(detail ? `${name} — ${detail}` : name);
}

const b = new Browser();
await b.launch();
await b.headers({ "X-Forwarded-Proto": "https" });
await b.viewport(393, 852);
await b.goto(`${BASE}/login`);
await b.waitFor("document.querySelectorAll('input').length >= 2", "login", 25_000);
await b.evaluate(
  `const set=(el,v)=>{Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el),"value").set.call(el,v);el.dispatchEvent(new Event("input",{bubbles:true}));};` +
    `const [e,p]=document.querySelectorAll("input");set(e,"qa.member@sakred.local");set(p,"SakredQA!2026");return true;`,
);
await b.settle();
const signIn = await b.evaluate<{ x: number; y: number }>(
  `const q=[...document.querySelectorAll("button")].find(x=>x.textContent.trim()==="Sign In").getBoundingClientRect();return {x:q.x+q.width/2,y:q.y+q.height/2};`,
);
await b.clickAt(signIn.x, signIn.y);
await b.waitFor("location.pathname === '/member'", "portal", 25_000);

for (const lesson of LESSONS) {
  await b.evaluate(`for (const k of Object.keys(localStorage)) if (k.startsWith("sakred.tour")) localStorage.removeItem(k); return true;`);
  await b.goto(`${BASE}/member?tour=replay`);
  await b.waitFor(`!!document.querySelector('[data-testid="tour-overlay"]')`, "overlay", 25_000);
  await b.settle();

  const driver = new TourDriver(b);
  await driver.driveUntil(lesson.reach);

  await b.evaluate(`
    const T = { samples: [] };
    window.__motion = T;
    const t0 = performance.now();
    T.sample = () => {
      const el = document.querySelector('[data-tour-id="${lesson.anchor}"]');
      const dock = document.querySelector('[data-testid="tour-panel-dock"]');
      const box = document.scrollingElement || document.documentElement;
      T.samples.push({
        t: Math.round(performance.now() - t0),
        scroll: Math.round(box.scrollTop),
        docH: Math.round(box.scrollHeight),
        targetTop: el ? Math.round(el.getBoundingClientRect().top) : null,
        phase: document.documentElement.getAttribute("data-tour-motion"),
        side: dock ? dock.getAttribute("data-tour-side") : null,
        scrolls: Number(document.documentElement.getAttribute("data-tour-scrolls") || 0),
        step: (document.querySelector('[data-testid="tour-overlay"]') || {}).getAttribute
          ? document.querySelector('[data-testid="tour-overlay"]').getAttribute("data-tour-step") : null,
      });
      return T.samples.length;
    };
    T.sample();
    return true;
  `);

  /* The step is taken by the driver, which hit-tests the point first: clicking
     a nav cell by coordinate lands on the scrim and does nothing, which an
     earlier version of this reported as a very calm "nothing moved". */
  const walking = driver.step().catch(() => undefined);
  const until = Date.now() + 6000;
  while (Date.now() < until) await b.evaluate(`return window.__motion.sample();`);
  await walking;

  const samples = await b.evaluate<Sample[]>(`return window.__motion.samples;`);
  /*
    The lesson under test, holding — not merely "something is holding".

    The step before this one is itself anchored and settles almost at once, so
    the first `holding` in the recording belongs to it. Slicing from there
    included the entire transition and reported the target moving 478px, which
    is true and is the tour doing its job.
  */
  const held = samples.findIndex((s) => s.step === lesson.step && s.phase?.startsWith("holding"));
  const after = (held === -1 ? [] : samples.slice(held)).filter((s) => s.step === lesson.step);

  // ── Negative control: did this run observe anything worth asserting? ────
  const mine = samples.filter((s) => s.step === lesson.step);
  const grew = new Set(mine.map((s) => s.docH)).size > 1;
  check(`${lesson.step}: the lesson settled`, held !== -1, `phases seen: ${[...new Set(samples.map((s) => s.phase ?? "-"))].join(", ")}`);
  check(`${lesson.step}: the page actually changed underneath it`, grew, "the document never grew — this run proves nothing about holding");

  if (held !== -1) {
    const tops = after.map((s) => s.targetTop).filter((t): t is number => t !== null);
    const rest = tops[0];
    /*
      Measured as *how long* it is off, not merely whether it ever was.

      Content arriving above the target moves it, and the hold answers on the
      next frame — so a single painted frame at the shifted position is the
      cost of noticing at all, and calling that a failure would be demanding
      the impossible from a rAF loop. A shift that survives two frames is a
      different thing: it is a hold that did not fire, and that is the defect.
    */
    let worst = 0;
    let run = 0;
    let peak = 0;
    for (const t of tops) {
      if (Math.abs(t - rest) > DRIFT_ALLOWED) {
        run += 1;
        peak = Math.max(peak, Math.abs(t - rest));
        worst = Math.max(worst, run);
      } else run = 0;
    }
    check(
      `${lesson.step}: the spotlighted control does not move after the lesson settles`,
      worst <= 1,
      `off its mark for ${worst} consecutive frames, by up to ${peak}px, across ${after.length}`,
    );
    check(
      `${lesson.step}: and comes to rest where it settled`,
      tops.length > 0 && Math.abs(tops[tops.length - 1] - rest) <= DRIFT_ALLOWED,
      `settled at ${rest}, ended at ${tops[tops.length - 1]}`,
    );

    const sides = [...new Set(after.map((s) => s.side).filter(Boolean))];
    check(
      `${lesson.step}: the panel does not change sides after the lesson settles`,
      sides.length <= 1,
      `sides after settling: ${sides.join(" → ")}`,
    );

    const spent = Math.max(...mine.map((s) => s.scrolls));
    check(
      `${lesson.step}: at most ${MAX_DIRECTED} directed scrolls`,
      spent <= MAX_DIRECTED,
      `spent ${spent}`,
    );

    const released = after.filter((s) => s.phase?.startsWith("released"));
    check(
      `${lesson.step}: the lesson does not let go on its own`,
      released.length === 0,
      released.length ? `became ${released[0].phase} with nobody touching the page` : "",
    );

    const growth = Math.max(...mine.map((s) => s.docH)) - Math.min(...mine.map((s) => s.docH));
    notes.push(
      `${lesson.step}: held at ${after[0].targetTop}px through ${growth}px of growth, ` +
        `${spent} scroll(s)`,
    );
  }
}

await b.close();

if (failures.length) {
  console.error("\n✗ walkthrough motion\n");
  for (const f of failures) console.error(`    ${f}`);
  console.error("");
  process.exit(1);
}
console.log("\n✓ the walkthrough moves the page once and then leaves it alone");
for (const n of notes) console.log(`    ${n}`);
