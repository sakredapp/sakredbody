/**
 * The Body Map.
 *
 * ── What these hold ───────────────────────────────────────────────────────
 *
 * One body, one subjective history. The screen reads the canonical check-in
 * and never asks its own questions — the failure this replaces was a second
 * subjective system, where a member could tell Sakred their clarity was 2/5
 * and that their crown was "open" five minutes later, about the same lived
 * state, with nothing to reconcile them.
 *
 * And it shows only what Sakred actually knows. A region with no answer
 * renders no reading rather than an invented one.
 *
 * Run: tsx script/test-body-map.ts
 */

import { readFileSync } from "node:fs";
import { MAP_REGIONS } from "../client/src/data/bodyMap.js";
import {
  REGION_ORDER,
  REGION_SIGNALS,
  REGION_NOTICE,
  signalsForRegion,
  hasSignals,
} from "../client/src/lib/bodySignals.js";
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

console.log("\nSeven territories, not nine centres\n");

{
  check("seven regions", REGION_ORDER.length === 7);

  /** The app's map and the website's map are the same map. */
  for (const key of REGION_ORDER) {
    check(`${key} exists in the shared content`, MAP_REGIONS.some((r) => r.key === key));
  }

  const names = REGION_ORDER.map((k) => MAP_REGIONS.find((r) => r.key === k)?.name);
  const expected = [
    "Mind & Awareness",
    "Breath & Pressure",
    "The Central Axis",
    "The Organ Network",
    "The Middle",
    "Flow",
    "Structure & Strength",
  ];
  check("the canonical taxonomy, in order", JSON.stringify(names) === JSON.stringify(expected),
    names.join(" / "));

  /** Every region teaches something to notice, in plain words. */
  for (const key of REGION_ORDER) {
    check(`${key} says what you might notice`, (REGION_NOTICE[key]?.length ?? 0) >= 4);
  }
}

console.log("\nOne body, one subjective history\n");

{
  const body = code("client/src/components/BodyMap.tsx");

  /** The three-state selector is gone, and not merely renamed. */
  check("no blocked/stirring/open", !/blocked|stirring/i.test(body));
  check("nor the same model wearing new labels", !/"Low"|"Medium"|"High"/.test(body));
  check("no nine-centre vocabulary", !/\bCrown\b|\bBrow\b|\bSacral\b|\bSolar\b/.test(body));

  /** Nothing here writes. It is a reading surface. */
  check("the screen records nothing", !/useMutation|apiRequest\("POST/.test(body));
  check("and asks no questions of its own", !/useRecordReading|CentreState/.test(body));

  /** It reads the canonical check-in, on the same key the check-in writes. */
  check("it reads the canonical check-in", /"\/api\/terrain\/checkin"/.test(body));

  /** Every region maps only to real canonical signals. */
  for (const key of REGION_ORDER) {
    const ids = REGION_SIGNALS[key] ?? [];
    check(`${key} maps to real signals`, ids.length > 0 && ids.every((id) => SIGNAL_KEYS.includes(id)));
  }

  /** The one unambiguous mapping, pinned. */
  check("The Middle reads digestion", REGION_SIGNALS.gut.includes("digestion"));
  check("Mind & Awareness reads clarity", REGION_SIGNALS.crown.includes("mentalClarity"));

  /**
   * Not every signal under every region. Seven regions each showing three
   * signals is one answer wearing seven hats, and teaches nothing.
   */
  const total = REGION_ORDER.reduce((n, k) => n + REGION_SIGNALS[k].length, 0);
  check("mappings stay narrow", total <= TERRAIN_SIGNALS.length * 2, `${total} mappings`);
}

console.log("\nOnly what Sakred actually knows\n");

{
  check("no check-in, no reading", signalsForRegion("crown", null).length === 0);
  check("and nothing claimed", !hasSignals("crown", null));

  /** An unanswered signal is absent, not zero. */
  const partial = { mentalClarity: 2, energy: null };
  const crown = signalsForRegion("crown", partial);
  check("an answered signal shows", crown.some((s) => s.id === "mentalClarity" && s.value === 2));
  check("an unanswered one does not", !crown.some((s) => s.id === "energy"));
  check("a null is not read as a zero", crown.every((s) => typeof s.value === "number"));

  /** A region whose signals were not answered says nothing at all. */
  check("digestion unanswered means The Middle is silent", !hasSignals("gut", { energy: 4 }));
  check("digestion answered means it speaks", hasSignals("gut", { digestion: 2 }));

  const body = code("client/src/components/BodyMap.tsx");
  check(
    "the Today section renders only when there is something in it",
    /signals\.length > 0 && \(/.test(body),
  );
  check("and every value is source-labelled", /Member reported/.test(body));
}

console.log("\nTradition and measurement stay apart\n");

{
  const body = code("client/src/components/BodyMap.tsx");
  check("a traditional lens is labelled as one", /Traditional lens/.test(body));
  check("and a modern one separately", /Modern lens/.test(body));
  check("they are never merged into one claim", !/region\.lens \+ |`\$\{region\.lens\}.*\$\{region\.measured\}/.test(body));
  check("and the screen still says it is not a diagnosis", /isn't a diagnosis/.test(body));
}

console.log("\nThe nine centres are retired, not deleted\n");

{
  /**
   * They remain a real tributary and should return as an optional traditional
   * lens. Deleting the server side would make that a rebuild rather than a
   * route, so the tables and hooks stay.
   */
  check("the centre hooks still exist", src("client/src/hooks/use-energy.ts").length > 0);
}

console.log(`\n${failed === 0 ? "✓" : "✗"} ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
