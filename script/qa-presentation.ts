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

/** Land on a section, from wherever the crawl currently is. */
async function openSection(id: string): Promise<boolean> {
  if ((PRIMARY as readonly string[]).includes(id)) return tap(`nav-${id}`);
  if (!(await tap("nav-more"))) return false;
  /*
    Wait for the row to have a size, not for the sheet to exist. Radix keeps
    the content mounted at zero size while closed, so "the element is present"
    is true before the sheet has opened and a tap at that moment lands on
    whatever is underneath it.
  */
  try {
    await b.waitFor(
      `!![...document.querySelectorAll('[data-tour-id="nav-more-${id}"]')].find(e => e.getBoundingClientRect().height > 0)`,
      `the ${id} row`,
      8_000,
    );
  } catch {
    return false;
  }
  return tap(`nav-more-${id}`);
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
async function settled(expect?: string): Promise<boolean> {
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
    const onTarget = !expect || now.startsWith(`${expect}|`);
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
/** Sections the crawl could not get to. Reported, never silently skipped. */
const unreachable: string[] = [];
/** Sections that never stopped changing. Also reported, never sampled anyway. */
const unsettled: string[] = [];

const SECTIONS = [...PRIMARY, ...SECONDARY];

for (const theme of ["dark", "light"] as const) {
  await b.goto(`${BASE}/member`);
  await settled("home");
  await b.evaluate(`document.documentElement.setAttribute("data-theme", ${JSON.stringify(theme)}); return true;`);

  for (const id of SECTIONS) {
    const reached = await openSection(id);
    const surface = `${id} (${theme})`;
    if (!reached) {
      unreachable.push(`${surface} [${lastTapFailure}]`);
      continue;
    }
    /*
      A section that never settles is reported, not silently sampled. An
      unsettled screen is a screen this crawl did not actually inspect, and
      counting it as clean is the lie the whole file exists to prevent.
    */
    if (!(await settled(id))) {
      unsettled.push(surface);
      continue;
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
check("every section settled", unsettled.length === 0, unsettled.join(", "));

/*
  A crawl that loads the same screen nine times under nine names finds nothing
  and reports nine surfaces clean. Distinct content is the evidence that the
  routes above are real routes.
*/
{
  const dark = Array.from(fingerprints.entries()).filter(([k]) => k.includes("(dark)"));
  const distinct = new Set(dark.map(([, v]) => v));
  check(
    "each section rendered something different",
    distinct.size >= Math.ceil(dark.length * 0.6),
    `${distinct.size} distinct of ${dark.length} sections — the rest resolved to the same screen`,
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
