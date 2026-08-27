/**
 * Can a member in daylight read the app.
 *
 * ── Why the grep was not enough ───────────────────────────────────────────
 *
 * `test-theme-leak.ts` finds absolute colour in source, and it found all
 * eighty-one. What it cannot see is the result: a token that flips the wrong
 * way, a card whose ground moved while its text did not, a `dark:` variant
 * left behind on a selector that no longer matches. Those all read as clean
 * source and render as invisible text.
 *
 * So this asks the browser. For every visible run of text on every surface,
 * in both atmospheres: what colour is it, what is actually behind it, and can
 * the two be told apart.
 *
 * ── Why the threshold is 2.0 and not 4.5 ──────────────────────────────────
 *
 * WCAG AA is 4.5:1 for body text, and the app would fail it in places on
 * purpose — the muted captions under a heading are quiet by design, and a
 * harness that reports those every run is a harness that gets muted itself.
 *
 * What this is for is the catastrophic case, which is not a near miss. White
 * on limestone is 1.1:1. Ink on ink is 1.0:1. Anything above 2.0 is legible
 * even if it is not beautiful, and anything below it is a member looking at a
 * blank card. Reporting only that keeps every failure real.
 *
 * ── What counts as behind ─────────────────────────────────────────────────
 *
 * The nearest ancestor with a non-transparent background, composited down
 * through any translucent ones on the way — which is the whole point on a
 * `bg-raise` card, whose own background is three per cent of something. An
 * element over an image is skipped rather than guessed at: the harness cannot
 * sample a photograph, and reporting a number it made up would be worse than
 * reporting nothing.
 */

import { Browser } from "./cdp.js";
import { Portal, ALL_SECTIONS } from "./portal.js";

const BASE = process.env.SAKRED_QA_BASE ?? "http://127.0.0.1:5199";
/** Below this, the text is not quiet — it is gone. */
const FLOOR = 2.0;
const SELFTEST = process.argv.includes("--selftest");

let passed = 0;
const failures: string[] = [];
function check(name: string, ok: boolean, detail = "") {
  if (ok) passed++;
  else failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
}

/**
 * Run in the page. Returns the worst offenders, not every element — a screen
 * with one broken card has one bug, and printing four hundred rows hides it.
 */
const MEASURE = `
  const parse = (c) => {
    const m = /rgba?\\(([^)]+)\\)/.exec(c);
    if (!m) return null;
    const p = m[1].split(/[,\\s/]+/).filter(Boolean).map(Number);
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  const lum = ({ r, g, b }) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const over = (fg, bg) => ({
    r: fg.r * fg.a + bg.r * (1 - fg.a),
    g: fg.g * fg.a + bg.g * (1 - fg.a),
    b: fg.b * fg.a + bg.b * (1 - fg.a),
    a: 1,
  });
  const ratio = (a, b) => {
    const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
    return (x + 0.05) / (y + 0.05);
  };

  /* Down through every translucent layer to the first opaque one. An element
     whose own background is 3% of white is only readable because of what is
     under it, so stopping at the first non-"transparent" value would compare
     the text against a colour nothing is actually painting. */
  const groundOf = (el) => {
    const stack = [];
    for (let n = el; n; n = n.parentElement) {
      const s = getComputedStyle(n);
      if (s.backgroundImage && s.backgroundImage !== "none") return { image: true };
      const c = parse(s.backgroundColor);
      if (!c || c.a === 0) continue;
      stack.push(c);
      if (c.a === 1) {
        let ground = stack.pop();
        while (stack.length) ground = over(stack.pop(), ground);
        return { colour: ground };
      }
    }
    return { colour: { r: 255, g: 255, b: 255, a: 1 } };
  };

  const out = [];
  let measured = 0;
  for (const el of document.querySelectorAll("body *")) {
    if (el.children.length && ![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
    const text = (el.textContent ?? "").trim();
    if (!text) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) continue;
    if (r.bottom < 0 || r.top > innerHeight * 3) continue;
    const s = getComputedStyle(el);
    if (s.visibility === "hidden" || s.display === "none") continue;
    if (Number(s.opacity) < 0.15) continue;
    const fg = parse(s.color);
    if (!fg || fg.a === 0) continue;
    const g = groundOf(el);
    if (g.image) continue;
    measured++;
    const ratioValue = ratio(over(fg, g.colour), g.colour);
    if (ratioValue < ${FLOOR}) {
      out.push({
        text: text.slice(0, 40),
        ratio: Math.round(ratioValue * 100) / 100,
        colour: s.color,
        tag: el.tagName.toLowerCase(),
        cls: (el.className && el.className.baseVal !== undefined ? el.className.baseVal : String(el.className || "")).slice(0, 70),
      });
    }
  }
  out.sort((a, b) => a.ratio - b.ratio);
  return { unreadable: out.slice(0, 6), total: out.length, measured };
`;

const b = new Browser();
await b.launch();
await b.headers({ "X-Forwarded-Proto": "https" });
await b.viewport(393, 852);

const portal = new Portal(b, BASE);
await portal.login();
await portal.dismissTour();

type Row = { text: string; ratio: number; colour: string; tag: string; cls: string };
const worst: { where: string; row: Row }[] = [];
let surfaces = 0;

for (const theme of ["dark", "light"] as const) {
  await b.evaluate(
    `document.documentElement.setAttribute("data-theme", ${JSON.stringify(theme)}); return true;`,
  );

  for (const id of ALL_SECTIONS) {
    const opened = await portal.openSection(id);
    check(`${id} opens (${theme})`, opened);
    if (!opened) continue;
    await portal.awaitSection(id);
    // Mounted is not rendered — several tabs are still fetching at that point.
    await portal.settleText();
    surfaces++;

    if (SELFTEST && theme === "light" && id === "home") {
      // A planted failure, to prove the measurement can produce one. Text set
      // to the ground it is standing on — the exact shape of the bug the
      // whole Light pass was about.
      await b.evaluate(`
        const h = document.querySelector("h1, h2, h3");
        if (h) { h.style.color = getComputedStyle(document.body).backgroundColor; }
        return true;
      `);
    }

    const { unreadable, total, measured } = await b.evaluate<{
      unreadable: Row[];
      total: number;
      measured: number;
    }>(MEASURE);
    /* A surface with nothing to measure passes for the wrong reason — a sheet
       that never opened, a section that rendered its skeleton. */
    check(`${id} had text to read (${theme})`, measured >= 8, `${measured} runs of text`);
    check(
      `${id} is readable in ${theme}`,
      total === 0,
      unreadable.map((u) => `"${u.text}" ${u.ratio}:1 ${u.colour} <${u.tag} class="${u.cls}">`).join(" · "),
    );
    for (const row of unreadable) worst.push({ where: `${id} (${theme})`, row });
  }
}

await b.close();

/*
  A measurement that never fires is not a guarantee. If the walk found nothing
  to measure — a selector change, a login that silently landed somewhere else
  — every surface above passes for the wrong reason.
*/
check(
  "both atmospheres were actually crawled",
  surfaces === ALL_SECTIONS.length * 2,
  `${surfaces} of ${ALL_SECTIONS.length * 2}`,
);

if (failures.length) {
  console.error("\n✗ contrast\n");
  for (const f of failures) console.error(`    ${f}`);
  console.error("");
  process.exit(1);
}
console.log(`✓ ${passed} contrast assertions passed across ${surfaces} surfaces, nothing below ${FLOOR}:1`);
