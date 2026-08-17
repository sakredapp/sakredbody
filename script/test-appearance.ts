/**
 * Appearance: two independent variables that used to be one class.
 *
 * ── What went wrong, and what these defend ────────────────────────────────
 *
 * `.dark` did two jobs. It was added to `documentElement` from the URL at boot
 * and removed when a marketing page mounted, so it meant "this is the portal";
 * and it selected the dark palette in `index.css`, so it also meant "this is
 * the dark appearance". Those coincided for as long as the portal was the only
 * dark thing and nobody could choose otherwise. The moment Light exists they
 * come apart: /member is still the portal and is no longer dark.
 *
 * Building Light on top of that primitive would have produced a setting that
 * could not be expressed — so the separation happens first, and these
 * assertions are what stop the two collapsing back together later.
 *
 * ── The pixel-identity claim ──────────────────────────────────────────────
 *
 * Renaming a selector is only safe if it selects the same declarations on the
 * same element at the same moment. The palette assertions below check the
 * structural half of that — that Light is a refinement of an existing palette
 * rather than a fork, and that neither theme declares a token the other cannot
 * resolve. The remaining half is pixels, and pixels need the screenshot
 * baseline; nothing here should be read as having proven Dark unchanged on
 * screen.
 */

import { readFileSync } from "node:fs";
import {
  DEFAULT_APPEARANCE,
  isAppearance,
  resolveAppearance,
  type Appearance,
} from "../client/src/lib/appearance.js";

let passed = 0;
const failures: string[] = [];

function check(name: string, ok: boolean, detail = "") {
  if (ok) passed++;
  else failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
}

// ─── Resolution ──────────────────────────────────────────────────────────

/*
  The whole truth table, because the interesting cases are the disagreements.
  A member who chose Light on a phone that is in Dark chose Light; treating the
  OS as a tiebreaker there makes the setting look broken in exactly the case
  where somebody bothered to change it.
*/
const table: Array<[Appearance, boolean, "light" | "dark"]> = [
  ["light", false, "light"],
  ["light", true, "light"],
  ["dark", false, "dark"],
  ["dark", true, "dark"],
  ["system", false, "light"],
  ["system", true, "dark"],
];

for (const [preference, osDark, expected] of table) {
  check(
    `${preference} + OS ${osDark ? "dark" : "light"} resolves ${expected}`,
    resolveAppearance(preference, osDark) === expected,
    resolveAppearance(preference, osDark),
  );
}

check(
  "an explicit choice outranks the operating system in both directions",
  resolveAppearance("light", true) === "light" && resolveAppearance("dark", false) === "dark",
);

/*
  Dark is the default because it is what every existing member already has. An
  appearance system that relights the app for people who never opened the
  setting has changed the product rather than added one.
*/
check("the default is Dark, so nobody is relit without asking", DEFAULT_APPEARANCE === "dark");

check(
  "stored junk falls back rather than being applied",
  !isAppearance("Dark") && !isAppearance("") && !isAppearance(null) && !isAppearance(undefined),
);
check(
  "and the three real values are accepted",
  isAppearance("system") && isAppearance("light") && isAppearance("dark"),
);

// ─── The primitive separation ────────────────────────────────────────────

const css = readFileSync("client/src/index.css", "utf8");
const boot = readFileSync("client/src/lib/inkSurface.ts", "utf8");
const hook = readFileSync("client/src/hooks/use-ink-surface.ts", "utf8");
const appearanceSrc = readFileSync("client/src/lib/appearance.ts", "utf8");
const tw = readFileSync("tailwind.config.ts", "utf8");

check(
  "the palette is selected by attribute, not by the route marker class",
  /\[data-theme="dark"\]\s*\{/.test(css) && !/^\.dark\s*\{/m.test(css),
);
check(
  "and nothing sets a `dark` class on the document any more",
  !/classList\.(add|remove)\(["']dark["']\)/.test(boot + hook + appearanceSrc),
);
check(
  "Tailwind's dark: variants compile against the same attribute",
  /darkMode:\s*\["selector",\s*'\[data-theme="dark"\]'\]/.test(tw),
);

check(
  "the route decides the surface",
  /applySurface\(portal\)/.test(boot) && /isPortalPath\(window\.location\.pathname\)/.test(boot),
);
check(
  "and the stored preference decides the theme, independently",
  /applyTheme\(portal \? resolveAppearance\(appearance\(\), prefersDark\(\)\)/.test(boot),
);

/*
  Marketing pages must come out of this unchanged. They run their own
  tone-ink / tone-light banding against `:root` and are outside the appearance
  system, so they get the attribute *removed* rather than set to "light" —
  naming a theme for them would put them inside it.
*/
check(
  "a non-portal page is given no theme at all, not an explicit light one",
  /if \(resolved === null\) \{\s*root\.removeAttribute\("data-theme"\)/.test(appearanceSrc),
);
check(
  "and the hook takes both attributes back off on unmount",
  /applySurface\(false\);\s*applyTheme\(null\);/.test(hook),
);

// ─── The boot read must be synchronous ───────────────────────────────────

/*
  The theme has to be on the element before the first paint, and the portal
  pages are lazy chunks so something renders while they download. An awaited
  read is a frame of the wrong atmosphere — the same defect, in the other
  direction, that the boot code was originally written to remove.
*/
check(
  "the boot preference is read from synchronous storage",
  /window\.localStorage\.getItem\(APPEARANCE_KEY\)/.test(appearanceSrc),
);
check(
  "and Capacitor Preferences is never the boot source",
  !/await import\("@capacitor\/preferences"\)[\s\S]{0,400}?export function readAppearance/.test(
    appearanceSrc,
  ) && /export function readAppearance\(\): Appearance \{\s*try \{\s*const raw = window\.localStorage/.test(appearanceSrc),
);
check(
  "the native mirror is only read when nothing is stored locally",
  /export async function hydrateFromNative[\s\S]{0,200}?if \(hasStoredAppearance\(\)\) return;/.test(
    appearanceSrc,
  ),
);
check(
  "storage access is guarded, because a private-mode throw must not blank the app",
  (appearanceSrc.match(/} catch \{/g) ?? []).length >= 5,
);

// ─── Light is a refinement, not a fork ───────────────────────────────────

function block(selector: string): string {
  const start = css.indexOf(selector);
  if (start === -1) return "";
  const open = css.indexOf("{", start);
  const close = css.indexOf("\n}", open);
  return css.slice(open, close);
}

function tokensIn(body: string): string[] {
  return Array.from(new Set((body.match(/--[a-z0-9-]+(?=\s*:)/g) ?? [])));
}

const rootTokens = tokensIn(block(":root {"));
const darkTokens = tokensIn(block('[data-theme="dark"] {'));
const lightTokens = tokensIn(block('[data-theme="light"] {'));

check("there is a :root palette to compare against", rootTokens.length > 30, `${rootTokens.length}`);
check("and a dark palette", darkTokens.length > 30, `${darkTokens.length}`);
check("and a daylight block", lightTokens.length > 0, `${lightTokens.length}`);

/*
  Every token the daylight block touches must already exist in `:root`.
  Otherwise Light is not a refinement of the existing warm palette — it is a
  second palette that happens to sit nearby, and the two drift the first time
  somebody edits one of them.
*/
const inventedByLight = lightTokens.filter((t) => !rootTokens.includes(t));
check(
  "daylight only refines tokens :root already defines",
  inventedByLight.length === 0,
  inventedByLight.join(", "),
);

/*
  The classic unreadable-theme bug: a token defined in one theme and not the
  other resolves to nothing in the other, and a component styled with it paints
  one theme's text on the other theme's ground.
*/
const darkOnly = darkTokens.filter((t) => !rootTokens.includes(t));
check(
  "and the dark palette invents nothing :root cannot resolve",
  darkOnly.length === 0,
  darkOnly.join(", "),
);

// ─── Native chrome must be able to follow ────────────────────────────────

check(
  "color-scheme is set from the resolved appearance, not left to CSS alone",
  /root\.style\.setProperty\("color-scheme", resolved\)/.test(appearanceSrc),
);
check(
  "and removed again for pages outside the appearance system",
  /root\.style\.removeProperty\("color-scheme"\)/.test(appearanceSrc),
);
check(
  "the daylight scrollbar does not keep the dark theme's full-strength gold",
  /html\[data-theme="light"\] \{\s*scrollbar-color: hsl\(var\(--gold-dark\)/.test(css),
);

// ─── Result ──────────────────────────────────────────────────────────────

if (failures.length) {
  console.error("\n✗ appearance\n");
  for (const f of failures) console.error(`    ${f}`);
  console.error("");
  process.exit(1);
}
console.log(`✓ ${passed} appearance assertions passed`);
