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
import { apiUrl } from "@/lib/apiBase";

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
 * The five pillars, in one place on purpose.
 *
 * The marketing site currently runs Restore / Build / Embody / Terrain and
 * these mockups run Restore / Build / Executive / Retreats / Knowledge. That
 * is an unsettled brand decision, not a code one, so it lives as a single
 * array — swapping a pillar is one edit here rather than a refactor.
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
    section: null,
  },
  {
    key: "executive",
    title: "Executive",
    blurb: "Mindset, leadership and performance.",
    image: "/images/elegant-interior.webp",
    section: "coaching",
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
 * Through `apiUrl` rather than a bare relative path: the native shells serve
 * this bundle from `https://localhost`, where `/api/...` resolves against the
 * device instead of the server. See lib/apiBase.ts.
 */
function useCounts() {
  const today = useQuery<{ habits: Array<{ completed: boolean }> }>({
    queryKey: ["/api/habits/today"],
    queryFn: async () => {
      const r = await fetch(apiUrl("/api/habits/today"), { credentials: "include" });
      if (!r.ok) throw new Error("no");
      return r.json();
    },
  });

  const offerings = useQuery<Array<unknown>>({
    queryKey: ["/api/offerings"],
    queryFn: async () => {
      const r = await fetch(apiUrl("/api/offerings"), { credentials: "include" });
      if (!r.ok) throw new Error("no");
      return r.json();
    },
  });

  const ebooks = useQuery<Array<unknown>>({
    queryKey: ["/api/library/ebooks"],
    queryFn: async () => {
      const r = await fetch(apiUrl("/api/library/ebooks"), { credentials: "include" });
      if (!r.ok) throw new Error("no");
      return r.json();
    },
  });

  return { today, offerings, ebooks };
}

export function PillarHome({
  firstName,
  onOpen,
}: {
  firstName?: string | null;
  onOpen: (section: MemberSection) => void;
}) {
  const { today, offerings, ebooks } = useCounts();

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
      case "build":
        return "Not open yet";
      case "executive":
        return "Speak to your coach";
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
