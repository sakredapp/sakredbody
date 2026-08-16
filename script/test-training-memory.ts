/**
 * Sakred remembers what your body said, and does not diagnose it.
 *
 * ── What this closes ──────────────────────────────────────────────────────
 *
 * A recommendation engine reading sleep and HRV can say "chest looks useful
 * today". It cannot say the only thing worth saying: that the last time this
 * person loaded a single-leg hinge their left low back complained and their
 * glute didn't fire. Before this, that sentence had nowhere to be written and
 * nothing to read it — three `note` columns existed, all unwritten and all
 * unread.
 *
 * ── The boundary these mostly exist for ───────────────────────────────────
 *
 * Personalizing around soreness, stiffness, weak connection and training
 * response is the product. Turning one sentence into a diagnosis is not, and
 * the cases where it would be most tempting to guess — numbness, something
 * that popped, three weeks of getting worse — are exactly the ones where
 * guessing is worst. So a flagged note gets a *smaller* training adjustment
 * and a sentence saying this is not Sakred's call, and it never names a
 * condition.
 *
 * Run: tsx script/test-training-memory.ts
 */

import { readFileSync } from "node:fs";
import {
  MEMORY_ALIKE_DAYS,
  MEMORY_DISCLOSURE,
  MEMORY_WINDOW_DAYS,
  isNotable,
  needsProfessionalEyes,
  recallFor,
  recallForCategory,
  recallLine,
  restoreLine,
  type Observation,
} from "../shared/models/trainingMemory.js";

let passed = 0;
let failed = 0;

function check(name: string, cond: boolean, detail?: string) {
  if (cond) passed++;
  else {
    failed++;
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const code = (p: string) =>
  readFileSync(new URL(`../${p}`, import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

const obs = (o: Partial<Observation>): Observation => ({
  exerciseId: null,
  note: null,
  quality: null,
  side: null,
  onDate: "2026-08-01",
  ...o,
});

console.log("\nOnly what is worth saying back\n");

{
  check("discomfort is", isNotable(obs({ quality: "discomfort" })));
  check("so is tightness", isNotable(obs({ quality: "tight" })));
  check("a weak connection", isNotable(obs({ quality: "weak" })));
  check("and instability", isNotable(obs({ quality: "unstable" })));

  /**
   * "Felt good" is the answer most sessions get and the one nobody needs read
   * back to them before their next set. It is recorded — it is what makes the
   * one bad evening legible — and it is not recalled.
   */
  check("but a good session is not recalled", !isNotable(obs({ quality: "good" })));
  check("nor 'something else' on its own", !isNotable(obs({ quality: "other" })));
  check("nor an empty one", !isNotable(obs({})));

  /**
   * A sentence can outrank the word beside it. Somebody who picked nothing and
   * wrote "went numb down the leg" has said the most important thing in the
   * table.
   */
  check("a red-flag sentence is notable whatever was picked",
    isNotable(obs({ quality: "good", note: "left foot went numb halfway through" })));
  check("and with no word at all",
    isNotable(obs({ note: "something popped and it gave way" })));
}

console.log("\nThe cases that are not Sakred's to judge\n");

{
  /** Neurological. */
  for (const note of [
    "left foot went numb",
    "tingling down the back of my leg",
    "pins and needles in the hand",
    "shooting pain into the calf",
    "felt it radiating down",
    "think it's a nerve thing",
    "sciatica flared up",
  ]) {
    check(`"${note}"`, needsProfessionalEyes(note));
  }

  /** Sharp, sudden, or a loss of function. */
  for (const note of [
    "sharp pain on the third rep",
    "something popped",
    "the knee just gave way",
    "couldn't lift my arm after",
    "can't straighten it this morning",
    "swollen this morning",
  ]) {
    check(`"${note}"`, needsProfessionalEyes(note));
  }

  /** Said plainly, over time. */
  for (const note of [
    "getting worse each session",
    "been like this for weeks now",
    "still hurts three days later",
  ]) {
    check(`"${note}"`, needsProfessionalEyes(note));
  }

  /**
   * And the ordinary training language this must NOT catch. A screen that
   * flags every ache stops meaning anything, and being told to see somebody
   * about normal soreness is how members learn to ignore the sentence.
   */
  for (const note of [
    "left glute didn't seem to connect",
    "low back a bit tight coming out of the hole",
    "felt strong, could have gone heavier",
    "sore from Tuesday but fine",
    "grip went before the back did",
    "hamstrings tight, warmed up fine after two sets",
  ]) {
    check(`"${note}" is training, not triage`, !needsProfessionalEyes(note));
  }

  check("and nothing said is nothing flagged", !needsProfessionalEyes(null));
}

console.log("\nRecalled where it could change a decision\n");

{
  const rdl = obs({
    exerciseId: "single-leg-romanian-deadlift",
    exerciseName: "Single-Leg Romanian Deadlift",
    pattern: "hinge",
    category: "legs",
    quality: "discomfort",
    side: "left",
    note: "Slight low-back discomfort. Glute didn't feel like it was firing.",
    onDate: "2026-08-10",
  });
  const older = obs({ ...rdl, note: "same but older", onDate: "2026-07-02" });
  const bench = obs({
    exerciseId: "barbell-bench-press",
    pattern: "push",
    category: "chest",
    quality: "tight",
    onDate: "2026-08-14",
  });

  const hinge = { id: "single-leg-romanian-deadlift", pattern: "hinge", category: "legs" };

  check("the exact movement matches", recallFor([bench, rdl], hinge)?.exerciseId === rdl.exerciseId);
  /** Newest wins — the last one is the one that might change today. */
  check("and the newest of them", recallFor([older, rdl], hinge)?.onDate === "2026-08-10");
  check("an unrelated movement does not", recallFor([bench], hinge) === null);

  /**
   * Matched by shape where the exact movement has nothing. A member who did
   * Single-Leg RDLs in March and B-stance RDLs today has not changed the
   * question their low back is being asked.
   */
  const bStance = { id: "b-stance-rdl", pattern: "hinge", category: "legs" };
  check("a movement of the same shape does", recallFor([rdl], bStance)?.exerciseId === rdl.exerciseId);
  check("but not one of a different shape", recallFor([rdl], { id: "x", pattern: "push", category: "chest" }) === null);
  /** No pattern, no shape match — a guess dressed as a recall. */
  check("and never on a missing pattern", recallFor([rdl], { id: "x", pattern: null, category: "legs" }) === null);

  /**
   * ── And a shape match fades ──
   *
   * "You noted this on a single-leg RDL, and today is a B-stance RDL" is worth
   * saying the week after. Saying it for six weeks turns one sentence into a
   * standing warning across every leg day, which is the opposite of adapting to
   * what is true now. The exact movement keeps the full window; coming back to
   * the same lift is precisely when somebody wants reminding.
   */
  const old = obs({ ...rdl, onDate: "2026-07-01" });
  check("a recent lookalike still speaks",
    recallFor([rdl], bStance, "2026-08-20") !== null);
  check("an old one does not", recallFor([old], bStance, "2026-08-20") === null);
  check("but the exact movement still does at the same age",
    recallFor([old], hinge, "2026-08-20") !== null);
  /** Exactly at the boundary, so the rule is a date and not a vibe. */
  check("the boundary is inclusive",
    recallFor([obs({ ...rdl, onDate: "2026-08-06" })], bStance, "2026-08-20") !== null);
  check("and one day past it is not",
    recallFor([obs({ ...rdl, onDate: "2026-08-05" })], bStance, "2026-08-20") === null);
  check("a shorter clock than the window", MEMORY_ALIKE_DAYS < MEMORY_WINDOW_DAYS,
    `${MEMORY_ALIKE_DAYS} vs ${MEMORY_WINDOW_DAYS}`);
  /** A recommendation is an inference about a kind of work, on the same clock. */
  check("the category recall fades too",
    recallForCategory([old], "legs", "2026-08-20") === null);
  check("and speaks while it is fresh",
    recallForCategory([rdl], "legs", "2026-08-20") !== null);

  /** Exact beats alike even when the alike one is newer. */
  const newerAlike = obs({ ...rdl, exerciseId: "dumbbell-romanian-deadlift", onDate: "2026-08-14" });
  check("the exact match wins over a newer lookalike",
    recallFor([newerAlike, rdl], hinge)?.exerciseId === "single-leg-romanian-deadlift");

  /**
   * Build recommends a category, not a movement, so that is the resolution it
   * is matched at. Matching more precisely than the recommendation would be
   * inventing precision.
   */
  check("a recommendation matches by category", recallForCategory([bench, rdl], "legs") === rdl);
  check("and finds nothing where there is nothing", recallForCategory([rdl], "shoulders") === null);
  check("a good session is not recalled here either",
    recallForCategory([obs({ quality: "good", category: "legs" })], "legs") === null);
}

console.log("\nThe frame is Sakred's, the sentence is theirs\n");

{
  const rdl = obs({
    exerciseId: "single-leg-romanian-deadlift",
    exerciseName: "Single-Leg Romanian Deadlift",
    quality: "discomfort",
    side: "left",
    note: "Slight low-back discomfort. Glute didn't feel like it was firing.",
  });

  const line = recallLine(rdl, "Single-Leg Romanian Deadlift");
  check("the side is stated", /left-sided/.test(line.headline));
  check("and what it was", /discomfort/.test(line.headline));
  /** Quoted whole. A paraphrase is a claim Sakred did not have the right to make. */
  check("the note is carried verbatim", line.quote === rdl.note);
  check("and not summarised into the headline", !line.headline.includes("Glute"));
  check("this one is a training adjustment", /start lighter/i.test(line.guidance));
  check("not a referral", !line.seekCare);

  const flagged = recallLine({ ...rdl, note: "sharp, and it went numb down the leg" }, "x");
  check("a flagged note is marked", flagged.seekCare);
  check("its guidance defers", /someone qualified/i.test(flagged.guidance));
  /** A *smaller* adjustment, not a better one. */
  check("and asks for less, not more", /light|leave the pattern out/i.test(flagged.guidance));

  /**
   * The line Sakred must never cross. No condition is named anywhere in the
   * model — not in the guidance, not in the flag list, not in the labels.
   */
  /**
   * Read from the strings a member can actually see, not from the file — the
   * prose explaining the rule necessarily contains the words the rule is about,
   * and an assertion over the comments would be an assertion about the comments.
   */
  const memberFacing = [
    flagged.headline, flagged.guidance,
    line.headline, line.guidance,
    restoreLine(rdl).headline, restoreLine(rdl).guidance,
    MEMORY_DISCLOSURE.title, MEMORY_DISCLOSURE.body,
  ].join(" ");
  for (const word of [
    "impingement", "tendinitis", "tendinopathy", "herniat", "bulge", "strain of",
    "tear", "sprain", "arthritis", "bursitis", "diagnos",
  ]) {
    check(`"${word}" is never said to the member`, !new RegExp(word, "i").test(memberFacing));
  }
  check("nothing promises to heal anything", !/\bheal(ing|s)?\b/i.test(memberFacing));
  check("and nothing is called an injury", !/\binjur(y|ies|ed)\b/i.test(memberFacing));
  /** A negative sweep over an empty string proves nothing. */
  check("there is member-facing text to sweep", memberFacing.length > 200, `${memberFacing.length} chars`);

  const restore = restoreLine(rdl);
  check("Restore gives the other half of the answer", /mobility|easy work/i.test(restore.guidance));
  check("and not the same advice again", restore.guidance !== line.guidance);
  check("it quotes them too", restore.quote === rdl.note);
}

console.log("\nWritten where it happens, read where it matters\n");

{
  const sheet = code("client/src/components/build/WorkoutSheet.tsx");
  const routes = code("server/training/routes.ts");
  const memory = code("server/training/memory.ts");

  /** During the workout, not only afterwards. */
  check("every movement can be noted on", /data-testid=\{`note-movement-/.test(sheet));
  check("and the icon says whether one exists", /observationFor\(m\.id\)\s*\?\s*"text-\[hsl\(var\(--gold\)\)\]"/.test(sheet));

  /** Finish is a question before it is a commit. */
  check("finishing opens the response loop", /onClick=\{\(\) => setReviewing\(true\)\}/.test(sheet));
  check("which lists what was done", /data-testid=\{`review-\$\{g\.movement\.id\}`\}/.test(sheet));
  check("offers a session note", /data-testid="review-session-note"/.test(sheet));
  /** And a fast path that still records something. */
  /** The fast answer is held rather than fired, so both exits mean something. */
  check("there is a fast answer", /data-testid="review-all-good"/.test(sheet));
  check("held locally", /const \[allGood, setAllGood\]/.test(sheet));
  check("and written on save as a real observation", /if \(allGood\)[\s\S]{0,300}quality: "good"/.test(sheet));
  /** The boundary is stated where somebody is about to describe a symptom. */
  check("the boundary is said on that screen", /doesn't diagnose/.test(sheet));

  /**
   * ── And nobody is held there ──
   *
   * A feedback screen with no way past it is how somebody ends up believing
   * they finished while the timer runs for another two hours. Three exits, all
   * visible.
   */
  check("back to the workout", /data-testid="review-back"/.test(sheet));
  check("which does not end the session", /onClick=\{\(\) => setReviewing\(false\)\}/.test(sheet));
  check("and says it is still running", /Still running/.test(sheet));
  check("finish with what was said", /data-testid="review-finish"/.test(sheet));
  check("and finish without saying anything", /data-testid="review-finish-bare"/.test(sheet));
  /** The bare exit writes nothing — otherwise the label is a lie. */
  const bare = sheet.slice(sheet.indexOf('data-testid="review-finish-bare"') - 400,
                           sheet.indexOf('data-testid="review-finish-bare"'));
  check("the bare exit records nothing", !/observe\.mutate/.test(bare));

  /** One observation per movement per session, replaced rather than stacked. */
  const post = routes.slice(routes.indexOf('"/api/training/sessions/:id/observations"'));
  const body = post.slice(0, post.indexOf("app.post(", 1));
  check("ownership is proven first", /eq\(workoutSessions\.userId, userId\)/.test(body));
  check("the day comes from the session", /onDate: owned\.onDate/.test(body));
  check("a correction replaces rather than stacks", /delete\(trainingObservations\)/.test(body));
  check("scoped to the movement", /eq\(trainingObservations\.exerciseId, input\.exerciseId\)/.test(body));
  check("and the session note is its own slot", /isNull\(trainingObservations\.exerciseId\)/.test(body));
  check("the sentence is stored as typed", /note: input\.note\?\.trim\(\) \|\| null/.test(body));

  /** One reader, so no two screens can disagree about one sentence. */
  check("the window is the model's", /MEMORY_WINDOW_DAYS/.test(memory));
  check("and notability is the model's too", /rows\.filter\(isNotable\)/.test(memory));
  check("joined to the catalogue for shape", /leftJoin\(exercises/.test(memory));

  /** Read where a decision is made, and nowhere else. */
  /**
   * By position rather than by a character window: what happened last time and
   * the reference sentence now sit between the two, and a fixed-distance regex
   * would report a layout change as a missing feature.
   */
  check("above the movement, before the sets",
    sheet.includes("<MovementMemory") &&
      sheet.indexOf("<MovementMemory") < sheet.indexOf("g.sets.map"));
  check("on the recommendation", /<SuggestionMemory/.test(code("client/src/components/build/BuildToday.tsx")));
  check("and on Restore", /<RestoreMemory \/>/.test(code("client/src/components/RestoreTab.tsx")));
  /** Not as a feed. Nothing renders a list of past complaints. */
  const surface = code("client/src/components/build/TrainingMemory.tsx");
  check("one note, never a history", !/\.map\(/.test(surface));
  check("and nothing at all when there is nothing", /return null/.test(surface));

  /**
   * ── And it stays small ──
   *
   * "Last time: slight left low-back discomfort." A note is information a
   * member weighs, and an app that escalates one sentence into a bordered
   * warning across every future leg day has stopped helping them adapt. The
   * border, the icon and the guidance are kept for the flagged case only,
   * which is the one where a smaller nudge is not the useful thing.
   */
  check("the ordinary recall is one line", /if \(!seekCare\) \{[\s\S]{0,600}<button/.test(surface));
  check("with the guidance behind a tap", /\{open && \(/.test(surface));
  check("and no border on it", !/if \(!seekCare\) \{[\s\S]{0,400}rounded-xl border/.test(surface));
  check("the flagged one keeps its weight", /AlertTriangle/.test(surface));
}

console.log("\nAnd it says why the five seconds are worth it\n");

{
  const build = code("client/src/components/build/BuildToday.tsx");
  check("the disclosure exists", /MEMORY_DISCLOSURE/.test(build));
  check("it says what is learned from", /discomfort/.test(MEMORY_DISCLOSURE.body));
  check("and what changes", /warm-ups/.test(MEMORY_DISCLOSURE.body));
  /** Only after they have left one, so it explains rather than asks. */
  check("shown only once something has been said",
    /if \(!data\?\.observations\?\.length\) return null/.test(build));
  check("and it is mounted", /<MemoryDisclosure \/>/.test(code("client/src/components/BuildTab.tsx")));

  check("the window is a stated number", MEMORY_WINDOW_DAYS > 0 && MEMORY_WINDOW_DAYS <= 90,
    String(MEMORY_WINDOW_DAYS));
}

console.log(`\n${failed === 0 ? "✓" : "✗"} ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
