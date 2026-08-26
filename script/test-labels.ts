/**
 * Every canonical value a member can meet has words.
 *
 * ── The failure this makes impossible ─────────────────────────────────────
 *
 * A member confirming an imported workout read "Sakred reads this as
 * full_body." The label existed. The registry existed. The component simply
 * interpolated the raw column, and nothing anywhere could tell.
 *
 * The deeper problem was not that one line. It was that three copies of the
 * same label map had accumulated — one canonical, two hand-written in
 * components — and each copy was free to be missing an entry. A copy that is
 * missing an entry does not fail; it falls through to `?? value`, and the
 * database vocabulary is on the phone.
 *
 * So this asserts two things a type cannot:
 *
 *   1. every value of every finite enum resolves to a label that is not the
 *      value itself, and reads as English;
 *   2. there is exactly one copy of each map.
 *
 * The second is what stops this recurring. `satisfies Record<T, string>` in
 * labels.ts already makes a *missing* entry a compile error — but only for the
 * copy the compiler is looking at, and the two that caused this bug were
 * `Record<string, string>`, which accepts anything and returns undefined.
 */

import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import {
  LABELLED_ENUMS,
  terrainSourceLabel,
  humanise,
  categoryLabel,
  healthActivityLabel,
} from "../shared/models/labels.js";

const ROOT = fileURLToPath(new URL("../", import.meta.url));

let passed = 0;
const failures: string[] = [];
const check = (name: string, ok: boolean, detail = "") => {
  if (ok) passed++;
  else failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
};

// ─── 1. Every value resolves, and to something human ──────────────────────

for (const [name, spec] of Object.entries(LABELLED_ENUMS)) {
  const missing: string[] = [];
  const machine: string[] = [];
  for (const value of spec.values) {
    const label = spec.label(value);
    if (!label) {
      missing.push(value);
      continue;
    }
    /*
      The label must not be the identifier. Returning the raw value is exactly
      what `?? value` did, and it is the shape of the original defect — it
      "works" for every id that happens to be a word and leaks for every id
      that happens to contain an underscore.
    */
    if (label === value) machine.push(value);
    else if (/[_]/.test(label)) machine.push(`${value} → ${label}`);
  }
  check(`${name}: every value has a label`, missing.length === 0, missing.join(", "));
  check(`${name}: no label is the identifier`, machine.length === 0, machine.join(", "));
}

// ─── 2. Hyphenation the machine could not have guessed ────────────────────

/*
  These are the cases that prove a title-casing helper is not a substitute for
  a registry. "Warmup" and "Backoff" read as typos to the only people who see
  them, and both are what `humanise` would produce.
*/
{
  const set = LABELLED_ENUMS.setStyle;
  check("warmup is written Warm-up", set.label("warmup") === "Warm-up", String(set.label("warmup")));
  check("dropset is written Drop set", set.label("dropset") === "Drop set", String(set.label("dropset")));
  check("backoff is written Back-off set", set.label("backoff") === "Back-off set", String(set.label("backoff")));
  check("humanise would have got these wrong", humanise("warmup") === "Warmup");
}

// ─── 3. The screenshot case ───────────────────────────────────────────────

check("full_body reads as Full body", categoryLabel("full_body") === "Full body", String(categoryLabel("full_body")));
/*
  Null, not the id. A caller that wants to render an unknown category anyway
  has to say so out loud — a silent fallback to the raw value is the original
  bug with a helper wrapped around it.
*/
check("an unknown category resolves to nothing at all", categoryLabel("not_a_category") === null);
check("…and so does an absent one", categoryLabel(null) === null && categoryLabel(undefined) === null);

// ─── 3b. The second screenshot case ──────────────────────────────────────

/*
  "Functionalstrengthtraining" reached a real phone. HKWorkoutActivityType has
  no runtime name, so rows carry the enum case lowercased with its word
  boundaries gone — and the old lookup was keyed on `functional_strength`,
  which never matched anything that existed.
*/
{
  const cases: [string, string | null][] = [
    ["functionalstrengthtraining", "Strength"],
    ["traditionalstrengthtraining", "Strength"],
    ["highintensityintervaltraining", "HIIT"],
    ["mindandbody", "Mind and body"],
    ["stairclimbing", "Stairs"],
    ["strength", "Strength"],
    ["yoga", "Yoga"],
    /* Separators kept: the writer preserved the boundaries, so title-case is safe. */
    ["martial arts", "Martial arts"],
    ["jump_rope", "Jump rope"],
    /* A plausible single word from a third-party app still gets through. */
    ["pickleball", "Pickleball"],
    ["kickboxing", "Kickboxing"],
    /* And an unknown run-together identifier is admitted to, not guessed at. */
    ["somenewcollapsedactivitytype", null],
    ["other", null],
    ["", null],
  ];
  for (const [input, want] of cases) {
    const got = healthActivityLabel(input);
    check(`healthActivityLabel(${JSON.stringify(input)})`, got === want, `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
  }

  /* The regression, stated as the string that must never appear again. */
  check(
    "no imported activity renders as a run-together identifier",
    healthActivityLabel("functionalstrengthtraining") !== "Functionalstrengthtraining",
  );
}

// ─── 3c. The retired helper cannot be used by accident ───────────────────

{
  const src = readFileSync(join(ROOT, "shared/models/training.ts"), "utf8");
  check("the old title-casing helper throws rather than title-cases",
    /export function activityLabel\(\): never/.test(src));

  const callers = execSync(
    `grep -rln 'activityLabel' client/src server --include='*.ts' --include='*.tsx' || true`,
    { cwd: ROOT, encoding: "utf8" },
  ).split("\n").map((x) => x.trim()).filter(Boolean);
  /* Every remaining caller must be reaching the new one. */
  const bad = callers.filter((f) => {
    const src = readFileSync(join(ROOT, f), "utf8");
    return /(?<!health)activityLabel\(/.test(src.replace(/healthActivityLabel/g, "healthActivityLabel"));
  }).filter((f) => !/healthActivityLabel/.test(readFileSync(join(ROOT, f), "utf8")));
  check("nothing still calls the retired helper", bad.length === 0, bad.join(", "));
}

// ─── 4. One value, the right words for who is reading ─────────────────────

/*
  `measured` title-cased is "Measured", which tells a member nothing. What they
  need is that it came from their watch — and a coach reading somebody else's
  terrain cannot be told it came from "your" devices.
*/
check("measured speaks to the member about their devices",
  terrainSourceLabel("measured") === "From your devices", terrainSourceLabel("measured"));
check("reported speaks about their check-in",
  terrainSourceLabel("reported") === "From today's check-in", terrainSourceLabel("reported"));
check("a coach is never told it is theirs",
  !terrainSourceLabel("measured", "coach").includes("your"), terrainSourceLabel("measured", "coach"));
check("…and the two remain distinguishable in both voices",
  terrainSourceLabel("measured", "coach") !== terrainSourceLabel("reported", "coach"));

// ─── 5. There is exactly one copy of each map ─────────────────────────────

/*
  The structural half, and the reason this defect happened at all.

  Two components had hand-written duplicates of the focus labels, typed
  `Record<string, string>` — which accepts a partial map and returns undefined
  for anything absent, so the compiler had nothing to say. A third copy would
  have been just as invisible.
*/
{
  const found = execSync(
    `grep -rln 'chest: "Chest"' client/src shared server --include='*.ts' --include='*.tsx' || true`,
    { cwd: ROOT, encoding: "utf8" },
  ).split("\n").map((x) => x.trim()).filter(Boolean);

  check(
    "the focus labels are written down exactly once",
    found.length === 1 && found[0] === "shared/models/labels.ts",
    found.join(", ") || "nowhere — the registry has moved",
  );
}

{
  /*
    Nothing outside the registry may map a category id to words. A component
    that needs a label imports one; a component that writes its own is the
    beginning of the next drift.
  */
  const found = execSync(
    `grep -rln 'full_body: "Full body"' client/src shared server --include='*.ts' --include='*.tsx' || true`,
    { cwd: ROOT, encoding: "utf8" },
  ).split("\n").map((x) => x.trim()).filter(Boolean);
  const allowed = new Set(["shared/models/labels.ts", "shared/models/training.ts"]);
  const stray = found.filter((f) => !allowed.has(f));
  check("no component writes its own category labels", stray.length === 0, stray.join(", "));
}

{
  /*
    `?? value` is the fallback that turns a missing label into a leak. It is
    the single most reliable textual signature of this bug, so it is worth
    refusing outright in the places that render.
  */
  const found = execSync(
    `grep -rn 'LABEL\\[[a-zA-Z.]*\\] ?? ' client/src --include='*.tsx' || true`,
    { cwd: ROOT, encoding: "utf8" },
  ).split("\n").map((x) => x.trim()).filter(Boolean);
  check(
    "no render falls back to the raw value when a label is missing",
    found.length === 0,
    found.slice(0, 4).join(" | "),
  );
}

// ─── 6. The registry covers what the schema can hold ──────────────────────

/*
  A category added to EXERCISE_CATEGORIES arrives with its label, because that
  registry pairs them. This asserts the pairing rather than trusting it — an
  entry with an empty label would type-check and render as nothing.
*/
{
  const src = readFileSync(join(ROOT, "shared/models/training.ts"), "utf8");
  const entries = [...src.matchAll(/\{\s*id:\s*"([\w-]+)",\s*label:\s*"([^"]*)"/g)];
  const blank = entries.filter(([, , label]) => !label.trim()).map(([, id]) => id);
  check("every exercise category carries wording", blank.length === 0, blank.join(", "));
}

if (failures.length) {
  console.error("\n✗ presentation labels\n");
  for (const f of failures) console.error(`    ${f}`);
  console.error("");
  process.exit(1);
}
console.log(`✓ ${passed} label assertions passed`);
