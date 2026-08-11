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

/**
 * The vocabulary this register actually uses. Only for detecting dropped
 * spaces — deliberately not the same list as `anchors`, which has to stay
 * strict to mean anything as a groundedness test.
 */
const DOMAIN_WORDS = [
  // sky and time
  "moon", "season", "summer", "winter", "spring", "autumn", "waning", "waxing",
  "crescent", "gibbous", "morning", "evening", "night", "today", "tonight",
  // body
  "spleen", "stomach", "liver", "kidney", "lung", "heart", "gallbladder",
  "bladder", "intestine", "body", "breath", "sleep",
  // the work
  "protocol", "phase", "habit", "water", "food", "meal", "rest", "ground",
  "clear", "prepare", "rebuild",
];

/**
 * What the *second* half of a fused pair looks like. A closed list, because
 * the alternative — guessing from remainder length — flagged "clearing" and
 * "moonlight", and rejecting good copy is worse than passing a rare typo.
 */
const FUSION_TAILS = new Set([
  "asks", "ask", "needs", "need", "wants", "want", "gives", "give",
  "takes", "take", "holds", "hold", "means", "mean", "carries", "carry",
  "and", "the", "for", "with", "that", "this", "your", "you",
  "are", "was", "were", "will", "can", "does", "has", "have", "belongs",
]);

export type TrainingSignals = {
  /** Sessions finished in the last seven days. */
  sessionsThisWeek: number;
  /** Whole days since the most recent finished session. 0 is today. */
  daysSinceLast: number | null;
  /** Families trained in the last seven days, most recent first. */
  recent: string[];
  /**
   * Families they have not touched in a while.
   *
   * Only ever families they have trained at some point in the window's
   * history — telling somebody who has never done studio work that they are
   * neglecting the reformer is a recommendation, not an observation, and this
   * file only makes observations.
   */
  neglected: string[];
};

/**
 * The prompt lines, or none.
 *
 * Written as sentences rather than a table because the surrounding prompt is
 * sentences, and because the model's job is to say what follows from a fact —
 * which is easier from "three sessions, none of them mobility" than from a
 * count in a column.
 */
export function trainingPromptLines(t: TrainingSignals | null): string[] {
  if (!t) return [];
  const lines: string[] = ["WHAT THEY HAVE BEEN TRAINING (computed, all true)"];

  if (t.daysSinceLast === 0) lines.push("They trained today.");
  else if (t.daysSinceLast === 1) lines.push("They trained yesterday.");
  else if (t.daysSinceLast !== null) lines.push(`Last trained ${t.daysSinceLast} days ago.`);

  lines.push(
    t.sessionsThisWeek === 0
      ? "Nothing logged in the last seven days."
      : `${t.sessionsThisWeek} session${t.sessionsThisWeek === 1 ? "" : "s"} in the last seven days.`,
  );

  if (t.recent.length) lines.push(`This week: ${t.recent.join(", ")}.`);
  if (t.neglected.length) {
    lines.push(`Not touched in over a week, though they normally do: ${t.neglected.join(", ")}.`);
  }
  return lines;
}

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
 * The facts this note was given. A note must cite at least one of them.
 *
 * This is the check that matters most. Banning phrases only removes bad
 * words — it does nothing to make a note *say* something. "Embrace the cosmic
 * release" and "Honour what is shifting" are both phrase-clean and both mean
 * nothing, because neither refers to anything that is true today.
 *
 * Grounding is checkable precisely because we computed the inputs ourselves.
 * If none of the moon, the season, the organ, the protocol day or the member's
 * numbers appears anywhere in the text, the note is about nothing.
 */
export function anchorsFor(ctx: NoteContext): string[] {
  const a = ctx.almanac;
  const anchors: string[] = [];

  // Moon — the phase words plus how people actually say them.
  anchors.push(...a.moon.phase.split(" "));
  anchors.push("moon");
  if (a.moon.direction) anchors.push(a.moon.direction);
  if (a.moon.phase === "new") anchors.push("dark");
  if (a.moon.phase === "full") anchors.push("full");
  anchors.push("emptying", "filling");

  // Season, element, organs.
  anchors.push(a.season, a.elemental.season, a.elemental.element);
  anchors.push(...a.elemental.organ.split(/\s+and\s+|\s+/));

  // Where they are in the work.
  if (ctx.protocol) {
    anchors.push(...ctx.protocol.name.toLowerCase().split(/\s+/));
    anchors.push(ctx.protocol.phase);
    anchors.push("day", String(ctx.protocol.dayNumber), String(ctx.protocol.durationDays));
  }
  if (ctx.centre) {
    anchors.push(ctx.centre.name.toLowerCase());
    if (ctx.centre.aspect) anchors.push(ctx.centre.aspect.toLowerCase());
  }

  // Numbers, spelled and digit.
  const WORDS = ["zero","one","two","three","four","five","six","seven","eight","nine","ten"];
  const nums = [a.universalDay, a.personal?.personalDay, a.personal?.lifePath].filter(
    (n): n is number => typeof n === "number",
  );
  for (const n of nums) {
    anchors.push(String(n));
    if (n < WORDS.length) anchors.push(WORDS[n]);
  }

  // Short words ("the", "of") would make anything look grounded, so they go —
  // but digits stay whatever their length, because "day 9 of 21" is exactly
  // the kind of specificity this check exists to reward.
  return Array.from(
    new Set(
      anchors
        .map((s) => s.toLowerCase())
        .filter((s) => s && (s.length > 2 || /^\d+$/.test(s))),
    ),
  );
}

/**
 * Reject anything that reads like the thing we're trying not to build.
 *
 * Length limits are part of this, not a separate concern: the failure mode of
 * generated mysticism is *volume*, and a hard cap is the single most effective
 * constraint on it.
 */
export function judge(c: Candidate, anchors?: string[]): Verdict {
  const reasons: string[] = [];
  const headline = (c.headline ?? "").trim();
  const body = (c.body ?? "").trim();
  const invitation = (c.invitation ?? "").trim();
  const all = `${headline}\n${body}\n${invitation}`.toLowerCase();

  if (!headline) reasons.push("no headline");
  if (!body) reasons.push("no body");

  // Six words, because four was wrong. "Clear ground, hold the line" and
  // "The moon is almost dark" are both good headlines and both five words;
  // the cap was rejecting the model for writing well. The character limit is
  // the real constraint on length — word count only catches rambling.
  const headlineWords = headline.split(/\s+/).filter(Boolean).length;
  if (headlineWords > 6) reasons.push(`headline is ${headlineWords} words, max 6`);
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

  // Dropped spaces. A live run produced "The spleen seasonasks for simple
  // food" — two words fused, which reads as broken software rather than a typo.
  //
  // Length can't catch it: "seasonasks" is ten letters, the same as
  // "everything". The fusion always involves a word from this register though,
  // so we check against a fixed vocabulary rather than against `anchors` —
  // anchors exist to prove groundedness, and padding them with generic words
  // like "season" would quietly weaken that check.
  //
  // Matching on remainder *length* was too crude — it flagged "clearing"
  // ("clear" + "ing"), which is just a word. What actually happens is a domain
  // word fused to a common one, so the tail is matched against a closed list.
  // "seasonasks" is caught; "clearing", "seasonal" and "moonlight" are not.
  const tokens = `${headline} ${body} ${invitation}`
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter(Boolean);

  const fused = tokens.find((w) =>
    DOMAIN_WORDS.some(
      (d) => w.length > d.length && w.startsWith(d) && FUSION_TAILS.has(w.slice(d.length)),
    ),
  );
  if (fused) reasons.push(`looks like a dropped space: "${fused}"`);

  // The groundedness check. A note that refers to nothing true is about
  // nothing, however clean its vocabulary — "honour what is shifting" passes
  // every rule above and means as little as the copy those rules exist to stop.
  if (anchors && anchors.length > 0) {
    const words = new Set(all.split(/[^a-z0-9]+/).filter(Boolean));
    const cited = anchors.filter((a) => words.has(a));
    if (cited.length === 0) {
      reasons.push("says nothing specific — cites no fact about today");
    }
  }

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
  /**
   * A stable pseudonym, never a name. See server/daily/memberRef.ts for why the
   * model is not told who this is.
   */
  memberRef?: string | null;
  /**
   * Values held only so they can be scrubbed OUT of the assembled prompt.
   * Nothing in buildUserPrompt may read this — it exists for redaction.
   */
  identifiers?: (string | null | undefined)[];
  /**
   * What their phone measured, already reduced to signals. Raw daily series
   * would be several hundred numbers the model would average badly; these are
   * the four a coach would actually look at, plus the direction of travel.
   */
  health?: {
    label: string;
    recent: string;
    /** "up", "down", or null when there is no baseline worth comparing to. */
    direction: string | null;
  }[] | null;
  polarity?: string | null;
  /** Where they are in a protocol, if they're running one. */
  protocol?: {
    name: string;
    dayNumber: number;
    durationDays: number;
    /** prepare | clear | rebuild, inferred from position. */
    phase: string;
  } | null;
  /** The energy centre in focus. */
  centre?: { id: string; name: string; aspect: string | null } | null;
  /**
   * Where that centre came from. The two are not the same claim: "you marked
   * this" is about them, "it is late summer" is about the calendar, and a note
   * that blurs them sounds like it knows something it does not.
   */
  centreSource?: "reading" | "season";
  /** What they wrote as their own intention, if they've set one. */
  intention?: string | null;
  /** Their last few days' completion, so the note can notice. */
  recentCompletion?: { done: number; total: number } | null;
  /**
   * Prompt-ready sentences about what they have been training, from
   * server/daily/trainingSignals.ts. Already reduced and already free of
   * anything a member typed — see the note at the top of that file.
   */
  training?: string[] | null;
}

export const SYSTEM_PROMPT = `You write one short daily note for a member of Sakred Body — a private health practice for a small number of people paying a great deal for attention. Every member has a coach. You are not the coach; you are the thing they read before they see one.

WHAT YOU ARE WRITING
A headline of two to four words, a body of under seventy words, and optionally one concrete invitation of under twenty words. That is all. Brevity is the house style, not a limit you are working around.

VOICE
Old money, eastern philosophy, plain speech. Think of a note left on a table by someone who knows you, not a caption. Short declarative sentences. Concrete nouns. You may name what is physically true — the moon is emptying, the season has turned, they are on day nine of twenty-one — and say what follows from it in ordinary language.

ON "DAY N"
Write "Day nine of twenty-one" only about their protocol, and only when they are running one. A member reads "Day 25" as their own progress, so never use a bare day number for the moon, the month or anything else. For the moon, say what it looks like — near dark, three days past full — not what number it is.

NEVER WRITE
- "journey", "embrace", "unlock", "manifest", "abundance", "highest self", "sacred", "divine timing", "the universe", "energy that no longer serves", "trust the process", "lean into", "step into your"
- "X without Y is Z" constructions
- Three-clause slogans ("clear the terrain, build its capacity, live inside it")
- Questions as headlines. "Are you ready to…" anything.
- Step numbers, 01/02/03, bullet lists
- Explanatory subtitles restating the headline
- Hedges: "you may find", "perhaps consider", "it might be that"

THE TEST EVERY NOTE MUST PASS
Could this note have been written for anyone, on any day? If yes, it has failed. Delete it and write one that could only have been written for this person, today.

"Embrace the cosmic release" is a failure. So is "honour what is shifting" and "today asks you to slow down". They are not wrong; they are about nothing. A member reads them and learns nothing they did not know before.

Every note must refer to at least one thing that is actually true today — the moon's phase, the season and the organ it belongs to, the day number of their protocol, one of their numbers. Name the fact. Then say what follows from it. That is the whole form:

    the fact  →  what it means for today's effort

A member should finish reading knowing something concrete: push or rest, begin or finish, eat more or less, sleep earlier. If you cannot get to something concrete, say less — two true sentences beat six evocative ones.

ON THE ESOTERIC MATERIAL
The moon phase, season and numbers you are given are real and computed. Treat them the way a farmer treats an almanac: as conditions worth knowing, not as fate. Never predict. Never tell them what will happen.

Do not explain the system. They know what a waning moon is. Never define a term.

When two signals agree — a waning moon and a clearing phase, spring and a liver protocol — saying so plainly is the single most useful thing you can write. That is the note earning its place.

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
  // The moon's age is deliberately NOT given as "day N". A live run handed a
  // member on day 3 of a 28-day protocol the headline "Day 25." — the model
  // had reached for the lunar day, and to the member "Day 25" can only mean
  // their protocol. The number is worth having; the phrasing was the problem.
  lines.push(
    `Moon: ${a.moon.phase}${a.moon.direction ? `, ${a.moon.direction}` : ""}, ` +
      `${Math.round(a.moon.illumination * 100)}% lit, ` +
      `${Math.round(a.moon.age)} days since the last new moon`,
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
  // A ref, not a name. The model personalises from their protocol, their
  // numbers and their own words — none of which require knowing who they are.
  if (ctx.memberRef) lines.push(`Member: ${ctx.memberRef} (a reference, not a name — never write it)`);

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

  if (ctx.health?.length) {
    lines.push("");
    lines.push("THEIR BODY, LAST SEVEN DAYS (measured, not reported)");
    // Given with the direction because the direction is the finding. A resting
    // heart rate of 54 means nothing on its own; 54 and rising is the note.
    for (const signal of ctx.health) {
      lines.push(
        `${signal.label}: ${signal.recent}${signal.direction ? ` (${signal.direction} on their own baseline)` : ""}`,
      );
    }
    lines.push(
      "These are measurements, not a diagnosis. You may notice one of them. " +
        "Do not give medical advice, do not name a condition, and do not tell " +
        "them a number is good or bad — say what it suggests about today.",
    );
  }

  /**
   * What they have actually been doing.
   *
   * The one input where Sakred knows more than the wearable does: a watch can
   * say the heart rate went up, and only Build knows it was pulling, that it
   * was heavy, and that nothing elastic has happened in three weeks. Placed
   * directly after the measurements because the two are read together — a low
   * night after four hard days means something a low night alone does not.
   */
  if (ctx.training?.length) {
    lines.push("");
    lines.push(...ctx.training);
    lines.push(
      "You may name one of these. Do not prescribe a workout, do not tell them " +
        "to rest, and do not congratulate them on a number. If a whole kind of " +
        "movement has been missing, saying so plainly is enough.",
    );
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
    lines.push(
      `Energy centre in focus: ${ctx.centre.name}${ctx.centre.aspect ? ` — ${ctx.centre.aspect}` : ""}` +
        (ctx.centreSource === "reading"
          ? " — because they marked it themselves. You may refer to that."
          : " — seasonal context only. They have not marked anything, so do not imply they told you this.") +
        ".",
    );
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
    // A live run echoed "Stop eating after 8pm" straight back as "tonight you
    // stop eating at eight", which tells the member nothing they didn't write
    // themselves ten seconds earlier.
    lines.push(
      "Do NOT restate this. They wrote it; they know it. Either say something that " +
        "makes it easier to keep, or ignore it entirely and write about the day.",
    );
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
