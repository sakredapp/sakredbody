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
  version: 1,
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
      advance: { kind: "section", section: "home" },
    },
    {
      id: "terrain",
      objective: "Understand Home",
      section: "home",
      anchor: "terrain-now",
      title: "Your terrain",
      body:
        "Sakred reads your recent signals together rather than treating one number " +
        "as the whole story.\n\nIt's a reading, not a verdict. Your body still has " +
        "the final vote.",
      advance: { kind: "continue" },
    },
    {
      id: "health",
      objective: "Understand Home",
      section: "home",
      anchor: "health-card",
      optional: true,
      title: "What your phone knows",
      body:
        "If you've connected Apple Health or Health Connect, sleep and movement " +
        "arrive here on their own.\n\nIf you haven't, Sakred still works — it just " +
        "listens to you instead of your watch. You can connect it any time in Settings.",
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
      objective: "Visit Restore",
      section: "restore",
      anchor: "restore-practice",
      optional: true,
      title: "This changes with you",
      body:
        "What's offered here moves with your state. Recovery, breath, sleep and " +
        "stillness are tools you pick up — not identities you take on.\n\nOpen one " +
        "if you're curious. You don't have to do it now.",
      advance: { kind: "continue" },
    },

    // ── Build ────────────────────────────────────────────────────────────
    {
      id: "build",
      objective: "Learn Build",
      anchor: "nav-build",
      title: "Build",
      body:
        "Where Sakred turns readiness into capacity — strength, structure, and " +
        "intensity that's worth spending.\n\nTap Build.",
      advance: { kind: "section", section: "build" },
    },
    {
      id: "build-today",
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
        "This opens your workout.\n\nOpen one now and I'll show you how logging " +
        "works. Nothing you do in here is recorded — this one's a rehearsal.",
      advance: { kind: "present", anchor: "workout-add-exercise" },
    },

    // ── Inside the workout ───────────────────────────────────────────────
    {
      id: "add-exercise",
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
      objective: "Learn Build",
      anchor: "workout-set-row",
      title: "Weight and reps",
      body:
        "This is the whole of it. Tap a finished set later if you need to correct it.",
      advance: { kind: "continue" },
    },
    {
      id: "rpe",
      objective: "Learn Build",
      anchor: "workout-rpe",
      title: "How hard it felt",
      body:
        "RPE tells Sakred what the number can't — whether that set cost you nothing " +
        "or everything.\n\nYou don't have to turn every set into homework. Use it " +
        "when the effort is worth recording.",
      advance: { kind: "continue" },
    },
    {
      id: "set-style",
      objective: "Learn Build",
      anchor: "workout-set-style",
      optional: true,
      title: "When a set isn't a normal set",
      body:
        "Warm-up, drop, back-off, taken to failure — mark it when it matters, ignore " +
        "it when it doesn't.",
      advance: { kind: "continue" },
    },
    {
      id: "last-time",
      objective: "Learn Build",
      anchor: "workout-last-time",
      optional: true,
      title: "Last time",
      body:
        "Once you've trained a movement before, Sakred puts that session beside " +
        "today's.\n\nIt's a reference, not an instruction. More weight isn't the only " +
        "way a lift goes better — and how the warm-up landed is information too.",
      advance: { kind: "continue" },
    },
    {
      id: "close-workout",
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
      objective: "Open the Body Map",
      section: "body",
      anchor: "body-map",
      title: "Territories, not parts",
      body:
        "These help you see where a signal belongs — and how one region carries " +
        "another. Sleep shows up in the gut. Stress shows up in the jaw.",
      advance: { kind: "continue" },
    },
    {
      id: "body-territory",
      objective: "Open the Body Map",
      section: "body",
      anchor: "body-territory",
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

    // ── Done ─────────────────────────────────────────────────────────────
    {
      id: "complete",
      title: "You know the terrain",
      body:
        "That's the map.\n\nYou don't need to master any of it today. Use the system, " +
        "notice how you respond, and Sakred gets more useful as you get more familiar " +
        "with your own body.",
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
