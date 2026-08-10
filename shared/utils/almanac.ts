/**
 * The almanac — what is actually true about a given day.
 *
 * Pure functions over a date. No database, no clock, no network, no model.
 * These are the *inputs* to the daily theme: real sky, real season, real
 * position in a protocol. The words that get written about them come later
 * and elsewhere — this file is only ever facts.
 *
 * That separation is the point. If the theme ever reads as invented, the fix
 * is in the writing layer, because everything here is checkable against an
 * ephemeris.
 */

// ─── Moon ──────────────────────────────────────────────────────────────────

/** Mean synodic month — new moon to new moon. */
const SYNODIC_MONTH = 29.530588853;

/**
 * A known new moon, as a Unix timestamp: 2000-01-06 18:14 UTC.
 *
 * Using the mean synodic month from a fixed epoch drifts from the true new
 * moon by up to ~14 hours, because the moon's orbit is eccentric. That is
 * comfortably inside a one-day bucket, which is all we need — we report which
 * of eight phases the day falls in, not the minute of syzygy.
 */
const KNOWN_NEW_MOON = Date.UTC(2000, 0, 6, 18, 14, 0);

export const MOON_PHASES = [
  "new",
  "waxing crescent",
  "first quarter",
  "waxing gibbous",
  "full",
  "waning gibbous",
  "last quarter",
  "waning crescent",
] as const;

export type MoonPhase = (typeof MOON_PHASES)[number];

export interface MoonState {
  phase: MoonPhase;
  /** 0 at new, 0.5 at full, approaching 1 back at new. */
  fraction: number;
  /** 0 dark, 1 fully lit. */
  illumination: number;
  /** Waxing means filling; waning means emptying. Null exactly at new/full. */
  direction: "waxing" | "waning" | null;
  /** Days since the last new moon. */
  age: number;
}

export function moonState(date: Date): MoonState {
  const days = (date.getTime() - KNOWN_NEW_MOON) / 86_400_000;
  // Modulo that stays positive for dates before the epoch.
  const age = ((days % SYNODIC_MONTH) + SYNODIC_MONTH) % SYNODIC_MONTH;
  const fraction = age / SYNODIC_MONTH;

  // Eight equal buckets, each centred on its phase — so "new" spans the day
  // either side of the new moon rather than starting at it.
  const index = Math.floor((fraction + 1 / 16) * 8) % 8;
  const phase = MOON_PHASES[index];

  const illumination = (1 - Math.cos(2 * Math.PI * fraction)) / 2;

  let direction: "waxing" | "waning" | null = null;
  if (phase !== "new" && phase !== "full") {
    direction = fraction < 0.5 ? "waxing" : "waning";
  }

  return { phase, fraction, illumination, direction, age };
}

// ─── Sun sign ──────────────────────────────────────────────────────────────

export const ZODIAC = [
  "Capricorn",
  "Aquarius",
  "Pisces",
  "Aries",
  "Taurus",
  "Gemini",
  "Cancer",
  "Leo",
  "Virgo",
  "Libra",
  "Scorpio",
  "Sagittarius",
] as const;

export type ZodiacSign = (typeof ZODIAC)[number];

/** Last day of the *previous* sign, per month. Cusps move a day either way. */
const SIGN_CUTOVER = [20, 19, 20, 20, 21, 21, 22, 23, 23, 23, 22, 21];

export function sunSign(date: Date): ZodiacSign {
  const month = date.getUTCMonth();
  const day = date.getUTCDate();
  return day > SIGN_CUTOVER[month] ? ZODIAC[(month + 1) % 12] : ZODIAC[month];
}

// ─── Season, both ways ─────────────────────────────────────────────────────

export type Season = "spring" | "summer" | "autumn" | "winter";

/** Approximate solstice/equinox dates. Good to a day; we bucket by day. */
export function season(date: Date, hemisphere: "north" | "south" = "north"): Season {
  // getUTCMonth() is 0-based; the boundary constants below are written as
  // human month-day (321 = March 21), so shift before comparing.
  const md = (date.getUTCMonth() + 1) * 100 + date.getUTCDate();

  let s: Season;
  if (md >= 320 && md < 621) s = "spring";
  else if (md >= 621 && md < 923) s = "summer";
  else if (md >= 923 && md < 1221) s = "autumn";
  else s = "winter";

  if (hemisphere === "south") {
    const flip: Record<Season, Season> = {
      spring: "autumn",
      summer: "winter",
      autumn: "spring",
      winter: "summer",
    };
    return flip[s];
  }
  return s;
}

/**
 * The five-element season, and the organ system traditionally read as
 * ascendant in it.
 *
 * This is the one that earns its place: it is the reason a liver protocol
 * belongs in spring and a kidney one in winter, which is exactly the "better
 * times for certain cleanses" the product is meant to explain. Late summer
 * (Earth) is a real fifth season in this system, not a rounding error.
 */
export type Element = "wood" | "fire" | "earth" | "metal" | "water";

export interface ElementalSeason {
  element: Element;
  /** The organ pairing traditionally associated with it. */
  organ: string;
  /** The energy centre on our own body map that this maps to. */
  centreId: string;
  season: string;
}

export function elementalSeason(date: Date): ElementalSeason {
  // Same 0-based month shift as season(). The constants are month-day.
  const md = (date.getUTCMonth() + 1) * 100 + date.getUTCDate();

  // Wood    — spring, liver/gallbladder
  // Fire    — summer, heart/small intestine
  // Earth   — late summer, spleen/stomach
  // Metal   — autumn, lung/large intestine
  // Water   — winter, kidney/bladder
  if (md >= 204 && md < 506) {
    return { element: "wood", organ: "liver and gallbladder", centreId: "solar", season: "spring" };
  }
  if (md >= 506 && md < 807) {
    return { element: "fire", organ: "heart and small intestine", centreId: "heart", season: "summer" };
  }
  if (md >= 807 && md < 908) {
    return { element: "earth", organ: "spleen and stomach", centreId: "gut", season: "late summer" };
  }
  if (md >= 908 && md < 1107) {
    return { element: "metal", organ: "lung and large intestine", centreId: "throat", season: "autumn" };
  }
  return { element: "water", organ: "kidney and bladder", centreId: "sacral", season: "winter" };
}

// ─── Numerology ────────────────────────────────────────────────────────────

/**
 * Reduce to a single digit, holding 11, 22 and 33 as master numbers.
 * Shared by every number below so they agree on what "reduce" means.
 */
export function reduceNumber(n: number): number {
  let v = Math.abs(Math.trunc(n));
  while (v > 9 && v !== 11 && v !== 22 && v !== 33) {
    v = String(v)
      .split("")
      .reduce((acc, d) => acc + Number(d), 0);
  }
  return v;
}

/**
 * Universal day — the number of the date itself, the same for everyone.
 * Sum every digit of YYYY-MM-DD and reduce.
 */
export function universalDay(isoDate: string): number {
  const digits = isoDate.replace(/\D/g, "");
  return reduceNumber(digits.split("").reduce((acc, d) => acc + Number(d), 0));
}

/**
 * Personal year — life path carried into the current calendar year.
 * Convention: reduce(month + day of birth + current year).
 */
export function personalYear(birthIso: string, onIso: string): number | null {
  const b = birthIso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const o = onIso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!b || !o) return null;
  return reduceNumber(reduceNumber(Number(b[2])) + reduceNumber(Number(b[3])) + reduceNumber(Number(o[1])));
}

/** Personal month — personal year plus the calendar month. */
export function personalMonth(birthIso: string, onIso: string): number | null {
  const year = personalYear(birthIso, onIso);
  const o = onIso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (year === null || !o) return null;
  return reduceNumber(year + reduceNumber(Number(o[2])));
}

/**
 * Personal day — the number of *this* day for *this* person.
 *
 * This is the one that makes numerology per-member rather than per-date, and
 * it's the number the daily theme should lean on.
 */
export function personalDay(birthIso: string, onIso: string): number | null {
  const month = personalMonth(birthIso, onIso);
  const o = onIso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (month === null || !o) return null;
  return reduceNumber(month + reduceNumber(Number(o[3])));
}

// ─── Name numerology ───────────────────────────────────────────────────────

/**
 * Pythagorean letter values: A–I = 1–9, J–R = 1–9, S–Z = 1–8.
 *
 * A name gives three numbers a birth date can't, which matters because far
 * more people know their full name than know their birth time:
 *
 *   Expression  — every letter. What they're equipped to do.
 *   Soul urge   — vowels only. What they actually want.
 *   Personality — consonants only. What others meet first.
 */
function letterValue(ch: string): number {
  const code = ch.charCodeAt(0) - 64; // 'A' = 1
  if (code < 1 || code > 26) return 0;
  return ((code - 1) % 9) + 1;
}

const VOWELS = new Set(["A", "E", "I", "O", "U"]);

/**
 * Is this Y acting as a vowel?
 *
 * ── Why the old rule was wrong ────────────────────────────────────────────
 *
 * It asked whether the *word* contained any other vowel: no other vowel means
 * Y is a vowel ("Lynn"), otherwise a consonant ("Mary"). That is right for
 * both of those and wrong for a great many real names, because the rule is
 * about the syllable, not the word. "Bryan" contains an A, so the old rule
 * called its Y a consonant — but nobody pronounces Bry-an with a consonant
 * there. Same for Kyle, Lyla, Myla, Tyler, Wyatt, Bryce, Skyler, Jolyn.
 *
 * That is not a rounding error. Soul urge is built from vowels alone and
 * personality from consonants alone, so one misclassified Y moves a letter
 * from one number to the other and changes both — and for a name like Kyle,
 * where the Y is the only vowel sound in the syllable, it produced a soul urge
 * with a single E in it.
 *
 * ── The rule now ──────────────────────────────────────────────────────────
 *
 * Y is a consonant only where it is doing consonant work: at the start of a
 * syllable, immediately before a sounded vowel. Everywhere else the Y is
 * carrying the vowel sound and counts as one.
 *
 *   Yolanda, Yves, Yasmine   Y begins the word before a vowel → consonant
 *   Maya, Sawyer, Kayla      Y sits between vowels, starting the next
 *                            syllable → consonant
 *   Lynn, Myrtle, Bryn       no other vowel → vowel
 *   Bryan, Kyle, Tyler       Y follows a consonant and carries the sound
 *                            → vowel, which the old rule got wrong
 *
 * It is a heuristic about pronunciation and cannot be perfect — English names
 * come from everywhere and "Sonya" and "Tanya" are argued over by people who
 * do this for a living. Where it matters, the member's own answer should win;
 * this is the default, not the verdict.
 */
/**
 * W and Y glide into the vowel before them — the "aw" of Sawyer, the "ay" of
 * Kayla. For deciding what a following Y is doing, a vowel plus one of these
 * still counts as a vowel sound.
 */
const SEMI_VOWELS = new Set(["W", "Y"]);

function precededByVowelSound(letters: string[], i: number): boolean {
  const prev = i > 0 ? letters[i - 1] : null;
  if (!prev) return false;
  if (VOWELS.has(prev)) return true;
  return SEMI_VOWELS.has(prev) && i > 1 && VOWELS.has(letters[i - 2]);
}

function yIsVowel(letters: string[], i: number): boolean {
  const next = i < letters.length - 1 ? letters[i + 1] : null;

  // Already a vowel sound in front of it, so the Y is starting the next
  // syllable rather than carrying this one: Maya, Kayla, Sawyer, Kyley's
  // second Y. This is the test that "does a vowel follow it" gets wrong,
  // because Bryan and Maya both have a vowel after the Y and only one of them
  // has a vowel before it.
  if (precededByVowelSound(letters, i)) return false;

  // Opening the word onto a vowel: Yolanda, Yasmine, Yannick. Not Yves —
  // there the Y is followed by a consonant and carries the sound itself
  // ("EEV"), which is why this checks the next letter rather than the
  // position alone.
  if (i === 0 && next && VOWELS.has(next)) return false;

  // Everything else: the Y is the vowel of its syllable. Lynn, Kyle, Bryan,
  // Tyler, Amy, Bryce, Skyler, Myrtle.
  return true;
}

function classifyLetters(
  namePart: string,
  yOverrides?: Record<string, boolean> | null,
): { vowels: string[]; consonants: string[] } {
  const letters = namePart.toUpperCase().replace(/[^A-Z]/g, "").split("");

  const vowels: string[] = [];
  const consonants: string[] = [];
  for (let i = 0; i < letters.length; i++) {
    const l = letters[i];
    if (VOWELS.has(l)) vowels.push(l);
    else if (l === "Y") {
      // The member's answer first, ours second. Keyed on the word as written
      // rather than upper-cased, to match what explainY hands the UI.
      const override = yOverrides?.[`${namePart}:${i}`];
      const isVowel = typeof override === "boolean" ? override : yIsVowel(letters, i);
      (isVowel ? vowels : consonants).push(l);
    } else consonants.push(l);
  }
  return { vowels, consonants };
}

/**
 * Where the Ys in a name fall, for showing the member and letting them correct
 * it. Returns one entry per Y, in order, with the classification we chose.
 */
export function explainY(fullName: string | null | undefined): {
  word: string;
  index: number;
  isVowel: boolean;
}[] {
  if (!fullName) return [];
  const out: { word: string; index: number; isVowel: boolean }[] = [];
  for (const word of fullName.trim().split(/\s+/)) {
    const letters = word.toUpperCase().replace(/[^A-Z]/g, "").split("");
    letters.forEach((l, i) => {
      if (l === "Y") out.push({ word, index: i, isVowel: yIsVowel(letters, i) });
    });
  }
  return out;
}

export interface NameNumbers {
  expression: number | null;
  soulUrge: number | null;
  personality: number | null;
}

/**
 * `fullName` should be the name given at birth, including any middle name —
 * that's the convention, and it's why signup asks for the middle name rather
 * than just first and last.
 */
export function nameNumbers(
  fullName: string | null | undefined,
  /**
   * The member's own answer about a Y, keyed `Word:index` exactly as
   * `explainY` reports it. The classifier is a heuristic about pronunciation
   * and a name belongs to the person saying it, so where they have told us,
   * they win.
   */
  yOverrides?: Record<string, boolean> | null,
): NameNumbers {
  if (!fullName || !fullName.trim()) {
    return { expression: null, soulUrge: null, personality: null };
  }

  const parts = fullName.trim().split(/\s+/);
  let allV: string[] = [];
  let allC: string[] = [];
  for (const part of parts) {
    const { vowels, consonants } = classifyLetters(part, yOverrides);
    allV = allV.concat(vowels);
    allC = allC.concat(consonants);
  }

  if (allV.length === 0 && allC.length === 0) {
    return { expression: null, soulUrge: null, personality: null };
  }

  const sum = (ls: string[]) => ls.reduce((acc, l) => acc + letterValue(l), 0);

  return {
    expression: reduceNumber(sum(allV) + sum(allC)),
    soulUrge: allV.length ? reduceNumber(sum(allV)) : null,
    personality: allC.length ? reduceNumber(sum(allC)) : null,
  };
}

// ─── The whole picture for one day ─────────────────────────────────────────

export interface AlmanacDay {
  date: string; // YYYY-MM-DD
  moon: MoonState;
  sunSign: ZodiacSign;
  season: Season;
  elemental: ElementalSeason;
  universalDay: number;
  /**
   * Present in proportion to what the member has given us. Every field is
   * independently optional — a member who supplies only a name still gets
   * expression/soul urge/personality, and one who supplies only a birth date
   * still gets a personal day. Nothing here is required to render a day.
   */
  personal?: {
    lifePath: number | null;
    personalYear: number | null;
    personalMonth: number | null;
    personalDay: number | null;
    expression: number | null;
    soulUrge: number | null;
    personality: number | null;
    sunSign?: string | null;
    moonSign?: string | null;
    risingSign?: string | null;
    /** How complete the picture is, 0–1. Drives how personal the note may be. */
    depth: number;
  };
}

export interface MemberChart {
  birthDate?: string | null;
  birthName?: string | null;
  lifePathNumber?: number | null;
  sunSign?: string | null;
  moonSign?: string | null;
  risingSign?: string | null;
}

/**
 * Everything true about a date, optionally through one member's chart.
 *
 * `date` is a plain YYYY-MM-DD in the member's own zone — the caller has
 * already decided what day it is for them, and this must not second-guess it.
 * Noon UTC is used for the astronomy so that neither edge of the day rounds
 * into a neighbouring one.
 */
export function almanacFor(date: string, chart?: MemberChart | null): AlmanacDay {
  const [y, m, d] = date.split("-").map(Number);
  const at = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));

  const day: AlmanacDay = {
    date,
    moon: moonState(at),
    sunSign: sunSign(at),
    season: season(at),
    elemental: elementalSeason(at),
    universalDay: universalDay(date),
  };

  const hasDate = !!chart?.birthDate;
  const hasName = !!chart?.birthName?.trim();
  if (!hasDate && !hasName) return day;

  const names = nameNumbers(chart?.birthName);

  // Depth is what stops a note claiming more than it knows. A member who gave
  // only a name should not be told what their moon sign means.
  const signals = [
    hasDate,
    hasName,
    !!chart?.sunSign,
    !!chart?.moonSign,
    !!chart?.risingSign,
  ];
  const depth = signals.filter(Boolean).length / signals.length;

  day.personal = {
    lifePath: chart?.lifePathNumber ?? null,
    personalYear: hasDate ? personalYear(chart!.birthDate!, date) : null,
    personalMonth: hasDate ? personalMonth(chart!.birthDate!, date) : null,
    personalDay: hasDate ? personalDay(chart!.birthDate!, date) : null,
    expression: names.expression,
    soulUrge: names.soulUrge,
    personality: names.personality,
    sunSign: chart?.sunSign ?? null,
    moonSign: chart?.moonSign ?? null,
    risingSign: chart?.risingSign ?? null,
    depth,
  };

  return day;
}

/**
 * Life path — sum every digit of the birth date and reduce.
 *
 * Re-exported here so the almanac is the single place that owns numerology.
 * `shared/models/energy.ts` has an older copy under `lifePathNumber`; both
 * agree, and this is the one new code should use.
 */
export function lifePathFromDate(isoDate: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return null;
  return universalDay(isoDate);
}
