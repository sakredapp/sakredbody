/**
 * The art, and which half of it a theme change reaches on its own.
 *
 * ── Why this is an inventory and not a rule ───────────────────────────────
 *
 * Every other guard in this suite says "don't". This one mostly says "here is
 * what there is", because the decision it supports — what daylight Sakred
 * looks like — is art direction and cannot be asserted. What *can* be asserted
 * is that nobody added a drawing surface without deciding which of these it is,
 * and that the pile of unconverted literals only ever gets smaller.
 *
 * ── What the audit found ──────────────────────────────────────────────────
 *
 * The art divides in two, and the halves have opposite problems.
 *
 * The SVG and CSS half is already written against `hsl(var(--…))` and
 * `currentColor`: BodyMap, TerrainWheel, CapacityRadar, LoopCycle, YinYang,
 * Dial, Sparkline, StarMark, HealthSwatches, ElementOrbit. It follows the theme
 * with no work at all — including the Body Map, which is the surface the whole
 * navigation change is built around. That was the good news of the audit and it
 * is worth not losing: these need protecting from regression, not converting.
 *
 * The canvas half cannot follow anything. A 2D context takes strings, resolves
 * no custom properties and inherits nothing, so each of those files carries
 * baked RGB with a runtime alpha — and the alpha *is* the animation, so it can
 * never become a utility class. `client/src/lib/themeInk.ts` is the bridge:
 * `channels("--gold")` gives canvas code the same token the stylesheet uses.
 *
 * ── The third category is real, not an excuse ─────────────────────────────
 *
 * `winCard.ts` draws a PNG a member shares outside the app. That image must not
 * change because the person who made it happened to be in Light — it is a
 * Sakred artefact, not a screenshot of their settings. It stays ink and gold
 * forever, and that is a designed answer rather than a deferral.
 */

import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, resolve, dirname, relative } from "node:path";

let passed = 0;
const failures: string[] = [];

function check(name: string, ok: boolean, detail = "") {
  if (ok) passed++;
  else failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
}

const ROOT = process.cwd();
const SRC = resolve(ROOT, "client/src");

// ─── Discovery ───────────────────────────────────────────────────────────

function allSources(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) allSources(p, out);
    else if (p.endsWith(".tsx") || p.endsWith(".ts")) out.push(relative(ROOT, p));
  }
  return out;
}

/**
 * What counts as drawing.
 *
 * `mountStage` matters as much as `getContext` here: the canvas components
 * don't open their own context, they hand a paint function to the shared stage
 * in `lib/canvasStage.ts`. A detector that only looked for `getContext` found
 * four modules and missed the entire constellation system.
 */
const DRAWS = /getContext\("2d"\)|mountStage|ctx\.(?:fillStyle|strokeStyle)|addColorStop|<svg|-gradient\(|boxShadow|box-shadow/;

/** Baked colour: literal rgb/rgba, or a hex. Template alpha is expected and fine. */
const LITERAL = /rgba?\(\s*[\d$]|#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g;
const TOKEN = /hsl\(\s*var\(--|currentColor/g;

type Surface = { file: string; literals: number; tokens: number; canvas: boolean };

/**
 * Comments are stripped before counting.
 *
 * These files explain themselves at length, and several quote the exact
 * `rgba(214,178,104,…)` line they are arguing about. Counting prose as art
 * would put a module in the inventory for describing the problem, and would
 * make the ratchet move when somebody edits a comment.
 */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

const surfaces: Surface[] = [];
for (const file of allSources(SRC)) {
  const raw = readFileSync(resolve(ROOT, file), "utf8");
  if (!DRAWS.test(raw)) continue;
  const src = code(raw);
  surfaces.push({
    file,
    literals: (src.match(LITERAL) ?? []).length,
    tokens: (src.match(TOKEN) ?? []).length,
    canvas: /getContext\("2d"\)|mountStage|ctx\.(?:fillStyle|strokeStyle)|addColorStop/.test(src),
  });
}

check("the art surface is discovered from source, not listed by hand", surfaces.length > 30,
  `${surfaces.length} drawing modules`);

// ─── The classification ──────────────────────────────────────────────────

/**
 * Fixed by design. Each needs a reason of the kind above — a property of what
 * the surface *is*, not of how hard it would be to convert.
 */
const FIXED: Record<string, string> = {
  // A shareable PNG that leaves the app. It is a Sakred artefact and must not
  // vary with the sharer's settings.
  "client/src/lib/winCard.ts": "exported image, not a screen",
  // The checkerboard and scrim are properties of an image editor. They exist to
  // read *against* an arbitrary photograph, which is what makes them neutral.
  "client/src/components/portal/PhotoCrop.tsx": "image editor furniture",
};

/**
 * Canvas art awaiting the daylight treatment, with today's literal count.
 *
 * These are the surfaces `channels()` exists for. The number is a ratchet, not
 * a target: it may fall as a surface is converted and must never rise. It is
 * deliberately not zero-by-a-deadline — several of these want different
 * geometry in daylight rather than different ink, and a guard that forced them
 * through find-and-replace would produce exactly the inverted-art result the
 * brief rules out.
 */
const AWAITING: Record<string, number> = {
  "client/src/components/JungleCanopy.tsx": 18,
  "client/src/components/SignalChain.tsx": 17,
  "client/src/components/portal/ConstellationSky.tsx": 10,
  "client/src/components/ManifestoField.tsx": 9,
  "client/src/components/ConstellationBody.tsx": 8,
  "client/src/components/MoonPhase.tsx": 7,
  "client/src/components/Constellation.tsx": 4,
  "client/src/components/BreathPacer.tsx": 3,
  "client/src/components/FlowField.tsx": 3,
  "client/src/components/ResonantRing.tsx": 3,
  "client/src/components/EmberField.tsx": 2,
  "client/src/components/GemStone.tsx": 2,
  "client/src/components/StarDust.tsx": 2,
  "client/src/lib/gem.ts": 1,
};

const classified = new Set([...Object.keys(FIXED), ...Object.keys(AWAITING)]);

/*
  The assertion that makes this an inventory rather than a snapshot: a new
  drawing surface with a baked colour in it fails here until somebody says
  which of the three things it is.
*/
const undecided = surfaces
  .filter((s) => s.literals > 0 && !classified.has(s.file))
  .map((s) => `${s.file} (${s.literals})`);
check(
  "every drawing surface with a baked colour has been classified",
  undecided.length === 0,
  undecided.join(", "),
);

const worsened = surfaces
  .filter((s) => s.file in AWAITING && s.literals > AWAITING[s.file])
  .map((s) => `${s.file}: ${AWAITING[s.file]} → ${s.literals}`);
check("and no unconverted surface gained more", worsened.length === 0, worsened.join(", "));

const overcounted = surfaces
  .filter((s) => s.file in AWAITING && s.literals < AWAITING[s.file])
  .map((s) => `${s.file}: ${AWAITING[s.file]} → ${s.literals}`);
check(
  "recorded counts match what is actually there",
  overcounted.length === 0,
  `converted — lower these: ${overcounted.join(", ")}`,
);

const ghosts = [...classified].filter((f) => !existsSync(resolve(ROOT, f)));
check("every classified surface still exists", ghosts.length === 0, ghosts.join(", "));

// ─── The half that already works ─────────────────────────────────────────

/**
 * These draw entirely from tokens today. The Body Map is the one that matters
 * most — the navigation change makes it a primary destination — and it needs
 * no conversion at all.
 *
 * Asserted because it is a fact that can quietly stop being true: one
 * `rgba(255,255,255,0.4)` added to BodyMap during some unrelated fix and the
 * daylight version has a white line through it that nobody looks for.
 */
const THEME_SOURCED = [
  "client/src/components/BodyMap.tsx",
  "client/src/components/TerrainWheel.tsx",
  "client/src/components/CapacityRadar.tsx",
  "client/src/components/LoopCycle.tsx",
  "client/src/components/YinYang.tsx",
  "client/src/components/ElementOrbit.tsx",
  "client/src/components/AscentChart.tsx",
  "client/src/components/portal/Dial.tsx",
  "client/src/components/portal/Sparkline.tsx",
  "client/src/components/portal/StarMark.tsx",
  "client/src/components/portal/HealthSwatches.tsx",
  "client/src/components/portal/PortalBackdrop.tsx",
];

for (const file of THEME_SOURCED) {
  const s = surfaces.find((x) => x.file === file);
  check(
    `${file.split("/").pop()} still draws only from tokens`,
    !!s && s.literals === 0 && s.tokens > 0,
    s ? `${s.literals} literals, ${s.tokens} tokens` : "not found as a drawing surface",
  );
}

// ─── Where the unconverted art actually appears ──────────────────────────

/**
 * Marketing art can wait; portal art cannot. Reachability is walked rather
 * than listed for the same reason as in the theme-leak guard — a screen added
 * to a directory nobody remembered is still a screen a member sees.
 */
function resolveImport(spec: string, fromFile: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = resolve(SRC, spec.slice(2));
  else if (spec.startsWith(".")) base = resolve(dirname(resolve(ROOT, fromFile)), spec);
  else return null;
  for (const c of [`${base}.tsx`, `${base}.ts`, `${base}/index.tsx`, `${base}/index.ts`]) {
    if (existsSync(c)) return relative(ROOT, c);
  }
  return null;
}

function reachable(roots: string[]): Set<string> {
  const seen = new Set<string>();
  const queue = [...roots];
  while (queue.length) {
    const file = queue.shift()!;
    if (seen.has(file) || !existsSync(resolve(ROOT, file))) continue;
    seen.add(file);
    const src = readFileSync(resolve(ROOT, file), "utf8");
    for (const m of [
      ...src.matchAll(/from\s+["']([^"']+)["']/g),
      ...src.matchAll(/import\(\s*["']([^"']+)["']\s*\)/g),
    ]) {
      const t = resolveImport(m[1], file);
      if (t) queue.push(t);
    }
  }
  return seen;
}

const portal = reachable([
  "client/src/pages/MemberDashboard.tsx",
  "client/src/pages/CoachingDashboard.tsx",
  "client/src/pages/AdminPortal.tsx",
]);

const portalAwaiting = Object.keys(AWAITING).filter((f) => portal.has(f));
const portalLiterals = portalAwaiting.reduce((a, f) => a + AWAITING[f], 0);

check(
  "the daylight art work inside the portal is a short list, and known",
  portalAwaiting.length <= 6,
  `${portalAwaiting.length}: ${portalAwaiting.join(", ")}`,
);

// ─── Result ──────────────────────────────────────────────────────────────

if (failures.length) {
  console.error("\n✗ art surface\n");
  for (const f of failures) console.error(`    ${f}`);
  console.error("");
  process.exit(1);
}

const canvasCount = surfaces.filter((s) => s.canvas).length;
const clean = surfaces.filter((s) => s.literals === 0).length;
console.log(
  `✓ ${passed} art surface assertions passed ` +
    `(${surfaces.length} drawing modules, ${canvasCount} on canvas, ${clean} already theme-sourced, ` +
    `${portalLiterals} literals await daylight inside the portal)`,
);
