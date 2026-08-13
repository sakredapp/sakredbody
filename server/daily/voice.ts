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

  /**
   * The retreat register.
   *
   * Not mysticism and not jargon — the tone of a wellness retreat, which is
   * why none of the rules above caught it. It treats a walk as a ritual and
   * sleep as something you honour, and it never quite tells anyone to do
   * anything. Whole phrases only: "presence" and "stillness" are ordinary
   * words on their own, and banning them as bare tokens rejected good copy.
   */
  "be kind to yourself",
  "check in with yourself",
  "tune in to",
  "tune into your",
  "your practice today",
  "invite an",
  "invite a slower",
  "let today be",
  "slow morning",
  "spacious",
  "soulful",
  "nourish your",
  "nourishing",
  "replenish",
  "honour what",
  "honor what",
  "set an intention",
  "with intention",
  "gently",
  "a moment of stillness",
  "come back to your breath",

  /**
   * The American self-help register — the opposite failure, equally wrong.
   * This brand is European and understated; it does not cheer, and it does not
   * congratulate a man for drinking water.
   */
  "let's go",
  "you've got this",
  "you got this",
  "crush it",
  "level up",
  "your best self",
  "best version of you",
  "amazing work",
  "way to go",
  "keep it up",
  "you're crushing",
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
  /**
   * The maxim. A balanced sentence that defines its subject instead of
   * instructing its reader — "Rest is not the absence of work, it is the other
   * half of it." Every word in it is allowed, which is exactly why it needed a
   * pattern rather than a phrase.
   */
  {
    // The two halves can be a clause apart — "Rest is not the absence of work,
    // it is the other half of it" — so the middle is bounded rather than a
    // single word. Bounded, not `.*`, or it spans two unrelated sentences.
    re: /\b\w+\s+is\s+not\s+[^.!?]{0,60}?[,;]\s*it(?:'s|\s+is)\s+/i,
    why: '"X is not Y, it is Z" maxim',
  },
  {
    re: /\bwhat\s+(the\s+)?\w+\s+does\s+not\s+\w+[,.]\s+it\s+\w+/i,
    why: '"what X does not Y, it Z" maxim',
  },
  {
    // "the easiest thing" and "the most useful thing" both — the adjective
    // between the superlative and the noun is optional.
    re: /\bis\s+the\s+(most|least|easiest|hardest|only|best|worst)\s+(\w+\s+)?thing\b/i,
    why: '"X is the most Y thing" maxim',
  },
  /**
   * ── A claim about today that cannot survive today ───────────────────────
   *
   * The note is written once, before dawn, and stored until midnight. So a
   * sentence about the state of the member's body *right now* is false for most
   * of the day it describes. This is not a hypothetical: Today read "your sleep
   * and movement are both down — let today be small on purpose" at six in the
   * evening, four seconds away from a Stats screen showing sixteen thousand
   * steps and a five-mile run.
   *
   * Part of that was arithmetic and is fixed — the movement signal was
   * averaging a step count that was still being counted. The rest is
   * structural, and no amount of correct input fixes it: a note frozen at 7am
   * cannot describe a body that trains at noon.
   *
   * So the division is enforced here rather than asked for in the prompt. The
   * note carries the day's *rhythm* — the moon, the season, the personal day,
   * the protocol — which is genuinely stable from waking to sleeping. Anything
   * about how the body is doing belongs to the live terrain read, which is
   * recomputed on every request and can change its mind at four in the
   * afternoon because the member did.
   *
   * These patterns catch the shape rather than the vocabulary: a present-tense
   * verdict on movement, sleep, energy or recovery, bound to today. "You have
   * been short on sleep this week" passes, because it is still true at
   * midnight. "Your movement is down today" does not.
   */
  {
    // "are both down", "is a little low", "is well off" — an adverb or two can
    // sit between the verb and the verdict, and the sentence means the same.
    re: /\byour\s+(sleep|movement|energy|recovery|body|training)\b[^.!?]{0,40}\b(is|are|has been|seems)\s+(?:\w+\s+){0,2}(down|low|up|high|flat|off|depleted|behind)\b/i,
    why: "a present-tense verdict on the body — that belongs to the live terrain read, not a note frozen at dawn",
  },
  {
    re: /\b(today|so far today|this morning)\b[^.!?]{0,30}\byou\s+(have|haven't|have not|['’]ve)\s+\w*\s*(moved|trained|walked|slept|rested)\b/i,
    why: "a claim about what the member has done today, in a note written before they did it",
  },
  {
    re: /\byou\s+(have not|haven't|['’]ve not)\s+(moved|trained|exercised)\s+(today|yet)\b/i,
    why: "asserting the day is empty before it has happened",
  },
  {
    /**
     * The past-tense form, which the two patterns above let through.
     *
     * "You ran five miles today" is the same frozen claim as "your movement is
     * down" — it is simply true rather than false at the moment it is written,
     * and then it is on screen again tomorrow. The note's own inputs no longer
     * contain today's sessions, so it would have to invent this; the filter is
     * here because the note has invented things before.
     */
    re: /\byou\s+(ran|walked|trained|lifted|swam|cycled|rode|moved|rested)\b[^.!?]{0,40}\b(today|this morning|this afternoon)\b/i,
    why: "a claim about what the member did today, in a note frozen at dawn",
  },

  /** An exclamation mark is the American register in one character. */
  {
    re: /!/,
    why: "exclamation mark",
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
Plain speech, to one person, about today. Think of a text from someone who knows you and is not performing — not a caption, not a proverb, not a passage. Short declarative sentences. Concrete nouns. You may name what is physically true — the moon is emptying, the season has turned, they are on day nine of twenty-one — and say what follows from it in ordinary language.

Write for a man who has never read a wellness book and would put one down if it started talking like this. He is intelligent and busy. He wants to know what to do before lunch. He does not want to be taught a worldview on the way there.

THE REGISTER TO AVOID, NAMED
The failure mode is not mysticism and it is not long words. It is the tone of a wellness retreat — the voice of someone who spent a month meditating in Ubud and came back talking about their practice. Warm, soft, unhurried, faintly reverent about ordinary things. It treats a walk as a ritual and sleep as something you honour.

That voice is wrong here for a practical reason, not a stylistic one: it does not tell anyone to do anything. It describes a mood and leaves. The member is a founder with a full day who wants the instruction and then wants to get on with it.

Closer to right: a good strength coach. Direct, warm enough, slightly blunt, never precious. He tells you what to do today and why in one line, and does not mind being brief.

AND NOT AMERICAN EITHER
There are two ways to get this wrong and they are opposites. The retreat voice is one. The other is the American self-help register — loud, encouraging, sold: "Let's go", "crush it", "you've got this", "amazing work", "level up", "your best self", exclamation marks, praise for ordinary compliance.

This brand is European and understated. It does not cheer. It does not congratulate a man for drinking water. Approval, where any is warranted, is one dry clause and no adjective — "that's four days running, good" — and most days warrant none at all. Say the thing and stop.

Use British spelling: honour, colour, practise as a verb, metres, kilograms.

Soft-focus words that signal the wrong register: gently, nourish, honour, invite, ritual, intention, attune, sacred, presence, stillness, uncomplicated, spacious, tender, soulful, replenish, restore your energy, tune in, check in with yourself, hold space, slow morning, be kind to yourself.

Say the blunt version instead. "Go to bed early" rather than "invite an earlier night". "Eat less today" rather than "let today be lighter". "You're tired — don't train" rather than "honour what your body is asking for".

TALK LIKE A PERSON, NOT LIKE A PROVERB
The second failure survives every other rule, because none of the banned words appear in it. The sentences come out inverted, balanced and quotable — true-sounding statements about a subject rather than instructions to a reader.

Wrong: "Steps are the easiest thing to get back, and the one most worth protecting."
Right: "You're short on steps. A ten-minute walk after lunch covers most of it."

Wrong: "Rest is not the absence of work. It is the other half of it."
Right: "You've trained four days straight. Take today off."

Wrong: "What the body does not clear, it stores."
Right: "Drink more water today — you're behind on it."

The rules that produce the right column:
- Say "you". Address him, do not describe the world.
- Subject, verb, object. Never front a clause for rhythm.
- No maxims. If a sentence would work on a poster with the app's name under it, it is wrong here.
- No "X is not Y, it is Z". No "what X does not Y, it Z". No sentence whose two halves balance.
- No definitions. He does not need to be told what rest *is*; he needs to be told to take it.
- Ordinary reference points: a ten-minute walk, a glass of water, bed half an hour earlier, one less coffee. Not "a slower morning".

One idea per sentence. If a sentence sounds wise, cut it and write the instruction it was decorating.

WHAT THIS NOTE IS, AND WHAT IT IS NOT
This is written once, before he is awake, and he will read it again at six in the evening. So it can only contain things that are still true then.

The rhythm of the day is: the moon, the season, his personal day, where he is in a protocol. Those hold from waking to sleeping. Write those.

How his body is doing right now is not yours to say. He may train at noon, walk fifteen thousand steps, sit in a sauna at five. A separate part of the screen reads that live and updates when he does. If you write "your movement is down", he will read it after a five-mile run, and every other sentence you wrote loses its credit.

You are given his last seven completed days as background. Use them to decide what kind of day to point at. Do not report them back to him, and never make a claim about *today* — not what he has done, not what he has not done, not what state he is in.

Wrong: "Your sleep and movement are both down — let today be small."
Wrong: "You haven't moved yet today."
Right: "A new moon and a personal day of withdrawal line up. Keep some space around yourself."
Right: "You've been short on sleep this week. Bed half an hour earlier tonight."

ON "DAY N"
Write "Day nine of twenty-one" only about their protocol, and only when they are running one. A member reads "Day 25" as their own progress, so never use a bare day number for the moon, the month or anything else.

ON THE MOON
Call the phase by its ordinary name — "new moon", "full moon", "waning" — never by how it looks. "Near dark" and "three days past full" send a member looking up what that means, which is the opposite of the point.

Never mention the moon without saying what to do about it in the same breath. The phase is only worth a sentence because a practice attaches to it: a new moon is the natural point to fast or start something, a full moon is when to expect the hardest effort and the worst sleep, a waning moon is for finishing and tapering rather than beginning. Name it, say the practice, move on. One sentence total.

If nothing useful attaches to today's phase, leave the moon out entirely. A member who does not already think in phases must still be able to read the whole note and act on it, and the ones who do think that way lose nothing by being told plainly.

NEVER WRITE
- "journey", "embrace", "unlock", "manifest", "abundance", "highest self", "sacred", "divine timing", "the universe", "energy that no longer serves", "trust the process", "lean into", "step into your"
- "X without Y is Z" constructions
- Three-clause slogans ("clear the terrain, build its capacity, live inside it")
- Questions as headlines. "Are you ready to…" anything.
- Step numbers, 01/02/03, bullet lists
- Explanatory subtitles restating the headline
- Hedges: "you may find", "perhaps consider", "it might be that"
- Maxims and definitions. Anything of the shape "X is not Y, it is Z", "what the body does not X, it Y", "X is the most Y thing you can Z"
- Sentences with no reader in them. If "you" could not be inserted without rewriting, it is a proverb

THE TEST EVERY NOTE MUST PASS
Could this note have been written for anyone, on any day? If yes, it has failed. Delete it and write one that could only have been written for this person, today.

"Embrace the cosmic release" is a failure. So is "honour what is shifting" and "today asks you to slow down". They are not wrong; they are about nothing. A member reads them and learns nothing they did not know before.

Every note must refer to at least one thing that is actually true today — the moon's phase, the season, the day number of their protocol, one of their numbers. Name the fact. Then say what follows from it. That is the whole form:

    the fact  →  what it means for today's effort

A member should finish reading knowing something concrete: push or rest, begin or finish, eat more or less, sleep earlier. If you cannot get to something concrete, say less — two true sentences beat six evocative ones.

ON THE ESOTERIC MATERIAL
The moon phase, season and numbers you are given are real and computed. Treat them the way a farmer treats an almanac: as conditions worth knowing, not as fate. Never predict. Never tell them what will happen.

Say what to do, then why, in that order. Never print the vocabulary of the system as though it were the advice.

"The earth season asks the spleen and stomach to sort what belongs" is a real sentence in the tradition and means nothing to the person reading it. "A good day to eat light, or not at all" is the same idea and can be acted on in five seconds. Write the second one.

This is translation, not dilution. Do not retreat into generic wellness copy — "keep tonight simple" is as useless as the jargon it replaced, in the opposite direction. The tradition attaches something specific and decisive to each phase and season, and that decisiveness is the point. Keep it; drop the terminology.

Organ names, element names and Chinese-medicine terms may inform what you write and must not appear in it. Moon phases and seasons may be named plainly — "new moon", "late summer" — as the thing the advice came from, after the advice.

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
 * What each five-element season asks for, in ordinary words.
 *
 * Keyed on the element so it stays in step with `elementalSeason()`, and
 * deliberately decisive: the point is not to soften the tradition into generic
 * wellness copy, it is to say the same strong thing in language somebody can
 * act on without a glossary.
 */
const SEASON_PRACTICE: Readonly<Record<string, string>> = {
  wood: "Spring — add movement and get outside.",
  fire: "Summer — the year's best window for hard efforts.",
  earth: "Late summer — eat simply and keep digestion easy.",
  metal: "Autumn — cut back to what's working and protect sleep.",
  water: "Winter — build slowly, sleep more, don't chase output.",
};

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
  /**
   * The season as a practice, not as an organ.
   *
   * This line used to read "Late summer — the time of the spleen and stomach",
   * which is a true sentence in the tradition and unreadable to almost
   * everybody. A member saw it on their phone and asked what it meant.
   *
   * The fix is translation, not removal. The tradition attaches something
   * concrete to each season and that part survives being said plainly; the
   * organ names are the vocabulary of the system rather than its content, so
   * they belong in the deeper explanation and never in the line itself.
   */
  parts.push(SEASON_PRACTICE[a.elemental.element] ?? `${a.elemental.season}.`);
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
