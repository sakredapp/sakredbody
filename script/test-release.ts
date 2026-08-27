/**
 * The two release traps, made into assertions.
 *
 * Neither of these is about the product. They are about the difference between
 * a commit and the thing that reaches a phone, and both cost a cut of the
 * native pair to find:
 *
 *   · A wall-clock timestamp in the client's `define` made the build
 *     irreproducible, which made "the same commit" and "the same application"
 *     two different claims.
 *   · `cap sync` writes a Swift file to disk and does not add it to the Xcode
 *     target, so a plugin can exist, compile nowhere, and fail the archive on
 *     the file next to it.
 *
 * Source assertions rather than behavioural ones, because both defects are in
 * build configuration and neither can be reached from a test process. What
 * makes them worth having is that both were invisible until an artifact was
 * already being cut.
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

let passed = 0;
const failures: string[] = [];
function check(name: string, ok: boolean, detail = "") {
  if (ok) passed++;
  else failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
}
function section(title: string) {
  console.log(`\n${title}\n`);
}

const ROOT = process.cwd();
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");
/** Source with comments removed — every check below is "is this still here". */
const code = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

// ── 1. One commit, one application ─────────────────────────────────────────
section("The client build is reproducible");

const vite = code(read("vite.config.ts"));

/*
  The defect, exactly. `__BUILT_AT__` lands in MemberDashboard, so a clock
  reading gives that chunk a new hash on every build, which renames it, which
  changes every chunk importing it, which changes the entry, which changes
  everything. Two builds three seconds apart shared 11 of 56 filenames while
  54 of 55 chunks were byte-identical once the hashes were normalised out.
*/
const define = /define:\s*\{([\s\S]*?)\n\s{2}\},/.exec(vite)?.[1] ?? "";
check("the define block was found at all", define.length > 0, "vite.config.ts changed shape");
check(
  "nothing in the client's define reads the clock",
  !/new Date\(\s*\)|Date\.now\(\)/.test(define),
  define.trim().split("\n").map((l) => l.trim()).join(" "),
);
check(
  "the build stamp comes from the commit",
  /git log -1 --format=%cI/.test(vite),
);
check(
  "and SOURCE_DATE_EPOCH is honoured ahead of it",
  vite.indexOf("SOURCE_DATE_EPOCH") > -1 &&
    vite.indexOf("SOURCE_DATE_EPOCH") < vite.indexOf("git log -1"),
);
/*
  A build with neither must say it does not know. Falling back to the clock
  would reintroduce the defect on exactly the machines — CI, a tarball, a
  shallow clone — where nobody would think to look for it.
*/
check(
  "and a build with neither says so rather than guessing",
  /return "unknown";/.test(vite.slice(vite.indexOf("function builtAt"))),
);

section("The pair is built once and synced twice");

const aab = read("script/build-aab.sh");
check(
  "the Android script can be told not to rebuild the client",
  /SAKRED_SKIP_CLIENT_BUILD/.test(aab),
);
check(
  "and it refuses to assemble a shell that disagrees with dist",
  /node script\/native-parity\.mjs/.test(aab) &&
    aab.indexOf("native-parity.mjs") < aab.indexOf("bundleRelease"),
);
check("there is a script that does the whole pair", existsSync(resolve(ROOT, "script/release-pair.sh")));

const pair = read("script/release-pair.sh");
/* Order is the whole point: one build, then both syncs, then the check. */
check(
  "it builds before it syncs, and checks after both",
  pair.indexOf("npm run build") < pair.indexOf("npx cap sync") &&
    pair.indexOf("npx cap sync") < pair.indexOf("native-parity.mjs"),
);
check(
  "and it hands Android a build rather than letting it make one",
  /SAKRED_SKIP_CLIENT_BUILD=1 bash script\/build-aab\.sh/.test(pair),
);

const parity = read("script/native-parity.mjs");
check(
  "parity is judged on content, not on filenames",
  /createHash\("sha256"\)/.test(parity),
);
check(
  "and a file in a shell that is not in the build is a finding",
  /stale\/extra/.test(parity),
);

// ── 2. Native sources are in the targets that build them ───────────────────
section("Every native source is in its target");

/*
  `cap sync` puts a Swift file on disk and writes none of the four pbxproj
  entries it needs. AppearancePlugin.swift sat next to the file that imports
  it and the archive failed on "cannot find 'AppearancePlugin' in scope" —
  which reads as a typo and is a project-membership problem.

  Checked from the directory rather than from a list, so a file added
  tomorrow is covered without anybody remembering to add it here.
*/
const pbx = read("ios/App/App.xcodeproj/project.pbxproj");
const swift = readdirSync(resolve(ROOT, "ios/App/App")).filter((f) => f.endsWith(".swift"));
check("there are Swift sources in the app directory", swift.length > 0, `${swift.length}`);

for (const file of swift) {
  const fileRef = new RegExp(`/\\* ${file} \\*/ = \\{isa = PBXFileReference`).test(pbx);
  const buildFile = new RegExp(`/\\* ${file} in Sources \\*/ = \\{isa = PBXBuildFile`).test(pbx);
  /*
    Listed in the group AND in the compile phase. A file reference alone puts
    it in the navigator and compiles nothing, which is the state that failed
    the archive — visible in Xcode, absent from the build.
  */
  const inSources = new RegExp(`[0-9A-F]{24} /\\* ${file} in Sources \\*/,`).test(pbx);
  check(`${file} is a file reference`, fileRef);
  check(`${file} is a build file`, buildFile);
  check(`${file} is in the compile phase`, inSources);
}

/* The Android half of the same question. MainActivity registers app-local
   plugins by hand, so a plugin class nobody registers is dead code that
   compiles — the quieter version of the same failure. */
const androidDir = resolve(ROOT, "android/app/src/main/java/com/sakredbody/app");
const plugins = readdirSync(androidDir).filter((f) => /Plugin\.(java|kt)$/.test(f));
const mainActivity = code(read("android/app/src/main/java/com/sakredbody/app/MainActivity.java"));
check("there is at least one app-local Android plugin", plugins.length > 0, `${plugins.length}`);
for (const file of plugins) {
  const cls = file.replace(/\.(java|kt)$/, "");
  check(`${cls} is registered in MainActivity`, mainActivity.includes(`registerPlugin(${cls}.class)`));
}

// ── Result ─────────────────────────────────────────────────────────────────

if (failures.length) {
  console.error("\n✗ release\n");
  for (const f of failures) console.error(`    ${f}`);
  console.error("");
  process.exit(1);
}
console.log(`\n✓ ${passed} release assertions passed\n`);
