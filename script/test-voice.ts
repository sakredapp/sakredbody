/**
 * Voice filter tests.
 *
 * `judge()` is the thing standing between a generated note and a member paying
 * five figures. A prompt is a request; this is the guarantee. So it gets
 * tested against the copy it exists to stop.
 *
 *   npx tsx script/test-voice.ts
 */

import { judge, fallbackNote, type Candidate } from "../server/daily/voice.js";
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

rejects("headline too long", {
  headline: "A Very Long Headline That Rambles On",
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

console.log(`\n${failed === 0 ? "✓" : "✗"} ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
