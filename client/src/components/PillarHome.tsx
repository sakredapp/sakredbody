/**
 * Home — five doors.
 *
 * The launcher from the second round of mockups. It replaces opening straight
 * onto Today, and the reason is about how the app *reads* rather than what it
 * does: Today opens onto an empty checklist, which looks broken. A launcher of
 * five doors is supposed to be sparse, so the same absence of content reads as
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
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
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
 * The five doors, in one place on purpose.
 *
 * ── Embody, not Executive ─────────────────────────────────────────────────
 *
 * A round of mockups proposed Restore / Build / Executive / Retreats /
 * Knowledge. The brand already had an answer and it wasn't that: the meta
 * description reads "Restore the Body. Build the Body. Embody the Life.", and
 * the constellation on the landing page is drawn with four named anchors —
 * Restore, Build, Embody, Gather. Executive is a product tier here, not a
 * stage of the sequence, and promoting it to a pillar would have put a
 * customer segment where a practice belongs.
 *
 * Kept as a single array because that is the whole point: this is a brand
 * decision, so changing it should be one edit and never a refactor.
 */
const PILLARS: Pillar[] = [
  {
    key: "restore",
    title: "Restore",
    blurb: "Nervous system, recovery and inner balance.",
    image: "/images/zen-sand-garden.webp",
    section: "coaching",
  },
  {
    key: "build",
    title: "Build",
    blurb: "Strength, movement and resilience.",
    image: "/images/training-focus.webp",
    section: "build",
  },
  {
    key: "embody",
    title: "Embody",
    // Their own line: the body is the terrain you live your whole life
    // through. This door opens onto the nine centres, which is the closest
    // thing the app has to reading your own body — and which was otherwise
    // buried in the More sheet with no front door at all.
    blurb: "The terrain you live in, read from the inside.",
    image: "/images/rugged-cliffs.webp",
    section: "body",
  },
  {
    key: "retreats",
    title: "Retreats",
    blurb: "Transformative experiences in sacred locations.",
    image: "/images/retreat-mountain.webp",
    section: "retreat",
  },
  {
    key: "knowledge",
    title: "Knowledge",
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
 * These briefly went through an `apiUrl` helper so they would resolve inside
 * the Capacitor shell, where the bundle is served from `https://localhost` and
 * a bare `/api/...` hits the device rather than the server. That helper is
 * real but is not committed yet, and neither is `@capacitor/core` — importing
 * it broke the production build, since the file exists on one laptop and
 * nowhere else.
 *
 * When the native wrapper lands properly, every relative fetch in the client
 * needs that treatment in one sweep, not this component alone.
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

  const centres = useQuery<Array<{ reading?: unknown | null }>>({
    queryKey: ["/api/energy/centres"],
    queryFn: async () => {
      const r = await fetch("/api/energy/centres", { credentials: "include" });
      if (!r.ok) throw new Error("no");
      return r.json();
    },
  });

  return { today, offerings, ebooks, centres, build };
}

export function PillarHome({
  firstName,
  onOpen,
}: {
  firstName?: string | null;
  onOpen: (section: MemberSection) => void;
}) {
  const { today, offerings, ebooks, centres, build } = useCounts();

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
      case "embody": {
        if (centres.isLoading) return undefined;
        const all = centres.data ?? [];
        if (all.length === 0) return undefined;
        // Centres carry their latest reading, not today's, so this counts how
        // much of the map has ever been read rather than claiming a daily
        // figure the data can't support.
        const read = all.filter((c) => c.reading).length;
        return read === 0 ? "Not read yet" : `${read} of ${all.length} read`;
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

      <div className="space-y-3">
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
                "h-28 sm:h-32",
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
              {/* Read left-to-right: opaque where the words are, image where
                  they aren't. A flat scrim over the whole card would dim the
                  photograph without making the text any more legible. */}
              <div className="absolute inset-0 bg-gradient-to-r from-[hsl(var(--ink))] via-[hsl(var(--ink))]/85 to-[hsl(var(--ink))]/20" />

              <div className="relative h-full flex items-center gap-3 px-4">
                <div className="min-w-0 flex-1">
                  <h2 className="font-display text-xl tracking-wide uppercase text-white">
                    {p.title}
                  </h2>
                  <p className="text-xs text-white/60 mt-0.5 line-clamp-2">{p.blurb}</p>
                  {fact && (
                    <p className="text-[11px] text-[hsl(var(--gold))] mt-1">{fact}</p>
                  )}
                </div>

                {open && (
                  <span className="shrink-0 h-7 w-7 rounded-full border border-[hsl(var(--gold))]/40 grid place-items-center group-hover:border-[hsl(var(--gold))] transition-colors">
                    <ChevronRight className="h-3.5 w-3.5 text-[hsl(var(--gold))]" />
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
