/**
 * Nothing a member reads is written in the database's vocabulary.
 *
 * ── The defect this is the regression for ─────────────────────────────────
 *
 * On a real phone, on the shipped candidate:
 *
 *     Sakred reads this as full_body.
 *
 * `full_body` is a canonical identifier — correct in the column, correct in
 * the API, correct in the load model, and not English. The component that
 * printed it had a label map three lines above the render and interpolated the
 * raw field instead.
 *
 * ── Why this is a browser crawl and not a grep ────────────────────────────
 *
 * Because grep cannot tell `{variant}` passed as a prop from `{category}`
 * rendered as text. A source scan of this repository returns 141 candidates
 * and most are `className` inputs to UI primitives — a list that size gets
 * skimmed, and the one real leak in it gets skimmed too.
 *
 * More importantly, this repository has been taught the lesson four separate
 * times in one release: source looking correct is not the application
 * behaving correctly. The tour anchor that never reached the DOM, the
 * rehearsal barrier wired to nothing, the resume reconstruction, the coach
 * extension. Each was fine to read.
 *
 * So this reads the rendered document — visible text plus the accessible
 * names, because a value hidden visually and spoken aloud by VoiceOver is
 * still a leak.
 *
 * ── What it flags, and what it deliberately does not ──────────────────────
 *
 * Machine *shape*, not machine values. Several canonical values are also
 * ordinary English — `restore`, `build`, `both`, `good`, `left`, `other` —
 * and flagging those would drown the real findings in a screen's worth of
 * legitimate copy. What no product surface should ever contain is
 * snake_case or a known machine spelling of an English phrase:
 *
 *     full_body   health_connect   adaptive-stressor   dropset   warmup
 *
 * Underscores are not banned everywhere. A URL, a diagnostic panel, an admin
 * screen showing a raw value on purpose — those are allowlisted explicitly and
 * by name, so an exception is a decision somebody recorded rather than a
 * pattern that quietly widened.
 *
 *   Terminal 1:  npm run build && DATABASE_URL=$SAKREDBODY_QA_DATABASE_URL \
 *                SESSION_SECRET=… PORT=5199 NODE_ENV=production node dist/index.cjs
 *   Terminal 2:  set -a && . ./.env.qa && set +a && npx tsx script/qa-presentation.ts
 */

import { Browser } from "./cdp.js";
import { SET_STYLES, EXERCISE_CATEGORIES } from "../shared/models/training.js";
import { WORKOUT_FOCUSES } from "../shared/models/health.js";
import { LOAD_CLASSES } from "../shared/models/loadClass.js";
import { RECOMMENDATION_TYPES } from "../shared/models/recommendation.js";
import { REASON_CODES } from "../shared/models/brain.js";
import { SAKRED_INTRO } from "../client/src/lib/tour/sakredIntro.js";

const BASE = process.env.QA_BASE_URL ?? "http://127.0.0.1:5199";
const PASSWORD = process.env.QA_PASSWORD ?? "SakredQA!2026";

let passed = 0;
const failures: string[] = [];
const check = (name: string, ok: boolean, detail = "") => {
  if (ok) passed++;
  else failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
};

// ─── What counts as machine vocabulary ─────────────────────────────────────

/**
 * Every canonical value in the product that is machine-shaped.
 *
 * Assembled from the enums themselves rather than typed out, so a new
 * `some_new_category` is watched for the moment it is added — which is the
 * only way this stays true a year from now.
 */
const MACHINE_VALUES = new Set<string>(
  [
    ...EXERCISE_CATEGORIES.map((c) => c.id),
    ...WORKOUT_FOCUSES,
    ...SET_STYLES,
    ...LOAD_CLASSES,
    ...RECOMMENDATION_TYPES,
    ...REASON_CODES,
    "health_connect", "apple_health", "healthkit", "session_exercise",
    "apple_health_import", "canonical_action_type", "pattern_algorithm_version",
    "guidance_version", "brain_version", "decision_logic_version",
  ].filter((v) => /[_-]/.test(v) || ["dropset", "backoff", "warmup", "healthkit"].includes(v)),
);

/**
 * Surfaces that may legitimately show a raw value.
 *
 * Empty, and that is the intent. If one is ever added it needs a sentence
 * saying who reads that screen and why the raw value is the right thing for
 * them — an admin diagnostic is a real case; "it was easier" is not.
 */
const ALLOWED_SELECTORS: string[] = [];

/** Anything that is plainly not product copy. */
const IGNORE_ATTRS = /^(data-|aria-controls|aria-labelledby|id|for|href|src)/;

const COLLECT = `
    const skip = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE"]);
    const out = [];

    const push = (text, where, node) => {
      if (!text) return;
      const t = String(text).trim();
      if (!t) return;
      out.push({ text: t, where, tag: node?.tagName ?? "", testid: node?.getAttribute?.("data-testid") ?? null });
    };

    // Visible text, node by node — so the offending string is reported with
    // the element that rendered it rather than as a page-sized blob.
    const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walk.nextNode())) {
      const el = n.parentElement;
      if (!el || skip.has(el.tagName)) continue;
      const r = el.getBoundingClientRect();
      /* Zero-sized is a Radix sheet kept mounted while closed — not on screen,
         not read aloud, and not this test's business. */
      if (r.width === 0 && r.height === 0) continue;
      const style = getComputedStyle(el);
      if (style.visibility === "hidden" || style.display === "none") continue;
      push(n.nodeValue, "text", el);
    }

    // The half a screenshot cannot show. A value hidden visually and spoken by
    // a screen reader is still a value a member receives.
    for (const el of document.querySelectorAll("[aria-label], [title], img[alt], [aria-description]")) {
      push(el.getAttribute("aria-label"), "aria-label", el);
      push(el.getAttribute("title"), "title", el);
      push(el.getAttribute("alt"), "alt", el);
      push(el.getAttribute("aria-description"), "aria-description", el);
    }
  return JSON.stringify(out);
`;

type Seen = { text: string; where: string; tag: string; testid: string | null };

const SNAKE = /\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/g;

type Leak = { surface: string; text: string; token: string; where: string; testid: string | null };

function inspect(surface: string, seen: Seen[]): Leak[] {
  const leaks: Leak[] = [];
  for (const s of seen) {
    const tokens = new Set<string>();
    for (const m of s.text.matchAll(SNAKE)) tokens.add(m[0]);
    for (const w of s.text.split(/[\s.,;:!?()"'/]+/)) {
      if (MACHINE_VALUES.has(w.toLowerCase())) tokens.add(w);
    }
    for (const token of Array.from(tokens)) {
      leaks.push({ surface, text: s.text.slice(0, 90), token, where: s.where, testid: s.testid });
    }
  }
  return leaks;
}

// ─── Drive ─────────────────────────────────────────────────────────────────

/**
 * Make animations advance in a browser that draws no frames.
 *
 * Headless Chrome composites only when something needs painting, so
 * `requestAnimationFrame` callbacks can stall indefinitely. framer-motion
 * drives its transitions from rAF, and `AnimatePresence mode="wait"` will not
 * mount the incoming section until the outgoing one's exit animation has
 * *completed* — so with stalled frames the portal changes its section state,
 * renders the old section forever, and every screen fingerprints identically.
 *
 * That is what made the first three runs of this crawl report five sections as
 * one. `document.getAnimations().forEach(a => a.finish())` does not reach it:
 * that only knows about WAAPI, and these are rAF.
 *
 * So rAF is driven from a timer instead. 16ms rather than 0 on purpose — the
 * portal has canvas loops that would otherwise spin as fast as the event loop
 * allows and starve the crawl of CPU.
 */
const PUMP_RAF = `
(() => {
  let t = performance.now();
  window.requestAnimationFrame = (cb) => window.setTimeout(() => { t += 16.7; cb(t); }, 16);
  window.cancelAnimationFrame = (id) => window.clearTimeout(id);
})();
`;

const b = new Browser();
await b.launch();
await b.send("Page.enable").catch(() => {});
await b.send("Page.addScriptToEvaluateOnNewDocument", { source: PUMP_RAF });
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
  const at = await b.evaluate<{ x: number; y: number }>(`
    const q = [...document.querySelectorAll("button")].find(x => x.textContent.trim() === "Sign In").getBoundingClientRect();
    return { x: q.x + q.width / 2, y: q.y + q.height / 2 };
  `);
  await b.clickAt(at.x, at.y);
  await b.waitFor("location.pathname === '/member'", "the portal", 25_000);
}

/**
 * Every section of the member portal, and how a member gets to one.
 *
 * Not a list of URLs. `MemberDashboard` says it out loud — "a section is not a
 * route; every section of the portal lives at /member and is switched by the
 * state" — so a crawl that walks `?tab=…` visits the home screen twelve times
 * and reports twelve clean surfaces. The first version of this file did
 * exactly that, and the route-distinctness check below is what caught it.
 *
 * `more` is how the secondary sections are reached, so they are opened the way
 * a member opens them: tap More, then tap the row. That also puts the sheet
 * itself under the scanner, which matters — a sheet is precisely the kind of
 * surface nobody screenshots.
 */
const PRIMARY = ["home", "restore", "build", "community", "body"] as const;
const SECONDARY = [
  "retreat", "apothecary", "library", "masterclass", "wins", "help", "settings",
] as const;

/**
 * The first instance of an anchor that is actually on screen.
 *
 * Radix keeps a closed sheet mounted at zero size, and the desktop nav is in
 * the document at phone widths. `querySelector` returns whichever comes first
 * in source order, which is regularly the invisible twin — so a tap that
 * appears to do nothing is the default failure here, not the exception.
 */
/**
 * The element that would actually receive the tap.
 *
 * Sized and on screen is not enough. The first version of this crawl reported
 * five sections as one, because every tap was landing on the walkthrough's
 * scrim — the nav was visible underneath it, correctly positioned, and
 * completely unreachable. `elementFromPoint` is the only thing that knows the
 * difference, and without it a covered control looks identical to a control
 * that was tapped and did nothing.
 */
const SIZED = (id: string) => `
  const els = [...document.querySelectorAll('[data-tour-id="${id}"]')];
  let why = "";
  for (const el of els) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const x = r.x + r.width / 2, y = r.y + r.height / 2;
    if (y < 0 || y > innerHeight || x < 0 || x > innerWidth) continue;
    const hit = document.elementFromPoint(x, y);
    if (!hit) { why = "nothing at the point"; continue; }
    if (hit !== el && !el.contains(hit) && !hit.contains(el)) {
      why = "covered by " + (hit.getAttribute("data-testid") || hit.getAttribute("data-tour-id") || hit.tagName);
      continue;
    }
    return { x, y, why: "" };
  }
  return { x: -1, y: -1, why: why || (els.length ? "all instances unsized or off screen" : "no such anchor") };
`;

/** djb2 — a cheap identity for "did this screen change at all". */
function fingerprint(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return `${text.length}:${(h >>> 0).toString(36)}`;
}

/** Why a tap could not be made, for the last failure. Reported, not guessed at. */
let lastTapFailure = "";

async function tap(id: string): Promise<boolean> {
  const at = await b.evaluate<{ x: number; y: number; why: string }>(SIZED(id));
  if (!at || at.x < 0) {
    lastTapFailure = `${id}: ${at?.why ?? "no result"}`;
    return false;
  }
  await b.clickAt(at.x, at.y);
  await b.settle();
  return true;
}

/**
 * Leave no sheet open behind us.
 *
 * The More sheet is how every secondary section is reached, and it does not
 * always close on its own — a row that navigates underneath can leave it
 * sitting there, and the crawl's next tap on More then lands on the sheet it
 * already has open. That presented as "covered by more-sheet", "covered by
 * svg", "covered by H2" — seven sections unreachable for one reason wearing
 * seven different names.
 *
 * Escape rather than a click on the backdrop: a backdrop click is a coordinate
 * and coordinates are what got us here.
 */
async function closeSheets(): Promise<void> {
  const open = () =>
    b.evaluate<boolean>(
      `return [...document.querySelectorAll('[data-tour-id="more-sheet"], [role="dialog"]')]
         .some(e => e.getBoundingClientRect().height > 0);`,
    );
  for (let attempt = 0; attempt < 4 && (await open()); attempt++) {
    await b.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    await b.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    await b.settle();
    await b.settle();
  }
}

/** Land on a section, from wherever the crawl currently is. */
async function openSection(id: string): Promise<boolean> {
  await closeSheets();
  if ((PRIMARY as readonly string[]).includes(id)) return tap(`nav-${id}`);

  /*
    Twice if need be.

    Opening the sheet is a two-step gesture and the first step is not reliable
    from every starting point: the first secondary section of a run opened
    fine and every one after it failed with "all instances unsized or off
    screen" — the sheet had been asked to open and had not finished, or had
    opened and closed again behind the row we were waiting for. Retrying the
    whole gesture is honest about that; waiting longer inside it was not,
    because the row genuinely was not there.
  */
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await closeSheets();
    if (!(await tap("nav-more"))) { lastTapFailure = `nav-more: ${lastTapFailure}`; continue; }
    if (process.env.SAKRED_CRAWL_DEBUG) {
      console.log("    [debug] just after tapping More: " + (await b.evaluate<string>(`
        return "sheets=" + document.querySelectorAll('[data-tour-id="more-sheet"]').length +
          " dialogs=" + document.querySelectorAll('[role="dialog"]').length +
          " rows=" + document.querySelectorAll('[data-tour-id^="nav-more-"]').length +
          " overlay=" + !!document.querySelector('[data-testid="tour-overlay"]') +
          " body=" + JSON.stringify(document.body.innerText.trim().slice(0, 60));`)));
    }

    /* The sheet itself, before its contents. Radix keeps the content mounted
       at zero size while closed, so "the row exists" is true before the sheet
       has opened and a tap at that moment lands on whatever is underneath. */
    /* An expression, not a statement. `waitFor` wraps what it is given in
       `return (…)`, so a trailing semicolon here is a syntax error that looks
       exactly like a sheet that never opened — six seconds of it, every time. */
    const opened = await b
      .waitFor(
        `[...document.querySelectorAll('[data-tour-id="more-sheet"]')].some(e => e.getBoundingClientRect().height > 100)`,
        "the More sheet",
        6_000,
      )
      .then(() => true)
      .catch(() => false);
    if (!opened) {
      lastTapFailure = await b.evaluate<string>(`
        const sheets = [...document.querySelectorAll('[data-tour-id="more-sheet"]')];
        const dialogs = [...document.querySelectorAll('[role="dialog"]')];
        return "the More sheet never opened at " + innerWidth + "x" + innerHeight + " — " + sheets.length + " sheet(s) at [" +
          sheets.map(e => Math.round(e.getBoundingClientRect().height)).join(",") + "], " +
          dialogs.length + " dialog(s) at [" +
          dialogs.map(e => (e.getAttribute("data-testid") || e.getAttribute("data-tour-id") || "?") + ":" +
            Math.round(e.getBoundingClientRect().height)).join(",") + "]";`);
      continue;
    }

    /*
      Wait for the row to be reachable, rather than for a moment to pass.

      The sheet animates up from nothing, so its rows are mounted and sized
      zero, then sized and below the fold, then finally where a finger could
      reach them. Two settles after the sheet passed 100px caught it mid-rise:
      "all instances unsized or off screen" for six sections, which reads like
      a layout problem and was a timing one. Measured on the settled sheet,
      every row sits between y=372 and y=852 at 393×852 and every one of them
      hit-tests to itself — there was nothing wrong with the sheet.
    */
    const reachable = await b
      .waitFor(
        `[...document.querySelectorAll('[data-tour-id="nav-more-${id}"]')].some(e => {
           const r = e.getBoundingClientRect();
           if (!r.width || !r.height) return false;
           const x = r.x + r.width / 2, y = r.y + r.height / 2;
           if (y < 0 || y > innerHeight || x < 0 || x > innerWidth) return false;
           const hit = document.elementFromPoint(x, y);
           return !!hit && (hit === e || e.contains(hit) || hit.contains(e));
         })`,
        `the ${id} row`,
        8_000,
      )
      .then(() => true)
      .catch(() => false);
    if (!reachable) { lastTapFailure = `the ${id} row never became reachable in the open sheet`; continue; }

    if (!(await tap(`nav-more-${id}`))) { lastTapFailure = `nav-more-${id}: ${lastTapFailure}`; continue; }

    /*
      Tapped is not arrived.

      This used to return true on a successful click and leave the settle loop
      to discover, twenty-five seconds later, that the screen was still Home —
      reported as "masterclass never settled", which points at the wrong
      thing entirely. The row hit-tests to itself and the click lands; what
      occasionally does not happen is the navigation, and a click swallowed by
      a sheet still animating is indistinguishable from a click that worked
      until you ask whether anything changed.

      `data-tour-section-wanted` answers that immediately — it is set the
      instant the member's tap reaches state, before any animation — so a
      swallowed tap costs one more attempt instead of a section.
    */
    const took = await b
      .waitFor(
        `document.documentElement.getAttribute("data-tour-section-wanted") === ${JSON.stringify(id)}`,
        `the tap on ${id} to register`,
        3_000,
      )
      .then(() => true)
      .catch(() => false);
    if (took) return true;

    /*
      Which half failed: the delivery, or the handler.

      A coordinate click is a press and a release at one point, and if the
      layout shifts between them the browser dispatches the click on the
      common ancestor instead — the sheet, which does nothing. That is
      indistinguishable from a row whose handler is broken until you dispatch
      one directly and see whether the app moves. So this asks, and says.

      Only after the real gesture has been given its chance. A harness that
      reaches for a synthetic click first stops testing the thing a finger
      does.
    */
    const bySynthetic = await b.evaluate<boolean>(`
      const el = document.querySelector('[data-tour-id="nav-more-${id}"]');
      if (!el) return false;
      el.click();
      return true;`);
    const landed = bySynthetic
      ? await b
          .waitFor(
            `document.documentElement.getAttribute("data-tour-section-wanted") === ${JSON.stringify(id)}`,
            `the synthetic tap on ${id}`,
            3_000,
          )
          .then(() => true)
          .catch(() => false)
      : false;
    if (landed) {
      swallowed.push(id);
      return true;
    }
    lastTapFailure = `the ${id} row was tapped but the app never asked for it`;
  }
  return false;
}

/** Put the walkthrough away if it is running. Idempotent; safe when it is not. */
async function dismissTour(): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const at = await b.evaluate<{ x: number; y: number } | null>(`
      const el = document.querySelector('[data-testid="button-tour-pause"]');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) return null;
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };`);
    if (!at) return;
    await b.clickAt(at.x, at.y);
    await b.settle();
  }
}

/**
 * Wait for the screen to stop changing, rather than for a fixed moment.
 *
 * Three things move at different speeds here and a single settle catches none
 * of them reliably: the section swap (a framer exit animation, driven by the
 * rAF pump above), the queries behind each section, and the QA branch, which
 * is slow enough that a section can be mounted and empty for a second or two.
 *
 * So this polls a cheap signature — which section the app says it is on, plus
 * how much text is on screen — and returns once it has repeated. A crawl that
 * samples a half-rendered screen finds nothing and reports it clean, which is
 * the failure mode this whole file is built to avoid.
 */
/**
 * What the last poll saw, so a timeout can say why rather than only that.
 *
 * A settle that gives up after twenty-five seconds and reports the section
 * name is a check that has noticed something and declined to say what. This
 * is the whole content of the fix it would otherwise take an afternoon to
 * find.
 */
let lastSeen = "";

async function settled(expect?: string, wasShowing?: string): Promise<boolean> {
  const deadline = Date.now() + 25_000;
  let last = "";
  let repeats = 0;

  while (Date.now() < deadline) {
    await b.evaluate(
      `/* Infinite effects cannot be finished — an ambient shimmer throws
          'Cannot finish Animation with an infinite target effect', which would
          abandon the crawl over decoration. */
       document.getAnimations().forEach(a => { try { a.finish(); } catch {} }); return true;`,
    );
    const now = await b.evaluate<string>(
      `return (document.documentElement.getAttribute("data-tour-section") || "?") + "|" + document.body.innerText.trim().length;`,
    );
    /*
      `data-tour-section` now names the section that is MOUNTED, and is absent
      while one is leaving — see the vocabulary note in use-guided-tour.ts. It
      used to name the section that had been *requested*, which is why six
      secondary sections and two primaries once fingerprinted identically:
      this loop watched the attribute and the text length, both of which are
      perfectly stable on the screen we were trying to leave.

      `data-tour-settled` says the entrance animation has finished too. The
      old defence — "and the body text is no longer what it was" — stays as a
      second opinion, because a section that renders the same words as the one
      before it is exactly the case a single signal would miss.
    */
    const settled = await b.evaluate<string | null>(
      `return document.documentElement.getAttribute("data-tour-settled");`,
    );
    const body = await b.evaluate<string>(`return document.body.innerText.trim();`);
    const changed = wasShowing === undefined || fingerprint(body) !== wasShowing;
    const onTarget = (!expect || (now.startsWith(`${expect}|`) && settled === expect)) && changed;
    lastSeen = `mounted=${now.split("|")[0]} settled=${settled ?? "-"} text=${now.split("|")[1]} changed=${changed}`;
    if (onTarget && now === last && Number(now.split("|")[1]) > 0) {
      if (++repeats >= 2) return true;
    } else {
      repeats = 0;
    }
    last = now;
    await b.settle();
  }
  return false;
}

const all: Leak[] = [];
const visited: string[] = [];
/** What each surface actually rendered, so "clean" cannot mean "never loaded". */
const fingerprints = new Map<string, string>();
/**
 * Rows whose coordinate click went nowhere but whose handler worked.
 *
 * Reported rather than swallowed: it is the difference between "this control
 * is broken" and "this harness lost a click", and the second one still costs
 * a member a tap.
 */
const swallowed: string[] = [];

/** Sections the crawl could not get to. Reported, never silently skipped. */
const unreachable: string[] = [];
/** Sections that never stopped changing. Also reported, never sampled anyway. */
const unsettled: string[] = [];

const SECTIONS = [...PRIMARY, ...SECONDARY];

/** Prove the scan can fail before believing that it did not. */
const SELFTEST = process.env.SAKRED_CRAWL_SELFTEST === "1";

/*
  Called, which it was not.

  `login()` was defined here and never invoked, so every run crawled the login
  page: twelve sections, each reported unreachable or — in an earlier shape of
  this file, before the reachability check existed — reported clean. A crawl
  that never gets past the front door finds no machine values anywhere, which
  is indistinguishable from a product that has none.
*/
await login();

/*
  And the walkthrough put away first.

  It auto-starts for an account that has not finished it, and its scrim blocks
  every tap the crawl makes. Dismissed the way a member dismisses it rather
  than by forging a completion record, so the crawl inspects the same app
  anybody else gets.
*/
await dismissTour();

for (const theme of ["dark", "light"] as const) {
  await b.goto(`${BASE}/member`);
  await settled("home");
  await dismissTour();
  await b.evaluate(`document.documentElement.setAttribute("data-theme", ${JSON.stringify(theme)}); return true;`);

  for (const id of SECTIONS) {
    /* What the screen was before the tap, so "it changed" is a fact and not a
       hope about animation timing. */
    const before = fingerprint(await b.evaluate<string>(`return document.body.innerText.trim();`));
    const reached = await openSection(id);
    const surface = `${id} (${theme})`;
    if (!reached) {
      /* With what the page actually was at that moment. "no such anchor"
         without it sent two runs looking for a covered control when the
         portal had not rendered at all. */
      const where = await b.evaluate<string>(`
        return location.pathname + " · " + document.querySelectorAll("[data-tour-id]").length + " anchors · " +
          JSON.stringify(document.body.innerText.trim().slice(0, 120));`).catch(() => "unknown");
      unreachable.push(`${surface} [${lastTapFailure}] at ${where}`);
      continue;
    }
    /*
      A section that never settles is reported, not silently sampled. An
      unsettled screen is a screen this crawl did not actually inspect, and
      counting it as clean is the lie the whole file exists to prevent.
    */
    if (!(await settled(id, before))) {
      unsettled.push(`${surface} [${lastSeen}]`);
      continue;
    }
    /*
      The negative control, run as part of the real crawl rather than beside
      it.

      This file has reported "clean across eighteen surfaces" three separate
      times while reading the login page, reading shared chrome, and reading
      the previous section. A clean result is only worth anything if a dirty
      one would have been caught on the same pass, through the same collector,
      on a real surface — so one surface gets a machine value planted in it
      and the run fails if the scan does not find exactly that.
    */
    const planted = SELFTEST && surface === `home (dark)`;
    if (planted) {
      await b.evaluate(`
        const p = document.createElement("p");
        p.textContent = "Sakred reads this as full_body.";
        p.setAttribute("data-testid", "crawl-selftest");
        document.body.appendChild(p);
        return true;`);
    }
    if (planted) {
      const probe = JSON.parse(await b.evaluate<string>(COLLECT)) as Seen[];
      const caught = inspect(surface, probe).filter((l) => l.token === "full_body");
      check("the scanner catches a machine value planted in a real surface", caught.length === 1,
        `found ${caught.length}`);
      /* Removed before the real scan, and the surface still goes on to be
         crawled and to return home — a control that derails the run it is
         controlling is not a control. */
      await b.evaluate(`document.querySelector('[data-testid="crawl-selftest"]')?.remove(); return true;`);
      await b.settle();
    }
    const seen = JSON.parse(await b.evaluate<string>(COLLECT)) as Seen[];
    visited.push(surface);
    /*
      Hashed whole, not truncated.

      The first version kept the first 4000 characters, which on this portal is
      entirely nav, greeting and date — shared by every section. Five different
      screens fingerprinted identically and the distinctness check reported
      them as one, which is the same false-clean this file exists to prevent,
      one level up.
    */
    fingerprints.set(surface, fingerprint(seen.map((x) => x.text).join("|")));
    all.push(...inspect(surface, seen));
    /* Back to a known place, so the next tap is not made from inside a sheet. */
    await tap("nav-home");
  }
}

await b.close();

// ─── Report ────────────────────────────────────────────────────────────────

const unique = new Map<string, Leak>();
for (const l of all) unique.set(`${l.surface}|${l.token}|${l.text}`, l);
const leaks = Array.from(unique.values());

console.log(`  crawled ${visited.length} surfaces of a possible ${SECTIONS.length * 2}\n`);
check("every section was reachable", unreachable.length === 0, unreachable.join(", "));
if (swallowed.length) {
  console.error(`    ! a real tap went nowhere on: ${swallowed.join(", ")} — the row's handler is fine, the click was not delivered`);
}
check("every section settled", unsettled.length === 0, unsettled.join(", "));

/*
  A crawl that loads the same screen nine times under nine names finds nothing
  and reports nine surfaces clean. Distinct content is the evidence that the
  routes above are real routes.
*/
{
  const dark = Array.from(fingerprints.entries()).filter(([k]) => k.includes("(dark)"));
  const distinct = new Set(dark.map(([, v]) => v));
  /* Named, because "6 distinct of 11" does not say which five screens the
     crawl was actually reading, and that is the whole question. */
  const byPrint = new Map<string, string[]>();
  for (const [surface, print] of dark) {
    byPrint.set(print, [...(byPrint.get(print) ?? []), surface.replace(" (dark)", "")]);
  }
  const collisions = [...byPrint.values()].filter((names) => names.length > 1);
  check(
    "each section rendered something different",
    distinct.size >= Math.ceil(dark.length * 0.6),
    `${distinct.size} distinct of ${dark.length} — same screen: ${collisions.map((n) => n.join("=")).join(", ")}`,
  );
  const empty = dark.filter(([, v]) => Number(v.split(":")[0]) < 40).map(([k]) => k);
  check("no section rendered an empty page", empty.length === 0, empty.join(", "));
}

check(
  "no member surface renders a machine value",
  leaks.length === 0,
  leaks.length ? `${leaks.length} leak(s)` : "",
);

if (leaks.length) {
  for (const l of leaks) {
    console.error(`    ${l.surface}  ${l.where}${l.testid ? ` [${l.testid}]` : ""}`);
    console.error(`        ${l.token}   in: ${l.text}`);
  }
  console.error("");
}

if (failures.length) {
  console.error("✗ presentation boundary\n");
  for (const f of failures) console.error(`    ${f}`);
  console.error("");
  process.exit(1);
}
console.log(`✓ ${passed} presentation assertions passed across ${visited.length} surfaces\n`);
