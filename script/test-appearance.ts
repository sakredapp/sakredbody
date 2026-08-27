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
import { hslTripletToHex, statusBarStyleFor } from "../client/src/lib/nativeChrome.js";

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

/*
  The trap, asserted in both directions.

  Capacitor names its status-bar styles after the *background* they are for,
  not the icons they draw: `Style.Dark` means "dark background", so it draws
  light icons. Read the other way round — which is the natural reading — a
  member on Light gets white icons on a limestone bar and loses the clock, the
  battery and the signal indicator entirely. That is not a cosmetic defect, and
  it is invisible in a browser, so it is asserted here rather than trusted to
  be caught on a device.
*/
check(
  "dark appearance asks for the style that draws light icons",
  statusBarStyleFor("dark") === "DARK",
);
check(
  "light appearance asks for the style that draws dark icons",
  statusBarStyleFor("light") === "LIGHT",
);

/*
  The status bar and the web layer have to agree on one colour, and the
  stylesheet is where that colour lives. These pin the conversion the native
  side needs to read it — `#1C1A17` is the ink already compiled into the splash
  drawable, the Android window background and the static theme-color meta, so
  the dark case is checkable against three things that shipped before this did.
*/
check(
  "the dark ground converts to the ink the splash and window background already use",
  hslTripletToHex("30 10% 10%")?.toLowerCase() === "#1c1a17",
  String(hslTripletToHex("30 10% 10%")),
);
check(
  "and the daylight ground converts to warm limestone, not white",
  hslTripletToHex("40 26% 92%")?.toLowerCase() === "#f0ece5",
  String(hslTripletToHex("40 26% 92%")),
);
check(
  "a custom property read back with its surrounding whitespace still parses",
  hslTripletToHex("  40 26% 92%  ")?.toLowerCase() === "#f0ece5",
);
check(
  "an achromatic value does not drift off grey",
  hslTripletToHex("0 0% 100%") === "#ffffff" && hslTripletToHex("0 0% 0%") === "#000000",
);

/*
  Refusing beats guessing. If the token is missing or malformed — a renamed
  variable, a `var()` that did not resolve — the previous colour staying on the
  bar is a far better outcome than an arbitrary one being painted over it.
*/
check(
  "an unresolvable token yields nothing rather than a plausible colour",
  hslTripletToHex("") === null &&
    hslTripletToHex("var(--nope)") === null &&
    hslTripletToHex("40 26%") === null,
);

/*
  Ordering, which a diff will not show you.

  The chrome colour is read back from the *computed* `--ink`, so if the native
  call were made before the attribute landed it would sample the outgoing theme
  and paint the status bar one change behind — visible only as a bar that is
  always wrong by exactly one tap.
*/
const surfaceHook = readFileSync("client/src/hooks/use-ink-surface.ts", "utf8");
check(
  "the theme attribute is applied before the native chrome reads it back",
  surfaceHook.indexOf("applyTheme(resolved)") > -1 &&
    surfaceHook.indexOf("applyTheme(resolved)") <
      surfaceHook.indexOf("applyNativeChrome(resolved)"),
);
check(
  "and leaving the portal hands the chrome back to the marketing ground",
  /applySurface\(false\);[\s\S]{0,600}applyNativeChrome\("dark"\)/.test(surfaceHook),
);

/*
  A setting that writes to a server would need a pending state, an error state
  and a way to be wrong on one device. This one deliberately has none of those,
  and the way it stays that way is by never acquiring a mutation.
*/
const panel = readFileSync("client/src/components/portal/AppearanceSettings.tsx", "utf8");
// Comments stripped: the file explains at length why there is no Save button,
// and searching the prose for the word it argues against would always fail.
const panelCode = panel.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
check(
  "appearance applies on tap rather than on save",
  /onClick=\{\(\) => choose\(value\)\}/.test(panelCode) && !/Save/i.test(panelCode),
);
check(
  "and it never becomes a request that can fail",
  !/useMutation|apiRequest|fetch\(/.test(panel),
);
check(
  "all three choices are offered",
  ["system", "light", "dark"].every((v) => panel.includes(`value: "${v}"`)),
);
check(
  "and Settings actually renders it",
  /<AppearanceSettings \/>/.test(readFileSync("client/src/components/SettingsTab.tsx", "utf8")),
);

/*
  ── The surround ─────────────────────────────────────────────────────────

  Everything above concerns the document. These concern the strip of screen
  around it, which is drawn by the operating system and has to be told
  separately — and whose failures are the worst kind: nothing errors, and a
  member loses the clock, or the gesture pill, or the keyboard.

  Both native halves are read as source rather than exercised. A Kotlin call
  and a UIKit window cannot be reached from here at all, so the choice is a
  source assertion or nothing, and nothing is how the navigation bar stayed
  unhandled through the whole first Light pass.
*/
const chrome = readFileSync("client/src/lib/nativeChrome.ts", "utf8");
check(
  "the surround is told on every appearance change, not only the status bar",
  /SakredAppearance\.apply\(/.test(chrome),
);
check(
  "and the status bar failing does not stop it",
  // Two try blocks, not one. Sharing a catch means an older device that
  // rejects setBackgroundColor leaves the navigation bar and the keyboard
  // on the previous appearance — the more visible of the two failures.
  (chrome.match(/\btry \{/g) ?? []).length >= 2,
);
check(
  "and the ground it paints comes from the stylesheet",
  /ink: hex/.test(chrome),
);

const androidPlugin = readFileSync(
  "android/app/src/main/java/com/sakredbody/app/AppearancePlugin.java",
  "utf8",
);
/*
  The inversion, in the one place it is not already commented.
  `setAppearanceLightNavigationBars(true)` means a light *bar*, therefore dark
  icons — so Light theme takes `!dark`, and getting it backwards produces
  precisely the invisible pill this exists to prevent.
*/
check(
  "the navigation bar is given the contrast the theme needs",
  /setAppearanceLightNavigationBars\(!dark\)/.test(androidPlugin),
);
check(
  "and the choice survives to the next cold launch",
  /putBoolean\(KEY_DARK, dark\)/.test(androidPlugin),
);

const mainActivity = readFileSync(
  "android/app/src/main/java/com/sakredbody/app/MainActivity.java",
  "utf8",
);
check("the plugin is registered", /registerPlugin\(AppearancePlugin\.class\)/.test(mainActivity));
check(
  "and an absent choice launches dark rather than light",
  // The splash is ink and the app's default is dark. A first launch that
  // read `false` here would tear the splash down into daylight.
  /getBoolean\(AppearancePlugin\.KEY_DARK, true\)/.test(mainActivity),
);

/*
  Comments stripped before comparing positions. The line above the call
  explains that it has to come before makeKeyAndVisible, and naming it there
  put the earlier match inside the prose — so the check failed on correct
  code, which is the other half of the vacuous-check problem and just as
  likely to get a guard deleted.
*/
const scene = readFileSync("ios/App/App/SceneDelegate.swift", "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/\/\/.*$/gm, "");
check(
  "iOS is in the right appearance before its first frame",
  scene.indexOf("overrideUserInterfaceStyle") > -1 &&
    scene.indexOf("overrideUserInterfaceStyle") < scene.indexOf("makeKeyAndVisible"),
);

const iosPlugin = readFileSync("ios/App/App/AppearancePlugin.swift", "utf8");
check(
  "and every window follows, not only the one the plugin was called on",
  /for window in windowScene\.windows/.test(iosPlugin),
);
check(
  "and an unwritten preference is dark, not false",
  // `bool(forKey:)` answers false for a key that was never written, which
  // would put a first launch in Light on a phone that has chosen nothing.
  /object\(forKey: defaultsKey\) as\? Bool/.test(iosPlugin) &&
    !/UserDefaults\.standard\.bool\(forKey/.test(iosPlugin),
);

// ─── Result ──────────────────────────────────────────────────────────────

if (failures.length) {
  console.error("\n✗ appearance\n");
  for (const f of failures) console.error(`    ${f}`);
  console.error("");
  process.exit(1);
}
console.log(`✓ ${passed} appearance assertions passed`);
