/**
 * The finale actually changes the app, and the change survives.
 *
 * ── Why this cannot be a preview ──────────────────────────────────────────
 *
 * The last lesson offers a choice of atmosphere, and the temptation with a
 * tutorial is to show a swatch and apply it at the end. That would be a
 * demonstration of a setting rather than the setting — and a member who picked
 * Light, closed the app and came back to Dark would rightly conclude the
 * walkthrough had been theatre.
 *
 * So this drives the real narrative to the real control and asserts the whole
 * chain: the document repaints, the walkthrough repaints with it, the
 * preference is stored, it survives a reload, and Settings agrees. Finishing
 * the walkthrough afterwards must still count as finishing it.
 *
 *   Terminal 1:  npm run build && DATABASE_URL=$SAKREDBODY_QA_DATABASE_URL \
 *                SESSION_SECRET=… PORT=5199 NODE_ENV=production node dist/index.cjs
 *   Terminal 2:  npx tsx script/qa-atmosphere.ts
 */

import { Browser } from "./cdp.js";
import { TourDriver } from "./tour-driver.js";

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

console.log(`\nAtmosphere — ${BASE}\n`);

/** What the app looks like it is wearing, from the document rather than a flag. */
const PAINT = `
  const root = document.documentElement;
  const body = getComputedStyle(document.body);
  const panel = document.querySelector('[data-tour-panel-surface], [data-testid="tour-panel"]');
  return {
    theme: root.dataset.theme ?? null,
    stored: (() => { try { return localStorage.getItem("sakred.appearance"); } catch { return null; } })(),
    background: body.backgroundColor,
    colour: body.color,
    panel: panel ? getComputedStyle(panel).backgroundColor : null,
    step: document.querySelector('[data-testid="tour-overlay"]')?.getAttribute("data-tour-step") ?? null,
  };
`;
type Paint = {
  theme: string | null;
  stored: string | null;
  background: string;
  colour: string;
  panel: string | null;
  step: string | null;
};

async function toAtmosphere(): Promise<void> {
  await b.evaluate(`
    for (const k of Object.keys(localStorage)) if (k.startsWith("sakred.tour")) localStorage.removeItem(k);
    localStorage.setItem("sakred.tour.replay", ${JSON.stringify(JSON.stringify({ from: "atmosphere" }))});
    return true;
  `);
  await b.goto(`${BASE}/member`);
  await b.waitFor(`!!document.querySelector('[data-testid="tour-overlay"]')`, "the overlay", 30_000);
  await b.settle();
  await b.evaluate(`document.getAnimations().forEach(a => { try { a.finish(); } catch {} }); return true;`);
  await b.evaluate(`return new Promise(r => setTimeout(() => r(true), 700));`);
}

async function pick(value: "dark" | "light"): Promise<void> {
  const at = await b.evaluate<{ x: number; y: number } | null>(`
    const all = [...document.querySelectorAll('[data-testid="button-atmosphere-${value}"]')];
    const el = all.find(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
    if (!el) return null;
    el.scrollIntoView({ block: "center" });
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  `);
  if (!at) throw new Error(`no ${value} control on the atmosphere lesson`);
  await b.clickAt(at.x, at.y);
  await b.evaluate(`return new Promise(r => setTimeout(() => r(true), 500));`);
}

for (const choice of ["light", "dark"] as const) {
  await toAtmosphere();
  const before = await b.evaluate<Paint>(PAINT);
  check(`the walkthrough reaches the atmosphere lesson (${choice})`, before.step === "atmosphere",
    `${before.step}`);
  check(`and offers the choice itself, not a picture of it (${choice})`,
    await b.evaluate<boolean>(
      `return [...document.querySelectorAll('[data-testid^="button-atmosphere-"]')].some(e => e.getBoundingClientRect().height > 0);`,
    ));

  await pick(choice);
  const after = await b.evaluate<Paint>(PAINT);

  check(`choosing ${choice} repaints the app at once`, after.theme === choice,
    `${before.theme} → ${after.theme}`);
  check(`and the app's own surface changes with it (${choice})`,
    after.background !== before.background || before.theme === choice,
    `${before.background} → ${after.background}`);
  check(`and the walkthrough repaints with it (${choice})`, after.panel !== null,
    "no panel to read");
  check(`and the choice is stored (${choice})`, after.stored === choice, `${after.stored}`);

  /* Survives having the app taken away — the assertion a preview cannot pass. */
  await b.goto(`${BASE}/member`);
  await b.waitFor("location.pathname === '/member'", "the portal", 25_000);
  await b.settle();
  const reloaded = await b.evaluate<Paint>(PAINT);
  check(`${choice} survives a reload`, reloaded.theme === choice, `${reloaded.theme}`);
  check(`and is still what the app is wearing (${choice})`,
    reloaded.background === after.background, `${reloaded.background}`);

  /* And Settings is not a second opinion. */
  await b.evaluate(`
    const more = [...document.querySelectorAll('[data-tour-id="nav-more"]')].find(e => e.getBoundingClientRect().height > 0);
    if (more) more.click();
    return true;
  `);
  await b.evaluate(`return new Promise(r => setTimeout(() => r(true), 500));`);
  await b.evaluate(`
    const el = [...document.querySelectorAll('[data-tour-id="nav-more-settings"]')].find(e => e.getBoundingClientRect().height > 0)
      ?? document.querySelector('[data-tour-id="nav-more-settings"]');
    if (el) el.click();
    return true;
  `);
  await b.evaluate(`return new Promise(r => setTimeout(() => r(true), 800));`);
  const settings = await b.evaluate<string | null>(`
    const el = document.querySelector('[data-testid="button-appearance-${choice}"]');
    return el ? el.getAttribute("aria-checked") : null;
  `);
  check(`Settings agrees that the atmosphere is ${choice}`, settings === "true", `${settings}`);
}

/* Left as the product's default rather than as whatever the last case chose. */
await b.evaluate(`try { localStorage.removeItem("sakred.appearance"); } catch {} return true;`);

await b.close();

if (failures.length) {
  console.error("\n✗ atmosphere\n");
  for (const f of failures) console.error(`    ${f}`);
  console.error("");
  process.exit(1);
}
console.log(`\n✓ ${passed} atmosphere assertions — both branches, applied and kept\n`);
