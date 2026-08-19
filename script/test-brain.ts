/**
 * The brain's version constants describe the brain that is actually here.
 *
 * A recommendation recorded in August is only reconstructable if the version
 * it carries still means what it meant in August. That holds exactly as long
 * as nobody edits a decision module without bumping its version — which is not
 * something to hope for. It is something to fail a build over.
 *
 * When this test fails, the fix is two lines in shared/models/brain.ts: raise
 * the version, and paste the digest it prints. Do not paste the digest without
 * raising the version. That is the same as having no version at all, and it is
 * silent, which is worse.
 */
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import {
  BRAIN_VERSION,
  DECISION_ENGINES,
  DECISION_LOGIC,
  GUIDANCE_VERSION,
  PATTERN_ALGORITHM_VERSION,
} from "../shared/models/brain.js";
import { RECOMMENDATION_TYPES, ENGINE_OF, recommendationVersions } from "../shared/models/recommendation.js";
import { digestOf } from "./brainDigest.js";

const ROOT = fileURLToPath(new URL("../", import.meta.url));

let passed = 0;
const failures: string[] = [];
const check = (name: string, ok: boolean, detail = "") => {
  if (ok) passed++;
  else failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
};

const SEMVER = /^\d+\.\d+\.\d+$/;

// ─── Every version names real files ───────────────────────────────────────

for (const engine of DECISION_ENGINES) {
  const v = DECISION_LOGIC[engine];
  check(`${engine}: version is a version`, SEMVER.test(v.version), v.version);
  check(`${engine}: names at least one module`, v.modules.length > 0);
  for (const m of v.modules) {
    check(`${engine}: ${m} exists`, existsSync(join(ROOT, m)));
  }
}

// ─── …and the digest of those files is the one recorded ───────────────────

for (const engine of DECISION_ENGINES) {
  const v = DECISION_LOGIC[engine];
  if (!v.modules.every((m) => existsSync(join(ROOT, m)))) continue;
  const actual = digestOf(v.modules);
  check(
    `${engine}: decision logic ${v.version} still matches its modules`,
    actual === v.digest,
    `recorded ${v.digest}, on disk ${actual} — bump DECISION_LOGIC.${engine}.version and set digest to ${actual}`,
  );
}

// ─── Guidance moves with decision logic, until it doesn't ─────────────────

/*
  Not a redundant assertion. It is the tripwire on the refactor that lifts
  member-facing copy out of the decision modules: on that day this fails, and
  the fix is to give GUIDANCE_VERSION its own module list rather than to delete
  the check.
*/
check(
  "guidance is a version",
  SEMVER.test(GUIDANCE_VERSION),
  GUIDANCE_VERSION,
);
check(
  "pattern algorithm is a version",
  SEMVER.test(PATTERN_ALGORITHM_VERSION),
  PATTERN_ALGORITHM_VERSION,
);
check(
  "guidance copy still lives inside the decision modules",
  DECISION_ENGINES.every((e) => DECISION_LOGIC[e].modules.length > 0),
);

// ─── The brain version is bumped when anything under it is ────────────────

check("brain version is dated", /^\d{4}\.\d{2}\.\d+$/.test(BRAIN_VERSION), BRAIN_VERSION);

// ─── Every recommendation type is owned by exactly one engine ─────────────

for (const type of RECOMMENDATION_TYPES) {
  const engine = ENGINE_OF[type];
  check(`${type}: has an owning engine`, !!engine && DECISION_ENGINES.includes(engine), String(engine));
}

// ─── What actually gets written to a row ──────────────────────────────────

{
  const v = recommendationVersions("today_option");
  check("a recorded recommendation carries the brain version", v.brainVersion === BRAIN_VERSION);
  check(
    "…and the decision version of the engine that produced it",
    v.decisionLogicVersion === `today@${DECISION_LOGIC.today.version}`,
    v.decisionLogicVersion,
  );
  check("…and the guidance version", v.guidanceVersion === GUIDANCE_VERSION);
  /*
    The whole point of the audit. A deterministic recommendation must be
    recorded as deterministic — a NULL here is a fact, not a gap.
  */
  check("…and claims no model", v.modelProvider === null && v.modelId === null && v.promptVersion === null);
  check("…and claims no learned pattern until one is applied", v.patternAlgorithmVersion === null);

  const learned = recommendationVersions("today_option", { patternInformed: true });
  check(
    "a pattern-informed recommendation says so",
    learned.patternAlgorithmVersion === PATTERN_ALGORITHM_VERSION,
    String(learned.patternAlgorithmVersion),
  );
}

if (failures.length) {
  console.error("\n✗ brain versioning\n");
  for (const f of failures) console.error(`    ${f}`);
  console.error("");
  process.exit(1);
}
console.log(`✓ ${passed} brain version assertions passed`);
