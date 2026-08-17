import { useCallback, useState } from "react";
import { Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/hooks/use-auth";
import { useTimezoneSync } from "@/hooks/use-timezone";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/auth-utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { SakredDate } from "@/components/portal/DatePicker";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { ArrowRight, BarChart3, Building2, Calendar, Check, ChevronRight, Clock, Compass, DollarSign, Dumbbell, Heart, HelpCircle, Home, Hotel, ListChecks, LogOut, Map, MapPin, MoreHorizontal, Settings, Sparkles, Star, User, UserPlus, Users, UtensilsCrossed } from "lucide-react";
import type { Retreat, BookingRequest, Partner, PartnerService } from "@shared/schema";
import {
  SERVICE_CATEGORIES,
  getCategoryLabel,
  HOUSING_TIERS,
  getTierLabel,
  getTierPricing,
  type HousingTierKey,
  type ServiceCategoryValue,
} from "@shared/constants";
import {
  TodayTab,
  JourneyMap,
  RoutinesTab,
  CatalogSection,
  AnalyticsTab,
  CoachChat,
} from "./CoachingDashboard";
import { MasterclassTab } from "@/components/MasterclassTab";
import { ApothecaryTab } from "@/components/ApothecaryTab";
import { LibraryTab } from "@/components/LibraryTab";
import { BodyMap } from "@/components/BodyMap";
import { OfferingsTab } from "@/components/OfferingsTab";
import { CommunityTab } from "@/components/CommunityTab";
import { WinsTab } from "@/components/WinsTab";
import { SubNav } from "@/components/SubNav";
import {
  MemberTopNav,
  MemberBottomNav,
  BottomNavSpacer,
  type MemberSection,
  type CoachingTab,
} from "@/components/MemberNav";
import sakredLogo from "@assets/full_png_image_sakred__1771268151990.png";
import { useInkSurface } from "@/hooks/use-ink-surface";
import { PORTAL_COLUMN } from "@/lib/layout";
import { PortalBackdrop } from "@/components/portal/PortalBackdrop";
import { PillarHome } from "@/components/PillarHome";
import { BuildTab } from "@/components/BuildTab";
import { ActiveWorkoutBar } from "@/components/build/ActiveWorkoutBar";
import { WorkoutSheet, WorkoutSheetProvider } from "@/components/build/WorkoutSheet";
import { RestoreTab } from "@/components/RestoreTab";
import { SettingsTab } from "@/components/SettingsTab";
import { useHealthAutoSync } from "@/hooks/use-health";
import { publishTourSection } from "@/hooks/use-guided-tour";
import { Onboarding } from "@/components/portal/Onboarding";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useEffect } from "react";
import { useHasCoach } from "@/hooks/use-coaching";
import { useUnreadCoachMessages } from "@/hooks/use-notifications";
import { scheduleMorningNotice } from "@/lib/morningNotice";
import { updateWidget } from "@/lib/widget";
import { formatLocalDateString, addDaysToString } from "@shared/utils/dates";

// Icon mapping (UI-only, can't live in shared/)
const CATEGORY_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  hotel: Hotel, resort: Sparkles, vacation_rental: Home,
  yoga_studio: Heart, pilates_studio: Heart, fitness_gym: Dumbbell,
  spa: Sparkles, restaurant: UtensilsCrossed, wellness_center: Heart,
  other: MoreHorizontal,
};

function ServiceCategoryIcon({ category }: { category: string }) {
  const Icon = CATEGORY_ICONS[category] || Building2;
  return <Icon className="w-4 h-4" />;
}

function tierDescription(tier: string) {
  return HOUSING_TIERS[tier as HousingTierKey]?.dashboardDescription || "";
}

function tierPrivateAvailable(tier: string) {
  return HOUSING_TIERS[tier as HousingTierKey]?.privateAvailable || false;
}

function tierColor(tier: string) {
  switch (tier) {
    case "essential": return "bg-muted text-muted-foreground";
    case "premium": return "bg-gold/15 text-gold-foreground";
    case "elite": return "bg-gold text-white";
    default: return "";
  }
}

function statusBadge(status: string) {
  switch (status) {
    case "requested": return <Badge variant="outline" className="gap-1"><Clock className="w-3 h-3" /> Pending Review</Badge>;
    case "confirmed": return <Badge className="gap-1 bg-emerald-600 text-white"><Check className="w-3 h-3" /> Confirmed</Badge>;
    case "completed": return <Badge variant="secondary" className="gap-1"><Star className="w-3 h-3" /> Completed</Badge>;
    case "cancelled": return <Badge variant="destructive" className="gap-1">Cancelled</Badge>;
    default: return <Badge variant="outline">{status}</Badge>;
  }
}

type SharedDateRequest = {
  startDate: string;
  endDate: string;
  duration: number | null;
  guestCount: number;
  status: string;
};

function LoginGate() {
  // Redirect to the login page
  window.location.href = "/login";
  return null;
}

function BookingRequestCard({ booking }: { booking: BookingRequest }) {
  return (
    <Card data-testid={`card-booking-${booking.id}`}>
      <CardContent className="p-4 space-y-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h4 className="font-display text-base" data-testid={`text-booking-type-${booking.id}`}>
            {booking.retreatType === "private" ? "Private Retreat" : "Shared Retreat"}
          </h4>
          {statusBadge(booking.status)}
        </div>
        <div className="text-sm text-muted-foreground flex items-center gap-3 flex-wrap">
          <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {booking.guestCount} guest{booking.guestCount > 1 ? "s" : ""}</span>
          {booking.duration && (
            <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {booking.duration} days</span>
          )}
          {booking.housingTier && (
            <Badge className={`${tierColor(booking.housingTier)} text-xs`}>{getTierLabel(booking.housingTier)}</Badge>
          )}
        </div>
        {booking.preferredStartDate && booking.preferredEndDate && (
          <p className="text-sm text-muted-foreground">
            {new Date(booking.preferredStartDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })} – {new Date(booking.preferredEndDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
          </p>
        )}
        {booking.specialRequests && (
          <p className="text-sm text-muted-foreground">Your notes: {booking.specialRequests}</p>
        )}
        {booking.conciergeNotes && (
          <div className="bg-muted/50 rounded-md p-3 text-sm">
            <span className="font-medium">Concierge:</span> {booking.conciergeNotes}
          </div>
        )}
        <p className="text-xs text-muted-foreground">Requested {new Date(booking.createdAt!).toLocaleDateString()}</p>
      </CardContent>
    </Card>
  );
}

export default function MemberDashboard() {
  // First, and above every early return below — this file has had a
  // hooks-after-return bug before, and an effect is a hook like any other.
  useInkSurface();

  const { user, isLoading: authLoading, isAuthenticated, logout } = useAuth();
  const { toast } = useToast();

  // The server schedules by calendar date and runs in UTC; it needs to know
  // when this member's day actually starts.
  useTimezoneSync(isAuthenticated);

  // Home, not Today.
  //
  // Today is still the product, and it was the right default while it was the
  // only finished screen. It is the wrong one now: Today opens onto an empty
  // checklist until a protocol exists, which reads as an app that failed to
  // load. Home is five doors, and a launcher is meant to be sparse — the same
  // absence of content reads as a product waiting rather than a broken one.
  const defaultSection: MemberSection = "home";
  const [section, setSection] = useState<MemberSection>(defaultSection);
  // "What's On" first, not the booking form. The catalogue is the thing a
  // member browses repeatedly; designing a bespoke retreat is something they
  // do once, and it was standing in front of everything else.
  const [retreatView, setRetreatView] = useState<"book" | "services" | "my-bookings" | "masterminds">("masterminds");
  const [coachingTab, setCoachingTab] = useState<CoachingTab>("today");
  const hasCoach = useHasCoach();
  const unreadCoach = useUnreadCoachMessages();

  /**
   * A notification tapped before this screen existed.
   *
   * Claimed once, on mount, and only after auth has resolved — which is what
   * makes this safe: by the time it runs, the member is signed in and every
   * panel underneath fetches under their own authorization. The destination
   * moves the view; it does not carry any state with it. A `plan_activated`
   * from a plan that has since ended lands on Today and finds Today's truth.
   */
  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    void (async () => {
      const { claimDestination } = await import("@/lib/notificationRoutes");
      const destination = await claimDestination();
      if (cancelled || !destination || destination.app !== "member") return;
      setSection(destination.section as MemberSection);
      if (destination.tab) setCoachingTab(destination.tab as CoachingTab);
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  /**
   * Never stranded on a tab that stopped existing.
   *
   * `hasCoach` resolves after a request, and a member can be sitting on Coach
   * when a plan ends. Without this they keep the panel of a destination the row
   * no longer offers, with no way back to it — the tab is gone, so nothing is
   * highlighted and nothing looks wrong.
   */
  useEffect(() => {
    if (!hasCoach && coachingTab === "coach") setCoachingTab("today");
  }, [hasCoach, coachingTab]);

  /**
   * Open a section, and optionally land on one of its sub-tabs.
   *
   * Home's Protocol door needs `coaching`/`routines`. Without the second
   * argument it would drop somebody on Today and leave them to notice that a
   * sub-navigation exists and that the thing they tapped is inside it.
   */
  const openSection = useCallback((next: MemberSection, tab?: CoachingTab) => {
    setSection(next);
    if (tab) setCoachingTab(tab);
  }, []);

  /**
   * A section is not a route, so ScrollToTop never sees one change.
   *
   * Every section of the portal lives at /member and is switched by the state
   * above, while ScrollToTop keys on wouter's location. Tapping Restore from
   * halfway down Home therefore opened Restore halfway down — reported as
   * "it loads somewhere in the middle", and intermittent in exactly the way
   * that description suggests: it only happens if you had scrolled first, so
   * checking it from the top of the page shows nothing wrong.
   */
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [section]);

  /**
   * The one thing the guided walkthrough needs from this page.
   *
   * A step ends when the app *reaches* a screen — "tap Build" is satisfied by
   * Build being open, however the member got there. Since a section is state
   * rather than a route, the tour has no way to observe that from outside; and
   * threading tour props through the nav, the tabs, the sheets and the workout
   * would couple every screen here to a feature most members see once.
   *
   * So it goes on the document element, the same place the surface and the
   * theme already live, and the tour reads it. Cleared on unmount so a tour
   * left running cannot be told the app is still on a section it has left.
   */
  useEffect(() => {
    publishTourSection(section);
    return () => publishTourSection(null);
  }, [section]);

  const [showBookingDialog, setShowBookingDialog] = useState(false);

  // Health syncs when the app comes to the foreground, throttled — neither
  // HealthKit nor Health Connect gives us background delivery through this
  // plugin, so opening the app is the only moment we get. Placed at the
  // dashboard root rather than on the Stats tab: a member who never opens
  // Stats should still have their data current when their coach looks.
  useHealthAutoSync();

  // Rewrite the next few mornings' banners on every open, so what they say
  // stays true. The fixed ids mean this replaces rather than accumulates, and
  // it no-ops entirely if the member never granted notifications.
  useEffect(() => {
    void scheduleMorningNotice();
    // The widget's numbers and the banner's come from the same place, so they
    // are refreshed together — one going stale while the other did not is the
    // inconsistency a member notices first.
    void updateWidget();
  }, []);

  const [bookingStep, setBookingStep] = useState<"choose-type" | "configure">("choose-type");
  const [retreatType, setRetreatType] = useState<"private" | "shared">("shared");
  const [preferredStartDate, setPreferredStartDate] = useState("");
  const [duration, setDuration] = useState("3");
  const [housingTier, setHousingTier] = useState("essential");
  const [guestCount, setGuestCount] = useState("1");
  const [specialRequests, setSpecialRequests] = useState("");

  const bookingsQuery = useQuery<BookingRequest[]>({
    queryKey: ["/api/booking-requests/me"],
    queryFn: async () => {
      const res = await fetch("/api/booking-requests/me", { credentials: "include" });
      if (res.status === 401) return [];
      if (!res.ok) throw new Error("Failed to load bookings");
      return res.json();
    },
    enabled: isAuthenticated,
  });

  const sharedDatesQuery = useQuery<SharedDateRequest[]>({
    queryKey: ["/api/shared-retreat-dates"],
    queryFn: async () => {
      const res = await fetch("/api/shared-retreat-dates", { credentials: "include" });
      if (res.status === 401) return [];
      if (!res.ok) throw new Error("Failed to load shared dates");
      return res.json();
    },
    enabled: isAuthenticated && retreatType === "shared" && bookingStep === "configure",
  });

  const activePartnersQuery = useQuery<Partner[]>({
    queryKey: ["/api/partners/active"],
    enabled: isAuthenticated && retreatView === "services",
  });

  const allServicesQuery = useQuery<PartnerService[]>({
    queryKey: ["/api/services"],
    enabled: isAuthenticated && retreatView === "services",
  });

  const createBookingMutation = useMutation({
    mutationFn: async (data: {
      retreatType: string;
      preferredStartDate: string | null;
      preferredEndDate: string | null;
      duration: number;
      housingTier: string;
      guestCount: number;
      specialRequests: string;
    }) => {
      const res = await apiRequest("POST", "/api/booking-requests", data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Retreat Request Submitted", description: "Our concierge team will reach out to schedule your confirmation call." });
      setShowBookingDialog(false);
      setBookingStep("choose-type");
      setPreferredStartDate("");
      setDuration("3");
      setHousingTier("essential");
      setRetreatType("shared");
      setGuestCount("1");
      setSpecialRequests("");
      queryClient.invalidateQueries({ queryKey: ["/api/booking-requests/me"] });
      queryClient.invalidateQueries({ queryKey: ["/api/shared-retreat-dates"] });
    },
    onError: (error: Error) => {
      if (isUnauthorizedError(error)) {
        toast({ title: "Session expired", description: "Please sign in again.", variant: "destructive" });
        setTimeout(() => { window.location.href = "/api/login"; }, 500);
        return;
      }
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="space-y-4 w-full max-w-md px-4">
          <Skeleton className="h-8 w-48 mx-auto" />
          <Skeleton className="h-4 w-64 mx-auto" />
          <Skeleton className="h-48 w-full rounded-md" />
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginGate />;
  }

  /**
   * `new Date("2026-09-01")` parses as UTC midnight, `setDate` then moves the
   * *local* calendar, and `toISOString` reads it back as UTC — three different
   * frames in four lines. West of UTC that returned a retreat end date one day
   * late, on a booking the member submits. String arithmetic has no frames.
   */
  const computeEndDate = (start: string, days: number) =>
    start ? addDaysToString(start, days) : "";

  const handleSubmitBooking = () => {
    if (retreatType === "private" && !tierPrivateAvailable(housingTier)) {
      toast({ title: "Private Not Available", description: "Private retreats require Premium or Elite housing. Please upgrade your tier.", variant: "destructive" });
      setShowBookingDialog(false);
      return;
    }
    const endDate = computeEndDate(preferredStartDate, parseInt(duration));
    createBookingMutation.mutate({
      retreatType,
      preferredStartDate: preferredStartDate || null,
      preferredEndDate: endDate || null,
      duration: parseInt(duration),
      housingTier,
      guestCount: parseInt(guestCount),
      specialRequests,
    });
  };

  const initials = [user?.firstName?.[0], user?.lastName?.[0]].filter(Boolean).join("") || "M";
  /** Two weeks out, counted from the member's today rather than UTC's. */
  const minDateStr = addDaysToString(formatLocalDateString(), 14);

  return (
    <WorkoutSheetProvider>
    <div className="min-h-screen bg-background relative isolate">
      {/* The star chart the marketing site uses, held far back. Fixed, so it
          behaves like the room the content is in rather than scrolling with
          it. `isolate` here is what lets it sit at a negative z-index without
          disappearing behind the page background — see PortalBackdrop. */}
      <PortalBackdrop />

      {/* Asked once on the way in, snoozed for a fortnight if declined. A
          member who never opens Stats never learns the app can read their
          ring, so the feature may as well not exist for them. */}
      <Onboarding />

      {/* ─── Header ─── */}
      <header className="sticky top-0 pt-safe border-b border-border/50 bg-background/90 backdrop-blur-md" style={{ zIndex: 9999 }}>
        <div className={`${PORTAL_COLUMN} h-16 flex items-center justify-between gap-4`}>
          <Link href="/" className="flex items-center gap-2" data-testid="link-home-dashboard">
            <img src={sakredLogo} alt="Sakred Body" className="h-9 w-9 object-contain" />
          </Link>

          <MemberTopNav section={section} onChange={setSection} />

          <div className="flex items-center gap-3 flex-wrap">
            {/* Staff are members who can also do more, not separate accounts
                with their own door. Signing in once and finding the back
                office here is the whole point.

                `isStaff` rather than `isAdmin === "true"`: the moment there
                is a coach who sees their cohort and nothing else, this link
                still needs to appear for them, and a string comparison
                against a two-state field can't express that. */}
            {/*
              The door to the coach workspace, for anybody who can coach.
              `atLeast("coach")` rather than `isStaff` — the two are not the
              same question, and an admin who does not coach still gets the
              link because the roster it opens is scoped to them and will
              simply be empty. What it must not do is replace this member's own
              dashboard: Nick coaches and also trains, and the second is not
              forfeit for taking on the first.
            */}
            {/*
              Coach and Admin used to be two gold pills here.

              They are gone, and the reason is not tidiness. A pill in the
              header is a bespoke control that exists once, for one role, and
              has to be built again for the next one — which is exactly what
              happened: Admin sat here from before roles existed, Coach was
              added beside it, and a third would have made a row of one-offs
              where a menu belongs.

              Both now live in `ROLE_DESTINATIONS` and render under My Roles in
              the More sheet on a phone, and at the end of the section row on a
              desktop. One list, one architecture, and a new role is an entry in
              it rather than another pill in here.

              This also settles what a coach's own app looks like: Nick opens
              the same Sakred Body everyone opens, and his second job is a
              destination he goes to, not a badge he wears in the header of his
              own dashboard.
            */}
            {/* Help, before the avatar. Someone stuck is looking along the top
                bar for a way to ask, and "ask a person" should not be buried
                two taps into a menu labelled with your own face. */}
            <Link
              href="/support"
              className="tap inline-flex items-center justify-center w-8 h-8 rounded-full text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Ask for help"
              data-testid="link-help"
            >
              <HelpCircle className="w-[18px] h-[18px]" />
            </Link>

            {/* The avatar is the menu.
                It was a decorative circle with a separate sign-out icon beside
                it — the circle did nothing when tapped, which is the first
                thing anyone tries, and sign-out sat in the header as a
                one-tap accident next to the thing you actually want. Both
                fixed by making the avatar the control and putting sign-out
                inside it, where leaving takes a deliberate second tap. */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="tap rounded-full outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--gold))]/50"
                  aria-label="Your account"
                  data-testid="button-account-menu"
                >
                  <Avatar className="w-8 h-8 border border-[hsl(var(--gold))]/25">
                    {user?.profileImageUrl && (
                      <AvatarImage src={user.profileImageUrl} alt={user.firstName || "Member"} />
                    )}
                    <AvatarFallback className="text-xs">{initials}</AvatarFallback>
                  </Avatar>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="font-normal">
                  <p className="text-sm" data-testid="text-member-name">
                    {[user?.firstName, user?.lastName].filter(Boolean).join(" ") || "Member"}
                  </p>
                  {user?.email && (
                    <p className="text-[11px] text-muted-foreground truncate">{user.email}</p>
                  )}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => setSection("settings")} data-testid="menu-settings">
                  <Settings className="w-4 h-4 mr-2" />
                  Profile &amp; settings
                </DropdownMenuItem>
                <DropdownMenuItem asChild data-testid="menu-help">
                  <Link href="/support">
                    <HelpCircle className="w-4 h-4 mr-2" />
                    Ask for help
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={() => logout()}
                  className="text-destructive focus:text-destructive"
                  data-testid="button-logout"
                >
                  <LogOut className="w-4 h-4 mr-2" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      {/* ─── Sub-navigation ─── */}
      {/*
        ── Four destinations, not six ────────────────────────────────────────

        This row held Today, Journey, Routines, Habits, Stats and Coach, and it
        did not fit — the last item was cut off mid-word on a phone, which is
        how a second navigation system announces that it has outgrown the space
        it was given. The fix is not a scroll affordance. It is that three of
        the six should not have been there.

        Stats is gone as a peer. Its current-day half now opens Today, which is
        where somebody looking for "what has my body done" actually goes; the
        history behind it is still one tap away and is detail, not a
        destination.

        Journey is gone because it was a fourteen-day habit strip — the same
        ground as Habits and Routines, under a name promising something else.
        It comes back when it is the longitudinal record it should be: what has
        changed, not what is true today.

        Coach appears only when somebody is actually coaching this member. See
        `useHasCoach`.
      */}
      {section === "coaching" && (
        <SubNav
          value={coachingTab}
          onChange={setCoachingTab}
          items={[
            { id: "today", label: "Today" },
            { id: "routines", label: "Routines" },
            { id: "catalog", label: "Habits" },
            /*
              The count comes from unread coaching.message notifications, not
              from a second unread system — opening the conversation settles
              both, so this cannot sit at 1 over a thread with nothing new in
              it. Messages only: "Coach · 1" beside a plan activation would send
              somebody to a conversation to find nothing there.
            */
            ...(hasCoach
              ? [{ id: "coach" as const, label: unreadCoach > 0 ? `Coach · ${unreadCoach}` : "Coach" }]
              : []),
          ]}
        />
      )}

      {section === "retreat" && (
        <SubNav
          value={retreatView}
          onChange={setRetreatView}
          items={[
            { id: "masterminds", label: "What's On" },
            { id: "book", label: "Design a Retreat" },
            { id: "my-bookings", label: "My Requests", badge: bookingsQuery.data?.length ?? null },
          ]}
        />
      )}

      {/* ─── Content Area ─── */}
      <AnimatePresence mode="wait">
        {section === "home" && (
          <motion.div
            key="home"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className={`${PORTAL_COLUMN} py-6`}
          >
            <PillarHome firstName={user?.firstName} onOpen={openSection} />
          </motion.div>
        )}

        {section === "settings" && (
          <motion.div
            key="settings"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className={`${PORTAL_COLUMN} py-6`}
          >
            <SettingsTab weightUnit={user?.weightUnit} onLogout={() => logout()} />
          </motion.div>
        )}

        {/* Restore before Build, here as everywhere: you cannot load a terrain
            that cannot yet drain. */}
        {section === "restore" && (
          <motion.div
            key="restore"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className={`${PORTAL_COLUMN} py-6`}
          >
            <RestoreTab onOpen={setSection} />
          </motion.div>
        )}

        {section === "build" && (
          <motion.div
            key="build"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className={`${PORTAL_COLUMN} py-6`}
          >
            <BuildTab onOpen={setSection} />
          </motion.div>
        )}

        {section === "coaching" && (
          <motion.div
            key="coaching"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className={`${PORTAL_COLUMN} py-6`}
          >
            {coachingTab === "today" && (
              <TodayTab onOpenTrends={() => setCoachingTab("analytics")} />
            )}
            {/*
              Still reachable, no longer a peer. Stats is where the history
              lives, and it is opened from the day it explains rather than
              standing beside it in the row.
            */}
            {coachingTab === "journey" && <JourneyMap />}
            {coachingTab === "routines" && <RoutinesTab />}
            {coachingTab === "catalog" && <CatalogSection />}
            {coachingTab === "analytics" && <AnalyticsTab />}
            {coachingTab === "coach" && <CoachChat />}
          </motion.div>
        )}

        {section === "community" && (
          <motion.div
            key="community"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className={`${PORTAL_COLUMN} py-8`}
          >
            <CommunityTab />
          </motion.div>
        )}

        {section === "wins" && (
          <motion.div
            key="wins"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className={`${PORTAL_COLUMN} py-8`}
          >
            <WinsTab />
          </motion.div>
        )}

        {section === "apothecary" && (
          <motion.div
            key="apothecary"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className={`${PORTAL_COLUMN} py-8`}
          >
            <ApothecaryTab />
          </motion.div>
        )}

        {section === "body" && (
          <motion.div
            key="body"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className={`${PORTAL_COLUMN} py-8`}
          >
            <BodyMap />
          </motion.div>
        )}

        {section === "library" && (
          <motion.div
            key="library"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className={`${PORTAL_COLUMN} py-8`}
          >
            <LibraryTab />
          </motion.div>
        )}

        {section === "masterclass" && (
          <motion.div
            key="masterclass"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className={`${PORTAL_COLUMN} py-6`}
          >
            <MasterclassTab />
          </motion.div>
        )}

        {section === "retreat" && (
          <motion.div
            key="retreat"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className={`${PORTAL_COLUMN} py-8`}
          >

        {retreatView === "masterminds" && <OfferingsTab />}

        {retreatView === "book" && (
          <div className="space-y-8 max-w-3xl">
            <div>
              <h2 className="font-display text-2xl mb-1" data-testid="text-book-heading">Design Your Retreat</h2>
              <p className="text-muted-foreground">
                {bookingStep === "choose-type"
                  ? "Start by choosing your experience. Everything else follows from here."
                  : retreatType === "private"
                    ? "Your private retreat. Choose your housing, dates, and duration below."
                    : "Your shared retreat. Pick your dates to overlap with other members, choose your housing tier, and customize."}
              </p>
            </div>

            {bookingStep === "choose-type" && (
              <div className="space-y-3">
                <label className="text-sm font-medium">How do you want to experience your retreat?</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Card
                    className="overflow-visible cursor-pointer hover-elevate"
                    onClick={() => {
                      setRetreatType("private");
                      setHousingTier("premium");
                      setBookingStep("configure");
                    }}
                    data-testid="card-type-private"
                  >
                    <CardContent className="p-6 space-y-3">
                      <div className="flex items-center gap-2">
                        <User className="w-5 h-5 text-gold-foreground" />
                        <h3 className="font-display text-xl">Private</h3>
                      </div>
                      <p className="text-sm text-muted-foreground">Just you. Your schedule, your pace, complete privacy. A fully personalized experience with no distractions.</p>
                      <div className="pt-2 space-y-1">
                        <p className="text-xs text-muted-foreground flex items-center gap-1"><Check className="w-3 h-3 text-gold-foreground" /> Premium or Elite housing</p>
                        <p className="text-xs text-muted-foreground flex items-center gap-1"><Check className="w-3 h-3 text-gold-foreground" /> Custom dates & duration</p>
                        <p className="text-xs text-muted-foreground flex items-center gap-1"><Check className="w-3 h-3 text-gold-foreground" /> 1-on-1 concierge attention</p>
                      </div>
                      <Badge className="bg-gold/15 text-gold-foreground">From $450/night</Badge>
                    </CardContent>
                  </Card>
                  <Card
                    className="overflow-visible cursor-pointer hover-elevate"
                    onClick={() => {
                      setRetreatType("shared");
                      setHousingTier("essential");
                      setBookingStep("configure");
                    }}
                    data-testid="card-type-shared"
                  >
                    <CardContent className="p-6 space-y-3">
                      <div className="flex items-center gap-2">
                        <UserPlus className="w-5 h-5 text-gold-foreground" />
                        <h3 className="font-display text-xl">Shared</h3>
                      </div>
                      <p className="text-sm text-muted-foreground">Join other members for a group experience. Shared energy, curated programming, community-driven transformation.</p>
                      <div className="pt-2 space-y-1">
                        <p className="text-xs text-muted-foreground flex items-center gap-1"><Check className="w-3 h-3 text-gold-foreground" /> All housing tiers available</p>
                        <p className="text-xs text-muted-foreground flex items-center gap-1"><Check className="w-3 h-3 text-gold-foreground" /> Overlap dates with other members</p>
                        <p className="text-xs text-muted-foreground flex items-center gap-1"><Check className="w-3 h-3 text-gold-foreground" /> Group workshops & activities</p>
                      </div>
                      <Badge variant="outline">Essential tier included</Badge>
                    </CardContent>
                  </Card>
                </div>
              </div>
            )}

            {bookingStep === "configure" && (
              <div className="space-y-8">
                <div className="flex items-center gap-3 flex-wrap">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setBookingStep("choose-type");
                      setPreferredStartDate("");
                      setDuration("3");
                      setHousingTier(retreatType === "private" ? "premium" : "essential");
                      setGuestCount("1");
                      setSpecialRequests("");
                    }}
                    data-testid="button-back-to-type"
                  >
                    <ArrowRight className="w-4 h-4 mr-1 rotate-180" /> Change experience
                  </Button>
                  <Badge className={retreatType === "private" ? "bg-gold text-white" : "bg-gold/15 text-gold-foreground"}>
                    {retreatType === "private" ? "Private Retreat" : "Shared Retreat"}
                  </Badge>
                </div>

                {retreatType === "shared" && sharedDatesQuery.data && sharedDatesQuery.data.length > 0 && (
                  <div className="space-y-3">
                    <label className="text-sm font-medium">Other Members' Requested Dates</label>
                    <p className="text-xs text-muted-foreground">Tap a date range below to match your dates with existing members for a group experience.</p>
                    <div className="space-y-2">
                      {sharedDatesQuery.data.map((req, i) => (
                        <div
                          key={i}
                          className="flex items-center gap-3 p-3 bg-muted/50 rounded-md text-sm cursor-pointer hover-elevate flex-wrap"
                          onClick={() => {
                            if (req.startDate) setPreferredStartDate(req.startDate);
                            if (req.duration) setDuration(String(req.duration));
                          }}
                          data-testid={`shared-date-${i}`}
                        >
                          <Calendar className="w-4 h-4 text-muted-foreground" />
                          <span>
                            {new Date(req.startDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })} – {new Date(req.endDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                          </span>
                          <Badge variant="outline" className="text-xs">{req.duration} days</Badge>
                          <Badge variant="outline" className="text-xs">{req.guestCount} guest{req.guestCount > 1 ? "s" : ""}</Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="space-y-3">
                  <label className="text-sm font-medium">Housing Tier</label>
                  <div className={`grid grid-cols-1 gap-4 ${retreatType === "private" ? "sm:grid-cols-2" : "sm:grid-cols-3"}`}>
                    {(retreatType === "private"
                      ? (["premium", "elite"] as const)
                      : (["essential", "premium", "elite"] as const)
                    ).map((tier) => (
                      <Card
                        key={tier}
                        className={`overflow-visible cursor-pointer hover-elevate ${housingTier === tier ? "ring-2 ring-gold" : ""}`}
                        onClick={() => {
                          setHousingTier(tier);
                          if (tier === "essential" && parseInt(guestCount) > 2) setGuestCount("1");
                        }}
                        data-testid={`card-tier-${tier}`}
                      >
                        <CardContent className="p-4 space-y-2">
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <Badge className={`${tierColor(tier)}`}>{getTierLabel(tier)}</Badge>
                            <span className="text-sm font-semibold">{getTierPricing(tier)}</span>
                          </div>
                          <p className="text-xs text-muted-foreground">{tierDescription(tier)}</p>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Preferred Start Date</label>
                    <SakredDate
                      value={preferredStartDate}
                      onChange={setPreferredStartDate}
                      min={minDateStr}
                      placeholder="Choose a start date"
                      testId="input-start-date"
                    />
                    <p className="text-xs text-muted-foreground">At least 2 weeks out from today</p>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">Duration</label>
                    <Select value={duration} onValueChange={setDuration}>
                      <SelectTrigger data-testid="select-duration">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="3">3 Days</SelectItem>
                        <SelectItem value="5">5 Days</SelectItem>
                        <SelectItem value="7">7 Days (Full Week)</SelectItem>
                        <SelectItem value="10">10 Days</SelectItem>
                        <SelectItem value="14">14 Days (Two Weeks)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {preferredStartDate && (
                  <p className="text-sm text-muted-foreground">
                    Your retreat: {new Date(preferredStartDate).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })} – {new Date(computeEndDate(preferredStartDate, parseInt(duration))).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
                  </p>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Number of Guests</label>
                    <Select value={guestCount} onValueChange={setGuestCount}>
                      <SelectTrigger data-testid="select-guest-count">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {housingTier === "essential" ? (
                          <>
                            <SelectItem value="1">Just Me</SelectItem>
                            <SelectItem value="2">Me + 1 Guest</SelectItem>
                          </>
                        ) : (
                          Array.from({ length: 10 }, (_, i) => (
                            <SelectItem key={i + 1} value={String(i + 1)}>{i + 1} Guest{i > 0 ? "s" : ""}</SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                    {housingTier === "essential" && (
                      <p className="text-xs text-muted-foreground">Essential includes you and an optional +1</p>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Special Requests (optional)</label>
                  <Textarea
                    placeholder="Dietary needs, goals for the retreat, preferred activities, airport transfer, etc."
                    value={specialRequests}
                    onChange={(e) => setSpecialRequests(e.target.value)}
                    className="resize-none"
                    data-testid="input-special-requests"
                  />
                </div>

                <Separator />

                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div className="space-y-1">
                    <p className="text-sm font-medium">Ready to submit?</p>
                    <p className="text-xs text-muted-foreground">Our concierge will schedule a call to go over details before anything is finalized.</p>
                  </div>
                  <Button
                    onClick={() => setShowBookingDialog(true)}
                    className="bg-gold border-gold-border text-white"
                    disabled={!preferredStartDate}
                    data-testid="button-review-booking"
                  >
                    Review & Submit
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {retreatView === "services" && (
          <div className="space-y-8">
            <div>
              <h2 className="font-display text-2xl mb-1" data-testid="text-services-heading">Concierge Services</h2>
              <p className="text-muted-foreground">Explore wellness, fitness, dining, and accommodation services curated by our concierge team.</p>
            </div>
            {(activePartnersQuery.isLoading || allServicesQuery.isLoading) ? (
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                {[1, 2, 3].map((i) => (
                  <Card key={i}><CardContent className="p-5 space-y-3"><Skeleton className="h-6 w-3/4" /><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-2/3" /></CardContent></Card>
                ))}
              </div>
            ) : activePartnersQuery.data && activePartnersQuery.data.length > 0 ? (
              <>
                {activePartnersQuery.data.map((partner) => {
                  const partnerServices = (allServicesQuery.data || []).filter(s => s.partnerId === partner.id);
                  return (
                    <div key={partner.id} className="space-y-4" data-testid={`section-partner-${partner.id}`}>
                      <div className="flex items-center gap-3 flex-wrap">
                        <ServiceCategoryIcon category={partner.category} />
                        <h3 className="font-display text-xl">{partner.name}</h3>
                        <Badge variant="outline" className="text-xs">{getCategoryLabel(partner.category)}</Badge>
                        <span className="text-sm text-muted-foreground flex items-center gap-1"><MapPin className="w-3 h-3" /> {partner.location}</span>
                      </div>
                      <p className="text-sm text-muted-foreground max-w-2xl">{partner.description}</p>
                      {partnerServices.length > 0 ? (
                        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                          {partnerServices.map((service) => (
                            <Card key={service.id} className="overflow-visible hover-elevate" data-testid={`card-member-service-${service.id}`}>
                              {service.imageUrl && (
                                <img
                                  src={service.imageUrl}
                                  alt={service.name}
                                  className="w-full h-36 object-cover rounded-t-md"
                                />
                              )}
                              <CardContent className={`p-4 space-y-2 ${!service.imageUrl ? 'pt-4' : ''}`}>
                                <h4 className="font-medium">{service.name}</h4>
                                <p className="text-sm text-muted-foreground line-clamp-2">{service.description}</p>
                                <div className="flex items-center gap-3 text-sm text-muted-foreground flex-wrap">
                                  {service.price && (
                                    <span className="flex items-center gap-1"><DollarSign className="w-3.5 h-3.5" /> ${service.price} {service.priceUnit}</span>
                                  )}
                                  {service.duration && (
                                    <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> {service.duration}</span>
                                  )}
                                  {service.maxCapacity && (
                                    <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" /> Up to {service.maxCapacity}</span>
                                  )}
                                </div>
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">Services coming soon from this partner.</p>
                      )}
                      <Separator />
                    </div>
                  );
                })}
              </>
            ) : (
              <Card>
                <CardContent className="p-12 text-center space-y-3">
                  <Sparkles className="w-12 h-12 mx-auto text-muted-foreground" />
                  <div>
                    <h3 className="font-display text-lg mb-1">Coming Soon</h3>
                    <p className="text-sm text-muted-foreground">Our concierge team is building a curated network of wellness, fitness, and accommodation partners. Check back soon.</p>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {retreatView === "my-bookings" && (
          <div className="space-y-6">
            <div>
              <h2 className="font-display text-2xl mb-1" data-testid="text-bookings-heading">My Retreat Requests</h2>
              <p className="text-muted-foreground">Track the status of your retreat requests below.</p>
            </div>
            {bookingsQuery.isLoading ? (
              <div className="space-y-4">
                {[1, 2].map((i) => <Skeleton key={i} className="h-28 w-full rounded-md" />)}
              </div>
            ) : bookingsQuery.data && bookingsQuery.data.length > 0 ? (
              <div className="space-y-4 max-w-2xl">
                {bookingsQuery.data
                  .sort((a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime())
                  .map((booking) => (
                    <BookingRequestCard key={booking.id} booking={booking} />
                  ))}
              </div>
            ) : (
              <Card><CardContent className="p-8 text-center text-muted-foreground">No retreat requests yet. Design your retreat to get started.</CardContent></Card>
            )}
          </div>
        )}

          </motion.div>
        )}
      </AnimatePresence>

      <BottomNavSpacer />
      {/*
        Above the nav, below everything else. A workout that is running should
        be reachable from wherever the member wandered to — and hidden on Build
        itself, which is already showing it in full.
      */}
      <div className="fixed inset-x-0 bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-40 px-4 pointer-events-none">
        <div className="mx-auto max-w-md pointer-events-auto">
          {/*
            Shown on every screen now, Build included. It used to hide there
            because Build was where the workout lived; the workout is a layer
            over the whole app, so the strip is the way back into it from
            everywhere — and Build is no longer a special case.
          */}
          <ActiveWorkoutBar onOpenBuild={() => setSection("build")} />
        </div>
      </div>
      <MemberBottomNav section={section} onChange={setSection} />

      {/*
        Above the header and the nav both, so expanding it makes the app the
        workout rather than putting the workout inside the app.
      */}
      <WorkoutSheet />

      <Dialog open={showBookingDialog} onOpenChange={setShowBookingDialog}>
        <DialogContent className="max-w-md" data-testid="dialog-booking">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">Confirm Your Retreat Request</DialogTitle>
            <DialogDescription>
              Review the details below. After submitting, our concierge team will schedule a call to finalize everything.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-muted/50 rounded-md p-4 space-y-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="text-sm font-medium">{retreatType === "private" ? "Private Retreat" : "Shared Retreat"}</span>
                <Badge className={`${tierColor(housingTier)}`}>{getTierLabel(housingTier)}</Badge>
              </div>
              {preferredStartDate && (
                <p className="text-sm text-muted-foreground">
                  {new Date(preferredStartDate).toLocaleDateString("en-US", { month: "long", day: "numeric" })} – {new Date(computeEndDate(preferredStartDate, parseInt(duration))).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                </p>
              )}
              <p className="text-sm text-muted-foreground">{duration} days, {guestCount} guest{parseInt(guestCount) > 1 ? "s" : ""}</p>
              {housingTier !== "essential" && (
                <p className="text-sm font-semibold">Housing: {getTierPricing(housingTier)}</p>
              )}
            </div>

            {specialRequests && (
              <div className="text-sm">
                <span className="font-medium">Your notes:</span> {specialRequests}
              </div>
            )}

            <Button
              onClick={handleSubmitBooking}
              disabled={createBookingMutation.isPending}
              className="w-full bg-gold border-gold-border text-white"
              data-testid="button-submit-booking"
            >
              {createBookingMutation.isPending ? "Submitting..." : "Submit Retreat Request"}
            </Button>
            <p className="text-xs text-center text-muted-foreground">
              Nothing is finalized until your concierge call. No charges until confirmed.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
    </WorkoutSheetProvider>
  );
}
