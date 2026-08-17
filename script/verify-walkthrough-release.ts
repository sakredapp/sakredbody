/**
 * The one place a half-proven walkthrough cannot get past.
 *
 * ── Why this is separate from the suite ───────────────────────────────────
 *
 * `npm test` reports unmet walkthrough gates and stays green, because the
 * feature is under construction and a suite that is red for honest reasons is a
 * suite people learn to run with a flag. This one is not permissive: the moment
 * `AUTO_START_ENABLED` becomes true, every gate is mandatory and an unmet one
 * fails the build.
 *
 * The asymmetry is the point. Turning the tutorial on for every member of the
 * product is a one-line change, and one-line changes are exactly the kind made
 * on a Friday by somebody who believes the work is finished. This is what makes
 * that line refuse until it actually is.
 *
 * It runs inside `npm test` as well, so the refusal cannot be skipped by nobody
 * having remembered to run the release command.
 */

import { execSync } from "node:child_process";
import {
  AUTO_START_ENABLED,
  TOUR_ANCHORS,
  placedAnchors,
  walkthroughGates,
} from "./walkthrough-gates.js";

const grep = execSync(`grep -rho 'data-tour-id="[a-z-]*"' client/src || true`, { encoding: "utf8" });
const placed = placedAnchors(grep);

/*
  The nav and role pills build their anchor from an id, so no literal exists to
  grep. Their generated shape is asserted in the tour suite; here it is read
  once so the count is honest rather than short by eight.
*/
const navGenerated = execSync(
  "grep -c 'data-tour-id={`nav-' client/src/components/MemberNav.tsx || true",
  { encoding: "utf8" },
).trim();
if (Number(navGenerated) > 0) {
  for (const a of [
    "nav-home", "nav-restore", "nav-build", "nav-community", "nav-body",
    "nav-more-settings", "nav-more-wins", "role-coach",
  ]) placed.add(a);
}

const missing = TOUR_ANCHORS.filter((a) => !placed.has(a));
const gates = walkthroughGates(placed, missing.length);
const unmet = Object.entries(gates).filter(([, met]) => !met).map(([name]) => name);

const mountedIn = execSync(
  `grep -rlE "GuidedTourOverlay|<TourHost" client/src --include=*.tsx | grep -v components/tour/ || true`,
  { encoding: "utf8" },
).trim();

/*
  Required rollout with anything outstanding is the failure this file exists
  for. Everything else here is reporting.
*/
if (AUTO_START_ENABLED && unmet.length > 0) {
  console.error("\n\u2717 walkthrough release\n");
  console.error("    Required rollout is ON while these gates are unmet:\n");
  for (const g of unmet) console.error(`      \u00b7 ${g}`);
  console.error("\n    A mandatory tutorial that has not been proven is worse than none:");
  console.error("    it is unskippable, it is the product's first impression, and it");
  console.error("    arrives for existing members who were perfectly happy.\n");
  process.exit(1);
}

if (AUTO_START_ENABLED && !mountedIn) {
  console.error("\n\u2717 walkthrough release\n");
  console.error("    Required rollout is ON but the overlay is rendered nowhere.\n");
  process.exit(1);
}

if (unmet.length > 0) {
  console.log(`  walkthrough rollout held \u2014 outstanding: ${unmet.join(", ")}`);
}
console.log(
  `\u2713 walkthrough release gate (${placed.size}/${TOUR_ANCHORS.length} anchors, ` +
    `rollout ${AUTO_START_ENABLED ? "ON" : "OFF"}, ` +
    `mounted in ${mountedIn ? String(mountedIn.split("\n").length) + " file(s)" : "nothing"})`,
);
