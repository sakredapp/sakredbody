/**
 * Safari zooms the page when you tap a small box, and there is no way to ask it
 * not to.
 *
 * ── The rule, and why it cannot be worked around ──────────────────────────
 *
 * On iOS, focusing a form control whose *computed* font-size is under 16px
 * makes WebKit zoom the viewport to make it readable. It does not zoom back.
 * The member is left on a page wider than the screen, and the only things that
 * rescue it are a rotation or a reload — which is why this reads as "the app
 * broke" rather than as a text-size preference.
 *
 * `user-scalable=no` suppresses it and is not on the table: it takes pinch-zoom
 * away from everybody, including members who need it to read, and Safari
 * ignores it in recent versions anyway. The only fix is that every control a
 * finger can focus is at least 16px.
 *
 * ── Why a sweep rather than a fix ─────────────────────────────────────────
 *
 * This has now been "fixed" twice. Both times the fix was to the field that had
 * been reported, and both times another one was found the following week — most
 * recently the exercise-note textarea in the workout, which is a raw
 * `<textarea>` carrying `text-sm` and therefore 14px. A list of the fields
 * somebody remembered is not a list of the fields that exist.
 *
 * So: every control in the client, checked. Two ways to be safe —
 *
 *   · use the shared `Input`/`Textarea`, which carry `text-base md:text-sm`:
 *     16px on a phone, 14px from 768px up, which is exactly the rule;
 *   · or state a size of 16px or more, unprefixed.
 *
 * A responsive prefix does not count. `md:` and up are min-width breakpoints
 * at 768px and beyond, and an iPhone 15 is 393px wide, so a control that is
 * only 16px at `md:` is 14px in every hand holding one.
 *
 * Run: tsx script/test-ios-zoom.ts
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const SRC = "client/src";

let passed = 0;
let failed = 0;
const check = (name: string, cond: boolean, detail?: string) => {
  if (cond) passed++;
  else {
    failed++;
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
};

function files(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(join(ROOT, dir))) {
    if (entry.startsWith(".") || entry === "node_modules") continue;
    const rel = `${dir}/${entry}`;
    if (statSync(join(ROOT, rel)).isDirectory()) files(rel, out);
    else if (/\.tsx$/.test(entry)) out.push(rel);
  }
  return out;
}

/** Comments blanked, never removed, so a reported line number is the real one. */
function source(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/^(\s*)\/\/.*$/gm, "$1");
}

/** Tailwind's scale, in the pixels a browser actually computes. */
const SCALE: Record<string, number> = {
  "text-xs": 12,
  "text-sm": 14,
  "text-base": 16,
  "text-lg": 18,
  "text-xl": 20,
  "text-2xl": 24,
  "text-3xl": 30,
  "text-4xl": 36,
};

/**
 * The smallest unprefixed font-size a class list asks for, or null if it names
 * none. Prefixed variants are ignored on purpose — see the header.
 */
function smallestSize(classes: string): number | null {
  let smallest: number | null = null;
  for (const token of classes.split(/\s+/)) {
    if (token.includes(":")) continue; // md:, hover:, dark: — none apply here
    let px: number | null = null;
    if (token in SCALE) px = SCALE[token];
    const arbitrary = /^text-\[(\d+(?:\.\d+)?)(px|rem)?\]$/.exec(token);
    if (arbitrary) px = arbitrary[2] === "rem" ? Number(arbitrary[1]) * 16 : Number(arbitrary[1]);
    if (px != null && (smallest == null || px < smallest)) smallest = px;
  }
  return smallest;
}

/**
 * One element's attributes, from its tag name to the bracket that ends it.
 *
 * Brace-aware, and it has to be: the first version stopped at the first `>`,
 * which in JSX is almost always the arrow in `onChange={(e) => …}`. It read
 * three characters of every control and concluded that none of them stated a
 * size — reporting a `text-xs` select as "inherits" and a fixed field as
 * broken. A checker that misreads the thing it is checking is worse than none,
 * because it is believed.
 */
function attributesAt(src: string, start: number): string {
  let depth = 0;
  let quote: string | null = null;
  for (let i = start; i < src.length; i++) {
    const ch = src[i];
    if (quote) {
      if (ch === quote && src[i - 1] !== "\\") quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") quote = ch;
    else if (ch === "{") depth++;
    else if (ch === "}") depth--;
    else if (ch === ">" && depth === 0) return src.slice(start, i);
  }
  return src.slice(start, start + 2000);
}

/** Everything a finger can put a caret into. */
const RAW = /<(input|textarea|select)\b/g;
const SHARED = /<(Input|Textarea|Select|SelectTrigger)\b/g;
const EDITABLE = /contentEditable|contenteditable/g;

type Finding = { file: string; line: number; tag: string; why: string };

const controls: { file: string; line: number; tag: string; classes: string; raw: boolean }[] = [];
const editables: Finding[] = [];

for (const rel of files(SRC)) {
  const src = source(rel);

  /**
   * Class strings held in a `const` at the top of the file, so a shared field
   * style is read rather than reported as a control that states no size.
   * `BirthFields` puts its three lists through one such constant, and a
   * checker that could not follow it would have called the fix a regression.
   */
  const constants = new Map<string, string>();
  for (const c of src.matchAll(/const\s+([A-Z][A-Z0-9_]*)\s*=\s*((?:"[^"]*"\s*\+?\s*)+);/g)) {
    constants.set(c[1], [...c[2].matchAll(/"([^"]*)"/g)].map((x) => x[1]).join(" "));
  }

  for (const [re, raw] of [
    [RAW, true],
    [SHARED, false],
  ] as const) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) {
      const line = src.slice(0, m.index).split("\n").length;
      const attrs = attributesAt(src, m.index);
      const literal = [...attrs.matchAll(/className=\{?["'`]([^"'`]*)/g)].map((x) => x[1]);
      const named = [...attrs.matchAll(/className=\{([^}]*)\}/g)]
        .flatMap((x) => [...x[1].matchAll(/\b([A-Z][A-Z0-9_]*)\b/g)].map((n) => n[1]))
        .map((n) => constants.get(n) ?? "");
      const classes = [...literal, ...named].join(" ");

      /**
       * Only the controls that take typed text zoom. A slider, a file picker
       * and a checkbox have no caret and no font to be too small, and a
       * `hidden` input cannot be focused by a finger at all.
       */
      const type = /type=["'](\w+)["']/.exec(attrs)?.[1];
      if (type && !["text", "number", "email", "password", "search", "tel", "url", "date", "time", "datetime-local", "month", "week"].includes(type)) {
        continue;
      }
      if (/\bhidden\b/.test(classes)) continue;
      // The two shared components state their size through `cn(...)`, which is
      // read directly further down rather than through this scan.
      if (/components\/ui\/(input|textarea)\.tsx$/.test(rel)) continue;

      controls.push({ file: rel, line, tag: m[1], classes, raw });
    }
  }

  EDITABLE.lastIndex = 0;
  let e: RegExpExecArray | null;
  while ((e = EDITABLE.exec(src))) {
    editables.push({
      file: rel,
      line: src.slice(0, e.index).split("\n").length,
      tag: "contenteditable",
      why: "a contenteditable region takes focus and zooms like an input",
    });
  }
}

console.log("\nEvery box a finger can focus is at least 16px\n");

check("there are controls to check", controls.length > 60, `${controls.length} found`);

const tooSmall: Finding[] = [];
const inheriting: Finding[] = [];

for (const c of controls) {
  const size = smallestSize(c.classes);
  if (size != null && size < 16) {
    tooSmall.push({
      file: c.file,
      line: c.line,
      tag: c.tag,
      why: `${size}px`,
    });
    continue;
  }
  /**
   * A raw element that states no size at all inherits one, and an ancestor
   * carrying `text-sm` is ordinary in this codebase. Inheritance cannot be
   * resolved by reading one file, so a raw control is required to say what it
   * is — or to be the shared component, which already says it.
   */
  if (c.raw && size == null) {
    inheriting.push({
      file: c.file,
      line: c.line,
      tag: c.tag,
      why: "no size of its own; inherits, and an ancestor may be 14px",
    });
  }
}

const show = (title: string, rows: Finding[]) => {
  if (rows.length === 0) return;
  console.log(`\n  ${title}`);
  for (const r of rows) console.log(`    ${r.file}:${r.line}  <${r.tag}>  ${r.why}`);
};

check("no control asks for less than 16px", tooSmall.length === 0, `${tooSmall.length}`);
check("and no raw control leaves its size to an ancestor", inheriting.length === 0,
  `${inheriting.length}`);
check("nothing focusable is a contenteditable region", editables.length === 0,
  `${editables.length}`);

show("under 16px:", tooSmall);
show("size inherited:", inheriting);
show("contenteditable:", editables);

/**
 * ── And the two things that must stay true underneath ─────────────────────
 */
{
  const input = readFileSync(join(ROOT, SRC, "components/ui/input.tsx"), "utf8");
  const textarea = readFileSync(join(ROOT, SRC, "components/ui/textarea.tsx"), "utf8");
  check("the shared input is 16px on a phone", /\btext-base\b/.test(input));
  check("and 14px only from md up", /\bmd:text-sm\b/.test(input));
  check("the shared textarea too", /\btext-base\b/.test(textarea) && /\bmd:text-sm\b/.test(textarea));

  /**
   * The other way out of this problem, which is not a way out. It takes
   * pinch-zoom from everybody — including the members who need it — and recent
   * Safari ignores it, so it would be a change that costs accessibility and
   * fixes nothing.
   */
  // Comments stripped, or the note explaining why there is no maximum-scale
  // reads as a maximum-scale.
  const html = readFileSync(join(ROOT, "client/index.html"), "utf8")
    .replace(/<!--[\s\S]*?-->/g, "");
  check("nobody reached for user-scalable=no", !/user-scalable\s*=\s*no/.test(html));
  check("or maximum-scale, which is the same trick", !/maximum-scale/.test(html));
  check("the viewport still fits the screen", /viewport-fit=cover/.test(html));

  /**
   * ── And the other half of `viewport-fit=cover` ──
   *
   * Drawing under the notch is the point of it, and it means anything anchored
   * to the top of the screen is anchored underneath a camera. The toast
   * viewport was `top-0`, so "Posted to the room" rendered inside the Dynamic
   * Island — the first line of every confirmation the app gives, behind a
   * cutout, on the phones most members hold.
   */
  const toast = readFileSync(join(ROOT, SRC, "components/ui/toast.tsx"), "utf8");
  check("the toast clears the notch", /safe-area-inset-top/.test(toast));
  check("and adds to the gap rather than replacing it", /\+1rem\)\]/.test(toast));
  check("desktop puts it back at the corner", /sm:top-auto/.test(toast));
}

console.log(`\n${failed === 0 ? "✓" : "✗"} ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
