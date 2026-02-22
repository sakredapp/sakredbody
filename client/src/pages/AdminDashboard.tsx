import { useState } from "react";
import { Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Building2,
  Plus,
  Pencil,
  Trash2,
  ArrowRight,
  LogOut,
  MapPin,
  Globe,
  Mail,
  Phone,
  User,
  Dumbbell,
  Hotel,
  Home,
  Sparkles,
  UtensilsCrossed,
  Heart,
  MoreHorizontal,
  ChevronRight,
  X,
  ShieldCheck,
  ClipboardList,
  ArrowLeft,
  DollarSign,
  Clock,
  Users,
} from "lucide-react";
import type { Partner, PartnerService, BookingRequest } from "@shared/schema";
import {
  SERVICE_CATEGORIES,
  getCategoryLabel,
  type ServiceCategoryValue,
} from "@shared/constants";

// Icon mapping (UI-only, can't live in shared/)
const CATEGORY_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  hotel: Hotel, resort: Sparkles, vacation_rental: Home,
  yoga_studio: Heart, pilates_studio: Heart, fitness_gym: Dumbbell,
  spa: Sparkles, restaurant: UtensilsCrossed, wellness_center: Heart,
  other: MoreHorizontal,
};

function CategoryIcon({ category }: { category: string }) {
  const Icon = CATEGORY_ICONS[category] || Building2;
  return <Icon className="w-4 h-4" />;
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
            <ShieldCheck className="w-12 h-12 mx-auto text-muted-foreground" />
            <h1 className="font-display text-3xl" data-testid="text-admin-heading">Admin Portal</h1>
            <p className="text-muted-foreground">
              Sign in with an admin account to manage partners, services, and bookings.
            </p>
          </div>
          <Link href="/login" data-testid="button-admin-login">
            <Button size="lg" className="w-full bg-gold border-gold-border text-white">
              Sign In
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

function AccessDenied() {
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
            <X className="w-12 h-12 mx-auto text-destructive" />
            <h1 className="font-display text-3xl">Access Denied</h1>
            <p className="text-muted-foreground">
              Your account does not have admin access. Contact the Sakred Body team if you believe this is an error.
            </p>
          </div>
          <div className="flex gap-3 justify-center flex-wrap">
            <Link href="/member">
              <Button variant="outline">Go to Member Portal</Button>
            </Link>
            <Link href="/">
              <Button variant="ghost">Back to Home</Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

type AdminView = "partners" | "partner-detail" | "bookings";

interface PartnerFormData {
  name: string;
  category: string;
  description: string;
  location: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  website: string;
  imageUrl: string;
  notes: string;
  active: boolean;
}

const emptyPartnerForm: PartnerFormData = {
  name: "",
  category: "hotel",
  description: "",
  location: "",
  contactName: "",
  contactEmail: "",
  contactPhone: "",
  website: "",
  imageUrl: "",
  notes: "",
  active: true,
};

interface ServiceFormData {
  name: string;
  description: string;
  category: string;
  price: string;
  priceUnit: string;
  duration: string;
  imageUrl: string;
  maxCapacity: string;
  available: boolean;
}

const emptyServiceForm: ServiceFormData = {
  name: "",
  description: "",
  category: "",
  price: "",
  priceUnit: "per session",
  duration: "",
  imageUrl: "",
  maxCapacity: "",
  available: true,
};

export default function AdminDashboard() {
  const { user, isLoading: authLoading, isAuthenticated, logout } = useAuth();
  const { toast } = useToast();
  const [view, setView] = useState<AdminView>("partners");
  const [selectedPartner, setSelectedPartner] = useState<Partner | null>(null);
  const [showPartnerDialog, setShowPartnerDialog] = useState(false);
  const [editingPartner, setEditingPartner] = useState<Partner | null>(null);
  const [partnerForm, setPartnerForm] = useState<PartnerFormData>(emptyPartnerForm);
  const [showServiceDialog, setShowServiceDialog] = useState(false);
  const [editingService, setEditingService] = useState<PartnerService | null>(null);
  const [serviceForm, setServiceForm] = useState<ServiceFormData>(emptyServiceForm);

  const adminCheckQuery = useQuery<{ isAdmin: boolean }>({
    queryKey: ["/api/admin/check"],
    enabled: isAuthenticated,
  });

  const partnersQuery = useQuery<Partner[]>({
    queryKey: ["/api/admin/partners"],
    enabled: isAuthenticated && adminCheckQuery.data?.isAdmin === true,
  });

  const servicesQuery = useQuery<PartnerService[]>({
    queryKey: ["/api/admin/partners", selectedPartner?.id, "services"],
    queryFn: async () => {
      if (!selectedPartner) return [];
      const res = await fetch(`/api/admin/partners/${selectedPartner.id}/services`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load services");
      return res.json();
    },
    enabled: isAuthenticated && !!selectedPartner && adminCheckQuery.data?.isAdmin === true,
  });

  const bookingsQuery = useQuery<BookingRequest[]>({
    queryKey: ["/api/admin/bookings"],
    enabled: isAuthenticated && adminCheckQuery.data?.isAdmin === true,
  });

  if (authLoading || (isAuthenticated && adminCheckQuery.isLoading)) {
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

  if (!isAuthenticated) return <LoginGate />;
  if (!adminCheckQuery.data?.isAdmin) return <AccessDenied />;

  const createPartnerMutation = useMutation({
    mutationFn: async (data: PartnerFormData) => {
      const body = {
        ...data,
        contactName: data.contactName || null,
        contactEmail: data.contactEmail || null,
        contactPhone: data.contactPhone || null,
        website: data.website || null,
        imageUrl: data.imageUrl || null,
        notes: data.notes || null,
      };
      const res = await apiRequest("POST", "/api/admin/partners", body);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Partner Added", description: "New partner has been added to the network." });
      setShowPartnerDialog(false);
      setPartnerForm(emptyPartnerForm);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/partners"] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updatePartnerMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: PartnerFormData }) => {
      const body = {
        ...data,
        contactName: data.contactName || null,
        contactEmail: data.contactEmail || null,
        contactPhone: data.contactPhone || null,
        website: data.website || null,
        imageUrl: data.imageUrl || null,
        notes: data.notes || null,
      };
      const res = await apiRequest("PATCH", `/api/admin/partners/${id}`, body);
      return res.json();
    },
    onSuccess: (updated: Partner) => {
      toast({ title: "Partner Updated" });
      setShowPartnerDialog(false);
      setEditingPartner(null);
      setPartnerForm(emptyPartnerForm);
      if (selectedPartner?.id === updated.id) setSelectedPartner(updated);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/partners"] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deletePartnerMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/admin/partners/${id}`);
    },
    onSuccess: () => {
      toast({ title: "Partner Removed" });
      setSelectedPartner(null);
      setView("partners");
      queryClient.invalidateQueries({ queryKey: ["/api/admin/partners"] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const createServiceMutation = useMutation({
    mutationFn: async (data: ServiceFormData & { partnerId: number }) => {
      const body = {
        partnerId: data.partnerId,
        name: data.name,
        description: data.description,
        category: data.category,
        price: data.price ? parseInt(data.price) : null,
        priceUnit: data.priceUnit || "per session",
        duration: data.duration || null,
        imageUrl: data.imageUrl || null,
        amenities: null,
        maxCapacity: data.maxCapacity ? parseInt(data.maxCapacity) : null,
        available: data.available,
      };
      const res = await apiRequest("POST", "/api/admin/services", body);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Service Added" });
      setShowServiceDialog(false);
      setServiceForm(emptyServiceForm);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/partners", selectedPartner?.id, "services"] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateServiceMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: ServiceFormData }) => {
      const body = {
        name: data.name,
        description: data.description,
        category: data.category,
        price: data.price ? parseInt(data.price) : null,
        priceUnit: data.priceUnit || "per session",
        duration: data.duration || null,
        imageUrl: data.imageUrl || null,
        maxCapacity: data.maxCapacity ? parseInt(data.maxCapacity) : null,
        available: data.available,
      };
      const res = await apiRequest("PATCH", `/api/admin/services/${id}`, body);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Service Updated" });
      setShowServiceDialog(false);
      setEditingService(null);
      setServiceForm(emptyServiceForm);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/partners", selectedPartner?.id, "services"] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteServiceMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/admin/services/${id}`);
    },
    onSuccess: () => {
      toast({ title: "Service Removed" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/partners", selectedPartner?.id, "services"] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateBookingMutation = useMutation({
    mutationFn: async ({ id, status, conciergeNotes }: { id: number; status: string; conciergeNotes?: string }) => {
      const res = await apiRequest("PATCH", `/api/admin/bookings/${id}`, { status, conciergeNotes });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Booking Updated" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/bookings"] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const openAddPartner = () => {
    setEditingPartner(null);
    setPartnerForm(emptyPartnerForm);
    setShowPartnerDialog(true);
  };

  const openEditPartner = (partner: Partner) => {
    setEditingPartner(partner);
    setPartnerForm({
      name: partner.name,
      category: partner.category,
      description: partner.description,
      location: partner.location,
      contactName: partner.contactName || "",
      contactEmail: partner.contactEmail || "",
      contactPhone: partner.contactPhone || "",
      website: partner.website || "",
      imageUrl: partner.imageUrl || "",
      notes: partner.notes || "",
      active: partner.active,
    });
    setShowPartnerDialog(true);
  };

  const openAddService = () => {
    setEditingService(null);
    setServiceForm({ ...emptyServiceForm, category: selectedPartner?.category || "" });
    setShowServiceDialog(true);
  };

  const openEditService = (service: PartnerService) => {
    setEditingService(service);
    setServiceForm({
      name: service.name,
      description: service.description,
      category: service.category,
      price: service.price?.toString() || "",
      priceUnit: service.priceUnit || "per session",
      duration: service.duration || "",
      imageUrl: service.imageUrl || "",
      maxCapacity: service.maxCapacity?.toString() || "",
      available: service.available,
    });
    setShowServiceDialog(true);
  };

  const handleSubmitPartner = () => {
    if (!partnerForm.name || !partnerForm.description || !partnerForm.location) {
      toast({ title: "Missing Fields", description: "Name, description, and location are required.", variant: "destructive" });
      return;
    }
    if (editingPartner) {
      updatePartnerMutation.mutate({ id: editingPartner.id, data: partnerForm });
    } else {
      createPartnerMutation.mutate(partnerForm);
    }
  };

  const handleSubmitService = () => {
    if (!serviceForm.name || !serviceForm.description || !serviceForm.category) {
      toast({ title: "Missing Fields", description: "Name, description, and category are required.", variant: "destructive" });
      return;
    }
    if (editingService) {
      updateServiceMutation.mutate({ id: editingService.id, data: serviceForm });
    } else if (selectedPartner) {
      createServiceMutation.mutate({ ...serviceForm, partnerId: selectedPartner.id });
    }
  };

  const initials = [user?.firstName?.[0], user?.lastName?.[0]].filter(Boolean).join("") || "A";
  const partnerCount = partnersQuery.data?.length || 0;
  const bookingCount = bookingsQuery.data?.filter((b) => b.status === "requested").length || 0;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 border-b border-border/50 bg-background/80 backdrop-blur-md" style={{ zIndex: 9999 }}>
        <div className="container max-w-6xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link href="/" className="font-display text-xl tracking-tight" data-testid="link-home-admin">Sakred Body</Link>
            <Badge variant="outline" className="text-xs gap-1"><ShieldCheck className="w-3 h-3" /> Admin</Badge>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <Link href="/member">
              <Button variant="ghost" size="sm" data-testid="link-member-portal">Member View</Button>
            </Link>
            <Avatar className="w-8 h-8">
              {user?.profileImageUrl && <AvatarImage src={user.profileImageUrl} alt={user.firstName || "Admin"} />}
              <AvatarFallback className="text-xs">{initials}</AvatarFallback>
            </Avatar>
            <Button variant="ghost" size="icon" onClick={() => logout()} data-testid="button-admin-logout">
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>

      <div className="container max-w-6xl mx-auto px-4 py-8">
        <div className="flex items-center gap-4 mb-8 flex-wrap">
          <Button
            variant={view === "partners" && !selectedPartner ? "default" : "outline"}
            onClick={() => { setView("partners"); setSelectedPartner(null); }}
            data-testid="button-view-partners"
          >
            <Building2 className="w-4 h-4 mr-2" />
            Partners
            {partnerCount > 0 && <Badge variant="secondary" className="ml-2">{partnerCount}</Badge>}
          </Button>
          <Button
            variant={view === "bookings" ? "default" : "outline"}
            onClick={() => { setView("bookings"); setSelectedPartner(null); }}
            data-testid="button-view-admin-bookings"
          >
            <ClipboardList className="w-4 h-4 mr-2" />
            Bookings
            {bookingCount > 0 && <Badge variant="secondary" className="ml-2">{bookingCount}</Badge>}
          </Button>
        </div>

        {view === "partners" && !selectedPartner && (
          <div className="space-y-6">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <h2 className="font-display text-2xl mb-1" data-testid="text-partners-heading">Partner Network</h2>
                <p className="text-muted-foreground">Manage your concierge network of hotels, resorts, studios, and services.</p>
              </div>
              <Button onClick={openAddPartner} data-testid="button-add-partner">
                <Plus className="w-4 h-4 mr-2" />
                Add Partner
              </Button>
            </div>

            {partnersQuery.isLoading ? (
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                {[1, 2, 3].map((i) => (
                  <Card key={i}><CardContent className="p-5 space-y-3"><Skeleton className="h-6 w-3/4" /><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-2/3" /></CardContent></Card>
                ))}
              </div>
            ) : partnersQuery.data && partnersQuery.data.length > 0 ? (
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                {partnersQuery.data.map((partner) => (
                  <Card
                    key={partner.id}
                    className="overflow-visible hover-elevate cursor-pointer"
                    onClick={() => { setSelectedPartner(partner); setView("partners"); }}
                    data-testid={`card-partner-${partner.id}`}
                  >
                    {partner.imageUrl && (
                      <img
                        src={partner.imageUrl}
                        alt={partner.name}
                        className="w-full h-40 object-cover rounded-t-md"
                      />
                    )}
                    <CardContent className={`p-5 space-y-3 ${!partner.imageUrl ? 'pt-5' : ''}`}>
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-display text-lg" data-testid={`text-partner-name-${partner.id}`}>{partner.name}</h3>
                        <Badge variant={partner.active ? "outline" : "secondary"} className="text-xs shrink-0">
                          {partner.active ? "Active" : "Inactive"}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <CategoryIcon category={partner.category} />
                        <span>{getCategoryLabel(partner.category)}</span>
                      </div>
                      <div className="flex items-center gap-1 text-sm text-muted-foreground">
                        <MapPin className="w-3.5 h-3.5" />
                        <span>{partner.location}</span>
                      </div>
                      <p className="text-sm text-muted-foreground line-clamp-2">{partner.description}</p>
                      <div className="flex items-center justify-end">
                        <span className="flex items-center gap-1 text-sm font-medium text-gold-foreground">
                          Manage <ChevronRight className="w-4 h-4" />
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Card>
                <CardContent className="p-12 text-center space-y-4">
                  <Building2 className="w-12 h-12 mx-auto text-muted-foreground" />
                  <div>
                    <h3 className="font-display text-lg mb-1">No Partners Yet</h3>
                    <p className="text-sm text-muted-foreground">Start building your concierge network by adding your first partner.</p>
                  </div>
                  <Button onClick={openAddPartner}>
                    <Plus className="w-4 h-4 mr-2" /> Add Your First Partner
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {view === "partners" && selectedPartner && (
          <div className="space-y-6">
            <Button variant="ghost" onClick={() => setSelectedPartner(null)} className="gap-1" data-testid="button-back-partners">
              <ArrowLeft className="w-4 h-4" /> Back to Partners
            </Button>

            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="space-y-2">
                <div className="flex items-center gap-3 flex-wrap">
                  <h2 className="font-display text-2xl" data-testid="text-selected-partner-name">{selectedPartner.name}</h2>
                  <Badge variant={selectedPartner.active ? "outline" : "secondary"}>
                    {selectedPartner.active ? "Active" : "Inactive"}
                  </Badge>
                </div>
                <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
                  <span className="flex items-center gap-1"><CategoryIcon category={selectedPartner.category} /> {getCategoryLabel(selectedPartner.category)}</span>
                  <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" /> {selectedPartner.location}</span>
                  {selectedPartner.website && (
                    <a href={selectedPartner.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 underline">
                      <Globe className="w-3.5 h-3.5" /> Website
                    </a>
                  )}
                </div>
                <p className="text-muted-foreground max-w-2xl">{selectedPartner.description}</p>
              </div>
              <div className="flex gap-2 flex-wrap">
                <Button variant="outline" onClick={() => openEditPartner(selectedPartner)} data-testid="button-edit-partner">
                  <Pencil className="w-4 h-4 mr-2" /> Edit
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    if (confirm("Remove this partner and all their services?")) {
                      deletePartnerMutation.mutate(selectedPartner.id);
                    }
                  }}
                  data-testid="button-delete-partner"
                >
                  <Trash2 className="w-4 h-4 mr-2" /> Remove
                </Button>
              </div>
            </div>

            {(selectedPartner.contactName || selectedPartner.contactEmail || selectedPartner.contactPhone) && (
              <Card>
                <CardContent className="p-4 flex items-center gap-6 flex-wrap">
                  {selectedPartner.contactName && (
                    <span className="flex items-center gap-1.5 text-sm"><User className="w-3.5 h-3.5 text-muted-foreground" /> {selectedPartner.contactName}</span>
                  )}
                  {selectedPartner.contactEmail && (
                    <span className="flex items-center gap-1.5 text-sm"><Mail className="w-3.5 h-3.5 text-muted-foreground" /> {selectedPartner.contactEmail}</span>
                  )}
                  {selectedPartner.contactPhone && (
                    <span className="flex items-center gap-1.5 text-sm"><Phone className="w-3.5 h-3.5 text-muted-foreground" /> {selectedPartner.contactPhone}</span>
                  )}
                </CardContent>
              </Card>
            )}

            {selectedPartner.notes && (
              <Card>
                <CardContent className="p-4">
                  <p className="text-sm"><span className="font-medium">Internal Notes:</span> {selectedPartner.notes}</p>
                </CardContent>
              </Card>
            )}

            <Separator />

            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <h3 className="font-display text-xl mb-1" data-testid="text-services-heading">Services & Offerings</h3>
                <p className="text-sm text-muted-foreground">Manage what this partner offers to Sakred Body members.</p>
              </div>
              <Button onClick={openAddService} data-testid="button-add-service">
                <Plus className="w-4 h-4 mr-2" /> Add Service
              </Button>
            </div>

            {servicesQuery.isLoading ? (
              <div className="space-y-4">
                {[1, 2].map((i) => <Skeleton key={i} className="h-24 w-full rounded-md" />)}
              </div>
            ) : servicesQuery.data && servicesQuery.data.length > 0 ? (
              <div className="space-y-4">
                {servicesQuery.data.map((service) => (
                  <Card key={service.id} data-testid={`card-service-${service.id}`}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-4 flex-wrap">
                        <div className="space-y-1 flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="font-medium" data-testid={`text-service-name-${service.id}`}>{service.name}</h4>
                            <Badge variant={service.available ? "outline" : "secondary"} className="text-xs">
                              {service.available ? "Available" : "Unavailable"}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">{service.description}</p>
                          <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
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
                        </div>
                        <div className="flex gap-2 shrink-0">
                          <Button variant="ghost" size="icon" onClick={() => openEditService(service)} data-testid={`button-edit-service-${service.id}`}>
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              if (confirm("Remove this service?")) deleteServiceMutation.mutate(service.id);
                            }}
                            data-testid={`button-delete-service-${service.id}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Card>
                <CardContent className="p-8 text-center space-y-3">
                  <p className="text-muted-foreground">No services added yet for this partner.</p>
                  <Button variant="outline" onClick={openAddService}>
                    <Plus className="w-4 h-4 mr-2" /> Add First Service
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {view === "bookings" && (
          <div className="space-y-6">
            <div>
              <h2 className="font-display text-2xl mb-1" data-testid="text-admin-bookings-heading">Booking Requests</h2>
              <p className="text-muted-foreground">Review and manage member booking requests. Update status and add concierge notes.</p>
            </div>

            {bookingsQuery.isLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-28 w-full rounded-md" />)}
              </div>
            ) : bookingsQuery.data && bookingsQuery.data.length > 0 ? (
              <div className="space-y-4 max-w-3xl">
                {bookingsQuery.data
                  .sort((a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime())
                  .map((booking) => (
                    <BookingAdminCard
                      key={booking.id}
                      booking={booking}
                      onUpdateStatus={(status, notes) => updateBookingMutation.mutate({ id: booking.id, status, conciergeNotes: notes })}
                    />
                  ))}
              </div>
            ) : (
              <Card><CardContent className="p-8 text-center text-muted-foreground">No booking requests yet.</CardContent></Card>
            )}
          </div>
        )}
      </div>

      <Dialog open={showPartnerDialog} onOpenChange={setShowPartnerDialog}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" data-testid="dialog-partner">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">
              {editingPartner ? "Edit Partner" : "Add New Partner"}
            </DialogTitle>
            <DialogDescription>
              {editingPartner ? "Update partner details below." : "Add a new partner to your concierge network."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Partner Name *</label>
              <Input
                value={partnerForm.name}
                onChange={(e) => setPartnerForm({ ...partnerForm, name: e.target.value })}
                placeholder="e.g. Dorado Beach Resort"
                data-testid="input-partner-name"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Category *</label>
              <Select value={partnerForm.category} onValueChange={(v) => setPartnerForm({ ...partnerForm, category: v })}>
                <SelectTrigger data-testid="select-partner-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SERVICE_CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Location *</label>
              <Input
                value={partnerForm.location}
                onChange={(e) => setPartnerForm({ ...partnerForm, location: e.target.value })}
                placeholder="e.g. Dorado, Puerto Rico"
                data-testid="input-partner-location"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Description *</label>
              <Textarea
                value={partnerForm.description}
                onChange={(e) => setPartnerForm({ ...partnerForm, description: e.target.value })}
                placeholder="Brief description of the partner and what they offer..."
                className="resize-none"
                data-testid="input-partner-description"
              />
            </div>
            <Separator />
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Contact Name</label>
                <Input
                  value={partnerForm.contactName}
                  onChange={(e) => setPartnerForm({ ...partnerForm, contactName: e.target.value })}
                  placeholder="John Doe"
                  data-testid="input-partner-contact-name"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Contact Email</label>
                <Input
                  value={partnerForm.contactEmail}
                  onChange={(e) => setPartnerForm({ ...partnerForm, contactEmail: e.target.value })}
                  placeholder="john@resort.com"
                  data-testid="input-partner-contact-email"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Contact Phone</label>
                <Input
                  value={partnerForm.contactPhone}
                  onChange={(e) => setPartnerForm({ ...partnerForm, contactPhone: e.target.value })}
                  placeholder="+1 787 555 1234"
                  data-testid="input-partner-contact-phone"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Website</label>
                <Input
                  value={partnerForm.website}
                  onChange={(e) => setPartnerForm({ ...partnerForm, website: e.target.value })}
                  placeholder="https://..."
                  data-testid="input-partner-website"
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Image URL</label>
              <Input
                value={partnerForm.imageUrl}
                onChange={(e) => setPartnerForm({ ...partnerForm, imageUrl: e.target.value })}
                placeholder="https://... (cover photo URL)"
                data-testid="input-partner-image-url"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Internal Notes</label>
              <Textarea
                value={partnerForm.notes}
                onChange={(e) => setPartnerForm({ ...partnerForm, notes: e.target.value })}
                placeholder="Any internal notes about this partner (not shown to members)..."
                className="resize-none"
                data-testid="input-partner-notes"
              />
            </div>
            <Button
              onClick={handleSubmitPartner}
              disabled={createPartnerMutation.isPending || updatePartnerMutation.isPending}
              className="w-full bg-gold border-gold-border text-white"
              data-testid="button-submit-partner"
            >
              {(createPartnerMutation.isPending || updatePartnerMutation.isPending) ? "Saving..." : editingPartner ? "Update Partner" : "Add Partner"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showServiceDialog} onOpenChange={setShowServiceDialog}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" data-testid="dialog-service">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">
              {editingService ? "Edit Service" : "Add New Service"}
            </DialogTitle>
            <DialogDescription>
              {editingService ? "Update service details." : `Add a service offering for ${selectedPartner?.name}.`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Service Name *</label>
              <Input
                value={serviceForm.name}
                onChange={(e) => setServiceForm({ ...serviceForm, name: e.target.value })}
                placeholder="e.g. Sunrise Yoga Session"
                data-testid="input-service-name"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Category *</label>
              <Select value={serviceForm.category} onValueChange={(v) => setServiceForm({ ...serviceForm, category: v })}>
                <SelectTrigger data-testid="select-service-category">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {SERVICE_CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Description *</label>
              <Textarea
                value={serviceForm.description}
                onChange={(e) => setServiceForm({ ...serviceForm, description: e.target.value })}
                placeholder="What does this service include?"
                className="resize-none"
                data-testid="input-service-description"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Price</label>
                <Input
                  type="number"
                  value={serviceForm.price}
                  onChange={(e) => setServiceForm({ ...serviceForm, price: e.target.value })}
                  placeholder="150"
                  data-testid="input-service-price"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Price Unit</label>
                <Select value={serviceForm.priceUnit} onValueChange={(v) => setServiceForm({ ...serviceForm, priceUnit: v })}>
                  <SelectTrigger data-testid="select-service-price-unit">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="per session">Per Session</SelectItem>
                    <SelectItem value="per night">Per Night</SelectItem>
                    <SelectItem value="per person">Per Person</SelectItem>
                    <SelectItem value="per hour">Per Hour</SelectItem>
                    <SelectItem value="per class">Per Class</SelectItem>
                    <SelectItem value="flat rate">Flat Rate</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Duration</label>
                <Input
                  value={serviceForm.duration}
                  onChange={(e) => setServiceForm({ ...serviceForm, duration: e.target.value })}
                  placeholder="e.g. 60 minutes"
                  data-testid="input-service-duration"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Max Capacity</label>
                <Input
                  type="number"
                  value={serviceForm.maxCapacity}
                  onChange={(e) => setServiceForm({ ...serviceForm, maxCapacity: e.target.value })}
                  placeholder="e.g. 10"
                  data-testid="input-service-capacity"
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Image URL</label>
              <Input
                value={serviceForm.imageUrl}
                onChange={(e) => setServiceForm({ ...serviceForm, imageUrl: e.target.value })}
                placeholder="https://..."
                data-testid="input-service-image-url"
              />
            </div>
            <Button
              onClick={handleSubmitService}
              disabled={createServiceMutation.isPending || updateServiceMutation.isPending}
              className="w-full bg-gold border-gold-border text-white"
              data-testid="button-submit-service"
            >
              {(createServiceMutation.isPending || updateServiceMutation.isPending) ? "Saving..." : editingService ? "Update Service" : "Add Service"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function BookingAdminCard({ booking, onUpdateStatus }: { booking: BookingRequest; onUpdateStatus: (status: string, notes?: string) => void }) {
  const [notes, setNotes] = useState(booking.conciergeNotes || "");
  const [showNotes, setShowNotes] = useState(false);

  const statusOptions = [
    { value: "requested", label: "Pending" },
    { value: "confirmed", label: "Confirmed" },
    { value: "completed", label: "Completed" },
    { value: "cancelled", label: "Cancelled" },
  ];

  return (
    <Card data-testid={`card-admin-booking-${booking.id}`}>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium">Booking #{booking.id}</span>
              <Badge variant="outline" className="text-xs">Retreat #{booking.retreatId}</Badge>
              <Badge variant="outline" className="text-xs">Property #{booking.propertyId}</Badge>
            </div>
            <div className="text-sm text-muted-foreground flex items-center gap-3 flex-wrap">
              <span>User: {booking.userId}</span>
              <span>{booking.guestCount} guest{booking.guestCount > 1 ? "s" : ""}</span>
              <span>{new Date(booking.createdAt!).toLocaleDateString()}</span>
            </div>
          </div>
          <Select value={booking.status} onValueChange={(v) => onUpdateStatus(v, notes || undefined)}>
            <SelectTrigger className="w-36" data-testid={`select-booking-status-${booking.id}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {statusOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {booking.specialRequests && (
          <p className="text-sm text-muted-foreground">Member notes: {booking.specialRequests}</p>
        )}
        <div className="space-y-2">
          <Button variant="ghost" size="sm" onClick={() => setShowNotes(!showNotes)} data-testid={`button-toggle-notes-${booking.id}`}>
            {showNotes ? "Hide" : "Add"} Concierge Notes
          </Button>
          {showNotes && (
            <div className="flex gap-2">
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Internal notes for this booking..."
                className="resize-none flex-1"
                data-testid={`input-concierge-notes-${booking.id}`}
              />
              <Button
                variant="outline"
                onClick={() => onUpdateStatus(booking.status, notes)}
                data-testid={`button-save-notes-${booking.id}`}
              >
                Save
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
