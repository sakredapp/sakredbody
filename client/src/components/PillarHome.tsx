/**
 * Home — how you're doing, then where you go.
 *
 * The launcher from the second round of mockups. It replaces opening straight
 * onto Today, and the reason is about how the app *reads* rather than what it
 * does: Today opens onto an empty checklist, which looks broken. A launcher of
 * a few doors is supposed to be sparse, so the same absence of content reads as
 * a product waiting for you rather than one that failed.
 *
 * ── Every card states a fact, not a tagline ───────────────────────────────
 *
 * "Informational and applicable" is the brief, and it draws a real line. A
 * subtitle reading "Nervous system, recovery and inner balance" is decoration
 * — it says the same thing on every member's screen, forever. "4 of 6 done
 * today" and "2 upcoming" are true of this person right now, and they are the
 * reason to tap.
 *
 * So each door reads its own live count. When there is nothing, it says so
 * plainly instead of falling back to marketing copy — an honest "nothing
 * scheduled" is more useful than a sentence that would be there either way.
 *
 * ── Deliberately not a score ──────────────────────────────────────────────
 *
 * No composite here — no readiness, no capacity, no points. A number invented
 * out of other numbers is a character sheet, and this is a practice. The only
 * figures shown are things that are literally counted.
 */

import { useQuery } from "@tanstack/react-query";
import { useTrackedHabits } from "@/components/habits/useHabits";
import { useActiveEnrollment, useHasCoachPlan } from "@/hooks/use-coaching";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { HealthSwatches } from "@/components/portal/HealthSwatches";
import { TerrainToday } from "@/components/TerrainToday";
import type { MemberSection, CoachingTab } from "@/components/MemberNav";

interface Pillar {
  key: string;
  title: string;
  /** What it is. One line, fixed. */
  blurb: string;
  image: string;
  /** Where tapping goes. Null means it isn't open yet. */
  section: MemberSection | null;
  /** The sub-tab to land on, where the section has them. */
  tab?: CoachingTab;
  /** Full width, above the grid. At most one. */
  lead?: boolean;
}

/**
 * The doors, in one place on purpose.
 *
 * ── Why Embody is no longer one of them ───────────────────────────────────
 *
 * It used to sit third, between Build and Retreats, and the note here argued
 * for it: the brand line reads "Restore the Body. Build the Body. Embody the
 * Life." That argument was about the *site*, and the site has since answered
 * it — territories.ts is three now, not four, on the grounds that Embody was
 * never a force alongside the other two. It described the relationship
 * *between* them, which makes it a fine idea and a bad sibling.
 *
 * The app had the same fault with a sharper edge, because a door is not a
 * paragraph: tapping Embody opened the nine centres, which is a reading of
 * your own terrain.
 *
 * ── And why Terrain did not simply take its slot ──────────────────────────
 *
 * It did, for about an hour, and it was wrong twice over.
 *
 * First, it fixed the word and kept the mistake: the brief is explicit that
 * terrain "sits underneath all three" and that there must not be four
 * competing pillars — and a tile in the same grid, at the same size, with the
 * same treatment is a competing pillar whatever it says on it.
 *
 * Second, and worse, nobody knew what it meant. Asked cold, two readers
 * guessed diet, then protocols. A door a member cannot resolve is worse than
 * the one it replaced, because at least Embody was a word they had been
 * taught. Terrain survives as the name of the model, the endpoint and the
 * philosophy; it does not survive as one word on a phone.
 *
 * The second guess turned out to be the useful one. What was missing here was
 * never a name for the condition — that is the reading at the top — it was the
 * plan somebody is actually on. Hence the coach's plan.
 *
 * ── The coach's plan leads; Restore and Build are equals ──────────────────
 *
 * The lead card was removed an hour ago because it made Restore visually
 * senior to Build on the one screen whose job is presenting them as a pair.
 * That reasoning was right and does not apply here: the coach's plan is not
 * one of the two forces, it is what somebody has been assigned, so it can sit
 * above both without ranking them against each other.
 *
 * It is called the coach's plan and not Protocol because that is what it is —
 * a plan a person wrote for this member. "Protocol" is what the business calls
 * it internally, and it is also what a member would reasonably expect to cover
 * everything they do, which it does not: it is deliberately partial, and the
 * lifestyle habits either side of it are the member's own.
 *
 * The nine centres stay reachable from Restore and from the More sheet.
 *
 * ── Say what the screen is about, in the words people use ─────────────────
 *
 * The blurbs are close to how the product's own author described these out
 * loud when asked what they were for: Restore is "is the body well rested",
 * Build is "are you getting enough movement in". Those beat anything written
 * to sound considered, because they are what somebody actually wants to know
 * before tapping.
 *
 * ── Restore is a place now ────────────────────────────────────────────────
 *
 * The larger fault was quieter. Restore pointed at `coaching`, which is Today
 * — so of the two forces the whole product is built on, one was a screen and
 * the other was a redirect to the daily checklist. On a home screen that
 * presents them as a pair, that asymmetry is the product telling you which
 * half it actually built.
 *
 * ── Order is the argument ─────────────────────────────────────────────────
 *
 * The coach's plan first, because it is the answer to "what am I meant to be
 * doing".
 * Then Restore and Build, in that order, because you cannot load a body that
 * cannot yet recover. Then Gather and Library, which are what surrounds the
 * practice rather than what it is.
 *
 * Kept as a single array because that is the whole point: this is a brand
 * decision, so changing it should be one edit and never a refactor.
 */
const PILLARS: Pillar[] = [
  {
    key: "protocol",
    title: "Coach's Plan",
    blurb: "What your coach has you on.",
    image: "/images/rugged-cliffs.webp",
    section: "coaching",
    tab: "routines",
    lead: true,
  },
  {
    key: "restore",
    title: "Restore",
    blurb: "Is your body rested?",
    image: "/images/zen-sand-garden.webp",
    section: "restore",
  },
  {
    key: "build",
    title: "Build",
    blurb: "Are you moving enough?",
    image: "/images/training-focus.webp",
    section: "build",
  },
  {
    key: "retreats",
    title: "Gather",
    blurb: "Retreats, masterminds, the room.",
    image: "/images/retreat-mountain.webp",
    section: "retreat",
  },
  {
    key: "knowledge",
    title: "Library",
    // Was "Knowledge", which named the category rather than the thing. Nobody
    // opens an app looking for knowledge; they look for the guide they were
    // sent. It opens the library, so it says Library.
    blurb: "Guides, courses and tools.",
    image: "/images/stone-villa.webp",
    section: "library",
  },
];

/**
 * One shared fetch per door, so five cards don't become fifteen requests.
 *
 * Relative paths, deliberately, for now.
 *
 * Relative is now safe natively. `installNativeApiFetch()` runs in main.tsx
 * before render and rewrites same-origin `/api/` requests to the real API
 * origin, adding the bearer token — so a bare fetch here resolves correctly
 * inside the Capacitor shell rather than hitting the device.
 *
 * This note used to say the opposite, and it outlived the fix: it claimed the
 * wrapper had not landed and that every relative fetch needed converting in
 * one sweep. Read cold, it sends you off to change eighty call sites that
 * already work.
 */
function useCounts() {
  // Restore and Build count from the resolved day.
  //
  // This used to read /api/habits/today, which is the Coach's Plan checklist —
  // a different question, and the reason the Restore card once answered "is
  // your body rested?" with "4 of 6 done". That request is gone rather than
  // left in place: a fetch whose result nothing renders is a fetch nobody will
  // notice is still being made.
  const tracked = useTrackedHabits();

  const offerings = useQuery<Array<unknown>>({
    queryKey: ["/api/offerings"],
    queryFn: async () => {
      const r = await fetch("/api/offerings", { credentials: "include" });
      if (!r.ok) throw new Error("no");
      return r.json();
    },
  });

  const ebooks = useQuery<Array<unknown>>({
    queryKey: ["/api/library/ebooks"],
    queryFn: async () => {
      const r = await fetch("/api/library/ebooks", { credentials: "include" });
      if (!r.ok) throw new Error("no");
      return r.json();
    },
  });

  const build = useQuery<{ sessions: Array<{ exercises: unknown[] }> }>({
    queryKey: ["/api/training/today"],
    queryFn: async () => {
      const r = await fetch("/api/training/today", { credentials: "include" });
      if (!r.ok) throw new Error("no");
      return r.json();
    },
  });

  /**
   * `null` is a real answer here, not an error: /api/routines/active returns
   * it for somebody not enrolled in anything. So the fact says "Nothing
   * active" rather than staying blank, which is the difference between a door
   * that looks broken and one that tells you why it is empty.
   *
   * Through the shared hook rather than a second inline query on the same key.
   * It was declared here with its own hand-written response type, and the More
   * sheet answered the same question from nowhere at all — which is how the nav
   * came to offer a coach's plan to members this screen had already decided did
   * not have one.
   */
  const protocol = useActiveEnrollment();

  // The centres query left with the Terrain door. It was the only caller, and
  // a request whose result nothing renders is a request nobody will notice is
  // still being made.

  return { tracked, offerings, ebooks, build, protocol };
}

const lead = PILLARS.find((p) => p.lead) ?? null;
const rest = PILLARS.filter((p) => !p.lead);

/**
 * One door. Identical in every respect except height, which is the point —
 * the lead card is bigger, not different, so the grid still reads as one set.
 */
function Door({
  pillar,
  fact,
  onOpen,
}: {
  pillar: Pillar;
  fact?: string;
  onOpen: (section: MemberSection, tab?: CoachingTab) => void;
}) {
  const open = pillar.section !== null;

  return (
    <button
      onClick={() => pillar.section && onOpen(pillar.section, pillar.tab)}
      disabled={!open}
      className={cn(
        "group relative w-full overflow-hidden rounded-xl border border-[hsl(var(--gold))]/12 text-left tap-clean",
        pillar.lead ? "h-28 sm:h-32" : "col-span-1 h-36 sm:h-40",
        open ? "hover:border-[hsl(var(--gold))]/30 transition-colors" : "opacity-60",
      )}
      data-testid={`pillar-${pillar.key}`}
    >
      <img
        src={pillar.image}
        alt=""
        loading="lazy"
        className="absolute inset-0 h-full w-full object-cover"
      />
      {/* Bottom-up on the square cards, because they have no room to clear
          space beside the text — the words sit on the scrim rather than next
          to it. The lead card is wide enough to read left-to-right, so it
          clears its left third instead and keeps more of the photograph. */}
      <div
        className={cn(
          "absolute inset-0",
          pillar.lead
            ? "bg-gradient-to-r from-[hsl(var(--ink))] via-[hsl(var(--ink))]/85 to-[hsl(var(--ink))]/20"
            : "bg-gradient-to-t from-[hsl(var(--ink))] via-[hsl(var(--ink))]/80 to-[hsl(var(--ink))]/10",
        )}
      />

      <div
        className={cn(
          "relative h-full flex gap-3 px-4",
          pillar.lead ? "items-center" : "items-end pb-3",
        )}
      >
        <div className="min-w-0 flex-1">
          <h2
            className={cn(
              "font-display tracking-wide uppercase text-white",
              pillar.lead ? "text-xl" : "text-base",
            )}
          >
            {pillar.title}
          </h2>
          {/* The blurb used to be lead-only, on the grounds that two lines of
              small type under a title made these read as dense. It is on every
              card now because the first person to use the version without them
              asked what one of the doors was — dense beats unexplained. */}
          <p className="text-[11px] leading-snug text-white/55 mt-0.5 line-clamp-1">
            {pillar.blurb}
          </p>
          {fact && <p className="text-[11px] text-[hsl(var(--gold))] mt-1">{fact}</p>}
        </div>

        {open && pillar.lead && (
          <span className="shrink-0 h-7 w-7 rounded-full border border-[hsl(var(--gold))]/40 grid place-items-center group-hover:border-[hsl(var(--gold))] transition-colors">
            <ChevronRight className="h-3.5 w-3.5 text-[hsl(var(--gold))]" />
          </span>
        )}
      </div>
    </button>
  );
}

export function PillarHome({
  firstName,
  onOpen,
}: {
  firstName?: string | null;
  onOpen: (section: MemberSection, tab?: CoachingTab) => void;
}) {
  const { tracked, offerings, ebooks, build, protocol } = useCounts();

  /**
   * Resolved, not assumed. `null` is what /api/routines/active returns for
   * somebody not enrolled, so the card is hidden only once we actually know —
   * showing it and then removing it a moment later reads as a glitch.
   */
  const hasPlan = useHasCoachPlan();

  /**
   * The live line under each title.
   *
   * `undefined` while loading so the card renders its blurb and doesn't
   * flicker "nothing yet" into "3 upcoming" a moment later — a count that
   * changes under you reads as a bug even when it's just a fetch resolving.
   */
  function factFor(key: string): string | undefined {
    switch (key) {
      case "protocol":
        // The card only renders when there is one, so this is always a name.
        return protocol.data?.routine?.name ?? undefined;
      /**
       * Each card counts its own habits.
       *
       * Restore and Build are the two halves of a lifestyle, not two views of
       * one list: sleep, minerals and magnesium on one side; steps, sunlight
       * and intake on the other. Until habits carried a direction, the only
       * number available was the whole checklist — so this card asked "is your
       * body rested?" and answered "4 of 6 done today", which is the count of
       * everything ticked, most of it about something else entirely.
       *
       * A habit with no emphasis is counted by neither. That is deliberate:
       * it is a habit nobody has assigned a direction to, and inventing one
       * to make a number look complete is how the number stops being true.
       */
      case "restore":
      case "build": {
        if (tracked.isLoading) return undefined;
        // Only what is actually due today. A Mon/Wed/Fri sauna on a Tuesday is
        // neither done nor missed, and counting it into the denominator would
        // make every Tuesday read as a shortfall.
        const mine = (key === "restore" ? tracked.data?.restore : tracked.data?.build ?? [])
          ?.filter((h) => h.expected !== "off") ?? [];

        if (mine.length === 0) {
          // Build has a second thing to say when no habits are set for it;
          // Restore has nothing else to count, so it stays quiet rather than
          // showing a zero that reads as a failure.
          if (key === "build" && !build.isLoading) {
            const n = build.data?.sessions?.length ?? 0;
            if (n > 0) {
              const lifts = build.data!.sessions.reduce((t, s) => t + s.exercises.length, 0);
              return `${lifts} ${lifts === 1 ? "lift" : "lifts"} today`;
            }
          }
          return undefined;
        }

        const done = mine.filter(
          (h) => h.progressState === "met" || h.progressState === "over",
        ).length;
        return `${done} of ${mine.length} today`;
      }
      case "retreats": {
        if (offerings.isLoading) return undefined;
        const n = offerings.data?.length ?? 0;
        return n === 0 ? "Nothing scheduled yet" : `${n} upcoming`;
      }
      case "knowledge": {
        if (ebooks.isLoading) return undefined;
        const n = ebooks.data?.length ?? 0;
        return n === 0 ? "No guides yet" : `${n} ${n === 1 ? "guide" : "guides"}`;
      }
      default:
        return undefined;
    }
  }

  return (
    <div className="space-y-6">
      {/*
        The greeting, and the date.

        It was "You are your practice." in italic gold — a slogan printed under
        a greeting, telling the member nothing and setting exactly the tone the
        app is trying not to have. It is the first line on the first screen, so
        it did more than any other string to make this read like a retreat
        brochure.

        The date replaces it because it is the one thing worth saying in that
        position: everything below is about today, and today is now named. A
        line that carries information beats a line that carries an attitude.
      */}
      <div className="space-y-1">
        <h1 className="font-display text-3xl leading-tight">
          Welcome back{firstName ? `, ${firstName}` : ""}.
        </h1>
        <p className="text-sm text-muted-foreground">
          {new Date().toLocaleDateString(undefined, {
            weekday: "long",
            day: "numeric",
            month: "long",
          })}
        </p>
      </div>

      {/* What condition they are in, before what they could do about it —
          the doors mean something different once you have read this. */}
      <TerrainToday onOpenRestore={() => onOpen("restore")} />

      {/*
        Their own numbers, and then the doors. Nothing else.

        ── Why the suggestions are not here ──────────────────────────────────

        They were, for one build, and it was the wrong call. Three cards of
        "here's something you could do" at the top of Home turned a launcher
        into a recommendation engine — the first thing anybody saw, every time
        they opened the app, whether or not they wanted it.

        That is not what the feature is. It is a small, optional prompt for
        somebody who has already decided to move and wants an idea: it belongs
        inside Build and Restore, next to the thing it is suggesting, where a
        member arrives having asked the question it answers. On Home it was
        answering a question nobody had asked yet.

        The rhythm cards moved to Restore for the same reason — terrain
        context, not a headline.
      */}
      <HealthSwatches onOpenStats={() => onOpen("coaching")} />

      {/* The lead, then a 2x2 of equals. One Door component for both, so the
          only difference between them is height. */}
      {/* No plan, no card.
          Same rule the terrain reading follows: a door that says "Nothing
          active" is an empty promise taking up the largest slot on the screen,
          and most members will not have a coach. It appears the moment one
          assigns them something, and until then Restore and Build are simply
          the top row. */}
      {lead && hasPlan && <Door pillar={lead} fact={factFor(lead.key)} onOpen={onOpen} />}

      <div className="grid grid-cols-2 gap-3">
        {rest.map((p) => (
          <Door key={p.key} pillar={p} fact={factFor(p.key)} onOpen={onOpen} />
        ))}
      </div>
    </div>
  );
}
