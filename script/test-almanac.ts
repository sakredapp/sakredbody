/**
 * Almanac tests — the facts a daily note is written from.
 *
 * The moon cases are checked against real lunations, because the whole point
 * of computing this rather than inventing it is that it can be wrong in a way
 * you can catch.
 *
 *   npx tsx script/test-almanac.ts
 */

import {
  moonState,
  sunSign,
  season,
  elementalSeason,
  reduceNumber,
  universalDay,
  personalYear,
  personalMonth,
  personalDay,
  nameNumbers,
  explainY,
  almanacFor,
} from "../shared/utils/almanac.js";

let passed = 0;
let failed = 0;

function check(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) passed++;
  else {
    failed++;
    console.log(`  ✗ ${name}\n      expected ${e}\n      got      ${a}`);
  }
}
const section = (t: string) => console.log(`\n${t}`);

// ═══ Moon, against real lunations ══════════════════════════════════════════

section("Moon phase vs. known new and full moons");
const lunations: [string, string][] = [
  ["2024-01-11", "new"],
  ["2024-01-25", "full"],
  ["2025-01-29", "new"],
  ["2025-01-13", "full"],
  ["2026-01-18", "new"],
  ["2026-01-03", "full"],
  ["2026-08-12", "new"],
  ["2026-08-28", "full"],
];
for (const [d, expected] of lunations) {
  check(`${d} is ${expected}`, moonState(new Date(`${d}T12:00:00Z`)).phase, expected);
}

section("Moon illumination and direction");
check("new moon is dark", moonState(new Date("2026-08-12T12:00:00Z")).illumination < 0.05, true);
check("full moon is lit", moonState(new Date("2026-08-28T12:00:00Z")).illumination > 0.95, true);
check(
  "a week after new is waxing",
  moonState(new Date("2026-08-19T12:00:00Z")).direction,
  "waxing",
);
check(
  "a week after full is waning",
  moonState(new Date("2026-09-04T12:00:00Z")).direction,
  "waning",
);
check("dates before the epoch still work", moonState(new Date("1969-07-20T12:00:00Z")).phase.length > 0, true);

// ═══ Sun sign ══════════════════════════════════════════════════════════════

section("Sun sign");
check("Aug 8 is Leo", sunSign(new Date("2026-08-08T12:00:00Z")), "Leo");
check("Aug 23 is Leo", sunSign(new Date("2026-08-23T12:00:00Z")), "Leo");
check("Aug 24 is Virgo", sunSign(new Date("2026-08-24T12:00:00Z")), "Virgo");
check("Jan 1 is Capricorn", sunSign(new Date("2026-01-01T12:00:00Z")), "Capricorn");
check("Jan 21 is Aquarius", sunSign(new Date("2026-01-21T12:00:00Z")), "Aquarius");
check("Dec 22 is Capricorn", sunSign(new Date("2026-12-22T12:00:00Z")), "Capricorn");

// ═══ Seasons ═══════════════════════════════════════════════════════════════

section("Season, both hemispheres");
check("August is summer up north", season(new Date("2026-08-08T12:00:00Z")), "summer");
check("August is winter down south", season(new Date("2026-08-08T12:00:00Z"), "south"), "winter");
check("January is winter up north", season(new Date("2026-01-15T12:00:00Z")), "winter");
check("April is spring", season(new Date("2026-04-15T12:00:00Z")), "spring");
check("October is autumn", season(new Date("2026-10-15T12:00:00Z")), "autumn");

section("Five-element season — why a liver protocol belongs in spring");
check("April is wood/liver", elementalSeason(new Date("2026-04-01T12:00:00Z")).element, "wood");
check("April maps to the solar centre", elementalSeason(new Date("2026-04-01T12:00:00Z")).centreId, "solar");
check("June is fire/heart", elementalSeason(new Date("2026-06-15T12:00:00Z")).element, "fire");
check("late August is earth", elementalSeason(new Date("2026-08-20T12:00:00Z")).element, "earth");
check("late August maps to the gut", elementalSeason(new Date("2026-08-20T12:00:00Z")).centreId, "gut");
check("October is metal/lung", elementalSeason(new Date("2026-10-01T12:00:00Z")).element, "metal");
check("December is water/kidney", elementalSeason(new Date("2026-12-15T12:00:00Z")).element, "water");
check("water maps to the sacral centre", elementalSeason(new Date("2026-12-15T12:00:00Z")).centreId, "sacral");

// Every day of a year must land in exactly one element, with no gaps.
section("Five-element season covers the whole year");
const elements = new Set<string>();
let uncovered = 0;
for (let m = 0; m < 12; m++) {
  for (let d = 1; d <= 28; d++) {
    const e = elementalSeason(new Date(Date.UTC(2026, m, d, 12)));
    if (!e.element) uncovered++;
    elements.add(e.element);
  }
}
check("no uncovered days", uncovered, 0);
check("all five elements appear", elements.size, 5);

// ═══ Numerology ════════════════════════════════════════════════════════════

section("Reduction, holding master numbers");
check("9 stays 9", reduceNumber(9), 9);
check("10 reduces to 1", reduceNumber(10), 1);
check("28 reduces to 1", reduceNumber(28), 1);
check("11 is held", reduceNumber(11), 11);
check("22 is held", reduceNumber(22), 22);
check("33 is held", reduceNumber(33), 33);
check("29 reduces to 11 and stops", reduceNumber(29), 11);
check("48 reduces to 3", reduceNumber(48), 3);

section("Date numbers");
// 2+0+2+6+0+8+0+8 = 26 -> 8
check("universal day for 2026-08-08", universalDay("2026-08-08"), 8);
check("personal year is a valid number", (personalYear("1990-05-14", "2026-08-08") ?? 0) > 0, true);
check("personal month is a valid number", (personalMonth("1990-05-14", "2026-08-08") ?? 0) > 0, true);
check("personal day is a valid number", (personalDay("1990-05-14", "2026-08-08") ?? 0) > 0, true);
check("malformed birth date yields null", personalDay("not-a-date", "2026-08-08"), null);

// Two people born on different days get different personal days — the whole
// reason this is per-member rather than per-date.
const dayA = personalDay("1990-05-14", "2026-08-08");
const dayB = personalDay("1978-11-02", "2026-08-08");
check("different births give different personal days", dayA !== dayB, true);

section("Name numbers");
// J=1 O=6 H=8 N=5  D=4 O=6 E=5 -> vowels O,O,E = 6+6+5 = 17 -> 8
//                                  consonants J,H,N,D = 1+8+5+4 = 18 -> 9
//                                  expression 17+18 = 35 -> 8
const john = nameNumbers("John Doe");
check("soul urge from vowels", john.soulUrge, 8);
check("personality from consonants", john.personality, 9);
check("expression from all letters", john.expression, 8);

check("empty name yields nulls", nameNumbers(""), { expression: null, soulUrge: null, personality: null });
check("null name yields nulls", nameNumbers(null), { expression: null, soulUrge: null, personality: null });
check("punctuation is ignored", nameNumbers("O'Brien").expression, nameNumbers("OBrien").expression);
check("case is ignored", nameNumbers("john doe").expression, nameNumbers("JOHN DOE").expression);
check("a middle name changes the number", nameNumbers("John Doe").expression !== nameNumbers("John Michael Doe").expression, true);

// ─── Y ─────────────────────────────────────────────────────────────────────
//
// Soul urge is vowels alone and personality is consonants alone, so a
// misclassified Y moves a letter from one number to the other and changes
// both. This mattered more than it looks: the rule used to ask whether the
// *word* held any other vowel, which called the Y in "Bryan" a consonant
// because of the A — and produced a soul urge for Kyle built from a single E.
//
// The rule is about the syllable. Y is a consonant only where it opens one:
// after a vowel sound, or at the start of a word before a vowel.
const Y_CASES: [string, string][] = [
  // No other vowel — the classic case, and the only one the old rule got right
  ["Lynn", "v"],
  ["Myrtle", "v"],
  ["Bryn", "v"],
  // Trailing Y, carrying the sound
  ["Mary", "v"],
  ["Betty", "v"],
  ["Amy", "v"],
  // A consonant in front, a vowel behind — every one of these was wrong before
  ["Bryan", "v"],
  ["Kyle", "v"],
  ["Tyler", "v"],
  ["Lyla", "v"],
  ["Bryce", "v"],
  ["Skyler", "v"],
  // Opening a word onto a vowel: the "yuh" sound
  ["Yolanda", "c"],
  ["Yasmine", "c"],
  // Opening a word onto a consonant — "EEV", so the Y is the vowel
  ["Yves", "v"],
  // A vowel sound already in front, so the Y starts the next syllable
  ["Maya", "c"],
  ["Kayla", "c"],
  // ...including across the W glide of "aw"
  ["Sawyer", "c"],
  // Two Ys in one name, classified independently
  ["Yancy", "cv"],
  ["Kyley", "vc"],
];
for (const [name, expected] of Y_CASES) {
  check(
    `Y in ${name}`,
    explainY(name)
      .map((y) => (y.isVowel ? "v" : "c"))
      .join(""),
    expected
  );
}

// And the classification actually reaches the numbers, rather than only the
// explanation shown to the member.
check(
  "a vowel Y counts toward soul urge",
  nameNumbers("Lynn").soulUrge !== null,
  true
);
check(
  "a consonant Y does not",
  nameNumbers("Maya").soulUrge,
  nameNumbers("Maa").soulUrge
);

// ═══ Progressive personalisation ═══════════════════════════════════════════
// A member gives what they know. Nothing is required, and depth reports how
// much of the picture exists so a note can't claim more than it has.

section("Depth scales with what the member supplied");
check("no chart at all", almanacFor("2026-08-08").personal, undefined);

const nameOnly = almanacFor("2026-08-08", { birthName: "John Michael Doe" });
check("name only still gives an expression", nameOnly.personal?.expression !== null, true);
check("name only gives no personal day", nameOnly.personal?.personalDay, null);
check("name only is shallow", nameOnly.personal!.depth < 0.5, true);

const dateOnly = almanacFor("2026-08-08", { birthDate: "1990-05-14" });
check("date only gives a personal day", dateOnly.personal?.personalDay !== null, true);
check("date only gives no expression", dateOnly.personal?.expression, null);

const full = almanacFor("2026-08-08", {
  birthDate: "1990-05-14",
  birthName: "John Michael Doe",
  lifePathNumber: 2,
  sunSign: "Taurus",
  moonSign: "Pisces",
  risingSign: "Leo",
});
check("a full chart is depth 1", full.personal!.depth, 1);
check("full chart has a personal day", full.personal?.personalDay !== null, true);
check("full chart has an expression", full.personal?.expression !== null, true);
check("full chart keeps the moon sign", full.personal?.moonSign, "Pisces");

section("The day itself is always present");
const day = almanacFor("2026-08-08");
check("has a date", day.date, "2026-08-08");
check("has a moon phase", typeof day.moon.phase, "string");
check("has a sun sign", day.sunSign, "Leo");
check("has an elemental season", day.elemental.element, "earth");
check("has a universal day", day.universalDay, 8);

console.log(`\n${failed === 0 ? "✓" : "✗"} ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
