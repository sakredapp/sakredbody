import { useState } from "react";
import { Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
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
} from "lucide-react";
import type { Retreat, BookingRequest, Partner, PartnerService } from "@shared/schema";
import sakredLogo from "@assets/full_png_image_sakred__1771268151990.png";

const SERVICE_CATEGORIES = [
  { value: "hotel", label: "Hotel", icon: Hotel },
  { value: "resort", label: "Resort", icon: Sparkles },
  { value: "vacation_rental", label: "Vacation Rental", icon: Home },
  { value: "yoga_studio", label: "Yoga Studio", icon: Heart },
  { value: "pilates_studio", label: "Pilates Studio", icon: Heart },
  { value: "fitness_gym", label: "Fitness Gym", icon: Dumbbell },
  { value: "spa", label: "Spa", icon: Sparkles },
  { value: "restaurant", label: "Restaurant", icon: UtensilsCrossed },
  { value: "wellness_center", label: "Wellness Center", icon: Heart },
  { value: "other", label: "Other", icon: MoreHorizontal },
];

function serviceCategoryLabel(cat: string) {
  return SERVICE_CATEGORIES.find((c) => c.value === cat)?.label || cat;
}

function ServiceCategoryIcon({ category }: { category: string }) {
  const Icon = SERVICE_CATEGORIES.find((c) => c.value === category)?.icon || Building2;
  return <Icon className="w-4 h-4" />;
}

function tierLabel(tier: string) {
  switch (tier) {
    case "essential": return "Essential";
    case "premium": return "Premium";
    case "elite": return "Elite";
    default: return tier;
  }
}

function tierPricing(tier: string) {
  switch (tier) {
    case "essential": return "Included";
    case "premium": return "$450/night";
    case "elite": return "$1,500/night";
    default: return "";
  }
}

function tierDescription(tier: string) {
  switch (tier) {
    case "essential": return "Shared resort experience with fellow members. Group energy, curated programming, all-inclusive.";
    case "premium": return "5-star resort with premium amenities. Private or shared \u2014 your call. Elevated service, your own rhythm.";
    case "elite": return "Your own luxury home. Private chef, personal staff, complete solitude. The full experience, nobody around.";
    default: return "";
  }
}

function tierPrivateAvailable(tier: string) {
  return tier === "premium" || tier === "elite";
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
  return (
    <div className="min-h-screen relative flex flex-col">
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: "url('/images/member-login-bg.jpg')" }}
      />
      <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/40 to-black/65" />

      <div className="relative flex-1 flex flex-col" style={{ zIndex: 10 }}>
        <div className="pt-6 pb-2 px-6 flex items-center justify-between gap-4">
          <Link href="/" data-testid="link-home">
            <img src={sakredLogo} alt="Sakred Body" className="h-12 w-12 object-contain drop-shadow-lg" />
          </Link>
          <Link href="/" className="text-white/50 text-xs uppercase tracking-widest hover:text-white/70 transition-colors">
            Back to Site
          </Link>
        </div>

        <div className="flex-1 flex items-center justify-center p-4">
          <div className="max-w-lg w-full text-center space-y-8">
            <div className="space-y-4">
              <img src={sakredLogo} alt="Sakred Body" className="h-20 w-20 mx-auto object-contain drop-shadow-xl" />
              <h1 className="font-display text-4xl md:text-5xl text-white leading-tight" data-testid="text-login-heading">Member Portal</h1>
              <div className="w-12 h-px bg-gradient-to-r from-transparent via-gold to-transparent mx-auto" />
            </div>

            <p className="text-white/60 text-base leading-relaxed max-w-sm mx-auto">
              Design your private retreat in Puerto Rico. Select your housing, choose your dates, and our concierge handles the rest.
            </p>

            <div className="space-y-5 pt-2">
              <a href="/api/login" data-testid="button-login">
                <Button size="lg" className="w-full max-w-xs mx-auto bg-gold border-gold-border text-white text-base">
                  Enter the Portal
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </a>
              <p className="text-white/35 text-xs">
                Members only. If you haven't been accepted yet, <Link href="/" className="underline text-white/45">apply here</Link>.
              </p>
            </div>

            <div className="flex items-center justify-center gap-8 pt-4 flex-wrap">
              <div className="text-center">
                <p className="text-white/70 font-display text-lg">3 - 14</p>
                <p className="text-white/35 text-[10px] uppercase tracking-widest">Day Retreats</p>
              </div>
              <div className="w-px h-6 bg-white/15" />
              <div className="text-center">
                <p className="text-white/70 font-display text-lg">Private</p>
                <p className="text-white/35 text-[10px] uppercase tracking-widest">or Shared</p>
              </div>
              <div className="w-px h-6 bg-white/15" />
              <div className="text-center">
                <p className="text-white/70 font-display text-lg">Concierge</p>
                <p className="text-white/35 text-[10px] uppercase tracking-widest">White Glove</p>
              </div>
            </div>
          </div>
        </div>

        <div className="pb-6 text-center">
          <p className="text-white/25 text-[10px] tracking-[0.25em] uppercase">Puerto Rico</p>
        </div>
      </div>
    </div>
  );
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
            <Badge className={`${tierColor(booking.housingTier)} text-xs`}>{tierLabel(booking.housingTier)}</Badge>
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
  const [view, setView] = useState<"book" | "services" | "my-bookings">("book");
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
    enabled: isAuthenticated && view === "services",
  });

  const allServicesQuery = useQuery<PartnerService[]>({
    queryKey: ["/api/services"],
    enabled: isAuthenticated && view === "services",
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
      <header className="sticky top-0 border-b border-border/50 bg-background/90 backdrop-blur-md" style={{ zIndex: 9999 }}>
        <div className="container max-w-6xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2" data-testid="link-home-dashboard">
            <img src={sakredLogo} alt="Sakred Body" className="h-8 w-8 object-contain" />
            <span className="font-display text-lg tracking-tight">Sakred Body</span>
          </Link>
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

      <div className="container max-w-6xl mx-auto px-4 py-8">
        <div className="flex items-center gap-4 mb-8 flex-wrap">
          <Button
            variant={view === "book" ? "default" : "outline"}
            onClick={() => setView("book")}
            data-testid="button-view-book"
          >
            Design Your Retreat
          </Button>
          <Button
            variant={view === "services" ? "default" : "outline"}
            onClick={() => setView("services")}
            data-testid="button-view-services"
          >
            <Sparkles className="w-4 h-4 mr-2" />
            Services
          </Button>
          <Button
            variant={view === "my-bookings" ? "default" : "outline"}
            onClick={() => setView("my-bookings")}
            data-testid="button-view-bookings"
          >
            My Requests
            {bookingsQuery.data && bookingsQuery.data.length > 0 && (
              <Badge variant="secondary" className="ml-2">{bookingsQuery.data.length}</Badge>
            )}
          </Button>
        </div>

        {view === "book" && (
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
                        onClick={() => setHousingTier(tier)}
                        data-testid={`card-tier-${tier}`}
                      >
                        <CardContent className="p-4 space-y-2">
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <Badge className={`${tierColor(tier)}`}>{tierLabel(tier)}</Badge>
                            <span className="text-sm font-semibold">{tierPricing(tier)}</span>
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
                        {Array.from({ length: 10 }, (_, i) => (
                          <SelectItem key={i + 1} value={String(i + 1)}>{i + 1} Guest{i > 0 ? "s" : ""}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
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

        {view === "services" && (
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
                        <Badge variant="outline" className="text-xs">{serviceCategoryLabel(partner.category)}</Badge>
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

        {view === "my-bookings" && (
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
      </div>

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
                <Badge className={`${tierColor(housingTier)}`}>{tierLabel(housingTier)}</Badge>
              </div>
              {preferredStartDate && (
                <p className="text-sm text-muted-foreground">
                  {new Date(preferredStartDate).toLocaleDateString("en-US", { month: "long", day: "numeric" })} – {new Date(computeEndDate(preferredStartDate, parseInt(duration))).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                </p>
              )}
              <p className="text-sm text-muted-foreground">{duration} days, {guestCount} guest{parseInt(guestCount) > 1 ? "s" : ""}</p>
              {housingTier !== "essential" && (
                <p className="text-sm font-semibold">Housing: {tierPricing(housingTier)}</p>
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
