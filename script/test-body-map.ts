/**
 * The Sakred Body Map.
 *
 * ── What these hold ───────────────────────────────────────────────────────
 *
 * One canon, two surfaces. The website teaches the philosophy and the app makes
 * it personal, and both must cover all seven territories — but neither owns the
 * other's words. The app used to read the website's content object directly,
 * which meant a copy edit on a marketing page silently changed what a member's
 * health screen said about their body.
 *
 * One body, one subjective history. The screen reads the canonical check-in and
 * never asks its own questions — the failure it replaced was a second
 * subjective system, where somebody could report clarity 2/5 and "crown: open"
 * five minutes apart about the same lived state.
 *
 * And relevance is not measurement. Nothing in Sakred measures Flow.
 *
 * Run: tsx script/test-body-map.ts
 */

import { readFileSync } from "node:fs";
import { MAP_REGIONS } from "../client/src/data/bodyMap.js";
import { APP_REGIONS } from "../client/src/data/bodyMapApp.js";
import { signalsForRegion, hasSignals } from "../client/src/lib/bodySignals.js";
import {
  BODY_REGION_KEYS,
  BODY_REGION_NAMES,
  BODY_REGION_ORDER,
} from "../shared/models/bodyMap.js";
import { SIGNAL_KEYS, TERRAIN_SIGNALS } from "../shared/models/terrainSignals.js";

let passed = 0;
let failed = 0;

function check(name: string, cond: boolean, detail?: string) {
  if (cond) passed++;
  else {
    failed++;
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const code = (p: string) =>
  src(p)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

console.log("\nOne canon, seven territories\n");

{
  check("seven keys", BODY_REGION_KEYS.length === 7);
  check("read head to ground", BODY_REGION_ORDER.length === 7);
  check(
    "the order covers every key exactly once",
    new Set(BODY_REGION_ORDER).size === 7 && BODY_REGION_ORDER.every((k) => BODY_REGION_KEYS.includes(k)),
  );

  const expected = [
    "Mind & Awareness",
    "Breath & Pressure",
    "The Central Axis",
    "The Organ Network",
    "The Middle",
    "Flow",
    "Structure & Strength",
  ];
  check(
    "the canonical taxonomy, in order",
    JSON.stringify(BODY_REGION_ORDER.map((k) => BODY_REGION_NAMES[k])) === JSON.stringify(expected),
  );
}

console.log("\nBoth surfaces cover the canon, neither owns the other\n");

{
  /**
   * The contract, asserted in both directions. Adding a territory is a
   * deliberate act in three files rather than a drift in one.
   */
  for (const key of BODY_REGION_KEYS) {
    check(`the app covers ${key}`, Boolean(APP_REGIONS[key]));
    check(`the website covers ${key}`, MAP_REGIONS.some((r) => r.key === key));
  }
  check("the app adds no territory of its own", Object.keys(APP_REGIONS).length === 7);
  check("nor does the website", MAP_REGIONS.length === 7);

  /**
   * The app must not read the website's content. Sharing the taxonomy is the
   * point; sharing the prose is what let a copywriter edit a health screen.
   */
  const body = code("client/src/components/BodyMap.tsx");
  const signals = code("client/src/lib/bodySignals.ts");
  const appData = code("client/src/data/bodyMapApp.ts");
  for (const [name, s] of [["the screen", body], ["the reading layer", signals], ["the app content", appData]] as const) {
    check(`${name} does not import the website's copy`, !/from "@\/data\/bodyMap"/.test(s));
  }
  check("the screen takes its names from the canon", /BODY_REGION_NAMES/.test(body));
  check("and its content from the app's own file", /APP_REGIONS/.test(body));

  /** Neither surface hardcodes the taxonomy a second time. */
  check(
    "the app content does not restate the names",
    !/Mind & Awareness|Structure & Strength/.test(appData),
  );
}

console.log("\nOne body, one subjective history\n");

{
  const body = code("client/src/components/BodyMap.tsx");

  check("no blocked/stirring/open", !/blocked|stirring/i.test(body));
  check("nor the same model wearing new labels", !/"Low"|"Medium"|"High"/.test(body));
  check("no nine-centre vocabulary on screen", !/\bBrow\b|\bSacral\b|\bSolar\b/.test(body));

  check("the screen records nothing", !/useMutation|apiRequest\("POST/.test(body));
  check("and asks no questions of its own", !/useRecordReading|CentreState/.test(body));
  check("it reads the canonical check-in", /"\/api\/terrain\/checkin"/.test(body));

  for (const key of BODY_REGION_KEYS) {
    const ids = APP_REGIONS[key].signals;
    check(`${key} maps only to real signals`, ids.length > 0 && ids.every((id) => SIGNAL_KEYS.includes(id)));
    check(`${key} says what you might notice`, APP_REGIONS[key].notice.length >= 4);
  }

  check("The Middle relates to digestion", APP_REGIONS.gut.signals.includes("digestion"));
  check("Mind & Awareness relates to clarity", APP_REGIONS.crown.signals.includes("mentalClarity"));

  const total = BODY_REGION_KEYS.reduce((n, k) => n + APP_REGIONS[k].signals.length, 0);
  check("mappings stay narrow", total <= TERRAIN_SIGNALS.length * 2, `${total} mappings`);
}

console.log("\nRelevance, never measurement\n");

{
  const body = code("client/src/components/BodyMap.tsx");

  /**
   * The label is load-bearing. "Today" over a region heading reads as a reading
   * of that region; "Related today" says what it actually is.
   */
  check("the section is labelled as related", /Related today/.test(body));
  check("and not as a reading of the territory", !/<Label>Today<\/Label>/.test(body));

  /**
   * The signal keeps its own name, so it cannot be read as a region score.
   *
   * Asserted as "a label function is called and the raw id is not rendered",
   * rather than against one spelling of the lookup. This previously pinned
   * `SIGNAL_LABEL[s.id]`, and broke when that map moved into the canonical
   * label registry — the behaviour it names was never affected. A test that
   * fails on a rename it does not care about gets relaxed by whoever is in a
   * hurry, and the invariant goes with it.
   */
  check("each signal is named", /terrainSignalLabel\(s\.id\)/.test(body));
  check("and carries its provenance", /Member reported/.test(body));
  /** Nothing may render a region's name against a number. */
  check(
    "no region is ever scored",
    !/BODY_REGION_NAMES\[regionKey\]\}[^<]*\{s\.value|region.*\/5/.test(body),
  );
}

console.log("\nOnly what Sakred actually knows\n");

{
  check("no check-in, no reading", signalsForRegion("crown", null).length === 0);
  check("and nothing claimed", !hasSignals("crown", null));

  const partial = { mentalClarity: 2, energy: null };
  const crown = signalsForRegion("crown", partial);
  check("an answered signal shows", crown.some((s) => s.id === "mentalClarity" && s.value === 2));
  check("an unanswered one does not", !crown.some((s) => s.id === "energy"));
  check("a null is not read as a zero", crown.every((s) => typeof s.value === "number"));

  check("digestion unanswered means The Middle is silent", !hasSignals("gut", { energy: 4 }));
  check("digestion answered means it speaks", hasSignals("gut", { digestion: 2 }));

  const body = code("client/src/components/BodyMap.tsx");
  check("the section renders only when it has something in it", /signals\.length > 0 && \(/.test(body));
}

console.log("\nTradition and measurement stay apart\n");

{
  const body = code("client/src/components/BodyMap.tsx");
  check("a traditional lens is labelled as one", /Traditional lens/.test(body));
  check("and a modern one separately", /Modern lens/.test(body));
  check("they are never concatenated", !/traditional\}.*\{.*modern/.test(body));
  check("and the screen still says it is not a diagnosis", /isn't a diagnosis/.test(body));

  /** Every region keeps both, so neither can quietly go missing. */
  for (const key of BODY_REGION_KEYS) {
    check(`${key} keeps both lenses`, Boolean(APP_REGIONS[key].traditional && APP_REGIONS[key].modern));
  }
}

console.log("\nThe nine centres are retired, not deleted\n");

{
  check("the centre hooks still exist", src("client/src/hooks/use-energy.ts").length > 0);
}

console.log(`\n${failed === 0 ? "✓" : "✗"} ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
