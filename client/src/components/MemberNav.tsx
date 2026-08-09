/**
 * Navigation, twice — because a phone and a desktop want opposite things.
 *
 * ── The problem this replaces ─────────────────────────────────────────────
 *
 * Eight sections in a horizontally-scrolling pill row at the top, with a
 * second scrolling row of sub-navigation under it. On a phone that is two
 * rows of chrome before any content, both of which hide half their options
 * off-screen with no indication that they're there, and both of which sit at
 * the top — the part of a large phone a thumb cannot reach.
 *
 * ── What replaces it ──────────────────────────────────────────────────────
 *
 * On a phone: a bottom bar with the four places people actually go, plus More.
 * Bottom because that is where the thumb is, and because it is the convention
 * on both platforms — iOS calls it a tab bar, Android a navigation bar, and
 * they agree on the shape. Four plus More rather than eight, because a tab bar
 * that scrolls is a tab bar that has given up.
 *
 * On a desktop: the same destinations across the top, where there is room for
 * all of them and no thumb to worry about.
 *
 * The sheet holds the rest. Everything is still one tap from the bar, and
 * nothing is hidden behind a scroll nobody knows to perform.
 */

import type { ComponentType } from "react";
import {
  Home as HomeIcon,
  Dumbbell,
  Sun,
  Users,
  Award,
  CalendarDays,
  MoreHorizontal,
  Leaf,
  BookOpen,
  Activity,
  GraduationCap,
  Settings,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

export type MemberSection =
  | "home"
  | "coaching"
  | "build"
  | "community"
  | "wins"
  | "retreat"
  | "body"
  | "apothecary"
  | "library"
  | "masterclass"
  | "settings";

interface Destination {
  id: MemberSection;
  label: string;
  icon: ComponentType<{ className?: string }>;
  /** One line, shown only in the More sheet — the bar itself stays wordless. */
  note?: string;
}

/**
 * The four, and the rest.
 *
 * Chosen by what a member does daily rather than by what the business thinks
 * is important: home is the five doors, today is the product, the room is why
 * they stay, and wins are why they come back.
 *
 * Five is the ceiling, not a target — iOS collapses a sixth into "More" on
 * its own, and Android's guidance is the same. "What's On" moved into the
 * More sheet when Home took a slot: it is reachable from the Retreats door on
 * the home screen, which is where somebody looking for it would go first.
 */
export const PRIMARY: Destination[] = [
  { id: "home", label: "Home", icon: HomeIcon },
  { id: "coaching", label: "Today", icon: Sun },
  { id: "community", label: "Room", icon: Users },
  { id: "wins", label: "Wins", icon: Award },
];

export const SECONDARY: Destination[] = [
  { id: "retreat", label: "What's On", icon: CalendarDays, note: "Retreats, masterminds and talks" },
  { id: "build", label: "Build", icon: Dumbbell, note: "Today's lifts, and what you hit" },
  { id: "body", label: "The Body", icon: Activity, note: "Nine centres, read in sequence" },
  { id: "apothecary", label: "Apothecary", icon: Leaf, note: "What each protocol asks for" },
  { id: "library", label: "Library", icon: BookOpen, note: "Guides paired to your protocol" },
  { id: "masterclass", label: "Masterclass", icon: GraduationCap, note: "Lessons, on your own time" },
  { id: "settings", label: "Settings", icon: Settings, note: "Blocked people, units, your account" },
];

const ALL = [...PRIMARY, ...SECONDARY];

// ─── Phone ─────────────────────────────────────────────────────────────────

export function MemberBottomNav({
  section,
  onChange,
}: {
  section: MemberSection;
  onChange: (s: MemberSection) => void;
}) {
  const inMore = SECONDARY.some((d) => d.id === section);

  return (
    <nav
      className={cn(
        "md:hidden fixed bottom-0 inset-x-0 z-50",
        "border-t border-border/60 bg-background/95 backdrop-blur-md",
        // The home indicator sits over the bottom edge on a modern iPhone, so
        // the bar pays that back rather than putting a target underneath it.
        "pb-safe",
      )}
      aria-label="Sections"
    >
      <div className="flex items-stretch">
        {PRIMARY.map(({ id, label, icon: Icon }) => {
          const active = section === id;
          return (
            <button
              key={id}
              onClick={() => onChange(id)}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex-1 flex flex-col items-center justify-center gap-1 py-2 tap tap-clean",
                "transition-colors",
                active ? "text-[hsl(var(--gold))]" : "text-muted-foreground",
              )}
              data-testid={`nav-${id}`}
            >
              <Icon className="h-5 w-5" />
              {/* The label stays. An icon-only bar is a guessing game, and
                  these four icons are not universal enough to carry it. */}
              <span className="text-[10px] leading-none">{label}</span>
            </button>
          );
        })}

        <Sheet>
          <SheetTrigger asChild>
            <button
              className={cn(
                "flex-1 flex flex-col items-center justify-center gap-1 py-2 tap tap-clean",
                "transition-colors",
                inMore ? "text-[hsl(var(--gold))]" : "text-muted-foreground",
              )}
              data-testid="nav-more"
              aria-label="More sections"
            >
              <MoreHorizontal className="h-5 w-5" />
              <span className="text-[10px] leading-none">More</span>
            </button>
          </SheetTrigger>

          <SheetContent side="bottom" className="pb-safe">
            <SheetHeader className="text-left">
              <SheetTitle className="font-display text-xl font-normal">
                Everything else
              </SheetTitle>
            </SheetHeader>

            <div className="mt-4 -mx-2">
              {SECONDARY.map(({ id, label, icon: Icon, note }) => (
                <button
                  key={id}
                  onClick={() => {
                    onChange(id);
                    // Radix closes the sheet on any click inside it that
                    // isn't prevented, so no explicit close is needed.
                  }}
                  className={cn(
                    "w-full flex items-center gap-3 px-4 py-3 rounded-md text-left tap-clean",
                    section === id ? "bg-[hsl(var(--gold))]/10" : "hover:bg-muted/50",
                  )}
                  data-testid={`nav-more-${id}`}
                >
                  <Icon
                    className={cn(
                      "h-5 w-5 shrink-0",
                      section === id ? "text-[hsl(var(--gold))]" : "text-muted-foreground",
                    )}
                  />
                  <span className="min-w-0">
                    <span className="block text-sm">{label}</span>
                    {note && (
                      <span className="block text-xs text-muted-foreground">{note}</span>
                    )}
                  </span>
                </button>
              ))}
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </nav>
  );
}

/**
 * The spacer the bottom bar needs.
 *
 * A fixed bar covers the last ~64px of the page, which on the community tab is
 * the composer and on Today is the chart invitation. Rendered as a sibling
 * rather than as padding on a wrapper so it can't be forgotten by whatever
 * lays the page out next.
 */
export function BottomNavSpacer() {
  return <div className="md:hidden h-20" aria-hidden="true" />;
}

// ─── Desktop ───────────────────────────────────────────────────────────────

export function MemberTopNav({
  section,
  onChange,
}: {
  section: MemberSection;
  onChange: (s: MemberSection) => void;
}) {
  return (
    <div className="hidden md:flex items-center bg-muted/60 rounded-full p-1 gap-0.5">
      {ALL.map(({ id, label }) => (
        <button
          key={id}
          onClick={() => onChange(id)}
          aria-current={section === id ? "page" : undefined}
          className={cn(
            "px-3.5 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-all duration-300",
            section === id
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
          data-testid={`member-section-${id}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
