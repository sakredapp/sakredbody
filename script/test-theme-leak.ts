/**
 * Colours that only work in one atmosphere, inside a surface that has two.
 *
 * ── What this guards ──────────────────────────────────────────────────────
 *
 * `text-white` is not a colour decision, it is a colour *assumption* — that
 * whatever is behind this text is dark. Inside the portal that assumption held
 * for as long as the portal was always dark. It stops holding the moment a
 * member picks Light, and it fails silently: nothing errors, the build is
 * clean, and somebody reads white text on limestone.
 *
 * A grep is not a substitute for looking at the screen. What it does is stop
 * the count going back up while the migration is in progress, which is the
 * failure mode of every theme migration that was ever abandoned half-done.
 *
 * ── Why the denominator walks imports ─────────────────────────────────────
 *
 * The obvious scope is a list of directories, and it is wrong twice. It
 * includes marketing components that legitimately live in one visual world —
 * the constellation field is *meant* to be luminous on ink and has no daylight
 * obligation — and it silently excludes any portal screen added to a directory
 * nobody remembered to list.
 *
 * So the scope is derived from source: start at the three pages the portal
 * routes render and follow every local import. A new screen is covered the day
 * it is imported, and a marketing component is out of scope because the portal
 * genuinely does not render it. That boundary is the same one
 * `data-surface="portal"` draws at runtime, which is not a coincidence — they
 * are the same question asked at two different times.
 *
 * ── Why a ratchet rather than zero ────────────────────────────────────────
 *
 * There are known violations today and fixing them is the tokenization work
 * that has not happened yet. A guard that demands zero on day one gets
 * commented out. This one demands: no file that was clean may become dirty,
 * and no dirty file may get worse. The numbers only go down, and the day they
 * reach zero this becomes an ordinary assertion.
 */

import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve, relative } from "node:path";

let passed = 0;
const failures: string[] = [];

function check(name: string, ok: boolean, detail = "") {
  if (ok) passed++;
  else failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
}

const ROOT = process.cwd();
const SRC = resolve(ROOT, "client/src");

/** What the portal routes actually render. Everything else follows from here. */
const ROOTS = [
  "client/src/pages/MemberDashboard.tsx",
  "client/src/pages/CoachingDashboard.tsx",
  "client/src/pages/AdminPortal.tsx",
];

/**
 * Components that belong to one visual world on purpose.
 *
 * These are generative or illustrative surfaces whose whole subject is light
 * emerging from darkness. A luminous constellation is not a themed card that
 * someone forgot to tokenize, and forcing it through semantic tokens would
 * make it worse, not portable. They get a daylight treatment as art direction
 * — different geometry and tone — rather than as a find-and-replace.
 *
 * Anything added here needs a reason of that kind. "It was hard to convert"
 * is not one.
 */
const ART = new Set([
  "client/src/components/ElementOrbit.tsx",
  "client/src/components/ConstellationBody.tsx",
  "client/src/components/StarDust.tsx",
  "client/src/components/MoonPhase.tsx",
  "client/src/components/FlowField.tsx",
  "client/src/components/GemStone.tsx",
  "client/src/components/JungleCanopy.tsx",
  "client/src/components/Constellation.tsx",
  "client/src/components/SignalChain.tsx",
  // Crops a photograph. The checkerboard and the scrim are properties of the
  // image editor, not of the app's palette.
  "client/src/components/portal/PhotoCrop.tsx",
]);

// ─── The denominator ─────────────────────────────────────────────────────

function resolveImport(spec: string, fromFile: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = resolve(SRC, spec.slice(2));
  else if (spec.startsWith(".")) base = resolve(dirname(resolve(ROOT, fromFile)), spec);
  else return null; // node_modules, @shared — not ours to theme

  for (const candidate of [`${base}.tsx`, `${base}.ts`, `${base}/index.tsx`, `${base}/index.ts`]) {
    if (existsSync(candidate)) return relative(ROOT, candidate);
  }
  return null;
}

function portalSurface(): string[] {
  const seen = new Set<string>();
  const queue = [...ROOTS];

  while (queue.length) {
    const file = queue.shift()!;
    if (seen.has(file) || !existsSync(resolve(ROOT, file))) continue;
    seen.add(file);

    const src = readFileSync(resolve(ROOT, file), "utf8");
    // Static imports and lazy dynamic ones. The portal lazy-loads several
    // tabs, and a screen that arrives by dynamic import is no less rendered.
    const specs = [
      ...src.matchAll(/from\s+["']([^"']+)["']/g),
      ...src.matchAll(/import\(\s*["']([^"']+)["']\s*\)/g),
    ].map((m) => m[1]);

    for (const spec of specs) {
      const target = resolveImport(spec, file);
      if (target) queue.push(target);
    }
  }

  return Array.from(seen).sort();
}

const surface = portalSurface();
const themeable = surface.filter((f) => f.endsWith(".tsx") && !ART.has(f));

check(
  "the portal surface is derived by walking imports from the routed pages",
  surface.length > 60,
  `${surface.length} modules reachable`,
);

// ─── The leak ────────────────────────────────────────────────────────────

/**
 * Absolute colour where a themed one belongs.
 *
 * `white` and `black` are the whole of it in practice: they read as neutral
 * and are the two values that are never neutral. Arbitrary hex in a utility is
 * included because it is the same assumption wearing a different syntax.
 *
 * Deliberately not banned: every hex literal everywhere. The audit found 15 in
 * the entire client and several are legitimate gradient stops in generative
 * art. A rule that fires on those trains people to ignore it.
 */
const LEAK = /\b(?:bg|text|border|from|to|via|ring|divide|fill|stroke|shadow|outline|decoration|caret|accent|placeholder)-(?:white|black)(?:\/\d+)?\b|\b(?:bg|text|border|from|to|via|ring|fill|stroke)-\[#[0-9a-fA-F]{3,8}\]/g;

function leaksIn(file: string): string[] {
  const src = readFileSync(resolve(ROOT, file), "utf8");
  return src.match(LEAK) ?? [];
}

const found = new Map<string, number>();
for (const file of themeable) {
  const hits = leaksIn(file);
  if (hits.length) found.set(file, hits.length);
}

/*
  It reached zero.

  What was here was a per-file ratchet with 35 entries and 81 allowed
  violations, and the note above it said that the day the count reached zero
  this becomes an ordinary assertion. That day is today, so this is one.

  Nothing was moved to the art allowlist to get here. The literals fell into
  four kinds and each got a name for what it actually was:

    a fixed pairing   `text-white` on `bg-gold`. Gold is 39 48% 56% in both
                      themes, so the white was never a theme assumption — it
                      only looked like one. Now `text-gold-foreground`.

    a relative wash   `bg-white/[0.03]` meant "lifted off the ground" and
                      `bg-black/20` meant "sunk into it". On ink those are a
                      white wash and a black one; on limestone both are
                      walnut. Now `bg-raise` and `bg-well`, which flip.

    the ground itself `text-white` over a photo under a `--ink` gradient. The
                      gradient already followed the theme; the text did not,
                      so in Light it was white on limestone. Now
                      `--ink-foreground`, the token the gradient's own ground
                      is paired with.

    a different       A video letterboxed for viewing, and a photo opened
    surface           full-screen. Black in daylight too, the way every viewer
                      on every platform does it. Now `bg-media` and
                      `text-onfill` — still absolute, but named for the
                      surface rather than for the colour, so the next reader
                      can tell it apart from the three above.
*/
const dirty = [...found.entries()].map(([f, n]) => `${f} (${n})`);
check(
  "no portal component carries an absolute colour",
  dirty.length === 0,
  dirty.join(", "),
);

/*
  The guard only means anything while the vocabulary it replaced them with
  still exists. A token deleted out of the stylesheet leaves every call site
  resolving to nothing — no error, no build failure, and text with no colour,
  which is the same silent failure by a different route.
*/
const css = readFileSync(resolve(ROOT, "client/src/index.css"), "utf8");
const dark = css.slice(css.indexOf('[data-theme="dark"]'));
const FLIPPING = ["--raise", "--raise-hover", "--raise-hover-soft", "--well", "--hairline", "--scrim"];
const FIXED = ["--gold-foreground", "--on-fill", "--media-ground"];

const missing = [...FLIPPING, ...FIXED].filter((t) => !css.includes(`${t}:`));
check("every token the portal was converted onto is defined", missing.length === 0, missing.join(", "));

const unflipped = FLIPPING.filter((t) => !dark.includes(`${t}:`));
check(
  "and the ones that mean something relative to the ground are redefined for it",
  unflipped.length === 0,
  `defined once, so they do not flip: ${unflipped.join(", ")}`,
);

/*
  And the fixed three must NOT be redefined per theme. A `--gold-foreground`
  that differs between the two would mean the pairing was a theme assumption
  after all, and the name would be a lie rather than a record.
*/
const flipped = FIXED.filter((t) => dark.includes(`${t}:`));
check(
  "and the ones that are fixed stay fixed",
  flipped.length === 0,
  `redefined for dark: ${flipped.join(", ")}`,
);

/*
  Art is excluded by name, and the exclusion is only honest while the names
  still exist. A renamed or deleted component leaves an entry that quietly
  widens the exemption for whatever takes its path next.
*/
const ghosts = [...ART].filter((f) => !existsSync(resolve(ROOT, f)));
check("every allowlisted art component still exists", ghosts.length === 0, ghosts.join(", "));

// ─── Result ──────────────────────────────────────────────────────────────

if (failures.length) {
  console.error("\n✗ theme leak\n");
  for (const f of failures) console.error(`    ${f}`);
  console.error("");
  process.exit(1);
}
console.log(
  `✓ ${passed} theme leak assertions passed (${themeable.length} portal components, no absolute colours)`,
);
