import { Browser } from "./cdp.js";
import { Portal } from "./portal.js";

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

/*
  Logging in, dismissing the walkthrough and opening a section are shared with
  the presentation crawl rather than written again here. Three harnesses have
  now needed them and each learned the same three lessons at cost — see
  script/portal.ts. The fourth should not have to.
*/
const portal = new Portal(b, BASE);
await portal.login();
await portal.dismissTour();

const tap = (selector: string) => portal.tapSelector(selector);
const type = (selector: string, value: string) => portal.type(selector, value);

// ─── Getting there ─────────────────────────────────────────────────────────

const opened = await portal.openSection("goals");
check("More → Your Goals is reachable", opened, portal.lastFailure);
if (!opened) {
  console.error(`\n✗ could not reach the goals screen — ${portal.lastFailure}\n`);
  await b.close();
  process.exit(1);
}
check("and the screen actually settles", await portal.awaitSection("goals"), portal.lastFailure);

/**
 * What the screen currently says about a goal, by its title.
 *
 * Read from the rendered text rather than from the API, because the API is not
 * what the member is disputing. `Target 6:00` on screen and `{seconds: 360}`
 * in a response are two different claims and only one of them is the product.
 */
async function figuresFor(title: string): Promise<Record<string, string>> {
  return b.evaluate<Record<string, string>>(`
    const cards = [...document.querySelectorAll('[data-testid^="goal-"]')];
    const card = cards.find((c) => c.textContent.includes(${JSON.stringify(title)}));
    if (!card) return {};
    const out = {};
    for (const row of card.querySelectorAll("dl > div")) {
      const dt = row.querySelector("dt"), dd = row.querySelector("dd");
      if (dt && dd) out[dt.textContent.trim()] = dd.textContent.trim();
    }
    return out;`);
}

// ─── Writing one ───────────────────────────────────────────────────────────

/*
  A title nobody else could have written, so a rerun against a QA database
  that already has goals in it is still reading its own row. Derived from the
  clock rather than random, so a failure names the run it came from.
*/
const stamp = new Date().toISOString().slice(11, 19).replace(/:/g, "");
const TITLE = `Six-minute mile ${stamp}`;

/** "the card for this goal is showing a row labelled X", as an expression. */
const cardShows = (label: string) => `
  (() => {
    const card = [...document.querySelectorAll('[data-testid^="goal-"]')]
      .find(c => c.textContent.includes(${JSON.stringify(TITLE)}));
    if (!card) return false;
    return [...card.querySelectorAll("dt")].some(dt => dt.textContent.trim() === ${JSON.stringify(label)});
  })()`;

/*
  Tapped and opened, not tapped and hoped.

  The first version of this checked that the tap was delivered and then waited
  ten seconds for a form that never came — which reads as a broken form and was
  a click swallowed by a sheet mid-animation. `tapUntil` asks whether the thing
  the tap was for actually happened, and says which of the two failed.
*/
const formOpen = await portal.tapUntil(
  '[data-testid="goal-add"]',
  `!!document.querySelector('[data-testid="goal-form"]')`,
  "the goal form to open",
);
check("the add-goal door opens the form", formOpen, portal.lastFailure);

await type('[data-testid="goal-title"]', TITLE);
check("the measurement can be chosen", await tap('[data-testid="goal-measurement-time_for_distance"]'));

/*
  A mile, in miles. The whole point of the distance unit row is that nobody
  types 1609.34 — so this types what a person types and the assertions below
  are about whether the app understood it.
*/
await type('[data-testid="goal-distance"]', "1");
check("miles is the default unit", await tap('[data-testid="goal-distance-unit-mi"]'));
await type('[data-testid="goal-time"]', "6:00");
await b.settle();

const canSave = await b.evaluate<boolean>(
  `const el = document.querySelector('[data-testid="goal-save"]'); return !!el && !el.disabled;`,
);
check("a complete goal can be saved", canSave);
check(
  "saving it works",
  await portal.tapUntil(
    '[data-testid="goal-save"]',
    `[...document.querySelectorAll('[data-testid^="goal-"]')].some(c => c.textContent.includes(${JSON.stringify(TITLE)}))`,
    "the goal to appear on the list",
  ),
  portal.lastFailure,
);

const afterCreate = await figuresFor(TITLE);
check("the goal appears on the member's own screen", Object.keys(afterCreate).length > 0);
check(
  "and it says the target the member typed, in the words they used",
  afterCreate.Target === "6:00 · mile",
  JSON.stringify(afterCreate),
);
/*
  Nothing invented. A goal with no observations must show a target and nothing
  else — a "Best —" or a zero would be the app filling a gap with a number
  nobody produced, which is the failure this whole feature is arranged against.
*/
check(
  "a goal nobody has measured shows no best and no latest",
  afterCreate.Best === undefined && afterCreate.Latest === undefined,
  JSON.stringify(afterCreate),
);

// ─── Recording where they actually are ─────────────────────────────────────

async function openGoal(): Promise<boolean> {
  const at = await b.evaluate<{ x: number; y: number } | null>(`
    const card = [...document.querySelectorAll('[data-testid^="goal-"]')]
      .find(c => c.textContent.includes(${JSON.stringify(TITLE)}));
    if (!card) return null;
    card.scrollIntoView({ block: "center" });
    const r = card.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + 20 };`);
  if (!at) return false;
  await b.clickAt(at.x, at.y);
  await b.settle();
  return true;
}

async function record(time: string): Promise<boolean> {
  if (!(await openGoal())) return false;
  if (
    !(await b
      .waitFor(`!!document.querySelector('[data-testid="goal-update-progress"]')`, "the detail sheet", 10_000)
      .then(() => true)
      .catch(() => false))
  ) {
    return false;
  }
  if (
    !(await portal.tapUntil(
      '[data-testid="goal-update-progress"]',
      `!!document.querySelector('[data-testid="goal-detail-save"]')`,
      "the progress fields to appear",
    ))
  ) {
    return false;
  }
  await type('[data-testid="goal-distance"]', "1");
  await type('[data-testid="goal-time"]', time);
  await b.settle();
  /*
    Saved when the sheet stops offering to save, which is the only signal that
    distinguishes a write that landed from a button that was never heard.
  */
  const saved = await portal.tapUntil(
    '[data-testid="goal-detail-save"]',
    `!document.querySelector('[data-testid="goal-detail-save"]')`,
    "the entry to be accepted",
  );
  await portal.closeSheets();
  return saved;
}

check("progress can be recorded", await record("6:28"), portal.lastFailure);
/*
  Wait for the card to say it, rather than settling and hoping.

  The write lands, the list query is invalidated, and the refetch comes back a
  moment later. A settle catches the first two and reads the card before the
  third — which is a harness measuring its own timing, and the failure it
  produces ("Best is missing") points squarely at the feature.
*/
check(
  "the list shows the new best",
  await portal.waitFor(cardShows("Best"), "the best on the card"),
  portal.lastFailure,
);
const afterFirst = await figuresFor(TITLE);
check("a recorded run becomes the best", afterFirst.Best === "6:28 · mile", JSON.stringify(afterFirst));
check("the target is unchanged by recording progress", afterFirst.Target === "6:00 · mile");

/*
  The assertion the browser is here for.

  A slower run afterwards must move `latest` and leave `best` alone. That is a
  derivation, a route, a query and a render, and three of those four are
  invisible to a unit test — so a regression in any of them would show up as a
  member's good day quietly disappearing off their own screen.
*/
check("a second, slower run can be recorded", await record("6:41"), portal.lastFailure);
check(
  "the list shows a latest distinct from the best",
  await portal.waitFor(cardShows("Latest"), "the latest on the card"),
  portal.lastFailure,
);
const afterSecond = await figuresFor(TITLE);
check(
  "a slower run does not erase the good day",
  afterSecond.Best === "6:28 · mile",
  JSON.stringify(afterSecond),
);
check(
  "and it does show as the latest",
  afterSecond.Latest === "6:41 · mile",
  JSON.stringify(afterSecond),
);
check("the target still stands", afterSecond.Target === "6:00 · mile");

// ─── And where it shows up ─────────────────────────────────────────────────

check("Build is reachable", await portal.openSection("build"), portal.lastFailure);
check("Build settles", await portal.awaitSection("build"), portal.lastFailure);
check(
  "the goal strip loads on Build",
  await portal.waitFor(
    `!!document.querySelector('[data-testid="goal-strip-build"]')`,
    "the goal strip",
  ),
  portal.lastFailure,
);
const onBuild = await b.evaluate<string>(`
  const strip = document.querySelector('[data-testid="goal-strip-build"]');
  return strip ? strip.textContent : "";`);
check(
  "the goal shows compactly on Build",
  onBuild.includes(TITLE) && onBuild.includes("6:00"),
  onBuild.slice(0, 160),
);
/*
  Titles and targets, and not the figures. The strip exists because Build is a
  screen about today; the moment it starts carrying best and latest it has
  become a second goals page in the middle of a page about something else.
*/
check(
  "…and carries the target without the history",
  !onBuild.includes("6:28") && !onBuild.includes("6:41"),
  onBuild.slice(0, 160),
);

await b.close();

for (const n of notes) console.log(`  ${n}`);
if (failures.length) {
  console.error(`\n✗ goals\n`);
  for (const f of failures) console.error(`    ${f}`);
  console.error("");
  process.exit(1);
}
console.log(`\n✓ ${notes.length} goal assertions passed in a browser\n`);
