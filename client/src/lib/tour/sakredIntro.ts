/**
 * The first lesson: the app teaching someone how to inhabit it, by moving.
 *
 * ── Voice ─────────────────────────────────────────────────────────────────
 *
 * Sakred walking beside the member, not a feature tour narrating itself. Short
 * sentences. No "Feature 3 of 7". No mystical fog, and no clinical SaaS
 * onboarding either. The video-game reference in the brief is about
 * interaction — dim, spotlight, wait for the real action — and explicitly not
 * about how any of this is written.
 *
 * ── Why the copy is here and not in the components ────────────────────────
 *
 * Because it is the part most likely to be revised, by someone who should not
 * have to find it threaded through twenty files. And because a step that reads
 * badly next to the step before it is the most common failure of a walkthrough
 * — one screen at a time always sounds fine.
 *
 * ── The optional steps ────────────────────────────────────────────────────
 *
 * LAST TIME needs a previous session. A Restore practice needs one offered
 * today. Neither is fabricated for the sake of the tutorial, so both are marked
 * optional and their copy never refers to a step the member may not have seen.
 * A brand-new member has no training history, which means the LAST TIME lesson
 * is one most people meet on their second week rather than their first hour —
 * and that is the honest version.
 */

import type { GuidedTour } from "./types";

export const SAKRED_INTRO: GuidedTour = {
  id: "sakred_intro",
  version: 2,
  steps: [
    // ── Welcome ──────────────────────────────────────────────────────────
    {
      id: "welcome",
      title: "Welcome to Sakred Body",
      body:
        "This isn't a dashboard you have to obey. Sakred helps you understand what " +
        "state your body is in, what it may be asking for, and how your choices " +
        "change that state over time.\n\nLet's walk the terrain.",
      advance: { kind: "continue" },
    },

    // ── Home ─────────────────────────────────────────────────────────────
    {
      id: "home",
      objective: "Understand Home",
      anchor: "nav-home",
      title: "Home",
      body:
        "Where Sakred brings the pieces together — your signals, today's direction, " +
        "and what's worth your attention now.\n\nTap Home.",
      /*
        A tap, not a section.

        The walkthrough starts on Home, so a lesson that completes when the
        member *is* on Home was already complete when it opened: it appeared
        and vanished inside a frame, having told nobody anything, while
        instructing a tap it did not wait for. Found by a harness that could
        never catch this lesson on screen to measure it.
      */
      advance: { kind: "tap" },
    },
    {
      id: "terrain",
      objective: "Understand Home",
      section: "home",
      anchor: "terrain-now",
      title: "Your terrain",
      body:
        "Sakred's current read of the whole terrain — not one score, and not one " +
        "number off a wearable.\n\nIt's a reading, not a verdict. Your body still " +
        "has the final vote.",
      advance: { kind: "continue" },
    },
    {
      id: "health",
      objective: "Understand Home",
      section: "home",
      /*
        The provenance line on the terrain card, not the coaching HealthCard.

        Health is not a separate pillar of Home and was never going to become
        one for the sake of a lesson — the coaching HealthCard is rendered only
        inside CoachingDashboard, so a walkthrough targeting it was waiting for
        an element that does not exist on a member's screen. Terrain is where a
        member meets measured data, so the lesson points at the sentence that
        says where this reading came from.
      */
      anchor: "health-context",
      optional: true,
      title: "What your devices add",
      body:
        "Your devices add measured context such as sleep, recovery signals and " +
        "movement.\n\nThey inform the picture; they don't get the final vote.\n\n" +
        "Nothing connected? Sakred still works without one — you can add it any " +
        "time in Settings.",
      advance: { kind: "continue" },
    },

    // ── Restore ──────────────────────────────────────────────────────────
    {
      id: "restore",
      objective: "Visit Restore",
      anchor: "nav-restore",
      title: "Restore",
      body:
        "The side of Sakred that clears, regulates and makes room.\n\nTap Restore.",
      advance: { kind: "section", section: "restore" },
    },
    {
      id: "restore-practice",
      weight: "workspace",
      objective: "Visit Restore",
      section: "restore",
      anchor: "restore-practice",
      /* Every practice card carries this anchor, and the lesson means any of
         them — "open one if you're curious" is not a step that has forgotten
         to say which. Declared, so the ambiguity rule still protects the
         steps that genuinely do mean one control. */
      anyInstance: true,
      optional: true,
      title: "This changes with you",
      body:
        "Restore creates room — for recovery, regulation and adaptation.\n\nWhat's " +
        "offered moves with your state. These are tools you pick up, not identities " +
        "you take on.\n\nOpen one if you're curious. You don't have to do it now.",
      advance: { kind: "continue" },
    },

    // ── Build ────────────────────────────────────────────────────────────
    {
      id: "build",
      objective: "Learn Build",
      anchor: "nav-build",
      title: "Build",
      body:
        "Build adds useful demand when the terrain can support it.\n\nIt develops " +
        "capacity — not effort for its own sake.\n\nTap Build.",
      advance: { kind: "section", section: "build" },
    },
    {
      id: "build-today",
      weight: "workspace",
      objective: "Learn Build",
      section: "build",
      anchor: "build-today",
      title: "Today's build",
      body:
        "What Sakred suggests, given where you are. Take it, change it, or train " +
        "something else entirely — it reads what you actually do, not what it hoped " +
        "you'd do.",
      advance: { kind: "continue" },
    },
    {
      id: "start-session",
      objective: "Learn Build",
      section: "build",
      anchor: "build-start-session",
      rehearsal: "begin",
      title: "Starting a session",
      body:
        "This opens your workout. What you actually do becomes part of what Sakred " +
        "knows next — it carries the demand forward rather than treating every day " +
        "as if nothing happened.\n\nOpen one now and I'll show you how logging " +
        "works. Nothing in here is recorded — this one's a rehearsal.",
      advance: { kind: "present", anchor: "workout-add-exercise" },
    },

    // ── Inside the workout ───────────────────────────────────────────────
    {
      id: "add-exercise",
      weight: "workspace",
      objective: "Learn Build",
      anchor: "workout-add-exercise",
      title: "Add what you're doing",
      body:
        "Movements go in here.\n\nSakred remembers the exercise before you log a " +
        "single set, so you can walk away mid-session and come back to it.\n\nAdd one.",
      advance: { kind: "present", anchor: "workout-set-row" },
    },
    {
      id: "set-row",
      weight: "workspace",
      objective: "Learn Build",
      anchor: "workout-set-row",
      title: "Weight and reps",
      body:
        "This is the whole of it. Tap a finished set later if you need to correct it." +
        "\n\nThe weight box says what it wants: for dumbbells it reads \"each\", " +
        "because 70 in each hand and 70 altogether are different sessions. You can " +
        "change how a movement is read from its ••• menu.",
      advance: { kind: "continue" },
    },
    {
      id: "rpe",
      weight: "workspace",
      objective: "Learn Build",
      anchor: "workout-rpe",
      title: "How hard it felt",
      body:
        "Weight tells Sakred what you lifted. RPE helps show what that effort cost " +
        "today.\n\nYou don't have to turn every ordinary set into homework. Use it " +
        "when the effort is worth recording — left blank, it stays unknown rather " +
        "than being read as easy.",
      advance: { kind: "continue" },
    },
    {
      id: "set-style",
      weight: "workspace",
      objective: "Learn Build",
      anchor: "workout-set-style",
      optional: true,
      title: "When a set isn't a normal set",
      body:
        "Warm-up, drop, back-off, taken to failure — mark it when it matters, ignore " +
        "it when it doesn't.\n\nEach one says what it means when you pick it, so " +
        "there's nothing here you're expected to already know.",
      advance: { kind: "continue" },
    },
    {
      id: "last-time",
      weight: "workspace",
      objective: "Learn Build",
      anchor: "workout-last-time",
      optional: true,
      title: "Last time",
      body:
        "This is an example. Once you begin training, it becomes your own previous " +
        "performance for the movement.\n\nA reference, not an instruction. More " +
        "weight isn't the only way a lift goes better, and how the warm-up landed is " +
        "information too.",
      advance: { kind: "continue" },
    },
    {
      id: "close-workout",
      weight: "workspace",
      objective: "Learn Build",
      anchor: "workout-close",
      rehearsal: "end",
      title: "That's a session",
      body:
        "Close this one. Nothing from the rehearsal is kept — no sets, no history, " +
        "nothing added to what Sakred knows about your training.",
      advance: { kind: "absent", anchor: "workout-set-row" },
    },

    // ── Body ─────────────────────────────────────────────────────────────
    {
      id: "body",
      objective: "Open the Body Map",
      anchor: "nav-body",
      title: "The Body",
      body:
        "Your map.\n\nSakred treats the body as connected terrain rather than a list " +
        "of separate complaints.\n\nTap Body.",
      advance: { kind: "section", section: "body" },
    },
    {
      id: "body-map",
      weight: "workspace",
      objective: "Open the Body Map",
      section: "body",
      anchor: "body-map",
      title: "Territories, not parts",
      body:
        "The map behind the signals.\n\nIt shows where something belongs and how one " +
        "region carries another — sleep shows up in the gut, stress shows up in the " +
        "jaw. The point is to understand the system, not only to follow it.",
      advance: { kind: "continue" },
    },
    {
      id: "body-territory",
      weight: "workspace",
      objective: "Open the Body Map",
      section: "body",
      anchor: "body-territory",
      /* Nine territories, nine correct answers. See TourStep.anyInstance. */
      anyInstance: true,
      title: "Have a look",
      body: "Open one territory. Anything that interests you — you can come back.",
      advance: { kind: "tap" },
    },

    // ── Room ─────────────────────────────────────────────────────────────
    {
      id: "room",
      objective: "Find Room",
      anchor: "nav-community",
      title: "Room",
      body:
        "Health isn't lived alone. This is where the conversation is.\n\nTap Room.",
      advance: { kind: "section", section: "community" },
    },
    {
      id: "room-feed",
      weight: "workspace",
      objective: "Find Room",
      section: "community",
      anchor: "room-feed",
      title: "Read before you write",
      body:
        "Nobody has to post. Read, reply, or sit quietly — all three are normal here.",
      advance: { kind: "continue" },
    },

    // ── More ─────────────────────────────────────────────────────────────
    {
      id: "more",
      objective: "Explore More",
      formFactor: "phone",
      anchor: "nav-more",
      title: "Everything else",
      body:
        "What's On, the Apothecary, the Library, Masterclass, your Progress & Wins, " +
        "and Settings.\n\nNothing here needs a permanent seat. Tap More.",
      advance: { kind: "present", anchor: "more-sheet" },
    },
    {
      id: "settings",
      objective: "Explore More",
      anchor: "nav-more-settings",
      title: "Settings",
      body:
        "Health connections, appearance, your photo, your account.\n\nOpen it — " +
        "there's one thing in there worth knowing about.",
      advance: { kind: "section", section: "settings" },
    },
    {
      id: "appearance",
      objective: "Explore More",
      section: "settings",
      anchor: "appearance-control",
      optional: true,
      title: "Night or daylight",
      body:
        "Sakred comes in both. Change it now or leave it — it's this device only, " +
        "and nothing about your body reads differently in either.",
      advance: { kind: "continue" },
    },

    // ── The lesson the rest of it was for ────────────────────────────────
    /*
      The one step somebody would otherwise need a person sitting beside them
      to learn. Everything above teaches where things are; this teaches what to
      do tomorrow morning, which is the actual thing being asked for when
      somebody says "can you show me how to use this".
    */
    {
      id: "rhythm",
      title: "Your rhythm with Sakred",
      body:
        "See where you are.\n\nAdd what technology can't know.\n\nRestore or Build " +
        "according to the day.\n\nRecord what actually happened.\n\nNotice the " +
        "response.\n\nOver time Sakred gains context — and you gain a clearer read " +
        "of your own patterns.",
      advance: { kind: "continue" },
    },

    // ── The finishing ritual ─────────────────────────────────────────────
    /*
      Not a preference field. The member picks the world the app opens into,
      the whole application changes underneath the overlay while they are still
      standing in it, and the night/day idea becomes something they have seen
      rather than something they were told.

      System is deliberately absent here. It is a third answer to a question
      the member has not been asked yet, and offering it at this moment turns a
      choice between two atmospheres into a settings screen. It stays available
      in Settings, where somebody looking for it will look.
    */
    {
      id: "atmosphere",
      objective: "Choose your atmosphere",
      section: "settings",
      choice: "appearance",
      title: "Choose your atmosphere",
      body:
        "One last thing.\n\nSakred can meet you in two atmospheres. The system " +
        "underneath is exactly the same — pick the one you want to live in.",
      advance: { kind: "continue" },
    },

    // ── Done ─────────────────────────────────────────────────────────────
    {
      id: "complete",
      title: "You know the terrain",
      body:
        "That's the map.\n\nYou don't need to master any of it today. Use the system, " +
        "notice how you respond, and Sakred gets more useful as you get more familiar " +
        "with your own body.\n\nYou can change the atmosphere any time in More → " +
        "Settings → Appearance.",
      advance: { kind: "continue" },
    },
  ],
};

/**
 * The coach extension.
 *
 * A separate tour, deliberately. Coach is an additive role over the member app
 * — a coach's own Home, Restore and Build are still theirs — and folding four
 * client-management steps into the universal walkthrough would teach every new
 * member about an inbox they do not have. It is offered after the intro is
 * finished, only to an account that holds the capability, and skipping it costs
 * nothing.
 *
 * The same shape is what a future role registers: its own tour, offered on its
 * own condition, with no edit to the one above.
 */
export const SAKRED_COACH_INTRO: GuidedTour = {
  id: "sakred_coach",
  version: 1,
  steps: [
    {
      id: "coach-welcome",
      title: "You also coach here",
      body:
        "Coaching is a room you step into, not a different app.\n\nYour own Home, " +
        "Restore, Build and Body stay yours. Client information only ever appears " +
        "inside Coach.",
      advance: { kind: "continue" },
    },
    {
      id: "coach-entry",
      objective: "Find your workspace",
      anchor: "nav-more",
      title: "Where it lives",
      body: "More, then My roles.\n\nTap More.",
      advance: { kind: "present", anchor: "more-sheet" },
    },
    {
      id: "coach-role",
      objective: "Find your workspace",
      anchor: "role-coach",
      title: "Coach",
      body: "Here. Open it.",
      advance: { kind: "tap" },
    },
  ],
};

/**
 * Role extensions, as a registry rather than a condition inside the tour.
 *
 * Adding a role to Sakred should add a line here and touch nothing else. The
 * alternative — an `if (isCoach)` somewhere in the universal walkthrough —
 * means the member tour grows a branch for every capability that ever exists,
 * and each branch is a chance to teach an ordinary member about an inbox they
 * do not have.
 *
 * `atLeast` is not used: this is about what an account *is*, not what it may
 * do. An admin outranks a coach in every permission check in the product and
 * still should not be handed a coaching walkthrough for clients they do not
 * have.
 */
export const ROLE_TOURS: { role: string; tour: GuidedTour }[] = [
  { role: "coach", tour: SAKRED_COACH_INTRO },
];

export function roleTours(role: string | null | undefined): GuidedTour[] {
  return ROLE_TOURS.filter((r) => r.role === role).map((r) => r.tour);
}
