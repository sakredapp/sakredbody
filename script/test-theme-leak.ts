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

/**
 * The ratchet.
 *
 * Recorded from a real measurement, not aspirational. Each of these is a file
 * the Dark tokenization pass has yet to reach. Lower a number when you fix
 * one; never raise one, and never add a key.
 */
const BASELINE: Record<string, number> = {
  "client/src/components/BuildTab.tsx": 2,
  "client/src/components/CommunityTab.tsx": 1,
  "client/src/components/MasterclassTab.tsx": 8,
  "client/src/components/OfferingsTab.tsx": 1,
  "client/src/components/PillarHome.tsx": 2,
  "client/src/components/ReportDialog.tsx": 1,
  "client/src/components/RestoreTab.tsx": 1,
  "client/src/components/RhythmCards.tsx": 2,
  "client/src/components/TerrainToday.tsx": 1,
  "client/src/components/TodayRead.tsx": 4,
  "client/src/components/VoiceMemo.tsx": 1,
  "client/src/components/WinMoment.tsx": 3,
  "client/src/components/WinsTab.tsx": 3,
  "client/src/components/admin/CommunityAdmin.tsx": 1,
  "client/src/components/admin/Energy.tsx": 2,
  "client/src/components/admin/ExecutiveApplications.tsx": 1,
  "client/src/components/admin/Hosts.tsx": 1,
  "client/src/components/admin/Library.tsx": 1,
  "client/src/components/admin/Offerings.tsx": 1,
  "client/src/components/admin/Training.tsx": 1,
  "client/src/components/build/MovementPicker.tsx": 1,
  "client/src/components/build/WhyToday.tsx": 1,
  "client/src/components/build/WorkoutInProgress.tsx": 1,
  "client/src/components/build/WorkoutSheet.tsx": 2,
  "client/src/components/coach/Conversation.tsx": 3,
  "client/src/components/health/ConfirmActivity.tsx": 2,
  "client/src/components/portal/HealthCard.tsx": 1,
  "client/src/components/portal/HealthSwatches.tsx": 6,
  "client/src/components/portal/TodayBody.tsx": 1,
  "client/src/components/ui/avatar.tsx": 2,
  "client/src/components/ui/dialog.tsx": 1,
  "client/src/components/ui/sheet.tsx": 1,
  "client/src/pages/AdminPortal.tsx": 10,
  "client/src/pages/CoachingDashboard.tsx": 6,
  "client/src/pages/MemberDashboard.tsx": 5,
};

const appeared = [...found.keys()].filter((f) => !(f in BASELINE));
check(
  "no portal component that was clean has picked up an absolute colour",
  appeared.length === 0,
  appeared.map((f) => `${f} (${found.get(f)})`).join(", "),
);

const worsened = [...found.entries()]
  .filter(([f, n]) => f in BASELINE && n > BASELINE[f])
  .map(([f, n]) => `${f}: ${BASELINE[f]} → ${n}`);
check("and no known one got worse", worsened.length === 0, worsened.join(", "));

/*
  The ratchet has to move in the other direction too. A fixed file whose entry
  is left behind lets a future regression slip back in under cover of its own
  stale allowance.
*/
const stale = Object.keys(BASELINE).filter((f) => !found.has(f));
check(
  "and every recorded allowance still corresponds to a real violation",
  stale.length === 0,
  `fixed — lower these to remove: ${stale.join(", ")}`,
);

const overcounted = [...found.entries()]
  .filter(([f, n]) => f in BASELINE && n < BASELINE[f])
  .map(([f, n]) => `${f}: ${BASELINE[f]} → ${n}`);
check(
  "recorded counts match what is actually there",
  overcounted.length === 0,
  `improved, update the baseline: ${overcounted.join(", ")}`,
);

const total = [...found.values()].reduce((a, b) => a + b, 0);
const allowed = Object.values(BASELINE).reduce((a, b) => a + b, 0);
check(`the portal carries no more than ${allowed} absolute colours`, total <= allowed, `${total}`);

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
  `✓ ${passed} theme leak assertions passed (${themeable.length} portal components, ${total} absolute colours remaining)`,
);
