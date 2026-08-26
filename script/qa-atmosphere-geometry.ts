/**
 * The two atmosphere cards are one control offered twice, so they are measured
 * against each other rather than described.
 *
 * A choice between two worlds should differ in exactly one respect — the world
 * — and any difference in the frames around them reads as one option being
 * more finished than the other. The descriptors are different lengths ("Night ·
 * Ink · Constellation" against "Day · Oak · Celestial"), so at some widths one
 * wraps and the other does not, and the card that wraps gets taller.
 */
import { Browser } from "./cdp.js";
import { TourDriver } from "./tour-driver.js";

const BASE = process.env.SAKRED_QA_BASE ?? "http://127.0.0.1:5199";

/** Sub-pixel layout rounding. Anything above this is a visible difference. */
const TOLERANCE = 0.5;

type Box = { x: number; y: number; width: number; height: number };
type Card = { box: Box; art: Box; name: Box; line: Box; border: string; lines: number };

const WIDTHS = [360, 393, 430];
const failures: string[] = [];
const notes: string[] = [];
const check = (name: string, ok: boolean, detail = "") => {
  if (!ok) failures.push(detail ? `${name} — ${detail}` : name);
};

const READ = `
  const cards = {};
  for (const el of document.querySelectorAll('[data-tour-id="atmosphere-choice"]')) {
    const which = el.getAttribute("data-tour-instance");
    const box = el.getBoundingClientRect();
    const art = el.querySelector("svg").getBoundingClientRect();
    const rows = el.querySelectorAll("[data-testid$='-name'], [data-testid$='-line']");
    const name = el.querySelector("[data-testid$='-name']").getBoundingClientRect();
    const line = el.querySelector("[data-testid$='-line']").getBoundingClientRect();
    const style = getComputedStyle(el);
    cards[which] = {
      box: { x: box.x, y: box.y, width: box.width, height: box.height },
      art: { x: art.x, y: art.y, width: art.width, height: art.height },
      name: { x: name.x, y: name.y, width: name.width, height: name.height },
      line: { x: line.x, y: line.y, width: line.width, height: line.height },
      border: style.borderTopWidth + " " + style.borderStyle,
      lines: Math.round(line.height / parseFloat(getComputedStyle(el.querySelector("[data-testid$='-line']")).lineHeight)),
    };
  }
  return cards;
`;

const b = new Browser();
await b.launch();
await b.headers({ "X-Forwarded-Proto": "https" });

for (const width of WIDTHS) {
  await b.viewport(width, 852);
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
  await b.evaluate(`for (const k of Object.keys(localStorage)) if (k.startsWith("sakred.tour")) localStorage.removeItem(k); return true;`);
  await b.goto(`${BASE}/member?tour=replay`);
  await b.waitFor(`!!document.querySelector('[data-testid="tour-overlay"]')`, "overlay", 25_000);
  await b.settle();

  const driver = new TourDriver(b);
  await driver.driveUntil("atmosphere");
  await b.waitFor(`document.querySelectorAll('[data-tour-id="atmosphere-choice"]').length === 2`, "both cards", 15_000);
  await b.settle();

  for (const theme of ["dark", "light"] as const) {
    /* Measured in both atmospheres, because choosing one re-themes the whole
       application underneath the cards — including the cards. */
    await b.evaluate(`document.documentElement.setAttribute("data-theme", ${JSON.stringify(theme)}); return true;`);
    await b.settle();
    const cards = await b.evaluate<Record<string, Card>>(READ);
    const at = `${width}/${theme}`;
    const d = cards.dark;
    const l = cards.light;
    if (!d || !l) {
      check(`[${at}] both cards are on screen`, false, `found ${Object.keys(cards).join(", ") || "none"}`);
      continue;
    }

    /*
      Widths are compared only where they are a frame decision. A title is a
      word — "Dark" is narrower than "Light" and always will be — so asserting
      the two spans match is asserting the two options have the same name.
    */
    for (const [what, a, c, sameWidth] of [
      ["card", d.box, l.box, true],
      ["artwork frame", d.art, l.art, true],
      ["title row", d.name, l.name, false],
      ["descriptor row", d.line, l.line, false],
    ] as const) {
      if (sameWidth) {
        check(`[${at}] the two ${what}s are the same width`,
          Math.abs(a.width - c.width) <= TOLERANCE, `${a.width} vs ${c.width}`);
      }
      check(`[${at}] the two ${what}s are the same height`,
        Math.abs(a.height - c.height) <= TOLERANCE, `${a.height} vs ${c.height}`);
      check(`[${at}] the two ${what}s sit at the same height on the row`,
        Math.abs((a.y - d.box.y) - (c.y - l.box.y)) <= TOLERANCE,
        `${(a.y - d.box.y).toFixed(1)} vs ${(c.y - l.box.y).toFixed(1)} from the card's top`);
    }

    check(`[${at}] the artwork keeps the same aspect ratio in both`,
      Math.abs(d.art.width / d.art.height - l.art.width / l.art.height) <= 0.01,
      `${(d.art.width / d.art.height).toFixed(3)} vs ${(l.art.width / l.art.height).toFixed(3)}`);

    check(`[${at}] the borders are the same thickness`, d.border === l.border, `${d.border} vs ${l.border}`);

    notes.push(`${at}: ${d.box.width.toFixed(0)}×${d.box.height.toFixed(0)}, art ${d.art.height.toFixed(0)}px, descriptor ${d.line.height.toFixed(0)}px`);

    /* Selecting must not resize anything. A card that grows when chosen makes
       the other one look like it shrank away from the decision. */
    const before = JSON.stringify([d.box.width, d.box.height, l.box.width, l.box.height]);
    await b.evaluate(`document.querySelector('[data-testid="button-atmosphere-light"]').click(); return true;`);
    await b.settle();
    await b.evaluate(`document.documentElement.setAttribute("data-theme", ${JSON.stringify(theme)}); return true;`);
    await b.settle();
    const after = await b.evaluate<Record<string, Card>>(READ);
    check(`[${at}] choosing does not change either card's size`,
      JSON.stringify([after.dark.box.width, after.dark.box.height, after.light.box.width, after.light.box.height]) === before,
      `${before} → ${JSON.stringify([after.dark.box.width, after.dark.box.height, after.light.box.width, after.light.box.height])}`);
  }
}

await b.close();

if (failures.length) {
  console.error("\n✗ atmosphere geometry\n");
  for (const f of failures) console.error(`    ${f}`);
  console.error("");
  process.exit(1);
}
console.log("\n✓ the two atmospheres are offered in identical frames");
for (const n of [...new Set(notes)]) console.log(`    ${n}`);
