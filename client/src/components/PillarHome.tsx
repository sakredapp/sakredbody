/**
 * Home — the terrain, then four doors.
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
import { cn } from "@/lib/utils";
import { HealthSwatches } from "@/components/portal/HealthSwatches";
import { TerrainToday } from "@/components/TerrainToday";
import type { MemberSection } from "@/components/MemberNav";

interface Pillar {
  key: string;
  title: string;
  /** What it is. One line, fixed. */
  blurb: string;
  image: string;
  /** Where tapping goes. Null means it isn't open yet. */
  section: MemberSection | null;
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
 * It did, for about an hour, and it was wrong for a reason worth keeping:
 * renaming the fourth door Terrain fixed the word and kept the mistake. The
 * brief is explicit that terrain "sits underneath all three" and that there
 * must not be four competing pillars — and a tile in the same grid, the same
 * size, with the same treatment, is a competing pillar no matter what it says
 * on it. The first person to see it asked "what is terrain?", which is the
 * only test that matters.
 *
 * So terrain is the *reading at the top* — TerrainToday, above these doors,
 * framing them — and the nine centres go back to being reachable from Restore
 * and from the More sheet. One word, one meaning, and it is not a place you
 * go: it is the condition the places are chosen against.
 *
 * ── Four doors, no hero ───────────────────────────────────────────────────
 *
 * Restore and Build now sit side by side at the same size. A hero row would
 * have made one of the two forces visually senior to the other on the screen
 * that introduces them as a pair, which is the same fault as the redirect
 * below, drawn instead of coded.
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
 * Restore, then Build, because you cannot load a terrain that cannot yet
 * drain. Then Gather and Library, which are what surrounds the practice
 * rather than what it is.
 *
 * Kept as a single array because that is the whole point: this is a brand
 * decision, so changing it should be one edit and never a refactor.
 */
const PILLARS: Pillar[] = [
  {
    key: "restore",
    title: "Restore",
    blurb: "Sleep, nervous system, and giving capacity back.",
    image: "/images/zen-sand-garden.webp",
    section: "restore",
  },
  {
    key: "build",
    title: "Build",
    blurb: "Strength, movement and resilience.",
    image: "/images/training-focus.webp",
    section: "build",
  },
  {
    key: "retreats",
    title: "Gather",
    blurb: "Retreats, masterminds, and the people around you.",
    image: "/images/retreat-mountain.webp",
    section: "retreat",
  },
  {
    key: "knowledge",
    title: "Library",
    // Was "Knowledge", which named the category rather than the thing. Nobody
    // opens an app looking for knowledge; they look for the guide they were
    // sent. It opens the library, so it says Library.
    blurb: "Courses, guides and tools for growth.",
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
  const today = useQuery<{ habits: Array<{ completed: boolean }> }>({
    queryKey: ["/api/habits/today"],
    queryFn: async () => {
      const r = await fetch("/api/habits/today", { credentials: "include" });
      if (!r.ok) throw new Error("no");
      return r.json();
    },
  });

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

  // The centres query left with the Terrain door. It was the only caller, and
  // a request whose result nothing renders is a request nobody will notice is
  // still being made.

  return { today, offerings, ebooks, build };
}

export function PillarHome({
  firstName,
  onOpen,
}: {
  firstName?: string | null;
  onOpen: (section: MemberSection) => void;
}) {
  const { today, offerings, ebooks, build } = useCounts();

  /**
   * The live line under each title.
   *
   * `undefined` while loading so the card renders its blurb and doesn't
   * flicker "nothing yet" into "3 upcoming" a moment later — a count that
   * changes under you reads as a bug even when it's just a fetch resolving.
   */
  function factFor(key: string): string | undefined {
    switch (key) {
      case "restore": {
        if (today.isLoading) return undefined;
        const list = today.data?.habits ?? [];
        if (list.length === 0) return "Nothing scheduled today";
        const done = list.filter((h) => h.completed).length;
        return `${done} of ${list.length} done today`;
      }
      case "build": {
        if (build.isLoading) return undefined;
        const n = build.data?.sessions?.length ?? 0;
        // "Prescribed" is the one word this app cannot use. Every legal page
        // we publish says we do not diagnose, treat, cure or prescribe — and
        // then the home screen told a member what had been prescribed for
        // them today. A reviewer reading both sees a health app claiming
        // medical authority its own disclaimer denies. "Planned" says the
        // same thing about the same data and claims nothing.
        if (n === 0) return "Nothing planned today";
        const lifts = build.data!.sessions.reduce((t, s) => t + s.exercises.length, 0);
        return `${lifts} ${lifts === 1 ? "lift" : "lifts"} today`;
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
      <div className="space-y-1">
        <h1 className="font-display text-3xl leading-tight">
          Welcome back{firstName ? `, ${firstName}` : ""}.
        </h1>
        <p className="font-display italic text-lg text-[hsl(var(--gold))]">
          You are your practice.
        </p>
      </div>

      {/* What condition they are in, before what they could do about it —
          the doors mean something different once you have read this. */}
      <TerrainToday onOpenRestore={() => onOpen("restore")} />

      {/* Their own numbers, before the menu. */}
      <HealthSwatches onOpenStats={() => onOpen("coaching")} />

      {/* A 2x2 grid of equals.

          This was one hero above a 2x2, which was right when there were five
          doors and the first was the obvious front. With four it made Restore
          senior to Build on the one screen whose job is to present them as two
          directions of the same thing. */}
      <div className="grid grid-cols-2 gap-3">
        {PILLARS.map((p) => {
          const fact = factFor(p.key);
          const open = p.section !== null;

          return (
            <button
              key={p.key}
              onClick={() => p.section && onOpen(p.section)}
              disabled={!open}
              className={cn(
                "group relative w-full overflow-hidden rounded-xl border border-[hsl(var(--gold))]/12 text-left tap-clean",
                "col-span-1 h-36 sm:h-40",
                open ? "hover:border-[hsl(var(--gold))]/30 transition-colors" : "opacity-60",
              )}
              data-testid={`pillar-${p.key}`}
            >
              <img
                src={p.image}
                alt=""
                loading="lazy"
                className="absolute inset-0 h-full w-full object-cover"
              />
              {/* Bottom-up, because a square card has no room to clear space
                  beside the text — the words sit on the scrim rather than
                  next to it. A flat scrim over the whole card would dim the
                  photograph without making anything more legible. */}
              <div className="absolute inset-0 bg-gradient-to-t from-[hsl(var(--ink))] via-[hsl(var(--ink))]/80 to-[hsl(var(--ink))]/10" />

              <div className="relative h-full flex items-end gap-3 px-4 pb-3">
                <div className="min-w-0 flex-1">
                  <h2 className="font-display tracking-wide uppercase text-white text-base">
                    {p.title}
                  </h2>
                  {/* The blurb used to be hero-only, on the grounds that two
                      lines of small type under a title made these read as
                      dense. It is back on every card because the first person
                      to use the four-door version asked what one of them was —
                      dense beats unexplained. One line, clamped. */}
                  <p className="text-[11px] leading-snug text-white/55 mt-0.5 line-clamp-2">
                    {p.blurb}
                  </p>
                  {fact && (
                    <p className="text-[11px] text-[hsl(var(--gold))] mt-1">{fact}</p>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
