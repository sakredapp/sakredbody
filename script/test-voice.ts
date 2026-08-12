/**
 * Voice filter tests.
 *
 * `judge()` is the thing standing between a generated note and a member paying
 * five figures. A prompt is a request; this is the guarantee. So it gets
 * tested against the copy it exists to stop.
 *
 *   npx tsx script/test-voice.ts
 */

import {
  judge,
  anchorsFor,
  fallbackNote,
  trainingPromptLines,
  type Candidate,
} from "../server/daily/voice.js";
import { almanacFor } from "../shared/utils/almanac.js";

let passed = 0;
let failed = 0;

function rejects(name: string, c: Candidate, expectReason?: string) {
  const v = judge(c);
  if (v.ok) {
    failed++;
    console.log(`  ✗ should have rejected: ${name}\n      "${c.headline}" / "${c.body}"`);
    return;
  }
  if (expectReason && !v.reasons.some((r) => r.toLowerCase().includes(expectReason.toLowerCase()))) {
    failed++;
    console.log(`  ✗ rejected for the wrong reason: ${name}\n      got ${JSON.stringify(v.reasons)}`);
    return;
  }
  passed++;
}

function accepts(name: string, c: Candidate) {
  const v = judge(c);
  if (!v.ok) {
    failed++;
    console.log(`  ✗ should have accepted: ${name}\n      rejected for ${JSON.stringify(v.reasons)}`);
    return;
  }
  passed++;
}

function check(name: string, actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) passed++;
  else {
    failed++;
    console.log(`  ✗ ${name}\n      expected ${JSON.stringify(expected)}\n      got      ${JSON.stringify(actual)}`);
  }
}

const section = (t: string) => console.log(`\n${t}`);

// ═══ The copy this exists to stop ══════════════════════════════════════════

section("Horoscope slop is rejected");

rejects("cosmic release", {
  headline: "Embrace The Cosmic Release",
  body: "As the moon wanes, so too does the energy that no longer serves your highest journey toward wellness. Trust the process and lean into what the universe is offering you today.",
}, "banned phrase");

rejects("manifest / abundance", {
  headline: "Manifest Abundance",
  body: "Today you are invited to manifest abundance in every area of your life. The universe wants you to step into your highest self.",
});

rejects("sacred vessel", {
  headline: "Honour Your Vessel",
  body: "Your sacred vessel is asking for attention. Hold space for what arises and trust your authentic self to guide the way forward.",
});

rejects("divine timing", {
  headline: "Divine Timing",
  body: "Everything is unfolding in divine timing. Let go and allow the process to carry you where you need to be right now.",
});

section("Constructions the house style bans");

rejects("X without Y is Z", {
  headline: "Rest Well",
  body: "Strength without recovery is decline. The moon is emptying and your body knows it. Sleep earlier than you think you need to.",
}, "without");

rejects("three-clause slogan", {
  headline: "The Work",
  body: "Clear it, build it, live it. That is the whole of the method and there is nothing else to say about today.",
});

rejects("are you ready opener", {
  headline: "Begin Now",
  body: "Are you ready to change everything about the way you approach your mornings and the hours that follow them?",
});

rejects("step numbering", {
  headline: "Three Moves",
  body: "Step one, drink water before coffee. Then eat protein. The moon is filling and the ground is good for beginning things.",
});

rejects("headline as a question", {
  headline: "Ready Today?",
  body: "The moon is emptying. Finish what is open before you start anything new. Sleep is the work tonight.",
}, "question");

section("Length is the main defence against generated mysticism");

// Five-word headlines are good and must survive — a live run rejected
// "Clear ground, hold the line" and "The moon is almost dark", which was the
// rule being wrong rather than the model.
accepts("five-word headline", {
  headline: "Clear ground, hold the line",
  body: "Day 9 of 21. The moon is waning. Steady rather than heroic — you can afford the slower pace this week.",
});

accepts("another five-word headline", {
  headline: "The moon is almost dark",
  body: "Waning crescent, and the spleen is ascendant in late summer. Simple food. Nothing raw, nothing cold, nothing late.",
});

rejects("headline too long", {
  headline: "A Very Long Headline That Rambles On And On",
  body: "The moon is emptying. Finish what is open. Sleep is the work tonight and tomorrow will be lighter for it.",
}, "headline");

rejects("body too long", {
  headline: "Let It Leave",
  body: Array(80).fill("word").join(" "),
}, "body");

rejects("body too short", {
  headline: "Rest",
  body: "Sleep well.",
}, "min");

rejects("invitation too long", {
  headline: "Let It Leave",
  body: "The moon is emptying and your protocol is in its clearing phase. These agree. Do less today.",
  invitation: Array(30).fill("word").join(" "),
}, "invitation");

rejects("too many em-dashes", {
  headline: "Let It Leave",
  body: "The moon — which is emptying — meets a clearing phase — and the two agree — so do less today than you planned.",
}, "em-dash");

section("Malformed output is rejected");
rejects("no headline", { headline: "", body: "The moon is emptying. Finish what is open before starting anything." }, "no headline");

rejects("no body", { headline: "Let It Leave", body: "" }, "no body");

// ═══ Good copy must survive ════════════════════════════════════════════════
// A filter that rejects everything is not a filter, it's an outage. These are
// written in the house voice and must pass.

section("Copy in the house voice is accepted");

accepts("waning + clearing phase", {
  headline: "Let it leave",
  body: "The moon is emptying. Your protocol is in its clearing phase. These agree — do less, and finish nothing new.",
  invitation: "Sleep an hour earlier than you want to.",
});

accepts("plain and short", {
  headline: "Take it on",
  body: "New moon, and day one of twenty-one. Good ground for beginning. The first three days are the only hard ones.",
  invitation: null,
});

accepts("names the season", {
  headline: "Spring, and the liver",
  body: "Wood season. The old reading puts the liver ascendant now, which is why this protocol sits here and not in December.",
});

accepts("notices a slip without scolding", {
  headline: "Four of seven",
  body: "You have missed three days this week. The moon is filling, which is the easier half of the cycle. Pick it back up today.",
});

accepts("knows almost nothing", {
  headline: "Waning",
  body: "The moon is three days past full. Nothing needs starting today. Finish one thing that has been open too long.",
});

accepts("uses a first name once", {
  headline: "Hold the line",
  body: "Jace, day nine of twenty-one is where most people quit. The moon is emptying with you. Two more days and it turns.",
});

// ═══ Groundedness ══════════════════════════════════════════════════════════
// The rule that matters most. Banning phrases removes bad words; it does not
// make a note *say* anything. A note that refers to nothing true about today
// is about nothing, however clean its vocabulary.

section("Groundedness — a note must cite a fact about today");

// 2026-08-08: waning gibbous, Leo, late summer (earth), spleen and stomach.
const ctx = {
  almanac: almanacFor("2026-08-08", { birthDate: "1990-05-14", lifePathNumber: 2 }),
  protocol: { name: "Liver Support", dayNumber: 9, durationDays: 21, phase: "clear" },
  centre: { id: "gut", name: "Gut", aspect: "Terrain" },
};
const anchors = anchorsFor(ctx);

function rejectsUngrounded(name: string, c: Candidate) {
  const v = judge(c, anchors);
  if (v.ok) {
    failed++;
    console.log(`  ✗ should have rejected as ungrounded: ${name}\n      "${c.body}"`);
  } else if (!v.reasons.some((r) => r.includes("says nothing specific"))) {
    failed++;
    console.log(`  ✗ rejected for the wrong reason: ${name}\n      ${JSON.stringify(v.reasons)}`);
  } else passed++;
}

function rejectsFused(name: string, c: Candidate) {
  const v = judge(c, anchors);
  if (v.ok) {
    failed++;
    console.log(`  ✗ should have caught a dropped space: ${name}`);
  } else if (!v.reasons.some((r) => r.includes("dropped space"))) {
    failed++;
    console.log(`  ✗ wrong reason: ${name}\n      ${JSON.stringify(v.reasons)}`);
  } else passed++;
}

function acceptsGrounded(name: string, c: Candidate) {
  const v = judge(c, anchors);
  if (!v.ok) {
    failed++;
    console.log(`  ✗ should have accepted: ${name}\n      ${JSON.stringify(v.reasons)}`);
  } else passed++;
}

check("anchors were derived", anchors.length > 5, true);
check("anchors include the moon", anchors.includes("waning"), true);
check("anchors include the protocol day", anchors.includes("9"), true);
check("anchors include the organ", anchors.includes("spleen"), true);

// Phrase-clean, rule-clean, and about nothing. These are the notes that get
// past a banned-word list and still waste a member's time.
rejectsUngrounded("pure vibes, no facts", {
  headline: "Soften today",
  body: "There is a quiet asking to be met. Notice what wants attention and give it room. Nothing needs forcing right now.",
});

rejectsUngrounded("honour what is shifting", {
  headline: "What is shifting",
  body: "Something is turning over in you. Let it turn. You do not have to name it or fix it or explain it to anyone.",
});

rejectsUngrounded("generic slow down", {
  headline: "Slow down",
  body: "You have been moving quickly. Today asks for less speed and more attention to what is already in front of you.",
});

// The same sentiment, anchored to something real, is fine.
acceptsGrounded("names the moon", {
  headline: "Let it leave",
  body: "The moon is waning. Finish what is open before you start anything new. That is the whole instruction today.",
});

acceptsGrounded("names the protocol day", {
  headline: "Day nine",
  body: "Day 9 of 21 is where most people quit. Nothing has gone wrong. Eat earlier tonight and sleep before eleven.",
});

acceptsGrounded("names the organ and season", {
  headline: "Spleen weather",
  body: "Late summer, and the old reading puts the spleen ascendant. Cooked food over raw today. Skip the cold drinks.",
});

// A live run produced "The spleen seasonasks for simple food" — two words
// fused. Length can't catch it ("seasonasks" is as long as "everything"), but
// it always fuses a domain word we already know about.
rejectsFused("dropped space after a domain word", {
  headline: "Waning and weighted",
  body: "The moon is near empty. The spleen seasonasks for simple food and early rest. Nothing needs building today.",
});

// Ordinary inflections of the same words must survive.
acceptsGrounded("seasonal is not a fusion", {
  headline: "Late summer",
  body: "The spleen is ascendant in this seasonal turn. Simple food today — nothing raw, nothing cold, nothing late.",
});

acceptsGrounded("names a number", {
  headline: "A 2 day",
  body: "Your personal day is 2 — pairing and patience. The moon is waning with it. Wait for the reply before you push.",
});

// ═══ The fallback must pass its own filter ═════════════════════════════════
// If the fallback couldn't survive judge(), the last-resort path would be
// shipping copy we'd reject from the model.

section("The computed fallback survives the filter");

for (const date of ["2026-01-15", "2026-04-01", "2026-06-15", "2026-08-08", "2026-10-01", "2026-12-15"]) {
  const ctx = { almanac: almanacFor(date) };
  const note = fallbackNote(ctx);
  const v = judge(note);
  if (!v.ok) {
    failed++;
    console.log(`  ✗ fallback for ${date} fails the filter: ${v.reasons.join("; ")}\n      "${note.headline}" / "${note.body}"`);
  } else {
    passed++;
  }
}

// And with a protocol running, which adds a clause.
const withProtocol = fallbackNote({
  almanac: almanacFor("2026-08-08"),
  protocol: { name: "Liver Support", dayNumber: 9, durationDays: 21, phase: "clear" },
});
const v = judge(withProtocol);
if (!v.ok) {
  failed++;
  console.log(`  ✗ fallback with a protocol fails: ${v.reasons.join("; ")}`);
} else {
  passed++;
}


// ── What they have been training ─────────────────────────────────────────
//
// These sentences go straight into a prompt, so a wrong one is a note that
// tells a member something untrue about their own week. Nothing here may
// contain member-typed text: only counts and catalogue family labels.

function tcheck(name: string, cond: boolean, detail?: string) {
  if (cond) passed++;
  else {
    failed++;
    console.log(`  \u2717 ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

tcheck("no training data says nothing at all", trainingPromptLines(null).length === 0);

const trained = trainingPromptLines({
  sessionsThisWeek: 3,
  daysSinceLast: 0,
  recent: ["strength", "practices"],
  neglected: ["mobility"],
}).join(" ");
tcheck("today is 'today', not '0 days ago'", trained.includes("They trained today."));
tcheck("the week is counted", trained.includes("3 sessions in the last seven days."));
tcheck("what they did is named", trained.includes("This week: strength, practices."));
tcheck("what is missing is named", trained.includes("mobility"));

const one = trainingPromptLines({
  sessionsThisWeek: 1,
  daysSinceLast: 1,
  recent: ["strength"],
  neglected: [],
}).join(" ");
tcheck("one session is singular", one.includes("1 session in the last seven days."));
tcheck("yesterday is 'yesterday'", one.includes("They trained yesterday."));
tcheck("nothing missing is not mentioned", !one.includes("Not touched"));

const stale = trainingPromptLines({
  sessionsThisWeek: 0,
  daysSinceLast: 12,
  recent: [],
  neglected: ["strength", "mobility"],
}).join(" ");
tcheck("a gap is stated plainly", stale.includes("Last trained 12 days ago."));
tcheck("an empty week says so", stale.includes("Nothing logged in the last seven days."));
tcheck("no empty 'This week:' line", !stale.includes("This week:"));

/**
 * ── The two registers, both wrong ─────────────────────────────────────────
 *
 * Described by the person who read a week of live notes as "a woo woo lady who
 * went to Ubud to meditate". None of it trips the older rules: no banned
 * vocabulary, no jargon, grounded in a real fact. It is soft, reverent about
 * ordinary things, and it never quite tells anybody to do anything.
 *
 * The opposite failure is the American self-help voice — loud, congratulatory,
 * sold. This brand is European and understated, so both are rejections.
 */
rejects("an invitation instead of an instruction", {
  headline: "A slower morning",
  body: "Let today be lighter. Invite a slower start, and be kind to yourself about the pace.",
  invitation: null,
});
rejects("honouring rather than doing", {
  headline: "Rest today",
  body: "Honour what your body is asking for. Set an intention for the evening and tune in to what it needs.",
  invitation: null,
});
rejects("a walk treated as a ritual", {
  headline: "Move gently",
  body: "Come back to your breath and gently nourish your body with a moment of stillness.",
  invitation: null,
});
rejects("American cheerleading", {
  headline: "Four days running",
  body: "Amazing work — you've got this. Keep it up and become the best version of you.",
  invitation: null,
});
rejects("an exclamation mark", {
  headline: "Day nine",
  body: "You are on day nine of twenty-one. Drink more water today!",
  invitation: null,
}, "exclamation");

/** The maxim: every word allowed, no reader anywhere in it. */
rejects("an X-is-not-Y maxim", {
  headline: "On rest",
  body: "Rest is not the absence of work, it is the other half of it. Day nine of twenty-one.",
  invitation: null,
}, "maxim");
rejects("a what-the-body-does-not maxim", {
  headline: "Water",
  body: "What the body does not clear, it stores. You are on day nine of twenty-one.",
  invitation: null,
}, "maxim");
rejects("a superlative maxim", {
  headline: "Steps",
  body: "Walking is the easiest thing to get back after a waning moon week.",
  invitation: null,
}, "maxim");

/**
 * And the blunt version of each has to survive, or the filter has simply
 * banned the subject rather than the register.
 */
acceptsGrounded("the blunt version of a rest note", {
  headline: "Take today off",
  body: "You have trained four days straight and you are on day nine of twenty-one. Skip the session. Go to bed half an hour early.",
  invitation: "Bed by ten.",
});
acceptsGrounded("the blunt version of a movement note", {
  headline: "Short on steps",
  body: "You are behind on movement for day nine of twenty-one. A ten-minute walk after lunch covers most of it.",
  invitation: "Walk ten minutes after your largest meal.",
});
acceptsGrounded("a dry, unadorned approval", {
  headline: "Four days running",
  body: "That is four days running on day nine of twenty-one, good. Hold the same load tomorrow.",
  invitation: null,
});

console.log(`\n${failed === 0 ? "✓" : "✗"} ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
