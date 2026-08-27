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
import { Portal } from "./portal.js";
import { TourDriver } from "./tour-driver.js";
import { SAKRED_INTRO } from "../client/src/lib/tour/sakredIntro.js";

const BASE = process.env.SAKRED_QA_BASE ?? process.env.QA_BASE_URL ?? "http://127.0.0.1:5199";

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

/*
  Through Portal, which this file used to duplicate badly.

  It had its own login, its own tap, and its own idea of reachable: find the
  first node with a non-zero size and click its centre. That is the exact
  mistake portal.ts was written down to stop. Nothing here dismissed the
  walkthrough either, so on an account that had not finished it every tap in
  this file landed on the tour's scrim and every door reported itself missing
  — a whole harness failing red against a product where all three doors work.

  The anchors were never the problem. `nav-more`, `nav-more-help` and
  `nav-more-settings` are exactly what the navigation renders.
*/
const portal = new Portal(b, BASE);
await portal.login();
await portal.dismissTour();

console.log(`\nHow to Use Sakred — ${BASE}\n`);

/*
  Tapping, hit-tested, through the shared boundary.

  `Portal.tap` and `tapSelector` verify that the element which would actually
  receive the tap is the one meant to — `document.elementFromPoint`, which is
  the only thing that knows about a scrim, a sheet mid-animation, or the
  navigation bar. What was here found the first sized node and clicked its
  centre, which is true of a control under a scrim as much as of a reachable
  one.
*/
/*
  `tapSelector`, not `tap`. Both hit-test; only `tapSelector` brings the
  control into view first, and the More sheet is taller than the screen — its
  Help row sits below the fold at 393x852, where a hit test correctly reports
  that nothing of it is reachable and incorrectly reads as a missing door.
*/
const tapTour = (tourId: string) => portal.tapSelector(`[data-tour-id="${tourId}"]`);

/**
 * The portal is on screen — waited for, not sampled.
 *
 * This used to read the document on the line after the tap. A section change
 * is a route change and a lazy import, so the honest answer at that instant is
 * "not yet" and the harness recorded it as "the door does not work". Every
 * wait in here is for a stated condition with a bound; none of them is a
 * sleep.
 */
async function onPortal(): Promise<boolean> {
  try {
    await b.waitFor(
      `!!document.querySelector('[data-testid="help-portal"]')`,
      "the help portal",
      8_000,
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Back to a known screen, with the More sheet open.
 *
 * `tapUntil` rather than tap-and-hope: a coordinate click can be swallowed by
 * a sheet still animating, and "the row is missing" and "the tap was eaten"
 * look identical from the outside. The condition is the sheet's own row being
 * on screen, which is the thing the next line is about to press.
 */
async function openMore(): Promise<boolean> {
  await b.goto(`${BASE}/member`);
  await b.waitFor(`!!document.querySelector('[data-tour-id="nav-more"]')`, "the navigation", 25_000);
  await portal.dismissTour();
  /*
    Reachable, not merely sized.

    A bottom sheet slides up from the foot of the screen and its rows have a
    size for the whole of that journey — measured mid-slide at y=851 of an
    852-tall screen, with the Help row at 1280. "Has a size" is therefore true
    a third of a second before any of it can be pressed, and a harness that
    believes it goes on to report every door in the sheet as missing.

    So the condition is the door answering a hit test at its own centre, which
    is the same question the next line asks and the only one worth waiting on.
  */
  return portal.tapUntil(
    '[data-tour-id="nav-more"]',
    `[...document.querySelectorAll('[data-tour-id="nav-more-help"]')].some(e => {
       const r = e.getBoundingClientRect();
       if (r.width === 0 || r.height === 0) return false;
       const y = r.y + r.height / 2;
       if (y < 0 || y > innerHeight) return false;
       const hit = document.elementFromPoint(r.x + r.width / 2, y);
       return !!hit && (hit === e || e.contains(hit) || hit.contains(e));
     })`,
    "the More sheet to open",
  );
}

// ─── Door one: More ───────────────────────────────────────────────────────

check("the More sheet opens", await openMore());
check("More lists How to Use Sakred", await tapTour("nav-more-help"), "no row for it");
check("and it opens the portal", await onPortal());

// ─── Door two: Settings ───────────────────────────────────────────────────

/*
  Opened through `openSection`, not by tapping the More row and reading the
  next line. Settings and the Library are lazily imported tabs: the row's tap
  lands, the section is *requested*, and the screen it names arrives some
  hundreds of milliseconds later. `awaitSection` waits for it to be mounted
  and settled, and `settleText` for it to have finished fetching — without
  which the help row genuinely is not there yet and "never became reachable"
  is a true statement about a working product.
*/
check("Settings is reachable", await portal.openSection("settings"), portal.lastFailure);
check("Settings settles", await portal.awaitSection("settings"), portal.lastFailure);
await portal.settleText();
check(
  "Settings offers Help & walkthrough",
  await portal.tapUntil(
    '[data-testid="button-settings-help"]',
    `!!document.querySelector('[data-testid="help-portal"]')`,
    "the help portal to open from Settings",
  ),
  portal.lastFailure,
);
check("and it opens the same portal", await onPortal());

// ─── Door three: the Library ──────────────────────────────────────────────

check("the Library is reachable", await portal.openSection("library"), portal.lastFailure);
check("the Library settles", await portal.awaitSection("library"), portal.lastFailure);
await portal.settleText();
check(
  "the Library offers it too",
  await portal.tapUntil(
    '[data-testid="button-library-help"]',
    `!!document.querySelector('[data-testid="help-portal"]')`,
    "the help portal to open from the Library",
  ),
  portal.lastFailure,
);
check("and it is the same portal again", await onPortal());

// ─── What the portal says ─────────────────────────────────────────────────

/** Everything the portal is currently offering. */
const portalSays = () =>
  b.evaluate<{ chapters: number; replay: boolean; resume: boolean; text: string }>(`
    return {
      chapters: document.querySelectorAll('[data-testid^="help-chapter-"]').length,
      replay: !!document.querySelector('[data-testid="button-help-replay"]'),
      resume: !!document.querySelector('[data-testid="button-help-resume"]'),
      text: (document.querySelector('[data-testid="help-start"]')?.textContent ?? "").slice(0, 200),
    };
  `);

/** Reopen the portal from the Library, whatever state we left it in. */
async function reopenHelp(): Promise<boolean> {
  await b.goto(`${BASE}/member`);
  await b.waitFor(`!!document.querySelector('[data-tour-id="nav-more"]')`, "the navigation", 25_000);
  await portal.dismissTour();
  if (!(await portal.openSection("help"))) return false;
  await portal.awaitSection("help");
  return onPortal();
}

{
  const seen = await portalSays();
  const objectives = new Set(SAKRED_INTRO.steps.map((s) => s.objective).filter(Boolean));
  check("every chapter of the walkthrough is listed", seen.chapters === objectives.size,
    `${seen.chapters} of ${objectives.size}`);
  check("the walkthrough can be replayed from here", seen.replay);
  check("the portal says replaying changes nothing", /changes nothing/.test(seen.text), seen.text);
}

/*
  Resume is offered when there is something to resume, and not otherwise.

  This used to assert only the second half, against whatever state the run
  happened to be in — and the state it was always in was *paused*, because
  `dismissTour` pauses the walkthrough and every door above went through it.
  So the assertion failed on a portal behaving exactly as designed: it offered
  to resume a walkthrough that was, in fact, paused.

  A precondition worth asserting is worth establishing. Both halves now, with
  the stored progress set deliberately either way.
*/
/**
 * Switch away and back, so the portal re-reads progress without a page load.
 *
 * A reload would re-arm the walkthrough — it auto-starts for an account with
 * nothing recorded — and dismissing it pauses it, which is the very state
 * being cleared. The first version of this cleared storage, navigated, and
 * measured a walkthrough it had just paused itself.
 */
async function refreshHelp(): Promise<boolean> {
  if (!(await portal.openSection("settings"))) return false;
  await portal.awaitSection("settings");
  if (!(await portal.openSection("help"))) return false;
  await portal.awaitSection("help");
  return onPortal();
}

{
  check("the portal is open to begin with", await reopenHelp(), "could not get back to it");
  await b.evaluate(`
    for (const k of Object.keys(localStorage)) if (k.startsWith("sakred.tour")) localStorage.removeItem(k);
    return true;`);
  check("the portal reopens with nothing stored", await refreshHelp(), "could not get back to it");
  const fresh = await portalSays();
  check("nothing is offered to resume when nothing is paused", !fresh.resume, fresh.text);
  check("and it still offers to replay", fresh.replay);

  /*
    A replay is not progress.

    Nothing is stored at this point. Opening the walkthrough in replay mode and
    pausing it must leave that true — which is the promise the portal's own
    copy makes, in as many words, two lines above.
  */
  await b.goto(`${BASE}/member?tour=replay`);
  await b.waitFor(`!!document.querySelector('[data-testid="tour-overlay"]')`, "the replay", 25_000);
  const replayDriver = new TourDriver(b);
  await replayDriver.step();
  await replayDriver.step();
  await portal.dismissTour();
  const afterReplay = await b.evaluate<{ completed: number; completedAt: string | null }>(`
    const k = Object.keys(localStorage).find(k => k.startsWith("sakred.tour"));
    if (!k) return { completed: 0, completedAt: null };
    try {
      const p = JSON.parse(String(localStorage.getItem(k)));
      return { completed: (p.completed ?? []).length, completedAt: p.completedAt ?? null };
    } catch { return { completed: -1, completedAt: null }; }
  `);
  /* Not "writes nothing" — it does keep a place. What it must not do is spend
     the member's record of having been through it, which is what the copy
     above promises in as many words. */
  check(
    "replaying two lessons banks none of them",
    afterReplay.completed === 0 && afterReplay.completedAt === null,
    JSON.stringify(afterReplay),
  );

  /*
    Now pause the real one, which does record.

    Two lessons in, not on the first. `paused` is derived from a stored
    `stepId`, and a walkthrough stopped before it has moved has none — the
    state is `new`, correctly, and the portal offers a start rather than a
    resume. Asserting "a paused walkthrough is offered back" against a
    walkthrough that was never part way through would have been a test of
    nothing.
  */
  await b.evaluate(`
    for (const k of Object.keys(localStorage)) if (k.startsWith("sakred.tour")) localStorage.removeItem(k);
    return true;`);
  await b.goto(`${BASE}/member`);
  await b.waitFor(`!!document.querySelector('[data-testid="tour-overlay"]')`, "the walkthrough", 25_000);
  const realDriver = new TourDriver(b);
  await realDriver.step();
  await realDriver.step();
  await portal.dismissTour();
  check("the portal reopens after pausing", await reopenHelp(), "could not get back to it");
  const paused = await portalSays();
  check("a paused walkthrough is offered back", paused.resume, paused.text);
  check("and the portal says so", /Paused/.test(paused.text), paused.text);
}

/*
  And replaying does not spend the member's record of having been through it,
  which is what the copy above promises in as many words.
*/
{
  const before = await b.evaluate<string>(`
    const k = Object.keys(localStorage).find(k => k.startsWith("sakred.tour"));
    return k ? String(localStorage.getItem(k)) : "";`);
  check("there is a stored record to protect", before.length > 0, before);

  await portal.tapSelector('[data-testid="button-help-replay"]');
  await b.waitFor(`!!document.querySelector('[data-testid="tour-overlay"]')`, "the replay", 15_000)
    .catch(() => undefined);
  const after = await b.evaluate<string>(`
    const k = Object.keys(localStorage).find(k => k.startsWith("sakred.tour"));
    return k ? String(localStorage.getItem(k)) : "";`);
  const completedOf = (raw: string) => {
    try { return JSON.stringify(JSON.parse(raw).completed ?? []); } catch { return "?"; }
  };
  check(
    "replaying does not erase what the member had already done",
    completedOf(after) === completedOf(before),
    `${completedOf(before)} → ${completedOf(after)}`,
  );
  await portal.dismissTour();
  check("and the portal is still reachable afterwards", await reopenHelp());
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
