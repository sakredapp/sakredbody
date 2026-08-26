/**
 * The walkthrough, measured in a real browser rather than looked at.
 *
 * ── What this refuses to accept ───────────────────────────────────────────
 *
 * "The spotlight is roughly on the button." A tutorial that highlights an area
 * near a control teaches nothing and looks broken, and it is exactly the
 * failure that survives a human clicking through once on a laptop. So every
 * anchored step is measured: the target's own rect, the halo the overlay drew,
 * the dialogue panel, the viewport — and the relationships between them are
 * assertions with numbers in them.
 *
 * ── The denominator is the tour ───────────────────────────────────────────
 *
 * Nothing here counts to 26. The step list, the objectives and the anchors all
 * come from `SAKRED_INTRO` at runtime, so a step added next month is exercised
 * without anybody remembering to add it, and a step removed stops being
 * expected.
 *
 *   Terminal 1:  npm run build && DATABASE_URL=$SAKREDBODY_QA_DATABASE_URL \
 *                SESSION_SECRET=… PORT=5199 NODE_ENV=production node dist/index.cjs
 *   Terminal 2:  npx tsx script/qa-walkthrough.ts
 */

import { mkdirSync } from "node:fs";
import { Browser } from "./cdp.js";
import { TourDriver } from "./tour-driver.js";
import { SAKRED_INTRO } from "../client/src/lib/tour/sakredIntro.js";

const BASE = process.env.QA_BASE_URL ?? "http://127.0.0.1:5199";
const SHOTS = process.env.QA_SHOTS ?? "/tmp/sakred-qa/shots";
const PASSWORD = process.env.QA_PASSWORD ?? "SakredQA!2026";

/** Halo padding, from the overlay. A halo tighter than this clips the target. */
const PAD = 8;
/** How far the halo's centre may sit from the target's, in CSS pixels. */
const CENTRE_TOLERANCE = 1.5;

type Rect = { x: number; y: number; width: number; height: number };
const centre = (r: Rect) => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });
const overlaps = (a: Rect, b: Rect) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

let passed = 0;
const failures: string[] = [];
const check = (name: string, ok: boolean, detail = "") => {
  if (ok) return void passed++;
  const line = `${name}${detail ? ` — ${detail}` : ""}`;
  failures.push(line);
  /* Printed as it happens as well as summarised. A run that dies in the
     browser three viewports in used to take its findings with it. */
  console.log(`    ✗ ${line}`);
};

const VIEWPORTS = [
  { name: "iphone-393", w: 393, h: 852, mobile: true },
  { name: "narrow-360", w: 360, h: 780, mobile: true },
  { name: "tall-430", w: 430, h: 932, mobile: true },
  { name: "desktop-1280", w: 1280, h: 900, mobile: false },
];

mkdirSync(SHOTS, { recursive: true });

const b = new Browser();
await b.launch();
/*
  Production sets `secure: true` on the session cookie behind `trust proxy 1`,
  so express-session withholds it entirely unless the request looks like it
  arrived over TLS. Imitating the proxy is right; weakening the cookie for
  testing would mean testing a different application.
*/
await b.headers({ "X-Forwarded-Proto": "https" });

async function loginThroughTheForm(who: string): Promise<void> {
  await b.viewport(393, 852);
  await b.goto(`${BASE}/login`);
  await b.waitFor("document.querySelectorAll('input').length >= 2", "the login form", 25_000);
  await b.evaluate(`
    const set = (el, v) => {
      Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), "value").set.call(el, v);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    };
    const [email, pw] = document.querySelectorAll("input");
    set(email, ${JSON.stringify(`qa.${who}@sakred.local`)});
    set(pw, ${JSON.stringify(PASSWORD)});
    return true;
  `);
  await b.settle();
  const r = await b.evaluate<Rect>(`
    const btn = [...document.querySelectorAll("button")].find(x => x.textContent.trim() === "Sign In");
    const q = btn.getBoundingClientRect();
    return { x: q.x, y: q.y, width: q.width, height: q.height };
  `);
  /* A real click at real coordinates — not `form.submit()`, which would prove
     the endpoint works and nothing about the button being reachable. */
  await b.clickAt(centre(r).x, centre(r).y);
  await b.waitFor("location.pathname === '/member'", "the portal", 25_000);
}

/** Read the whole world in one round trip, so the numbers are from one frame. */
const WORLD = `
  const el = document.querySelector('[data-testid="tour-overlay"]');
  if (!el) return { mounted: false };
  const stepId = el.getAttribute("data-tour-step");
  const box = (n) => {
    const e = document.querySelector(n);
    if (!e) return null;
    const r = e.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  };
  return {
    mounted: true,
    stepId,
    halo: box('[data-testid="tour-halo"]'),
    panel: box('[data-testid="tour-panel"]'),
    title: (document.querySelector('[data-testid="tour-title"]')?.textContent ?? "").trim(),
    hasContinue: !!document.querySelector('[data-testid="button-tour-continue"]'),
    hasPause: !!document.querySelector('[data-testid="button-tour-pause"]'),
    section: document.documentElement.getAttribute("data-tour-section"),
    theme: document.documentElement.dataset.theme,
    viewport: { x: 0, y: 0, width: innerWidth, height: (visualViewport && visualViewport.height) || innerHeight },
  };
`;

type World = {
  mounted: boolean;
  stepId?: string;
  halo: Rect | null;
  panel: Rect | null;
  title?: string;
  hasContinue?: boolean;
  hasPause?: boolean;
  section?: string | null;
  theme?: string;
  viewport?: Rect;
  instance?: string | null;
};

/** The element the step actually points at, chosen the way the resolver does. */
const targetOf = (anchor: string, instance: string | null) => `
  const all = [...document.querySelectorAll('[data-tour-id=${JSON.stringify(anchor)}]')];
  const visible = all.filter(e => {
    const r = e.getBoundingClientRect();
    const s = getComputedStyle(e);
    return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && Number(s.opacity) > 0.05;
  });
  const named = ${instance ? `visible.filter(e => e.getAttribute("data-tour-instance") === ${JSON.stringify(instance)})` : "visible"};
  const chosen = named[0];
  return {
    total: all.length,
    visible: visible.length,
    matching: named.length,
    rect: chosen ? (() => { const r = chosen.getBoundingClientRect(); return { x:r.x, y:r.y, width:r.width, height:r.height }; })() : null,
  };
`;

// ─── What the tour says exists ───────────────────────────────────────────

const steps = SAKRED_INTRO.steps;
const anchored = steps.filter((s) => s.anchor);
const objectives = new Set(steps.map((s) => s.objective).filter(Boolean));

console.log(`\nWalkthrough QA — ${BASE}\n`);
console.log(`  ${steps.length} steps · ${anchored.length} anchored · ${objectives.size} objectives\n`);

await loginThroughTheForm("member");

// ─── Mount the real tour through the real replay switch ──────────────────

/*
  Start from nothing. The browser profile outlives the run, so a second
  invocation would resume where the first left off and then measure a step
  against the screen the first one happened to end on — which reads as a
  geometry failure and is really a dirty fixture.
*/
await b.evaluate(`
  for (const k of Object.keys(localStorage)) if (k.startsWith("sakred.tour")) localStorage.removeItem(k);
  return true;
`);

await b.goto(`${BASE}/member?tour=replay`);
await b.waitFor("location.pathname === '/member'", "the portal after replay", 25_000);
/*
  Waiting on the route is not waiting on the overlay. The dashboard resolves a
  dozen queries before the tour host has anything to draw, and checking the
  moment the path changes measures an empty document — which reads as "the
  walkthrough is broken" and is really "the harness was early".
*/
try {
  await b.waitFor(`!!document.querySelector('[data-testid="tour-overlay"]')`, "the tour overlay", 20_000);
} catch {
  /* Fall through: the assertion below reports it properly. */
}
await b.settle();

let world = await b.evaluate<World>(WORLD);
check("the walkthrough mounts through ?tour=replay", world.mounted === true,
  world.mounted ? "" : "no [data-testid=tour-overlay] in the document");

if (!world.mounted) {
  console.error("\n✗ walkthrough QA\n");
  for (const f of failures) console.error(`    ${f}`);
  console.error("\n    Nothing further can be measured without the overlay.\n");
  await b.close();
  process.exit(1);
}

check("it starts at the first step", world.stepId === steps[0].id, `${world.stepId}`);
check("the first step has a title", (world.title ?? "").length > 0);
check("and a way forward", world.hasContinue === true);
check("and a way to pause rather than skip", world.hasPause === true);

// ─── Geometry, at every viewport, at every lesson ────────────────────────

/*
  This used to measure whichever step happened to be mounted — which is step
  one, which is unanchored, which means the geometry matrix asserted nothing
  about any halo at all and passed. Four viewports of measuring nothing.

  So the tour is now *driven* at each viewport, and every step is measured in
  the state a member is looking at when they meet it. The driver is the same
  one the traversal uses: it does what each lesson asks rather than clicking
  Continue, so the screens measured here are screens that genuinely occur.
*/

/**
 * Halo, panel, target and hit test — from one frame.
 *
 * They were four round trips, and the overlay scrolls the target into view
 * mid-step: so the halo came from before the scroll and the target's rect from
 * after it, and the harness reported centres 119 pixels apart on a walkthrough
 * that was drawing them concentrically. Numbers compared against each other
 * have to be read at the same instant or they are not measurements.
 */
const SNAP = (anchor: string | null, instance: string | null, anyInstance: boolean) => `
  const el = document.querySelector('[data-testid="tour-overlay"]');
  if (!el) return { mounted: false };
  const box = (n) => {
    const e = typeof n === "string" ? document.querySelector(n) : n;
    if (!e) return null;
    const r = e.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  };
  const out = {
    mounted: true,
    stepId: el.getAttribute("data-tour-step"),
    halo: box('[data-testid="tour-halo"]'),
    panel: box('[data-testid="tour-panel"]'),
    viewport: { x: 0, y: 0, width: innerWidth, height: (visualViewport && visualViewport.height) || innerHeight },
    target: null, hit: null,
  };
  ${anchor ? `
  const all = [...document.querySelectorAll('[data-tour-id=${JSON.stringify(anchor)}]')];
  const visible = all.filter(e => {
    const r = e.getBoundingClientRect();
    const s = getComputedStyle(e);
    return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && Number(s.opacity) > 0.05;
  });
  const named = ${instance ? `visible.filter(e => e.getAttribute("data-tour-instance") === ${JSON.stringify(instance)})` : "visible"};
  const chosen = (named.length === 1 || ${anyInstance ? "true" : "false"}) ? named[0] : null;
  out.target = { total: all.length, visible: visible.length, matching: named.length, rect: box(chosen ?? null) };
  if (out.target.rect) {
    const r = out.target.rect;
    const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    out.hit = {
      top: top ? (top.getAttribute("data-testid") ?? top.getAttribute("data-tour-id") ?? top.tagName) : "none",
      reaches: !!top?.closest('[data-tour-id=${JSON.stringify(anchor)}]'),
    };
  }
  ` : ""}
  return out;
`;

type Snap = {
  mounted: boolean;
  stepId?: string;
  halo: Rect | null;
  panel: Rect | null;
  viewport: Rect;
  target: { total: number; visible: number; matching: number; rect: Rect | null } | null;
  hit: { top: string; reaches: boolean } | null;
};

async function restartTour(): Promise<void> {
  await b.evaluate(`
    for (const k of Object.keys(localStorage)) if (k.startsWith("sakred.tour")) localStorage.removeItem(k);
    return true;
  `);
  await b.goto(`${BASE}/member?tour=replay`);
  await b.waitFor(`!!document.querySelector('[data-testid="tour-overlay"]')`, "the tour overlay", 30_000);
  await b.settle();
}

/**
 * Wait for the lesson to have finished arriving.
 *
 * A step is mounted before it is *ready*: the card it points at may still be
 * loading, and the overlay scrolls the target into view once it can find it.
 * Measuring the instant the step id changes measures a screen that exists for
 * about a frame and that no member ever sees — it reported eleven failures
 * that were all the harness being early.
 *
 * Bounded, and silent when it expires: a step whose target genuinely never
 * arrives is a finding for `measure` to report, not for this to throw over.
 */
async function settleOnStep(anchor: string | null): Promise<void> {
  if (anchor) {
    try {
      await b.waitFor(
        `!!document.querySelector('[data-testid="tour-halo"]') &&
         !!document.querySelector('[data-tour-id=${JSON.stringify(anchor)}]')`,
        `the halo for ${anchor}`,
        12_000,
      );
    } catch {
      /* Reported by the assertions below, with numbers. */
    }
  }
  /*
    Then let the overlay finish bringing it into view.

    Scrolling a target out from under the navigation is bounded and spaced —
    three attempts, a third of a second apart, so it cannot fight a member's
    own scrolling — which means a harness that measures 200ms after the step
    opens catches the first attempt and calls the result a defect. Waiting for
    the target to be entirely inside the viewport is waiting for what a member
    sees about a second in.
  */
  if (anchor) {
    try {
      await b.waitFor(
        `(() => {
           const el = document.querySelector('[data-tour-id=${JSON.stringify(anchor)}]');
           if (!el) return false;
           const r = el.getBoundingClientRect();
           return r.top >= 0 && r.left >= 0 && r.bottom <= innerHeight && r.right <= innerWidth;
         })()`,
        `${anchor} to be brought fully into view`,
        2_500,
      );
    } catch {
      /* Reported below, with the rect. */
    }
  }

  /*
    Then finish whatever is still moving, and give the layout two frames.

    Headless Chrome renders no compositor frames, so a CSS transition on the
    halo's position never advances — it sits at its starting keyframe. The
    harness read that as the walkthrough highlighting a control 113 pixels
    below the one it meant, which is a defect report about the instrument.
    Finishing in-flight animations is what a real device does in 200ms.
  */
  await b.evaluate(`document.getAnimations().forEach(a => { try { a.finish(); } catch {} }); return true;`);
  await b.evaluate(`return new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(true))));`);
  await b.evaluate(`return new Promise(r => setTimeout(() => r(true), 150));`);
}

/** Everything geometric that can be wrong about one lesson on one screen. */
async function measure(label: string, stepId: string, degraded: string[]): Promise<void> {
  const step = steps.find((s) => s.id === stepId);
  if (!step) {
    check(`[${label}] the mounted step is one the tour defines`, false, `${stepId}`);
    return;
  }
  const many = (step as { anyInstance?: boolean }).anyInstance === true;

  /*
    A lesson about an affordance this screen does not have is not measured
    here. The More sheet is a phone arrangement; asserting a halo for it on a
    desktop would be asserting that the product should invent one.
  */
  if (step.formFactor === "phone" && (await b.evaluate<number>("return innerWidth;")) >= 768) {
    return;
  }

  await settleOnStep(step.anchor ?? null);

  /*
    A lesson that has given up looking is not a geometry failure — it is the
    designed outcome when a subject cannot exist on this layout, and the More
    sheet genuinely does not exist on a desktop. Measuring a halo it never drew
    would report the fallback as a bug. What is worth asserting is that the
    member can still read it and still get out, and worth *printing* is which
    lessons degraded where, because that is a product fact rather than a pass.
  */
  const gaveUp = await b.evaluate<boolean>(
    `return !!document.querySelector('[data-testid="button-tour-continue-degraded"]');`,
  );
  if (gaveUp) {
    /* With the reason, because "terrain degraded" and "terrain degraded
       because Home had not finished loading" are different bug reports and
       the first one cost two runs to tell apart. */
    const why = await b.evaluate<string>(`
      const els = [...document.querySelectorAll('[data-tour-id=${JSON.stringify(step.anchor ?? "")}]')];
      if (!els.length) return "no element carries the anchor";
      const r = els[0].getBoundingClientRect();
      const cs = getComputedStyle(els[0]);
      return els.length + " present, first " + Math.round(r.width) + "x" + Math.round(r.height) +
        " at " + Math.round(r.top) + ", display " + cs.display + ", visibility " + cs.visibility;
    `).catch(() => "unknown");
    degraded.push(step.formFactor ? `${step.id} (not on this form factor)` : `${step.id} [${why}]`);
    const w = await b.evaluate<Snap>(SNAP(null, null, false));
    check(`[${label}] ${step.id}: a degraded lesson is still readable`, !!w.panel);
    return;
  }
  const w = await b.evaluate<Snap>(SNAP(step.anchor ?? null, null, many));
  if (!w.mounted) {
    check(`[${label}] ${step.id}: the overlay is still mounted`, false);
    return;
  }
  const vw = w.viewport;

  check(`[${label}] ${step.id}: the panel is inside the viewport`,
    !!w.panel && w.panel.x >= -0.5 && w.panel.y >= -0.5 &&
      w.panel.x + w.panel.width <= vw.width + 0.5 && w.panel.y + w.panel.height <= vw.height + 0.5,
    JSON.stringify(w.panel));

  if (!step.anchor) {
    check(`[${label}] ${step.id}: an unanchored step draws no halo`, w.halo === null);
    return;
  }

  const t = w.target!;
  check(`[${label}] ${step.id}: the anchor exists`, t.total > 0, `${step.anchor}`);

  /*
    A step that says it accepts any of several like controls is not ambiguous
    — the nine body territories are nine right answers. Every other step still
    has to resolve to exactly one, which is the condition the resolver refuses
    to guess at.
  */
  check(`[${label}] ${step.id}: ${many ? "at least one instance is on screen" : "exactly one visible instance"}`,
    many ? t.matching >= 1 : t.matching === 1,
    `${t.matching} matching of ${t.visible} visible, ${t.total} total`);

  if (!t.rect) return;
  const target = t.rect;

  check(`[${label}] ${step.id}: the target is on screen`,
    target.y >= -0.5 && target.y + target.height <= vw.height + 0.5 &&
      target.x >= -0.5 && target.x + target.width <= vw.width + 0.5,
    JSON.stringify(target));

  if (w.halo) {
    check(`[${label}] ${step.id}: the halo contains the target`,
      w.halo.x <= target.x + 0.5 && w.halo.y <= target.y + 0.5 &&
        w.halo.x + w.halo.width >= target.x + target.width - 0.5 &&
        w.halo.y + w.halo.height >= target.y + target.height - 0.5,
      `target ${JSON.stringify(target)} halo ${JSON.stringify(w.halo)}`);

    /*
      Two promises, not one.

      Most controls get eight pixels of breathing room. The six primary
      navigation cells and the role tiles get none, because they sit shoulder
      to shoulder in a full-width bar: padding there reaches into both
      neighbours and past the screen edge at the ends. Asserted from the same
      rule the overlay uses rather than a flat constant, so a halo that is
      quietly the wrong size for its kind still fails.
    */
    const hugs = /^(nav|role)-[a-z]+$/.test(step.anchor ?? "");
    const pad = hugs ? 0 : PAD;
    /*
      The promise, stated exactly: the target plus its padding, clipped to the
      screen. Not "plus sixteen pixels" — the Settings row opens flush against
      the top of the More sheet, so its ring genuinely has nowhere to go
      upwards, and a halo drawn off-screen would be worse than a tight one.
      Comparing against the clamped rectangle is what lets this assert the edge
      cases instead of excusing them.
    */
    const want = {
      x: Math.max(0, target.x - pad),
      y: Math.max(0, target.y - pad),
      right: Math.min(vw.width, target.x + target.width + pad),
      bottom: Math.min(vw.height, target.y + target.height + pad),
    };
    const wantW = want.right - want.x;
    const wantH = want.bottom - want.y;
    check(`[${label}] ${step.id}: with the padding the overlay promises`,
      Math.abs(w.halo.width - wantW) < 1 && Math.abs(w.halo.height - wantH) < 1,
      `${hugs ? "hugging" : `${PAD}px`}: halo ${w.halo.width}×${w.halo.height}, expected ${wantW}×${wantH} ` +
        `for target ${target.width}×${target.height}`);

    check(`[${label}] ${step.id}: a halo is never drawn off the screen`,
      w.halo.x >= -0.5 && w.halo.y >= -0.5 &&
        w.halo.x + w.halo.width <= vw.width + 0.5 &&
        w.halo.y + w.halo.height <= vw.height + 0.5,
      `halo ${JSON.stringify(w.halo)} in ${vw.width}×${vw.height}`);

    const hc = centre(w.halo);
    check(`[${label}] ${step.id}: centres agree`,
      Math.abs((want.x + wantW / 2) - hc.x) <= CENTRE_TOLERANCE &&
        Math.abs((want.y + wantH / 2) - hc.y) <= CENTRE_TOLERANCE,
      `off by ${((want.x + wantW / 2) - hc.x).toFixed(2)}, ${((want.y + wantH / 2) - hc.y).toFixed(2)}` +
        ` — target ${JSON.stringify(target)} halo ${JSON.stringify(w.halo)} viewport ${vw.width}×${vw.height}`);
  } else {
    check(`[${label}] ${step.id}: an anchored step draws a halo`, false, "no halo");
  }

  /*
    What the panel may sit on.

    "The panel does not overlap the target" is the right rule for a lesson
    asking for a press, and the wrong one for a lesson pointing at a card
    taller than the screen — Build's day card is 505px on a 780px phone, and no
    honest layout puts a dialogue anywhere that touches none of it. So the
    strict rule applies where a finger has to land, and everywhere else the
    requirement is that a useful part of the subject stays visible.
  */
  if (w.panel) {
    const mustTap = step.advance.kind === "tap" || step.advance.kind === "present";
    if (mustTap) {
      check(`[${label}] ${step.id}: the panel does not cover the control to press`,
        !overlaps(w.panel, target),
        `panel ${JSON.stringify(w.panel)} target ${JSON.stringify(target)}`);
    } else {
      const covered = Math.max(0, Math.min(w.panel.y + w.panel.height, target.y + target.height) - Math.max(w.panel.y, target.y));
      check(`[${label}] ${step.id}: enough of the subject stays visible`,
        target.height - covered >= Math.min(64, target.height * 0.4),
        `${Math.round(covered)} of ${Math.round(target.height)}px covered`);
    }
  }

  /*
    The measurement none of the rest can substitute for. The overlay's own
    container is `fixed inset-0`, which is a hit target as much as it is a
    drawing surface — a version of it that forgot `pointer-events-none`
    highlighted every control perfectly and let a member touch none of them.
    Geometry said pass; the product was unusable.
  */
  check(`[${label}] ${step.id}: a finger reaches the target`, w.hit?.reaches === true,
    `the top element at the target's centre is ${w.hit?.top ?? "nothing"}`);
}

/*
  Warm the dashboard before the first drive is timed.

  Terrain is computed, not stored, and the first request after a cold server
  takes several seconds. The driver's patience is a member's patience, so a
  cold first read looked like `terrain-now never appeared for this member` —
  a finding about the fixture rather than the product. Once is enough; the
  three drives after it were always green.
*/
await b.goto(`${BASE}/member`);
try {
  await b.waitFor(`!!document.querySelector('[data-tour-id="terrain-now"]')`, "Terrain's first read", 45_000);
} catch {
  check("Terrain renders for the QA member at all", false, "terrain-now never appeared");
}

for (const vp of VIEWPORTS) {
  await b.viewport(vp.w, vp.h, vp.mobile);
  await restartTour();

  const driver = new TourDriver(b);
  const seen: string[] = [];
  const degraded: string[] = [];
  /*
    Lessons the walkthrough itself moved past.

    A skipped step is never a step anybody stops on, so the harness cannot
    observe it — and counting it as unmeasured reports a hole that is really
    the product deciding, correctly, that it had nothing to teach here.
  */
  const skipped: string[] = [];
  for (let i = 0; i < steps.length + 6; i++) {
    const at = await driver.stepId();
    if (!at) break;
    seen.push(at);
    await measure(vp.name, at, degraded);
    await b.screenshot(`${SHOTS}/${vp.name}-${at}.png`);
    let t;
    try {
      t = await driver.step();
    } catch (err) {
      check(`[${vp.name}] the walkthrough can be driven to the end`, false,
        `stopped at ${at}: ${(err as Error).message}`);
      break;
    }
    if (t.nextActual) {
      const from = steps.findIndex((s) => s.id === at);
      const to = steps.findIndex((s) => s.id === t.nextActual);
      if (from >= 0 && to > from + 1) {
        for (const s of steps.slice(from + 1, to)) skipped.push(s.id);
      }
    }
    if (!t.nextActual) break;
  }

  /*
    Coverage is asserted rather than assumed. A drive that quietly stopped at
    step four would otherwise report four passes and no failures, which is the
    shape of a green run that measured nothing — the exact failure this whole
    section was rewritten to fix.
  */
  const anchoredSeen = seen.filter((id) => steps.find((s) => s.id === id)?.anchor).length;
  console.log(
    `  ${vp.name}: ${seen.length} lessons, ${anchoredSeen} anchored` +
      (degraded.length ? `, ${degraded.length} degraded (${degraded.join(", ")})` : ""),
  );

  /*
    The denominator is not 26.

    Some lessons complete themselves — `home` is satisfied by the member
    already being on Home — so they are never a step anybody stops on, and the
    harness cannot observe one that resolves during the read pause. Counting
    them as missed reports a failure on a walkthrough that worked.

    What is worth asserting is that nothing anchored was skipped, and that the
    drive ended at the end rather than somewhere in the middle.
  */
  /*
    A lesson about the More sheet has nothing to teach on a screen that has no
    More sheet. Not measured there, and not missing either: the release report
    has to be able to say "not applicable on this form factor" without that
    reading as a hole in the coverage.
  */
  const wide = vp.w >= 768;
  const missed = steps
    .filter(
      (s) =>
        s.anchor &&
        !seen.includes(s.id) &&
        !skipped.includes(s.id) &&
        !(wide && s.formFactor === "phone"),
    )
    .map((s) => s.id);
  if (skipped.length) console.log(`  ${vp.name}: ${skipped.length} skipped (${skipped.join(", ")})`);
  const inapplicable = steps.filter((s) => wide && s.formFactor === "phone").map((s) => s.id);
  if (inapplicable.length) {
    console.log(`  ${vp.name}: ${inapplicable.length} lesson(s) not applicable here (${inapplicable.join(", ")})`);
  }
  const unexpected = degraded.filter((d) => !d.includes("not on this form factor"));
  check(`[${vp.name}] no lesson degraded unexpectedly`, unexpected.length === 0, unexpected.join(", "));
  check(`[${vp.name}] every anchored lesson was measured`, missed.length === 0, missed.join(", "));
  check(`[${vp.name}] the drive reached the last lesson`,
    seen[seen.length - 1] === steps[steps.length - 1].id,
    `stopped at ${seen[seen.length - 1]}`);
}

// ─── Both atmospheres ────────────────────────────────────────────────────

await b.viewport(393, 852, true);
await restartTour();
for (const theme of ["dark", "light"]) {
  await b.evaluate(`document.documentElement.dataset.theme = ${JSON.stringify(theme)}; return true;`);
  await b.settle();
  await b.settle();
  const w = await b.evaluate<World>(WORLD);
  check(`the overlay resolves in ${theme}`, w.theme === theme && w.mounted, `${w.theme}`);
  check(`and still draws its panel in ${theme}`, !!w.panel);
  await b.screenshot(`${SHOTS}/theme-${theme}-${w.stepId}.png`);
}
await b.evaluate(`document.documentElement.dataset.theme = "dark"; return true;`);

// ─── A lesson that loses its target must not seal the screen ─────────────

/*
  The regression for the picker. A lesson points at "Add movement"; the member
  taps it; the control is replaced by the chooser the lesson is waiting for —
  so the step now has no target, and the overlay falls back to covering the
  whole screen. That fallback was `pointer-events: auto`, so the walkthrough
  blocked the one action it had just asked for and the lesson could never be
  completed.

  Reproduced here by taking the anchor away from the live document rather than
  by driving twelve lessons to the workout: the overlay re-resolves every
  frame, so removing the attribute puts it in exactly the no-target state, and
  the assertion is the one that matters — something underneath is still
  touchable.
*/
{
  await restartTour();
  const driver = new TourDriver(b);
  let anchored: string | null = null;
  for (let i = 0; i < steps.length; i++) {
    const at = await driver.stepId();
    if (!at) break;
    const step = steps.find((s) => s.id === at);
    if (step?.anchor) { await settleOnStep(step.anchor); anchored = at; break; }
    const t = await driver.step();
    if (!t.nextActual) break;
  }

  if (!anchored) {
    check("an anchored lesson was reached to take the anchor from", false);
  } else {
    const anchor = steps.find((s) => s.id === anchored)!.anchor!;
    const before = await b.evaluate<{ x: number; y: number } | null>(`
      const el = document.querySelector('[data-tour-id=${JSON.stringify(anchor)}]');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    `);
    await b.evaluate(`
      for (const el of document.querySelectorAll('[data-tour-id=${JSON.stringify(anchor)}]')) {
        el.removeAttribute("data-tour-id");
      }
      return true;
    `);
    /* Two frames for the overlay to notice, then the question. */
    await b.evaluate(`return new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(true))));`);

    const w = await b.evaluate<World>(WORLD);
    check("a lesson whose target vanishes draws no halo", w.halo === null, JSON.stringify(w.halo));
    check("and stays on the same lesson rather than skipping it", w.stepId === anchored,
      `${anchored} → ${w.stepId}`);

    const under = await b.evaluate<{ top: string; blocked: boolean }>(`
      const el = document.elementFromPoint(${before!.x}, ${before!.y});
      return {
        top: el ? (el.getAttribute("data-testid") ?? el.tagName) : "none",
        blocked: !!el?.closest('[data-testid="tour-overlay"]'),
      };
    `);
    /*
      The panel is not the scrim.

      This probed the vanished target's old centre and called any overlay
      element blocking — including the dialogue panel, which is meant to be
      interactive and has to sit somewhere. It passed for one reason: the panel
      defaulted to the bottom whenever there was no target, and the probe point
      happened to be higher up. The moment the panel kept the side it was
      already on, a correct overlay started failing a check about a different
      part of it.
    */
    check("and the screen underneath is still touchable", !under.blocked || under.top === "tour-panel-dock",
      `the top element is ${under.top}`);
  }
}

// ─── One gesture is one lesson ───────────────────────────────────────────

/*
  Not "one tap moves the index by one". Some lessons complete themselves the
  moment they open — `home` is satisfied by the member already being on Home —
  so a single deliberate tap legitimately lands two indices later, and an
  assertion counting indices calls the correct product broken. It did.

  The invariant a member actually has is differential: *a double tap must do
  no more than a single tap*. So the same starting lesson is played twice, and
  the two have to end in the same place.
*/
async function tapContinue(times: number): Promise<string | null> {
  await restartTour();
  /* Past the ghost window — the overlay ignores a press that arrives before
     its control has plausibly been seen, and the harness is not exempt. */
  await b.evaluate(`return new Promise(r => setTimeout(() => r(true), 400));`);
  const cont = await b.evaluate<Rect | null>(`
    const el = document.querySelector('[data-testid="button-tour-continue"]');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  `);
  if (!cont) return null;
  const c = centre(cont);
  for (let i = 0; i < times; i++) await b.clickAt(c.x, c.y);
  await b.settle();
  await b.evaluate(`return new Promise(r => setTimeout(() => r(true), 600));`);
  return (await b.evaluate<World>(WORLD)).stepId ?? null;
}

{
  const once = await tapContinue(1);
  const twice = await tapContinue(2);
  check("the first lesson offers Continue", once !== null, "no continue button");
  check("Continue advances the walkthrough",
    once !== null && once !== steps[0].id, `${steps[0].id} → ${once}`);
  check("and a double tap does no more than a single tap", once === twice,
    `one tap → ${once}, two taps → ${twice}`);
}

console.log(`  shots in ${SHOTS}\n`);
await b.close();

if (failures.length) {
  console.error("✗ walkthrough QA\n");
  for (const f of failures) console.error(`    ${f}`);
  console.error("");
  process.exit(1);
}
console.log(`✓ ${passed} walkthrough assertions passed\n`);
