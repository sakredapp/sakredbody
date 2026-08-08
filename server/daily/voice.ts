/**
 * The voice contract for generated notes.
 *
 * Two halves, and the second is what makes model-written text safe to ship:
 *
 *   1. The prompt — what we ask for.
 *   2. `judge()`  — a deterministic filter over what comes back.
 *
 * A prompt is a request; a filter is a guarantee. Anything that trips the
 * filter is regenerated, and after the last attempt we fall back to computed
 * text rather than shipping something that reads like a horoscope.
 *
 * The banned list is drawn from docs/VISION.md §5 plus the specific failure
 * mode this feature risks: portentous, vague, interchangeable copy.
 */

import type { AlmanacDay } from "../../shared/utils/almanac.js";

// ─── The filter ────────────────────────────────────────────────────────────

/**
 * Phrases that mark generic wellness copy. Matched case-insensitively as whole
 * phrases. Deliberately blunt — a false rejection costs one more generation,
 * a false acceptance costs a member's confidence.
 */
const BANNED_PHRASES = [
  // The house style forbids these outright.
  "journey",
  "embrace",
  "unlock",
  "dive deep",
  "holds space",
  "hold space",
  "sacred vessel",
  "highest self",
  "highest good",
  "divine timing",
  "the universe wants",
  "the universe is",
  "manifest",
  "abundance",
  "vibration is",
  "raise your vibration",
  "energy that no longer serves",
  "no longer serves you",
  "lean into",
  "step into your",
  "trust the process",
  "let go and",
  "honour your truth",
  "honor your truth",
  "authentic self",
  "on this day",
  "today is a day",
  "today invites you",
  "the cosmos invites",
  "as within, so without",
  // Hedged non-statements.
  "you may find that",
  "you might notice that perhaps",
  "consider taking a moment to",
];

/** "X without Y is Z" and friends — the construction called out by name. */
const BANNED_PATTERNS: { re: RegExp; why: string }[] = [
  {
    re: /\b\w+\s+without\s+\w+\s+is\s+\w+/i,
    why: '"X without Y is Z" construction',
  },
  {
    re: /^\s*(are|is)\s+you\s+ready/i,
    why: '"Are you ready…" opener',
  },
  {
    re: /\b\w+\s+it[.,]\s+\w+\s+it[.,]\s+\w+\s+it\b/i,
    why: "three-clause slogan",
  },
  {
    re: /\b0[123]\b|\bstep\s+(one|two|three)\b/i,
    why: "step numbering",
  },
];

export interface Candidate {
  headline: string;
  body: string;
  invitation?: string | null;
}

export interface Verdict {
  ok: boolean;
  reasons: string[];
}

/**
 * Reject anything that reads like the thing we're trying not to build.
 *
 * Length limits are part of this, not a separate concern: the failure mode of
 * generated mysticism is *volume*, and a hard cap is the single most effective
 * constraint on it.
 */
export function judge(c: Candidate): Verdict {
  const reasons: string[] = [];
  const headline = (c.headline ?? "").trim();
  const body = (c.body ?? "").trim();
  const invitation = (c.invitation ?? "").trim();
  const all = `${headline}\n${body}\n${invitation}`.toLowerCase();

  if (!headline) reasons.push("no headline");
  if (!body) reasons.push("no body");

  // A headline is two or three words. Four is a sentence.
  const headlineWords = headline.split(/\s+/).filter(Boolean).length;
  if (headlineWords > 4) reasons.push(`headline is ${headlineWords} words, max 4`);
  if (headline.length > 40) reasons.push(`headline is ${headline.length} chars, max 40`);

  const bodyWords = body.split(/\s+/).filter(Boolean).length;
  if (bodyWords > 70) reasons.push(`body is ${bodyWords} words, max 70`);
  if (bodyWords < 8) reasons.push(`body is ${bodyWords} words, min 8`);

  if (invitation) {
    const invWords = invitation.split(/\s+/).filter(Boolean).length;
    if (invWords > 20) reasons.push(`invitation is ${invWords} words, max 20`);
  }

  for (const phrase of BANNED_PHRASES) {
    if (all.includes(phrase)) reasons.push(`banned phrase: "${phrase}"`);
  }
  for (const { re, why } of BANNED_PATTERNS) {
    if (re.test(headline) || re.test(body)) reasons.push(why);
  }

  // Em-dash-joined clauses stacked up read as generated. One is fine.
  const emDashes = (body.match(/—/g) || []).length;
  if (emDashes > 2) reasons.push(`${emDashes} em-dashes in the body, max 2`);

  // A headline that ends in a question mark is asking, not saying.
  if (headline.endsWith("?")) reasons.push("headline is a question");

  return { ok: reasons.length === 0, reasons };
}

// ─── The prompt ────────────────────────────────────────────────────────────

const NUMBER_MEANINGS: Record<number, string> = {
  1: "beginning, self-direction, doing it alone",
  2: "pairing, patience, waiting for the other half",
  3: "expression, talk, scatter",
  4: "structure, work, foundations",
  5: "change, movement, restlessness",
  6: "responsibility, home, tending",
  7: "withdrawal, study, solitude",
  8: "power, material weight, consequence",
  9: "ending, release, clearing the ground",
  11: "heightened sensitivity, signal without filter",
  22: "building something that outlasts you",
  33: "teaching, service at cost",
};

function describeNumbers(a: AlmanacDay): string[] {
  const lines: string[] = [];
  lines.push(`Universal day: ${a.universalDay} — ${NUMBER_MEANINGS[a.universalDay] ?? ""}`);

  const p = a.personal;
  if (!p) return lines;

  if (p.personalDay != null) {
    lines.push(
      `Their personal day: ${p.personalDay} — ${NUMBER_MEANINGS[p.personalDay] ?? ""}` +
        " (this is the most important number here; it is theirs, not the calendar's)",
    );
  }
  if (p.personalYear != null) lines.push(`Their personal year: ${p.personalYear}`);
  if (p.lifePath != null) {
    lines.push(`Life path: ${p.lifePath} — ${NUMBER_MEANINGS[p.lifePath] ?? ""}`);
  }
  if (p.expression != null) lines.push(`Expression (what they are equipped to do): ${p.expression}`);
  if (p.soulUrge != null) lines.push(`Soul urge (what they actually want): ${p.soulUrge}`);
  if (p.personality != null) lines.push(`Personality (what others meet first): ${p.personality}`);

  return lines;
}

export interface NoteContext {
  almanac: AlmanacDay;
  firstName?: string | null;
  polarity?: string | null;
  /** Where they are in a protocol, if they're running one. */
  protocol?: {
    name: string;
    dayNumber: number;
    durationDays: number;
    /** prepare | clear | rebuild, inferred from position. */
    phase: string;
  } | null;
  /** The energy centre their protocol works, or the season's. */
  centre?: { id: string; name: string; aspect: string | null } | null;
  /** What they wrote as their own intention, if they've set one. */
  intention?: string | null;
  /** Their last few days' completion, so the note can notice. */
  recentCompletion?: { done: number; total: number } | null;
}

export const SYSTEM_PROMPT = `You write one short daily note for a member of Sakred Body — a private health practice for a small number of people paying a great deal for attention. Every member has a coach. You are not the coach; you are the thing they read before they see one.

WHAT YOU ARE WRITING
A headline of two to four words, a body of under seventy words, and optionally one concrete invitation of under twenty words. That is all. Brevity is the house style, not a limit you are working around.

VOICE
Old money, eastern philosophy, plain speech. Think of a note left on a table by someone who knows you, not a caption. Short declarative sentences. Concrete nouns. You may name what is physically true — the moon is emptying, the season has turned, they are on day nine of twenty-one — and say what follows from it in ordinary language.

NEVER WRITE
- "journey", "embrace", "unlock", "manifest", "abundance", "highest self", "sacred", "divine timing", "the universe", "energy that no longer serves", "trust the process", "lean into", "step into your"
- "X without Y is Z" constructions
- Three-clause slogans ("clear the terrain, build its capacity, live inside it")
- Questions as headlines. "Are you ready to…" anything.
- Step numbers, 01/02/03, bullet lists
- Explanatory subtitles restating the headline
- Hedges: "you may find", "perhaps consider", "it might be that"

ON THE ESOTERIC MATERIAL
The moon phase, season and numbers you are given are real and computed. Treat them the way a farmer treats an almanac: as conditions worth knowing, not as fate. Never predict. Never tell them what will happen. Say what is true today and what it suggests about effort — whether to push or to rest, to begin or to finish. If two signals agree, saying so is the most useful thing you can do.

Do not explain the system. They know what a waning moon is. Never define a term.

WHEN YOU KNOW LITTLE
You will sometimes be given almost nothing about the person. Then write about the day itself and say less. A short true note beats a long personal-sounding one. Never imply you know something you were not told.

MEDICAL LINE
Never diagnose, never name a disease, never promise an outcome, never contradict care. You may describe what someone might notice in their own body.

OUTPUT
Respond with a single JSON object and nothing else:
{"headline": "...", "body": "...", "invitation": "..." }
Set "invitation" to null if nothing concrete is worth asking for.`;

export function buildUserPrompt(ctx: NoteContext): string {
  const a = ctx.almanac;
  const lines: string[] = [];

  lines.push(`DATE: ${a.date}`);
  lines.push("");
  lines.push("SKY AND SEASON (computed, all true)");
  lines.push(
    `Moon: ${a.moon.phase}${a.moon.direction ? `, ${a.moon.direction}` : ""}, ` +
      `${Math.round(a.moon.illumination * 100)}% lit, day ${Math.round(a.moon.age)} of the cycle`,
  );
  lines.push(`Sun in ${a.sunSign}. Season: ${a.season}.`);
  lines.push(
    `Five-element season: ${a.elemental.season} — ${a.elemental.element}, ` +
      `traditionally read as the time of the ${a.elemental.organ}.`,
  );
  lines.push("");
  lines.push("NUMBERS");
  lines.push(...describeNumbers(a));

  lines.push("");
  lines.push("THE PERSON");
  if (ctx.firstName) lines.push(`Name: ${ctx.firstName} (you may use it once, or not at all)`);

  if (ctx.polarity) {
    // The member chose this themselves. It sets register, not content.
    const register: Record<string, string> = {
      masculine:
        "They have asked for a masculine register: direct, brief, framed around effort, capacity and holding a line. Do not soften.",
      feminine:
        "They have asked for a feminine register: warmer, framed around receiving, cycles and what is being made rather than forced. Do not harden.",
      balanced: "They have asked for a balanced register. Write plainly to both.",
    };
    lines.push(register[ctx.polarity] ?? "");
  }

  if (a.personal?.sunSign || a.personal?.moonSign || a.personal?.risingSign) {
    lines.push(
      `Their chart: ${[
        a.personal.sunSign && `${a.personal.sunSign} sun`,
        a.personal.moonSign && `${a.personal.moonSign} moon`,
        a.personal.risingSign && `${a.personal.risingSign} rising`,
      ]
        .filter(Boolean)
        .join(", ")}`,
    );
  }

  if (a.personal) {
    lines.push(
      `How much you know about them: ${Math.round(a.personal.depth * 100)}%. ` +
        (a.personal.depth < 0.5
          ? "This is thin. Write mostly about the day, and keep it short."
          : "Enough to be specific."),
    );
  } else {
    lines.push(
      "You know nothing personal about them. Write about the day only, and keep it short.",
    );
  }

  lines.push("");
  lines.push("WHAT THEY ARE DOING");
  if (ctx.protocol) {
    lines.push(
      `Protocol: ${ctx.protocol.name}, day ${ctx.protocol.dayNumber} of ${ctx.protocol.durationDays} ` +
        `(${ctx.protocol.phase} phase).`,
    );
  } else {
    lines.push("No protocol running.");
  }
  if (ctx.centre) {
    lines.push(`Energy centre in focus: ${ctx.centre.name}${ctx.centre.aspect ? ` — ${ctx.centre.aspect}` : ""}.`);
  }
  if (ctx.recentCompletion && ctx.recentCompletion.total > 0) {
    lines.push(
      `Last seven days: ${ctx.recentCompletion.done} of ${ctx.recentCompletion.total} habits done. ` +
        (ctx.recentCompletion.done / ctx.recentCompletion.total < 0.5
          ? "They are behind. Do not scold, and do not pretend otherwise."
          : "They are keeping up."),
    );
  }
  if (ctx.intention) {
    lines.push(`Their own intention today, in their words: "${ctx.intention}"`);
    lines.push("You may answer it, but do not repeat it back to them.");
  }

  lines.push("");
  lines.push("Write the note. JSON only.");

  return lines.join("\n");
}

// ─── Fallback ──────────────────────────────────────────────────────────────

/**
 * Computed text, for when generation fails or is unavailable.
 *
 * Short and factual on purpose — it should read as deliberately terse rather
 * than as a broken version of something richer. A member who sees this should
 * not be able to tell that anything went wrong.
 */
export function fallbackNote(ctx: NoteContext): Candidate {
  const a = ctx.almanac;
  const emptying = a.moon.direction === "waning" || a.moon.phase === "full";

  const headline = emptying ? "Let it leave" : "Take it on";

  const parts: string[] = [];
  parts.push(
    emptying
      ? `The moon is ${a.moon.phase === "full" ? "full" : "emptying"}.`
      : `The moon is ${a.moon.phase === "new" ? "dark" : "filling"}.`,
  );
  parts.push(
    `${a.elemental.season.charAt(0).toUpperCase()}${a.elemental.season.slice(1)} — the time of the ${a.elemental.organ}.`,
  );
  if (ctx.protocol) {
    parts.push(`Day ${ctx.protocol.dayNumber} of ${ctx.protocol.durationDays}.`);
  }
  parts.push(emptying ? "Finish things. Start nothing new." : "Good ground for beginning.");

  return {
    headline,
    body: parts.join(" "),
    invitation: null,
  };
}
