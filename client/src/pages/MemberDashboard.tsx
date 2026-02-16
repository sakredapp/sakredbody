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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Calendar,
  MapPin,
  Users,
  Bed,
  Bath,
  ArrowRight,
  LogOut,
  ArrowLeft,
  Check,
  Clock,
  Star,
  ChevronRight,
} from "lucide-react";
import type { Retreat, Property, BookingRequest } from "@shared/schema";

function tierLabel(tier: string) {
  switch (tier) {
    case "standard": return "Essential";
    case "premium": return "Premium";
    case "elite": return "Elite";
    default: return tier;
  }
}

function tierColor(tier: string) {
  switch (tier) {
    case "standard": return "bg-muted text-muted-foreground";
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

function LoginGate() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b border-border/50 bg-background/80 backdrop-blur-md" style={{ zIndex: 9999 }}>
        <div className="container max-w-6xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
          <Link href="/" className="font-display text-xl tracking-tight" data-testid="link-home">Sakred Body</Link>
        </div>
      </header>
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="max-w-md w-full text-center space-y-6">
          <div className="space-y-2">
            <h1 className="font-display text-3xl" data-testid="text-login-heading">Member Portal</h1>
            <p className="text-muted-foreground">
              Sign in to browse upcoming retreats, select your housing, and request concierge bookings.
            </p>
          </div>
          <a href="/api/login" data-testid="button-login">
            <Button size="lg" className="w-full bg-gold border-gold-border text-white">
              Sign In to Continue
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </a>
          <p className="text-xs text-muted-foreground">
            Members only. If you haven't been accepted yet, <Link href="/" className="underline">apply here</Link>.
          </p>
        </div>
      </div>
    </div>
  );
}

function RetreatCard({ retreat, onClick }: { retreat: Retreat; onClick: () => void }) {
  const start = new Date(retreat.startDate);
  const end = new Date(retreat.endDate);
  const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));

  return (
    <Card className="overflow-visible hover-elevate cursor-pointer" onClick={onClick} data-testid={`card-retreat-${retreat.id}`}>
      <div className="relative">
        <img
          src={retreat.imageUrl || "/images/hero-ocean.jpg"}
          alt={retreat.name}
          className="w-full h-52 object-cover rounded-t-md"
        />
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-4">
          <Badge className="bg-gold/90 text-white mb-1">{days}-Day Retreat</Badge>
        </div>
      </div>
      <CardContent className="p-5 space-y-3">
        <h3 className="font-display text-xl" data-testid={`text-retreat-name-${retreat.id}`}>{retreat.name}</h3>
        <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
          <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" /> {retreat.location}</span>
          <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" /> {start.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – {end.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
        </div>
        <p className="text-sm text-muted-foreground line-clamp-2">{retreat.description}</p>
        <div className="flex items-center justify-between gap-2 pt-1">
          <span className="text-xs text-muted-foreground flex items-center gap-1"><Users className="w-3 h-3" /> {retreat.capacity} spots</span>
          <span className="flex items-center gap-1 text-sm font-medium text-gold-foreground">
            View Housing <ChevronRight className="w-4 h-4" />
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

function PropertyCard({ property, onSelect }: { property: Property; onSelect: () => void }) {
  return (
    <Card className="overflow-visible hover-elevate" data-testid={`card-property-${property.id}`}>
      <div className="relative">
        <img
          src={property.imageUrl || "/images/studio-standard.jpg"}
          alt={property.name}
          className="w-full h-44 object-cover rounded-t-md"
        />
        <div className="absolute top-3 right-3">
          <Badge className={`${tierColor(property.tier)}`}>{tierLabel(property.tier)}</Badge>
        </div>
      </div>
      <CardContent className="p-5 space-y-3">
        <h4 className="font-display text-lg" data-testid={`text-property-name-${property.id}`}>{property.name}</h4>
        <div className="flex items-center gap-3 text-sm text-muted-foreground flex-wrap">
          <span className="flex items-center gap-1"><Bed className="w-3.5 h-3.5" /> {property.bedrooms} bed</span>
          <span className="flex items-center gap-1"><Bath className="w-3.5 h-3.5" /> {property.bathrooms} bath</span>
          <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" /> Up to {property.maxGuests}</span>
        </div>
        <p className="text-sm text-muted-foreground line-clamp-2">{property.description}</p>
        {property.amenities && property.amenities.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {property.amenities.slice(0, 4).map((a) => (
              <Badge key={a} variant="outline" className="text-xs">{a}</Badge>
            ))}
            {property.amenities.length > 4 && (
              <Badge variant="outline" className="text-xs">+{property.amenities.length - 4} more</Badge>
            )}
          </div>
        )}
        <Separator />
        <div className="flex items-center justify-between gap-2">
          <div>
            <span className="text-xl font-semibold">${property.pricePerNight}</span>
            <span className="text-sm text-muted-foreground"> / night</span>
          </div>
          <Button onClick={onSelect} data-testid={`button-select-property-${property.id}`}>
            Request Booking
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function BookingRequestCard({ booking, retreats }: { booking: BookingRequest; retreats: Retreat[] }) {
  const retreat = retreats.find((r) => r.id === booking.retreatId);
  return (
    <Card data-testid={`card-booking-${booking.id}`}>
      <CardContent className="p-4 space-y-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h4 className="font-display text-base" data-testid={`text-booking-retreat-${booking.id}`}>{retreat?.name || `Retreat #${booking.retreatId}`}</h4>
          {statusBadge(booking.status)}
        </div>
        <div className="text-sm text-muted-foreground flex items-center gap-3 flex-wrap">
          <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {booking.guestCount} guest{booking.guestCount > 1 ? "s" : ""}</span>
          {retreat && (
            <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {new Date(retreat.startDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })} – {new Date(retreat.endDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
          )}
        </div>
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
  const [selectedRetreat, setSelectedRetreat] = useState<Retreat | null>(null);
  const [bookingProperty, setBookingProperty] = useState<Property | null>(null);
  const [guestCount, setGuestCount] = useState("1");
  const [specialRequests, setSpecialRequests] = useState("");
  const [view, setView] = useState<"retreats" | "my-bookings">("retreats");

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

  const retreatsQuery = useQuery<Retreat[]>({
    queryKey: ["/api/retreats"],
  });

  const propertiesQuery = useQuery<Property[]>({
    queryKey: ["/api/retreats", selectedRetreat?.id, "properties"],
    queryFn: async () => {
      if (!selectedRetreat) return [];
      const res = await fetch(`/api/retreats/${selectedRetreat.id}/properties`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load properties");
      return res.json();
    },
    enabled: !!selectedRetreat,
  });

  const bookingsQuery = useQuery<BookingRequest[]>({
    queryKey: ["/api/booking-requests/me"],
    queryFn: async () => {
      const res = await fetch("/api/booking-requests/me", { credentials: "include" });
      if (res.status === 401) return [];
      if (!res.ok) throw new Error("Failed to load bookings");
      return res.json();
    },
  });

  const createBookingMutation = useMutation({
    mutationFn: async (data: { retreatId: number; propertyId: number; guestCount: number; specialRequests: string }) => {
      const res = await apiRequest("POST", "/api/booking-requests", data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Booking Requested", description: "Our concierge team will review and confirm your reservation shortly." });
      setBookingProperty(null);
      setSpecialRequests("");
      setGuestCount("1");
      queryClient.invalidateQueries({ queryKey: ["/api/booking-requests/me"] });
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

  const handleSubmitBooking = () => {
    if (!selectedRetreat || !bookingProperty) return;
    createBookingMutation.mutate({
      retreatId: selectedRetreat.id,
      propertyId: bookingProperty.id,
      guestCount: parseInt(guestCount),
      specialRequests,
    });
  };

  const initials = [user?.firstName?.[0], user?.lastName?.[0]].filter(Boolean).join("") || "M";

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 border-b border-border/50 bg-background/80 backdrop-blur-md" style={{ zIndex: 9999 }}>
        <div className="container max-w-6xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
          <Link href="/" className="font-display text-xl tracking-tight" data-testid="link-home-dashboard">Sakred Body</Link>
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
            variant={view === "retreats" ? "default" : "outline"}
            onClick={() => { setView("retreats"); setSelectedRetreat(null); }}
            data-testid="button-view-retreats"
          >
            Browse Retreats
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

        {view === "retreats" && !selectedRetreat && (
          <div className="space-y-6">
            <div>
              <h2 className="font-display text-2xl mb-1" data-testid="text-retreats-heading">Upcoming Retreats</h2>
              <p className="text-muted-foreground">Select a retreat to browse available housing and request your booking.</p>
            </div>
            {retreatsQuery.isLoading ? (
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                {[1, 2, 3].map((i) => (
                  <Card key={i}><CardContent className="p-0"><Skeleton className="h-52 w-full rounded-t-md" /><div className="p-5 space-y-3"><Skeleton className="h-6 w-3/4" /><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-2/3" /></div></CardContent></Card>
                ))}
              </div>
            ) : retreatsQuery.data && retreatsQuery.data.length > 0 ? (
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                {retreatsQuery.data.map((retreat) => (
                  <RetreatCard key={retreat.id} retreat={retreat} onClick={() => setSelectedRetreat(retreat)} />
                ))}
              </div>
            ) : (
              <Card><CardContent className="p-8 text-center text-muted-foreground">No upcoming retreats at this time. Check back soon.</CardContent></Card>
            )}
          </div>
        )}

        {view === "retreats" && selectedRetreat && (
          <div className="space-y-6">
            <Button variant="ghost" onClick={() => setSelectedRetreat(null)} className="gap-1" data-testid="button-back-retreats">
              <ArrowLeft className="w-4 h-4" /> Back to Retreats
            </Button>

            <div className="relative rounded-md overflow-hidden">
              <img
                src={selectedRetreat.imageUrl || "/images/hero-ocean.jpg"}
                alt={selectedRetreat.name}
                className="w-full h-64 object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
              <div className="absolute bottom-0 left-0 p-6 text-white">
                <h2 className="font-display text-3xl mb-1" data-testid="text-selected-retreat-name">{selectedRetreat.name}</h2>
                <div className="flex items-center gap-4 text-sm opacity-90 flex-wrap">
                  <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" /> {selectedRetreat.location}</span>
                  <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" /> {new Date(selectedRetreat.startDate).toLocaleDateString("en-US", { month: "long", day: "numeric" })} – {new Date(selectedRetreat.endDate).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</span>
                </div>
              </div>
            </div>

            <p className="text-muted-foreground max-w-3xl">{selectedRetreat.description}</p>

            <div>
              <h3 className="font-display text-xl mb-4" data-testid="text-housing-heading">Select Your Housing</h3>
              <p className="text-sm text-muted-foreground mb-6">Choose your accommodation level. Our concierge team handles all booking details — you just pick your preference and we take care of the rest.</p>
            </div>

            {propertiesQuery.isLoading ? (
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                {[1, 2, 3].map((i) => (
                  <Card key={i}><CardContent className="p-0"><Skeleton className="h-44 w-full rounded-t-md" /><div className="p-5 space-y-3"><Skeleton className="h-5 w-3/4" /><Skeleton className="h-4 w-full" /><Skeleton className="h-9 w-28 ml-auto" /></div></CardContent></Card>
                ))}
              </div>
            ) : propertiesQuery.data && propertiesQuery.data.length > 0 ? (
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                {propertiesQuery.data
                  .sort((a, b) => a.pricePerNight - b.pricePerNight)
                  .map((property) => (
                    <PropertyCard key={property.id} property={property} onSelect={() => setBookingProperty(property)} />
                  ))}
              </div>
            ) : (
              <Card><CardContent className="p-8 text-center text-muted-foreground">No properties listed yet for this retreat.</CardContent></Card>
            )}
          </div>
        )}

        {view === "my-bookings" && (
          <div className="space-y-6">
            <div>
              <h2 className="font-display text-2xl mb-1" data-testid="text-bookings-heading">My Booking Requests</h2>
              <p className="text-muted-foreground">Track the status of your concierge bookings below.</p>
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
                    <BookingRequestCard key={booking.id} booking={booking} retreats={retreatsQuery.data || []} />
                  ))}
              </div>
            ) : (
              <Card><CardContent className="p-8 text-center text-muted-foreground">No booking requests yet. Browse retreats to get started.</CardContent></Card>
            )}
          </div>
        )}
      </div>

      <Dialog open={!!bookingProperty} onOpenChange={(open) => { if (!open) setBookingProperty(null); }}>
        <DialogContent className="max-w-md" data-testid="dialog-booking">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">Request Concierge Booking</DialogTitle>
            <DialogDescription>
              Our team will review your request and confirm availability within 24 hours.
            </DialogDescription>
          </DialogHeader>
          {bookingProperty && selectedRetreat && (
            <div className="space-y-4">
              <div className="bg-muted/50 rounded-md p-3 space-y-1">
                <p className="font-medium text-sm">{selectedRetreat.name}</p>
                <p className="text-sm text-muted-foreground">{bookingProperty.name} — <span className="capitalize">{tierLabel(bookingProperty.tier)}</span></p>
                <p className="text-sm font-semibold">${bookingProperty.pricePerNight}/night</p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Number of Guests</label>
                <Select value={guestCount} onValueChange={setGuestCount}>
                  <SelectTrigger data-testid="select-guest-count">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: bookingProperty.maxGuests }, (_, i) => (
                      <SelectItem key={i + 1} value={String(i + 1)}>{i + 1} Guest{i > 0 ? "s" : ""}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Special Requests (optional)</label>
                <Textarea
                  placeholder="Dietary needs, arrival time, airport transfer, etc."
                  value={specialRequests}
                  onChange={(e) => setSpecialRequests(e.target.value)}
                  className="resize-none"
                  data-testid="input-special-requests"
                />
              </div>

              <Button
                onClick={handleSubmitBooking}
                disabled={createBookingMutation.isPending}
                className="w-full bg-gold border-gold-border text-white"
                data-testid="button-submit-booking"
              >
                {createBookingMutation.isPending ? "Submitting..." : "Submit Booking Request"}
              </Button>
              <p className="text-xs text-center text-muted-foreground">
                You will not be charged until your booking is confirmed by our concierge team.
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
