/**
 * `cap sync` writes paths that only work on the machine that ran it.
 *
 * ── What happens, and why it is not obvious ───────────────────────────────
 *
 * Capacitor regenerates the native project's plugin references on every sync,
 * resolving each plugin's directory and writing it back as a relative path. If
 * `node_modules` is reached through a symlink — a second worktree, an npm
 * workspace, a hoisted install — it resolves the *real* location and writes a
 * path that walks out of the checkout to get there:
 *
 *     project(':capacitor-android').projectDir =
 *       new File('../../sakredbody/node_modules/@capacitor/android/capacitor')
 *
 * That builds. It builds perfectly, on the one machine whose sibling directory
 * happens to be called `sakredbody`. Committed, it breaks every clone and every
 * CI job, and the failure arrives as a Gradle error about a missing project
 * rather than as anything pointing at this file.
 *
 * It was found the honest way: a release build of Android 52 produced a
 * correct, signed, uploadable bundle, and left the rewrite sitting in
 * `git status` afterwards.
 *
 * ── Normalise, do not revert ──────────────────────────────────────────────
 *
 * `git checkout` on the generated file would be the quick fix and the wrong
 * one: sync is what reconciles native plugin configuration, and a plugin added
 * or removed since the last commit is a *legitimate* change to the same file.
 * Reverting it would silently drop that and the next build would omit a plugin
 * nobody noticed was missing.
 *
 * So only the path portion is rewritten — anything that escapes the checkout
 * to reach `node_modules` or `plugins` is folded back to the repo-relative
 * form — and everything else sync wrote is left exactly as it wrote it.
 *
 * ── Then refuse to build ──────────────────────────────────────────────────
 *
 * Normalising is a fix; the guard is the point. After normalising, every
 * generated native file is scanned for any surviving escape — an absolute
 * `/Users/...`, a `..` that climbs past the repo root, a sibling checkout by
 * name. One is a non-zero exit, because a release artifact that depends on
 * this machine's neighbouring directory must not be uploadable.
 *
 * Both platforms. `cap sync` rewrites iOS package references the same way.
 *
 * Usage: node script/normalise-native-paths.mjs [--check]
 *   --check   report and fail without writing anything
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const CHECK_ONLY = process.argv.includes("--check");

/**
 * The generated files Capacitor rewrites. Each is listed with the directory a
 * relative path inside it is resolved against, because `capacitor.settings
 * .gradle` is read from `android/` while the Podfile-equivalents are read from
 * `ios/App/`.
 */
const GENERATED = [
  { file: "android/capacitor.settings.gradle", base: "android" },
  { file: "android/app/capacitor.build.gradle", base: "android/app" },
  { file: "ios/App/CapApp-SPM/Package.swift", base: "ios/App/CapApp-SPM" },
];

/**
 * Anything that is a path out of this checkout and into the dependency tree.
 *
 * The correct shape is `../` repeated exactly as far as the file is deep,
 * landing directly on `node_modules/` or `plugins/`. An escape is the same
 * climb with a *named directory* in between — `../../sakredbody/node_modules/`
 * — because that names somewhere this repository is not.
 *
 * The directory name may not start with a dot, and that restriction is the
 * whole correctness of this pattern. The first version allowed `.` inside the
 * name, so `../../../node_modules/` matched with `..` read as a directory, and
 * the checker reported the correct three-level climb out of
 * `ios/App/CapApp-SPM` as a machine-specific path. A guard that fails on
 * correct input gets switched off.
 */
const ESCAPES = [
  // An absolute path. Always machine-specific, whatever it points at.
  /["'`(]\s*\/Users\/[^"'`)]+/g,
  // A climb, then a named sibling, then the dependency tree.
  /(?:\.\.\/)+[A-Za-z0-9_][A-Za-z0-9._-]*\/(?:node_modules|plugins)\//g,
];

let changed = 0;
let offences = [];

for (const { file, base } of GENERATED) {
  const path = join(ROOT, file);
  if (!existsSync(path)) continue;

  const before = readFileSync(path, "utf8");

  /**
   * How far up this file has to go to reach the repo root, which is where
   * `node_modules` and `plugins` live. Computed from the file's own base
   * directory rather than assumed, so a file two levels down gets `../../`.
   */
  const depth = base.split("/").filter(Boolean).length;
  const up = "../".repeat(depth);

  let after = before;

  // An absolute path into this machine's copy of the tree, or into a sibling
  // checkout, folded back to the repo-relative form.
  after = after.replace(
    /\/Users\/[^"'`)\s]*?\/(node_modules|plugins)\//g,
    `${up}$1/`,
  );
  // And the climb-out form, whatever the sibling directory is named. The
  // leading character of that name may not be a dot, or `..` itself matches
  // and a correct path is "normalised" into the same correct path by accident.
  after = after.replace(
    /(?:\.\.\/)+[A-Za-z0-9_][A-Za-z0-9._-]*\/(node_modules|plugins)\//g,
    `${up}$1/`,
  );

  if (after !== before) {
    changed++;
    if (CHECK_ONLY) {
      /**
       * In check mode, needing a change *is* the finding.
       *
       * The first version normalised in memory and then scanned the result, so
       * `--check` cheerfully reported success on a file full of paths into a
       * sibling checkout — it was grading its own repair rather than the file.
       * Caught by feeding it the exact drift from the Android 52 build.
       */
      offences.push(`${file}: needs normalising — paths point outside the checkout`);
    } else {
      writeFileSync(path, after);
      console.log(`  normalised  ${file}`);
    }
  }

  /**
   * The guard, always against what is on disk — never against the corrected
   * text, for the reason above.
   */
  const now = readFileSync(path, "utf8");
  for (const re of ESCAPES) {
    re.lastIndex = 0;
    for (const m of now.matchAll(re)) {
      offences.push(`${file}: ${m[0].trim().slice(0, 90)}`);
    }
  }

  /**
   * And a positive check, so a file that stopped mentioning the dependency
   * tree at all cannot pass by saying nothing. Only for the two that must
   * always reference it.
   */
  if (/capacitor\.settings\.gradle$|Package\.swift$/.test(file)) {
    if (!now.includes(`${up}node_modules/`)) {
      offences.push(`${file}: no repo-relative node_modules reference at all`);
    }
  }
}

if (offences.length) {
  console.error("\n✗ generated native files point outside this checkout:\n");
  for (const o of offences) console.error(`    ${o}`);
  console.error(
    "\n  A release built from these depends on this machine's directory layout.\n" +
      "  Run `node script/normalise-native-paths.mjs` and re-check.\n",
  );
  process.exit(1);
}

console.log(
  changed === 0
    ? "  ✓ generated native paths are repo-relative"
    : `  ✓ ${changed} file${changed === 1 ? "" : "s"} normalised; no path escapes the checkout`,
);
