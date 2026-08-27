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

import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import {
  Home as HomeIcon,
  Dumbbell,
  Sun,
  Target,
  Users,
  UserCog,
  ShieldCheck,
  Award,
  CalendarDays,
  MoreHorizontal,
  ChevronRight,
  Leaf,
  Moon,
  BookOpen,
  Activity,
  GraduationCap,
  Settings,
  LifeBuoy,
  type LucideIcon,
} from "lucide-react";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useHasActiveCoachPlan } from "@/hooks/use-coach-plan";
import { useAccess } from "@/hooks/use-access";
import type { Role } from "@shared/models/access";
import { cn } from "@/lib/utils";
import { onStageRequest } from "@/lib/tour/stage";

export type MemberSection =
  | "home"
  | "goals"
  | "coaching"
  | "restore"
  | "build"
  | "community"
  | "wins"
  | "retreat"
  | "body"
  | "apothecary"
  | "library"
  | "masterclass"
  | "help"
  | "settings";

/**
 * The sub-tabs under Coaching.
 *
 * Exported so Home can deep-link into one — the Protocol door opens
 * `coaching`/`routines` rather than dropping somebody on Today and leaving
 * them to find the tab.
 */
export type CoachingTab =
  | "today"
  | "journey"
  | "routines"
  | "catalog"
  | "analytics"
  | "coach";

/**
 * Somewhere a member can go — which is now two different kinds of thing.
 *
 * Most destinations are sections of this one page, switched with `onChange`.
 * A role workspace is a *route*: `/coach` is its own screen with its own
 * internal navigation, and it always was — which is why it could not appear in
 * this menu at all and had to be smuggled in as a pill in the dashboard header
 * instead. One shape that can express both is what lets a role workspace live
 * where every other destination lives.
 *
 * Exactly one of `section` and `href` defines the behaviour. Both, or neither,
 * is a mistake this type cannot catch, so `destinationIsValid` does.
 */
interface Destination {
  /** Stable key and test id. Not the address — see `section`/`href`. */
  id: string;
  label: string;
  icon: LucideIcon;
  /** One line, shown only in the More sheet — the bar itself stays wordless. */
  note?: string;
  /** A section of the member dashboard. */
  section?: MemberSection;
  /** A route of its own. */
  href?: string;
  /**
   * Minimum staff role, for a destination not everybody holds.
   *
   * This decides what to *draw*. It is not the security boundary — `/coach`
   * and `/admin` each gate themselves, and every route behind them is checked
   * server-side against the relationship as well as the role. Hiding a row is
   * manners.
   */
  capability?: Role;
  /** Things actually needing attention. Absent and zero both render nothing. */
  badge?: number;
}

/** Exactly one address. Exported so a test can hold every list to it. */
export function destinationIsValid(d: Destination): boolean {
  return (d.section === undefined) !== (d.href === undefined);
}

/**
 * The four, and the rest.
 *
 * Chosen by what a member does daily rather than by what the business thinks
 * is important: home is where you are, the room is why they stay, and wins are
 * why they come back.
 *
 * ── Why Today is no longer one of them ────────────────────────────────────
 *
 * It held the second slot from the beginning, on the argument that "today is
 * the product". That was true of the idea and stopped being true of the
 * screen. Home already opens with the terrain reading and the member's own
 * numbers — it *is* the answer to "how am I doing today" — while the Today tab
 * showed a coach's routine checklist, which for most members is "No routine
 * running. Start one." A destination whose common case is an empty state,
 * sitting next to a screen that already answers its question, is a tab people
 * tap once.
 *
 * Restore and Build are the two things somebody actually does daily, and both
 * were buried in the More sheet underneath it. They take the slots.
 *
 * The coach's plan is not gone: it is the lead card on Home the moment a coach
 * assigns one, and it is in the More sheet. That is the right prominence for
 * something most members do not have.
 *
 * Five is the ceiling, not a target — iOS collapses a sixth into "More" on
 * its own, and Android's guidance is the same.
 */
/**
 * ── Why the fifth slot is the Body and not Wins ───────────────────────────
 *
 * "Wins are why they come back" is the sentence above, and it was a guess
 * about motivation rather than an observation of use. Wins is a record of
 * things that already happened, written by the system, and it announces itself
 * the moment it has something to say — `WinMoment` surfaces a new one where the
 * member already is. A surface that comes to you does not also need a
 * permanent seat in the five places you can reach with a thumb.
 *
 * The Body is the opposite kind of screen: seven territories the member reads
 * themselves, returns to, and gradually learns to interpret. It is the one
 * destination in the app whose whole purpose is teaching somebody to see their
 * own system — which makes it a pillar next to Restore and Build, not an item
 * in a drawer under them. It spent this whole time in the More sheet, one tap
 * further away than a page of trophies.
 *
 * Five is still the ceiling. Body takes the slot Wins had rather than adding a
 * sixth, because a tab bar that grows is a tab bar on its way back to scrolling.
 */
export const PRIMARY: Destination[] = [
  { id: "home", label: "Home", icon: HomeIcon, section: "home" },
  { id: "restore", label: "Restore", icon: Moon, section: "restore" },
  { id: "build", label: "Build", icon: Dumbbell, section: "build" },
  { id: "community", label: "Room", icon: Users, section: "community" },
  /*
    Activity, the same mark The Body carried in the sheet — a line finding its
    way across a field. Nothing anatomical and nothing muscular: this is the
    door to seven territories and what you notice in each, and an icon of a
    torso would make it look like the software the doctrine argues against.
  */
  { id: "body", label: "Body", icon: Activity, section: "body" },
];

export const SECONDARY: Destination[] = [
  /**
   * The coach's plan, by the name a member would use for it. It was the
   * "Today" tab; what it actually contains is whatever a coach has assigned,
   * which most members do not have.
   */
  /*
    "Your Plan", not "Coach's Plan", and not "Coaching".

    The gate is an active `coaching_plan`, and a plan can outlive the coaching
    relationship that produced it — its habit contracts are still governing the
    member's day. "Coaching" would therefore be a lie in exactly the case the
    gates were drawn to protect, and "Coach's Plan" quietly implies a coach is
    still there. It is the member's current practice either way.

    The attribution is not lost, it moves inside: the plan itself names the human
    who wrote it, where that is historically accurate, rather than the doorway
    depending on who authored it.

    The `id` stays `coaching` because it addresses an existing section. It is an
    address, not a claim — nothing may gate this destination on a coaching
    relationship. See `useSecondary`.
  */
  /*
    Above Your Plan, because a goal is the member's and a plan is somebody
    else's idea about how to get there. Most members have no coach and
    therefore no plan; every member can have a direction.
  */
  { id: "goals", label: "Your Goals", icon: Target, note: "What you're building toward", section: "goals" },
  { id: "coaching", label: "Your Plan", icon: Sun, note: "What you're working on now", section: "coaching" },
  { id: "retreat", label: "What's On", icon: CalendarDays, note: "Retreats, masterminds and talks", section: "retreat" },
  /**
   * "The Body", and not "Terrain".
   *
   * It was Terrain for an hour. The word is right for the *reading* on Home —
   * what condition you are in — and wrong as a destination, because a member
   * looking at a menu item called Terrain cannot tell whether it holds their
   * stats, their protocol or a philosophy page. The first person to see it
   * asked exactly that.
   *
   * One word, one meaning: terrain is the reading, The Body is the screen
   * where you take it yourself.
   */
  /*
    The Body is not here any more — it is the fifth primary destination. Listing
    it in both places would be the same room reached two ways, which is how a
    menu starts feeling longer than the app.
  */
  { id: "apothecary", label: "Apothecary", icon: Leaf, note: "What each protocol asks for", section: "apothecary" },
  { id: "library", label: "Library", icon: BookOpen, note: "Guides paired to your protocol", section: "library" },
  { id: "masterclass", label: "Masterclass", icon: GraduationCap, note: "Lessons, on your own time", section: "masterclass" },
  /*
    Wins keeps its screen and every row behind it — the awards, the sharing,
    the export. What it loses is a permanent seat in the bar. Nothing about the
    data changed; a member who wants to look back still can, and a member who
    doesn't is no longer walking past a trophy case to reach the Room.
  */
  { id: "wins", label: "Progress & Wins", icon: Award, note: "What you've come through so far", section: "wins" },
  /*
    Above Settings, not inside it.

    The walkthrough used to be reachable only from the day somebody signed up,
    and then only from a Settings row — which is where a person looks when
    something is wrong, not when they want to learn how the app works. This is
    the functional door: a member who wants to know how Build works should find
    it in one tap from the menu, without deciding first that it is a setting.
  */
  { id: "help", label: "How to Use Sakred", icon: LifeBuoy, note: "Learn the system and replay the walkthrough", section: "help" },
  { id: "settings", label: "Settings", icon: Settings, note: "Blocked people, units, your account", section: "settings" },
];

/**
 * Workspaces somebody holds by role rather than by membership.
 *
 * ── Why this is a list and not an `if (isCoach)` ──────────────────────────
 *
 * Because there is already a second one. Admin has sat in the dashboard header
 * as a hardcoded pill since before roles existed, Coach joined it there this
 * week, and a third — a practitioner, a retreat host — would have made three
 * bespoke pills in a row that is not a menu. The role ladder in access.ts was
 * built to be extended by adding a rank; this is the navigation that matches
 * it, so a new role is an entry here and nothing else.
 *
 * Named for the job, in the words the person would use for themselves. "Coach",
 * not "Staff Tools" and not the capability that gates it.
 */
export const ROLE_DESTINATIONS: Destination[] = [
  {
    id: "coach",
    label: "Coach",
    icon: UserCog,
    note: "The people you're working with",
    href: "/coach",
    capability: "coach",
  },
  {
    /*
      `admin`, not `viewBackOffice`. The header pill used `isStaff`, which is
      rank `moderator` — one below what AdminPortal itself will admit. So a
      moderator was shown a door that answered with Access Denied. The list
      should promise exactly what the page allows.
    */
    id: "admin",
    label: "Admin",
    icon: ShieldCheck,
    note: "Members, content and the back office",
    href: "/admin",
    capability: "admin",
  },
];

/**
 * The secondary destinations this particular member actually has.
 *
 * "Coach's Plan" is removed for anybody who has not been assigned one, which is
 * most members. It listed itself to everyone — "what your coach has you on" —
 * and opened an empty checklist, so the first thing a member without a coach
 * learned about the app was that one of its rooms was not for them.
 *
 * Home has gated its lead card on this since it was built (PillarHome's
 * `hasPlan`); the menu simply never got the same treatment, and the two
 * disagreeing is what made the app feel like it was guessing. Both read the
 * same fact now — and as of the coaching_plans canonicalization, that fact is
 * the plan itself rather than legacy routine enrollment, which could be empty
 * for somebody whose coach had demonstrably given them one.
 *
 * The product point underneath the layout one: an account with no coach has to
 * be a complete thing rather than a trial version of a coached one. Restore,
 * Build, the Room, Wins, the Library and the member's own numbers all stand up
 * without a plan attached, so the nav should stop implying something is
 * missing.
 */
function useSecondary(): Destination[] {
  const hasPlan = useHasActiveCoachPlan();
  return useMemo(
    () => (hasPlan ? SECONDARY : SECONDARY.filter((d) => d.id !== "coaching")),
    [hasPlan],
  );
}

/**
 * The role workspaces this particular account holds.
 *
 * Empty for almost everybody, and empty is the point: a member with no staff
 * role sees no My Roles heading at all, rather than a section explaining what
 * they are not. Same reasoning that removed "Your Plan" from an uncoached
 * member's menu.
 */
function useRoles(): Destination[] {
  const access = useAccess();
  return useMemo(
    () => ROLE_DESTINATIONS.filter((d) => !d.capability || access.atLeast(d.capability)),
    [access.role],
  );
}

/**
 * One row, whether it switches a section or opens a route.
 *
 * Split out because the two kinds render as different elements — a button and
 * an anchor — and the only honest way to keep them looking identical is to
 * give them the same insides rather than to maintain the resemblance by hand.
 */
function rowClass(active: boolean): string {
  return cn(
    "w-full flex items-center gap-3 px-4 py-3 rounded-md text-left tap tap-clean",
    active ? "bg-[hsl(var(--gold))]/10" : "hover:bg-muted/50",
  );
}

function RowBody({ d, active }: { d: Destination; active: boolean }) {
  const Icon = d.icon;
  const badge = d.badge ?? 0;
  return (
    <>
      <Icon
        className={cn(
          "h-5 w-5 shrink-0",
          active ? "text-gold" : "text-muted-foreground",
        )}
      />
      {/* `min-w-0` so a long label truncates instead of pushing the badge and
          chevron off the edge — client names and role names both get long. */}
      <span className="min-w-0 flex-1">
        <span className="block text-sm truncate">{d.label}</span>
        {d.note && <span className="block text-xs text-muted-foreground truncate">{d.note}</span>}
      </span>
      {badge > 0 && (
        <span
          className="shrink-0 min-w-5 h-5 px-1.5 rounded-full bg-[hsl(var(--gold))]/15 text-gold text-xs inline-flex items-center justify-center tabular-nums"
          data-testid={`nav-more-${d.id}-badge`}
        >
          {badge > 99 ? "99+" : badge}
        </span>
      )}
      {/* Only routed rows get the chevron: it means "this leaves the page",
          which is exactly what separates a role workspace from a section. */}
      {d.href && (
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/60" aria-hidden="true" />
      )}
    </>
  );
}

// ─── Phone ─────────────────────────────────────────────────────────────────

export function MemberBottomNav({
  section,
  onChange,
}: {
  section: MemberSection;
  onChange: (s: MemberSection) => void;
}) {
  const secondary = useSecondary();
  const roles = useRoles();
  const inMore = secondary.some((d) => d.section === section);
  /**
   * One dot, for anything under More wanting attention.
   *
   * Moving Coach into a sheet is only safe if the sheet can say it has
   * something inside. A count on the bar itself would be five kinds of thing
   * added together and therefore no kind of thing; the dot says "look in here"
   * and the row inside says what and how many.
   */
  const rolesNeedAttention = roles.some((d) => (d.badge ?? 0) > 0);

  /*
    Controlled, so a resumed walkthrough can open it.

    Two of the lessons live on rows inside this sheet, and a member who paused
    on one and came back to a closed sheet was being shown a panel about a
    control that does not exist yet. See client/src/lib/tour/stage.ts — the
    request is one-shot and only ever arrives when a tour is starting, so
    nothing here fights a member who opens or closes it themselves.
  */
  const [moreOpen, setMoreOpen] = useState(false);
  /*
    Opens, never closes.

    A request is held briefly so a subscriber that mounts a moment late still
    receives it — and a component that remounts for its own reasons would
    otherwise replay a stale "no sheet needed" and shut a sheet the member is
    reading. Closing is theirs; the walkthrough only ever asks for something
    to be brought forward.
  */
  useEffect(
    () => onStageRequest((request) => request.sheet === "more" && setMoreOpen(true)),
    [],
  );

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
      /* Persistent chrome: the walkthrough subtracts this from the box it
         calls visible, so a lesson never points at something underneath it.
         See `chromeInsets` in lib/tour/resolveTarget.ts. */
      data-tour-chrome="bottom"
    >
      <div className="flex items-stretch">
        {PRIMARY.map(({ id, label, icon: Icon, section: target }) => {
          const active = section === target;
          return (
            <button
              key={id}
              onClick={() => onChange(target!)}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex-1 flex flex-col items-center justify-center gap-1 py-2 tap tap-clean",
                "transition-colors",
                active ? "text-gold" : "text-muted-foreground",
              )}
              data-testid={`nav-`}
              // Named separately from the test id on purpose: renaming a test id is a
              // refactoring concern, and it must not silently unhook the walkthrough.
              data-tour-id={`nav-${id}`}
            >
              {/*
                Thinner than Lucide's 2px default, which reads as heavy at
                20px against this ground. Only the stroke changes — the box,
                the tap target, the spacing and the active colour are all
                untouched. Below about 1.4 the symbols start to disappear on a
                non-retina Android panel, so this is as fine as it goes.
              */}
              <Icon className="h-5 w-5" strokeWidth={1.6} />
              {/* The label stays. An icon-only bar is a guessing game, and
                  these four icons are not universal enough to carry it. */}
              <span className="text-[10px] leading-none">{label}</span>
            </button>
          );
        })}

        <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
          <SheetTrigger asChild>
            <button
              className={cn(
                "flex-1 flex flex-col items-center justify-center gap-1 py-2 tap tap-clean",
                "transition-colors",
                inMore ? "text-gold" : "text-muted-foreground",
              )}
              data-testid="nav-more"
              data-tour-id="nav-more"
              aria-label="More sections"
            >
              <span className="relative">
                <MoreHorizontal className="h-5 w-5" />
                {rolesNeedAttention && (
                  <span
                    className="absolute -top-0.5 -right-1 h-1.5 w-1.5 rounded-full bg-[hsl(var(--gold))]"
                    data-testid="nav-more-dot"
                    aria-hidden="true"
                  />
                )}
              </span>
              {/* The dot sits on the glyph, not beside the word, so nothing in
                  the bar shifts when it appears or goes. */}
              <span className="text-[10px] leading-none">More</span>
            </button>
          </SheetTrigger>

          {/* The sheet itself is a tour anchor as well as its rows: the More
              step ends when this opens, not when the button is pressed, so a
              member who opens it a second time isn't stuck on a completed
              instruction. */}
          <SheetContent side="bottom" className="pb-safe" data-tour-id="more-sheet">
            <SheetHeader className="text-left">
              <SheetTitle className="font-display text-xl font-normal">
                Everything else
              </SheetTitle>
            </SheetHeader>

            <div className="mt-4 -mx-2">
              {/* Wrapped in SheetClose, because the comment that used to sit
                  here was wrong: Radix does NOT close a Dialog on an arbitrary
                  click inside it. Only an explicit Close, an outside click or
                  Escape does. So picking a section navigated underneath and
                  left the sheet sitting over the page it had just opened, and
                  the member had to dismiss it themselves to see anything. */}
              {secondary.map((d) => (
                <SheetClose asChild key={d.id}>
                  <button
                    onClick={() => onChange(d.section!)}
                    className={rowClass(section === d.section)}
                    /* Interpolated. This was a template literal with nothing in
                       it, so every row in the sheet answered to the same name
                       and `nav-more-` picked whichever one was first. */
                    data-testid={`nav-more-${d.id}`}
                    data-tour-id={`nav-more-${d.id}`}
                  >
                    <RowBody d={d} active={section === d.section} />
                  </button>
                </SheetClose>
              ))}

              {/*
                The roles somebody holds, under a heading, only when they hold
                one. Quiet on purpose — this is a person's second job, not a
                permissions console, and the sheet it lives in is still called
                "Everything else".
              */}
              {roles.length > 0 && (
                <>
                  <p className="px-4 pt-5 pb-1 text-[10px] uppercase tracking-[0.18em] text-muted-foreground/70">
                    My roles
                  </p>
                  {roles.map((d) => (
                    <SheetClose asChild key={d.id}>
                      {/*
                        A Link, not `onChange` — these are routes with their own
                        screens. Wrapped in SheetClose for the same reason every
                        other row is: Radix does not close on an arbitrary click
                        inside, so without it the sheet stays sitting over the
                        workspace it just opened.
                      */}
                      <Link
                        href={d.href!}
                        className={rowClass(false)}
                        data-testid={`role-${d.id}`}
                        /*
                          `role-`, not `nav-more-`, because that is what the
                          anchor means: the way to a workspace somebody holds.
                          It was `nav-more-coach` here and `role-coach` on the
                          wide row, so the coach lesson could only ever resolve
                          the desktop pill — which is `display: none` on a
                          phone. The extension pointed at nothing on the one
                          form factor most coaches use.
                        */
                        data-tour-id={`role-${d.id}`}
                      >
                        <RowBody d={d} active={false} />
                      </Link>
                    </SheetClose>
                  ))}
                </>
              )}
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
  // Same facts as the phone's More sheet, so the two navs cannot disagree
  // about whether this member has a coach, or which roles they hold.
  const sections = [...PRIMARY, ...useSecondary()];
  const roles = useRoles();

  const pill = (active: boolean) =>
    cn(
      "px-3.5 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-all duration-300",
      active
        ? "bg-background text-foreground shadow-sm"
        : "text-muted-foreground hover:text-foreground",
    );

  /*
    The walkthrough's anchors, on this layout too.

    They were on the phone bar only, so on a laptop the Restore lesson pointed
    at a control that exists in the document and is `display: none` — the
    resolver correctly refused it, the step waited, and the walkthrough could
    not be completed in a browser at all. Measured at 1280×900, where it
    stopped dead on step four.

    Named by destination rather than by layout: `nav-restore` means "the way to
    reach Restore from the navigation", and on a wide screen that is this pill.
    The secondary sections take the `nav-more-` names they have on a phone for
    the same reason — the More sheet is where they live there, and this row is
    where they live here. The one anchor with no desktop counterpart is the
    More trigger itself, which is a phone affordance; that lesson degrades,
    which is what degrading is for.
  */
  const primary = new Set(PRIMARY.map((p) => p.id));

  return (
    <div className="hidden md:flex items-center bg-muted/60 rounded-full p-1 gap-0.5">
      {sections.map(({ id, label, section: target }) => (
        <button
          key={id}
          onClick={() => onChange(target!)}
          aria-current={section === target ? "page" : undefined}
          className={pill(section === target)}
          data-testid={`member-section-${id}`}
          data-tour-id={primary.has(id) ? `nav-${id}` : `nav-more-${id}`}
        >
          {label}
        </button>
      ))}

      {/*
        The role workspaces, at the end of the same row.

        Desktop has no More sheet — this row *is* the overflow, holding every
        destination the phone splits across a bar and a drawer. So a role
        belongs here, in the same list, rendered in the same language. What it
        must not become is a separate bespoke control beside the nav, which is
        precisely the header pill this replaces: one architecture, drawn twice.

        Divided by a hairline rather than a heading, because a heading inside a
        pill row would be the enterprise permissions menu nobody asked for.
      */}
      {roles.length > 0 && (
        <>
          <span className="mx-1 h-4 w-px bg-border/70 shrink-0" aria-hidden="true" />
          {roles.map(({ id, label, href, badge }) => (
            <Link
              key={id}
              href={href!}
              className={pill(false)}
              data-testid={`member-role-${id}`}
              data-tour-id={`role-${id}`}
            >
              {label}
              {(badge ?? 0) > 0 && (
                <span className="ml-1.5 text-xs text-gold tabular-nums">
                  {badge! > 99 ? "99+" : badge}
                </span>
              )}
            </Link>
          ))}
        </>
      )}
    </div>
  );
}
