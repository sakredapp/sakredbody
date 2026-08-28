/**
 * One tap, delivered the way a finger delivers it, arrives.
 *
 * ── The defect this is the regression for ─────────────────────────────────
 *
 * qa-presentation reported, for months, "a real tap went nowhere on: retreat,
 * goals — the row's handler is fine, the click was not delivered". It was
 * carried forward as harness noise. It was not.
 *
 * Measured on a 393×852 screen: the More sheet animates up from the bottom and
 * its rows travel about 475px on the way. "Goals" is at y=847 the instant it
 * becomes visible and hit-testable, and at y=372 when it stops. A press and a
 * release that straddle that journey touch two different elements, so the
 * browser dispatches `click` on their nearest common ancestor — the sheet —
 * and the row's handler never runs. Nothing on screen says why.
 *
 * It cannot activate the wrong row, because a common ancestor is never a
 * sibling. It is a lost tap, not a wrong one. It is still a lost tap, and the
 * member's only recourse was to tap again.
 *
 * ── What is asserted ─────────────────────────────────────────────────────
 *
 * One press and one release, at the row's centre, with no synthetic `.click()`
 * anywhere — the fallback Portal keeps for telling delivery from handling is
 * deliberately not used here, because using it is how this stayed invisible.
 * Every secondary section, in both themes, on a phone-sized screen.
 *
 *   Terminal 1:  npm run build && script/qa-serve.sh
 *   Terminal 2:  npx tsx script/qa-nav-tap.ts
 */

import { Browser, assertFreshBuild } from "./cdp.js";
import { Portal, SECONDARY_SECTIONS } from "./portal.js";

assertFreshBuild();

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
/* A phone, and the one the tour harness already treats as representative. The
   defect is a function of how far the sheet travels, so screen height is the
   variable that matters and a desktop viewport would hide it. */
await b.viewport(393, 852);

const portal = new Portal(b, BASE);
await portal.login();
await portal.dismissTour();

console.log(`\nOne tap, delivered the way a finger delivers it — ${BASE}\n`);

/**
 * Press and release at a point, and say whether the app moved.
 *
 * Deliberately not `Portal.tap`, which is the same gesture but retries — a
 * retry is exactly what a member does when the first one is eaten, and the
 * question here is whether they have to.
 */
async function realTap(id: string): Promise<{ arrived: boolean; why: string }> {
  const at = await b.evaluate<{ x: number; y: number; why: string } | null>(`
    for (const el of document.querySelectorAll('[data-tour-id="nav-more-${id}"]')) {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      const x = r.x + r.width / 2, y = r.y + r.height / 2;
      if (y < 0 || y > innerHeight || x < 0 || x > innerWidth) continue;
      const hit = document.elementFromPoint(x, y);
      if (!hit || !(hit === el || el.contains(hit) || hit.contains(el))) {
        return { x: -1, y: -1, why: "something else is at the row's centre: " + (hit ? hit.tagName : "nothing") };
      }
      return { x, y, why: "" };
    }
    return { x: -1, y: -1, why: "no row on screen with a size" };
  `);
  if (!at || at.x < 0) return { arrived: false, why: at?.why ?? "no row" };

  await b.send("Input.dispatchMouseEvent", { type: "mousePressed", x: at.x, y: at.y, button: "left", clickCount: 1 });
  /* Where the row is between the two halves of the gesture. This is the
     measurement that identified the defect, so it is the one reported. */
  const moved = await b.evaluate<number>(`
    for (const el of document.querySelectorAll('[data-tour-id="nav-more-${id}"]')) {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      return Math.round(Math.abs(r.y + r.height / 2 - ${at.y}));
    }
    return -1;
  `);
  await b.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: at.x, y: at.y, button: "left", clickCount: 1 });

  const arrived = await b
    .waitFor(
      `document.documentElement.getAttribute("data-tour-section-wanted") === ${JSON.stringify(id)}`,
      `the tap on ${id} to register`,
      4_000,
    )
    .then(() => true)
    .catch(() => false);

  return { arrived, why: arrived ? "" : `the row moved ${moved}px between press and release` };
}

for (const theme of ["dark", "light"] as const) {
  await b.evaluate(
    `localStorage.setItem("sakred.appearance", ${JSON.stringify(theme)}); return true;`,
  );
  await b.reload();
  await b.waitFor("location.pathname === '/member'", "the portal", 25_000);
  await portal.dismissTour();

  check(
    `the ${theme} theme is the one on screen`,
    (await b.evaluate<string>(`return document.documentElement.getAttribute("data-theme") || "";`)) === theme,
  );

  for (const id of SECONDARY_SECTIONS) {
    await portal.closeSheets();
    await b.evaluate(`document.documentElement.removeAttribute("data-tour-section-wanted"); return true;`);

    /*
      Closed, then opened. `nav-more` is a toggle, so opening it while the
      previous sheet is still on its way out closes the one that is arriving —
      which read as "no row on screen with a size" for whichever section came
      next, and put the whole loop out of step by one.
    */
    const gone = await b
      .waitFor(
        `!document.querySelector('[data-tour-id="more-sheet"]')`,
        "the previous sheet to leave",
        6_000,
      )
      .then(() => true)
      .catch(() => false);
    check(`${theme}: the sheet closes between sections (${id})`, gone);
    if (!gone) continue;

    /*
      Wait for the sheet to say it has stopped moving — the same signal the
      product uses to decide whether to accept a press at all. Waiting for
      "visible and hit-testable" is what let the defect hide: both are true
      475px before the row arrives.
    */
    const settled = await portal.tapUntil(
      '[data-tour-id="nav-more"]',
      `(() => {
         const s = document.querySelector('[data-tour-id="more-sheet"]');
         return !!s && s.getAttribute("data-tour-settled") === "true" && s.getBoundingClientRect().height > 100;
       })()`,
      "the More sheet, settled",
      3,
    );
    check(`${theme}: the More sheet opens and settles for ${id}`, settled, portal.lastFailure);
    if (!settled) continue;

    const { arrived, why } = await realTap(id);
    check(`${theme}: one tap opens ${id}`, arrived, why);
  }
}

/*
  And the case a member actually hits.

  Everything above taps a row that has stopped moving, which was already
  reliable. What was not, and what this file exists for, is a tap that begins
  while the sheet is still arriving. So: open it and press immediately, with no
  wait at all.

  The rule being asserted is not "the early tap works" — no browser buffers a
  press for an element that is 475px away from where it will be. It is that the
  early tap is *inert*: the rows do not accept it, nothing is dispatched to a
  common ancestor, and the sheet is still open and usable a moment later. That
  turns a tap that silently vanished into one that plainly has not happened
  yet.
*/
await portal.closeSheets();
await b.waitFor(`!document.querySelector('[data-tour-id="more-sheet"]')`, "the sheet to leave", 6_000);
await b.evaluate(`document.documentElement.removeAttribute("data-tour-section-wanted"); return true;`);

{
  const opened = await portal.tap("nav-more");
  check("More opens for the early-tap case", opened, portal.lastFailure);

  /* Mounted, but not settled. If the machine is fast enough that the
     animation is already over, say so rather than asserting nothing. */
  const early = await b.evaluate<{ mounted: boolean; settled: string | null; inert: boolean; y: number }>(`
    const sheet = document.querySelector('[data-tour-id="more-sheet"]');
    const rows = document.querySelector('[data-tour-id="more-rows"]');
    const row = document.querySelector('[data-tour-id="nav-more-goals"]');
    const r = row ? row.getBoundingClientRect() : null;
    return {
      mounted: !!sheet,
      settled: sheet ? sheet.getAttribute("data-tour-settled") : null,
      inert: !!rows && getComputedStyle(rows).pointerEvents === "none",
      y: r ? Math.round(r.y + r.height / 2) : -1,
    };
  `);

  if (early.settled === "false" && early.y > 0 && early.y < 852) {
    check("a sheet still arriving does not accept a press", early.inert, JSON.stringify(early));

    await b.send("Input.dispatchMouseEvent", { type: "mousePressed", x: 196, y: early.y, button: "left", clickCount: 1 });
    await b.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: 196, y: early.y, button: "left", clickCount: 1 });

    const wanted = await b.evaluate<string | null>(
      `return document.documentElement.getAttribute("data-tour-section-wanted");`,
    );
    check("and nothing is navigated to by mistake", wanted === null, String(wanted));

    /* Still there, and now usable. The point of refusing the press is that the
       member's next one lands — not that the sheet gives up. */
    const settledNow = await b
      .waitFor(
        `(() => { const s = document.querySelector('[data-tour-id="more-sheet"]');
                  return !!s && s.getAttribute("data-tour-settled") === "true"; })()`,
        "the sheet to settle after the early tap",
        8_000,
      )
      .then(() => true)
      .catch(() => false);
    check("the sheet is still open afterwards", settledNow);
    if (settledNow) {
      const { arrived, why } = await realTap("goals");
      check("and the next tap opens the section", arrived, why);
    }
  } else {
    notes.push(
      `· the sheet had already settled when measured (${JSON.stringify(early)}) — the early-tap case did not arise this run`,
    );
  }
}

/*
  And the second way the list moves under a finger: a query landing.

  Which rows exist depends on whether this member has a coach, and that answer
  arrives whenever it arrives. Open the sheet a moment earlier and the coaching
  row appears in the middle of the list, moving everything below it down by its
  own height — measured at 60px, which was enough to make "Goals" lose a tap
  that had already been pressed.

  Held deterministically rather than raced: the coach answer is delayed in the
  page, so the sheet is guaranteed to open before it lands. Without the freeze
  in MemberNav this is exactly the shift; with it, the list opened is the list
  that stays.
*/
await portal.closeSheets();
await b.waitFor(`!document.querySelector('[data-tour-id="more-sheet"]')`, "the sheet to leave", 6_000);

{
  await b.evaluate(`
    window.__realFetch = window.__realFetch || window.fetch;
    window.fetch = (input, init) => {
      const url = typeof input === "string" ? input : input.url;
      if (url.includes("/api/coaching/my-coach")) {
        return new Promise(r => setTimeout(() => r(window.__realFetch(input, init)), 2500));
      }
      return window.__realFetch(input, init);
    };
    return true;
  `);
  await b.reload();
  await b.waitFor("location.pathname === '/member'", "the portal", 25_000);
  await portal.dismissTour();

  const opened = await portal.tapUntil(
    '[data-tour-id="nav-more"]',
    `(() => { const s = document.querySelector('[data-tour-id="more-sheet"]');
              return !!s && s.getBoundingClientRect().height > 100; })()`,
    "the More sheet, before the coach answer lands",
    3,
  );
  check("the sheet opens before the coach answer arrives", opened, portal.lastFailure);

  const rowsNow = () =>
    b.evaluate<string[]>(`
      return [...document.querySelectorAll('[data-tour-id="more-rows"] [data-tour-id^="nav-more-"]')]
        .map(e => e.getAttribute("data-tour-id"));
    `);

  const first = await rowsNow();
  check("and has rows in it", first.length > 0, JSON.stringify(first));

  /* Long enough for the delayed answer to land and for React to have rendered
     whatever it was going to render. */
  await b.evaluate(`await new Promise(r => setTimeout(r, 3500)); return true;`);
  const later = await rowsNow();

  check(
    "the list a member is reading does not change under them",
    JSON.stringify(first) === JSON.stringify(later),
    `${JSON.stringify(first)} became ${JSON.stringify(later)}`,
  );

  /* And the tap still lands, which is the point of holding the list still. */
  const { arrived, why } = await realTap("goals");
  check("and a tap after the answer landed still opens the section", arrived, why);

  await b.evaluate(`window.fetch = window.__realFetch; return true;`);
}

await portal.closeSheets();

await b.close();

if (failures.length) {
  console.error("✗ a tap went nowhere\n");
  for (const f of failures) console.error(`    ${f}`);
  console.error("");
  process.exit(1);
}
console.log(`✓ ${notes.length} nav-tap assertions — every section opens on the first tap, in both themes`);
console.log("");
