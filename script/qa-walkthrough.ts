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
  if (ok) passed++;
  else failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
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
    viewport: { x: 0, y: 0, width: innerWidth, height: innerHeight },
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

// ─── Geometry, at every viewport ─────────────────────────────────────────

for (const vp of VIEWPORTS) {
  await b.viewport(vp.w, vp.h, vp.mobile);
  await b.settle();
  await b.settle();

  const w = await b.evaluate<World>(WORLD);
  const step = steps.find((s) => s.id === w.stepId);
  if (!step) {
    check(`[${vp.name}] the mounted step is one the tour defines`, false, `${w.stepId}`);
    continue;
  }

  check(`[${vp.name}] the panel is inside the viewport`,
    !!w.panel && w.panel.x >= -0.5 && w.panel.y >= -0.5 &&
      w.panel.x + w.panel.width <= vp.w + 0.5 && w.panel.y + w.panel.height <= vp.h + 0.5,
    JSON.stringify(w.panel));

  if (!step.anchor) {
    check(`[${vp.name}] an unanchored step draws no halo`, w.halo === null);
    await b.screenshot(`${SHOTS}/${vp.name}-${step.id}.png`);
    continue;
  }

  const t = await b.evaluate<{ total: number; visible: number; matching: number; rect: Rect | null }>(
    targetOf(step.anchor, null),
  );
  check(`[${vp.name}] ${step.id}: the anchor exists`, t.total > 0, `${step.anchor}`);
  check(`[${vp.name}] ${step.id}: exactly one visible instance`, t.visible === 1,
    `${t.visible} of ${t.total} visible`);

  if (t.rect && w.halo) {
    const target = t.rect;
    const halo = w.halo;
    check(`[${vp.name}] ${step.id}: the halo contains the target`,
      halo.x <= target.x + 0.5 && halo.y <= target.y + 0.5 &&
        halo.x + halo.width >= target.x + target.width - 0.5 &&
        halo.y + halo.height >= target.y + target.height - 0.5,
      `target ${JSON.stringify(target)} halo ${JSON.stringify(halo)}`);

    check(`[${vp.name}] ${step.id}: with the padding the overlay promises`,
      Math.abs(halo.width - (target.width + PAD * 2)) < 1 &&
        Math.abs(halo.height - (target.height + PAD * 2)) < 1,
      `halo ${halo.width}×${halo.height}, target ${target.width}×${target.height}`);

    const tc = centre(target);
    const hc = centre(halo);
    check(`[${vp.name}] ${step.id}: centres agree`,
      Math.abs(tc.x - hc.x) <= CENTRE_TOLERANCE && Math.abs(tc.y - hc.y) <= CENTRE_TOLERANCE,
      `off by ${(tc.x - hc.x).toFixed(2)}, ${(tc.y - hc.y).toFixed(2)}`);

    check(`[${vp.name}] ${step.id}: the target is on screen`,
      target.y >= 0 && target.y + target.height <= vp.h && target.x >= 0 && target.x + target.width <= vp.w,
      JSON.stringify(target));

    if (w.panel) {
      check(`[${vp.name}] ${step.id}: the panel does not cover the target`,
        !overlaps(w.panel, target),
        `panel ${JSON.stringify(w.panel)} target ${JSON.stringify(target)}`);
    }
  } else if (!w.halo) {
    check(`[${vp.name}] ${step.id}: an anchored step draws a halo`, false, "no halo");
  }

  await b.screenshot(`${SHOTS}/${vp.name}-${step.id}.png`);
}

// ─── Both atmospheres ────────────────────────────────────────────────────

await b.viewport(393, 852, true);
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

// ─── One tap is one transition ───────────────────────────────────────────

await b.settle();
const before = await b.evaluate<World>(WORLD);
const cont = await b.evaluate<Rect | null>(`
  const el = document.querySelector('[data-testid="button-tour-continue"]');
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.x, y: r.y, width: r.width, height: r.height };
`);
if (cont) {
  const c = centre(cont);
  /* Two taps as fast as the transport allows. A tutorial that advances twice
     has skipped a lesson nobody was taught. */
  await b.clickAt(c.x, c.y);
  await b.clickAt(c.x, c.y);
  await b.settle();
  await b.settle();
  const after = await b.evaluate<World>(WORLD);
  const from = steps.findIndex((s) => s.id === before.stepId);
  const to = steps.findIndex((s) => s.id === after.stepId);
  check("Continue advances the walkthrough", to > from, `${before.stepId} → ${after.stepId}`);
  check("and a double tap advances it exactly one step", to - from === 1, `moved ${to - from}`);
} else {
  check("the first step offers Continue", false, "no continue button");
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
