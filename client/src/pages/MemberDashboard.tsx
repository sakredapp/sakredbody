import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/hooks/use-auth";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Calendar,
  MapPin,
  Users,
  ArrowRight,
  LogOut,
  Check,
  Clock,
  Star,
  Sparkles,
  DollarSign,
  Heart,
  Dumbbell,
  Hotel,
  Home,
  UtensilsCrossed,
  MoreHorizontal,
  Building2,
  User,
  UserPlus,
  ChevronRight,
  ListChecks,
  Map,
  Compass,
  BarChart3,
  Mountain,
  Zap,
} from "lucide-react";
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
} from "./CoachingDashboard";
import sakredLogo from "@assets/full_png_image_sakred__1771268151990.png";

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
  const { user, isLoading: authLoading, isAuthenticated, logout } = useAuth();
  const { toast } = useToast();
  const [location] = useLocation();

  // Default to coaching tab if coming from /coaching URL
  const defaultSection = location === "/coaching" ? "coaching" : "retreat";
  const [section, setSection] = useState<"retreat" | "coaching">(defaultSection);
  const [retreatView, setRetreatView] = useState<"book" | "services" | "my-bookings">("book");
  const [coachingTab, setCoachingTab] = useState<"today" | "journey" | "routines" | "catalog" | "analytics">("today");
  const [showBookingDialog, setShowBookingDialog] = useState(false);

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

  const computeEndDate = (start: string, days: number) => {
    if (!start) return "";
    const d = new Date(start);
    d.setDate(d.getDate() + days);
    return d.toISOString().split("T")[0];
  };

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
  const minDate = new Date();
  minDate.setDate(minDate.getDate() + 14);
  const minDateStr = minDate.toISOString().split("T")[0];

  return (
    <div className="min-h-screen bg-background">
      {/* ─── Header ─── */}
      <header className="sticky top-0 border-b border-border/50 bg-background/90 backdrop-blur-md" style={{ zIndex: 9999 }}>
        <div className="container max-w-6xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2" data-testid="link-home-dashboard">
            <img src={sakredLogo} alt="Sakred Body" className="h-9 w-9 object-contain" />
          </Link>

          {/* Main section toggle */}
          <div className="flex items-center bg-muted/60 rounded-full p-1 gap-0.5">
            <button
              onClick={() => setSection("retreat")}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-medium transition-all duration-300 ${
                section === "retreat"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Mountain className="w-4 h-4" />
              <span className="hidden sm:inline">My Retreat</span>
            </button>
            <button
              onClick={() => setSection("coaching")}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-medium transition-all duration-300 ${
                section === "coaching"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Zap className="w-4 h-4" />
              <span className="hidden sm:inline">Coaching</span>
            </button>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <Avatar className="w-8 h-8">
              {user?.profileImageUrl && <AvatarImage src={user.profileImageUrl} alt={user.firstName || "Member"} />}
              <AvatarFallback className="text-xs">{initials}</AvatarFallback>
            </Avatar>
            <span className="text-sm hidden sm:inline" data-testid="text-member-name">{user?.firstName || "Member"}</span>
            <Button variant="ghost" size="icon" onClick={() => logout()} data-testid="button-logout">
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* ─── Sub-navigation ─── */}
      {section === "coaching" && (
        <div className="border-b border-border/50 bg-background/50 backdrop-blur-sm sticky top-16" style={{ zIndex: 9998 }}>
          <div className="container max-w-6xl mx-auto px-4">
            <div className="flex gap-1 overflow-x-auto py-1.5 scrollbar-thin">
              {([
                { id: "today" as const, label: "Today", icon: ListChecks },
                { id: "journey" as const, label: "Journey", icon: Map },
                { id: "routines" as const, label: "Routines", icon: Compass },
                { id: "catalog" as const, label: "Habits", icon: Sparkles },
                { id: "analytics" as const, label: "Stats", icon: BarChart3 },
              ]).map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setCoachingTab(id)}
                  className={`flex items-center gap-1.5 px-3 py-2 text-sm rounded-md whitespace-nowrap transition-colors ${
                    coachingTab === id
                      ? "bg-[hsl(var(--gold))]/15 text-[hsl(var(--gold))] font-medium"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {section === "retreat" && (
        <div className="border-b border-border/50 bg-background/50 backdrop-blur-sm sticky top-16" style={{ zIndex: 9998 }}>
          <div className="container max-w-6xl mx-auto px-4">
            <div className="flex gap-1 overflow-x-auto py-1.5 scrollbar-thin">
              <button
                onClick={() => setRetreatView("book")}
                className={`flex items-center gap-1.5 px-3 py-2 text-sm rounded-md whitespace-nowrap transition-colors ${
                  retreatView === "book"
                    ? "bg-[hsl(var(--gold))]/15 text-[hsl(var(--gold))] font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                }`}
              >
                Design Your Retreat
              </button>
              <button
                onClick={() => setRetreatView("my-bookings")}
                className={`flex items-center gap-1.5 px-3 py-2 text-sm rounded-md whitespace-nowrap transition-colors ${
                  retreatView === "my-bookings"
                    ? "bg-[hsl(var(--gold))]/15 text-[hsl(var(--gold))] font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                }`}
              >
                My Requests
                {bookingsQuery.data && bookingsQuery.data.length > 0 && (
                  <Badge variant="secondary" className="ml-2 text-[10px]">{bookingsQuery.data.length}</Badge>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Content Area ─── */}
      <AnimatePresence mode="wait">
        {section === "coaching" && (
          <motion.div
            key="coaching"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="container max-w-3xl mx-auto px-4 py-6"
          >
            {coachingTab === "today" && <TodayTab />}
            {coachingTab === "journey" && <JourneyMap />}
            {coachingTab === "routines" && <RoutinesTab />}
            {coachingTab === "catalog" && <CatalogSection />}
            {coachingTab === "analytics" && <AnalyticsTab />}
          </motion.div>
        )}

        {section === "retreat" && (
          <motion.div
            key="retreat"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="container max-w-6xl mx-auto px-4 py-8"
          >

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
                    <Input
                      type="date"
                      value={preferredStartDate}
                      onChange={(e) => setPreferredStartDate(e.target.value)}
                      min={minDateStr}
                      data-testid="input-start-date"
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
  );
}
