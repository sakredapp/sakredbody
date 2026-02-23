/**
 * AdminPortal — Unified admin dashboard with tabbed sections
 *
 * Tabs: Partners | Bookings | Coaching | Masterclass
 *
 * All hooks are called unconditionally at the top level (React Rules of Hooks).
 * Auth gates render below the hooks via conditional JSX.
 */

import { useState, useMemo } from "react";
import { Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

import {
  useAdminRoutines,
  useAdminRoutineHabits,
  useCreateRoutine,
  useUpdateRoutine,
  useDeleteRoutine,
  useCreateHabitTemplate,
  useUpdateHabitTemplate,
  useDeleteHabitTemplate,
  type WellnessRoutine,
  type RoutineHabitTemplate,
} from "@/hooks/use-coaching";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Building2,
  Plus,
  Pencil,
  Trash2,
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
  ArrowRight,
  DollarSign,
  Clock,
  Users,
  ListChecks,
  Calendar,
  Film,
  FolderPlus,
  Play,
} from "lucide-react";

import type { Partner, PartnerService, BookingRequest } from "@shared/schema";
import type { MasterclassCategory, MasterclassVideo } from "@shared/models/masterclass";
import {
  SERVICE_CATEGORIES,
  getCategoryLabel,
  type ServiceCategoryValue,
} from "@shared/constants";

// ═══════════════════════════════════════════════════════════════════════════
// SHARED HELPERS
// ═══════════════════════════════════════════════════════════════════════════

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

const COACHING_CATEGORIES = [
  "Sleep", "Gut Health", "Detox", "Movement", "Mindfulness",
  "Nutrition", "Recovery", "Energy", "Stress", "Performance",
];

type AdminTab = "partners" | "bookings" | "coaching" | "masterclass";

// ═══════════════════════════════════════════════════════════════════════════
// AUTH GATES
// ═══════════════════════════════════════════════════════════════════════════

function LoginGate() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b border-border/50 bg-background/80 backdrop-blur-md" style={{ zIndex: 9999 }}>
        <div className="container max-w-6xl mx-auto px-4 h-16 flex items-center">
          <Link href="/" className="font-display text-xl tracking-tight">Sakred Body</Link>
        </div>
      </header>
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="max-w-md w-full text-center space-y-6">
          <ShieldCheck className="w-12 h-12 mx-auto text-muted-foreground" />
          <h1 className="font-display text-3xl">Admin Portal</h1>
          <p className="text-muted-foreground">Sign in with an admin account to manage content.</p>
          <Link href="/login">
            <Button size="lg" className="w-full bg-gold border-gold-border text-white">
              Sign In <ArrowRight className="w-4 h-4 ml-2" />
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
        <div className="container max-w-6xl mx-auto px-4 h-16 flex items-center">
          <Link href="/" className="font-display text-xl tracking-tight">Sakred Body</Link>
        </div>
      </header>
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="max-w-md w-full text-center space-y-6">
          <X className="w-12 h-12 mx-auto text-destructive" />
          <h1 className="font-display text-3xl">Access Denied</h1>
          <p className="text-muted-foreground">Your account does not have admin access.</p>
          <div className="flex gap-3 justify-center flex-wrap">
            <Link href="/member"><Button variant="outline">Member Portal</Button></Link>
            <Link href="/"><Button variant="ghost">Home</Button></Link>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// FORM DATA TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface PartnerFormData {
  name: string; category: string; description: string; location: string;
  contactName: string; contactEmail: string; contactPhone: string;
  website: string; imageUrl: string; notes: string; active: boolean;
}
const emptyPartnerForm: PartnerFormData = {
  name: "", category: "hotel", description: "", location: "",
  contactName: "", contactEmail: "", contactPhone: "",
  website: "", imageUrl: "", notes: "", active: true,
};

interface ServiceFormData {
  name: string; description: string; category: string;
  price: string; priceUnit: string; duration: string;
  imageUrl: string; maxCapacity: string; available: boolean;
}
const emptyServiceForm: ServiceFormData = {
  name: "", description: "", category: "",
  price: "", priceUnit: "per session", duration: "",
  imageUrl: "", maxCapacity: "", available: true,
};

interface RoutineFormData {
  name: string; description: string; goal: string; goalDescription: string;
  durationDays: number; icon: string; color: string; tier: string;
  category: string; whoIsThisFor: string; whatToExpect: string;
  expectedResults: string; isFeatured: boolean; sortOrder: number;
}
const emptyRoutineForm: RoutineFormData = {
  name: "", description: "", goal: "", goalDescription: "",
  durationDays: 14, icon: "🌙", color: "#D4A574", tier: "free",
  category: "Sleep", whoIsThisFor: "", whatToExpect: "",
  expectedResults: "", isFeatured: false, sortOrder: 0,
};

interface HabitFormData {
  title: string; shortDescription: string; detailedDescription: string;
  instructions: string; scienceExplanation: string; tips: string;
  expectToNotice: string; cadence: string; recommendedTime: string;
  durationMinutes: number | null; dayStart: number | null; dayEnd: number | null;
  orderIndex: number; intensity: string; icon: string; routineId: string;
}
const emptyHabitForm: HabitFormData = {
  title: "", shortDescription: "", detailedDescription: "",
  instructions: "", scienceExplanation: "", tips: "",
  expectToNotice: "", cadence: "daily", recommendedTime: "Morning",
  durationMinutes: null, dayStart: 1, dayEnd: null,
  orderIndex: 0, intensity: "lite", icon: "", routineId: "",
};

interface MCCategoryFormData {
  name: string; slug: string; description: string;
  coverImageUrl: string; icon: string; sortOrder: number; active: boolean;
}
const emptyMCCategoryForm: MCCategoryFormData = {
  name: "", slug: "", description: "",
  coverImageUrl: "", icon: "📚", sortOrder: 0, active: true,
};

interface MCVideoFormData {
  categoryId: string; title: string; description: string;
  thumbnailUrl: string; videoUrl: string; duration: string;
  instructor: string; tags: string; isFeatured: boolean;
  sortOrder: number; active: boolean;
}
const emptyMCVideoForm: MCVideoFormData = {
  categoryId: "", title: "", description: "",
  thumbnailUrl: "", videoUrl: "", duration: "",
  instructor: "", tags: "", isFeatured: false,
  sortOrder: 0, active: true,
};

// ═══════════════════════════════════════════════════════════════════════════
// FORM DIALOGS
// ═══════════════════════════════════════════════════════════════════════════

function RoutineFormDialog({
  open, onClose, initial, onSubmit, isPending, title,
}: {
  open: boolean; onClose: () => void; initial: RoutineFormData;
  onSubmit: (d: RoutineFormData) => void; isPending: boolean; title: string;
}) {
  const [form, setForm] = useState(initial);
  const set = (k: keyof RoutineFormData, v: string | number | boolean) =>
    setForm((p) => ({ ...p, [k]: v }));

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="font-display text-xl">{title}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1 col-span-2">
              <label className="text-sm font-medium">Name</label>
              <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Sleep Mastery" />
            </div>
            <div className="space-y-1 col-span-2">
              <label className="text-sm font-medium">Description</label>
              <Textarea value={form.description} onChange={(e) => set("description", e.target.value)} className="resize-none" rows={3} />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Category</label>
              <Select value={form.category} onValueChange={(v) => set("category", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {COACHING_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Tier</label>
              <Select value={form.tier} onValueChange={(v) => set("tier", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="free">Free</SelectItem>
                  <SelectItem value="premium">Premium</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Duration (days)</label>
              <Input type="number" value={form.durationDays} onChange={(e) => set("durationDays", parseInt(e.target.value) || 14)} min={1} />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Sort Order</label>
              <Input type="number" value={form.sortOrder} onChange={(e) => set("sortOrder", parseInt(e.target.value) || 0)} />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Icon (emoji)</label>
              <Input value={form.icon} onChange={(e) => set("icon", e.target.value)} placeholder="🌙" />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Color (hex)</label>
              <Input value={form.color} onChange={(e) => set("color", e.target.value)} placeholder="#D4A574" />
            </div>
          </div>
          <Separator />
          <div className="space-y-1">
            <label className="text-sm font-medium">Goal</label>
            <Input value={form.goal} onChange={(e) => set("goal", e.target.value)} placeholder="Optimize sleep quality" />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Goal Description</label>
            <Textarea value={form.goalDescription} onChange={(e) => set("goalDescription", e.target.value)} className="resize-none" rows={2} />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Who is this for?</label>
            <Textarea value={form.whoIsThisFor} onChange={(e) => set("whoIsThisFor", e.target.value)} className="resize-none" rows={2} />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">What to expect</label>
            <Textarea value={form.whatToExpect} onChange={(e) => set("whatToExpect", e.target.value)} className="resize-none" rows={2} />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Expected results</label>
            <Textarea value={form.expectedResults} onChange={(e) => set("expectedResults", e.target.value)} className="resize-none" rows={2} />
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" checked={form.isFeatured} onChange={(e) => set("isFeatured", e.target.checked)} className="rounded" />
            <label className="text-sm">Featured routine</label>
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={() => onSubmit(form)} disabled={isPending || !form.name || !form.description} className="bg-gold text-white">
              {isPending ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function HabitFormDialog({
  open, onClose, initial, onSubmit, isPending, title, routines,
}: {
  open: boolean; onClose: () => void; initial: HabitFormData;
  onSubmit: (d: HabitFormData) => void; isPending: boolean; title: string;
  routines: WellnessRoutine[];
}) {
  const [form, setForm] = useState(initial);
  const set = (k: keyof HabitFormData, v: string | number | null) =>
    setForm((p) => ({ ...p, [k]: v }));

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="font-display text-xl">{title}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1">
            <label className="text-sm font-medium">Title</label>
            <Input value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="Morning Cold Exposure" />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Short Description</label>
            <Input value={form.shortDescription} onChange={(e) => set("shortDescription", e.target.value)} />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Detailed Description</label>
            <Textarea value={form.detailedDescription} onChange={(e) => set("detailedDescription", e.target.value)} className="resize-none" rows={3} />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Instructions</label>
            <Textarea value={form.instructions} onChange={(e) => set("instructions", e.target.value)} className="resize-none" rows={2} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-sm font-medium">Cadence</label>
              <Select value={form.cadence} onValueChange={(v) => set("cadence", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="as-needed">As Needed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Intensity</label>
              <Select value={form.intensity} onValueChange={(v) => set("intensity", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="lite">Lite</SelectItem>
                  <SelectItem value="intense">Intense</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Recommended Time</label>
              <Select value={form.recommendedTime} onValueChange={(v) => set("recommendedTime", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Morning">Morning</SelectItem>
                  <SelectItem value="Afternoon">Afternoon</SelectItem>
                  <SelectItem value="Evening">Evening</SelectItem>
                  <SelectItem value="Anytime">Anytime</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Duration (min)</label>
              <Input type="number" value={form.durationMinutes ?? ""} onChange={(e) => set("durationMinutes", e.target.value ? parseInt(e.target.value) : null)} placeholder="10" />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Day Start</label>
              <Input type="number" value={form.dayStart ?? ""} onChange={(e) => set("dayStart", e.target.value ? parseInt(e.target.value) : null)} min={1} />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Day End</label>
              <Input type="number" value={form.dayEnd ?? ""} onChange={(e) => set("dayEnd", e.target.value ? parseInt(e.target.value) : null)} />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Order Index</label>
              <Input type="number" value={form.orderIndex} onChange={(e) => set("orderIndex", parseInt(e.target.value) || 0)} />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Icon (emoji)</label>
              <Input value={form.icon} onChange={(e) => set("icon", e.target.value)} placeholder="🧊" />
            </div>
          </div>
          <Separator />
          <div className="space-y-1">
            <label className="text-sm font-medium">Science Explanation</label>
            <Textarea value={form.scienceExplanation} onChange={(e) => set("scienceExplanation", e.target.value)} className="resize-none" rows={2} />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Tips</label>
            <Textarea value={form.tips} onChange={(e) => set("tips", e.target.value)} className="resize-none" rows={2} />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Expect to Notice</label>
            <Textarea value={form.expectToNotice} onChange={(e) => set("expectToNotice", e.target.value)} className="resize-none" rows={2} />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Primary Routine (FK)</label>
            <Select value={form.routineId || "_none"} onValueChange={(v) => set("routineId", v === "_none" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="Select routine..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">None (junction only)</SelectItem>
                {routines.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={() => onSubmit(form)} disabled={isPending || !form.title} className="bg-gold text-white">
              {isPending ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// BOOKING ADMIN CARD
// ═══════════════════════════════════════════════════════════════════════════

function BookingAdminCard({ booking, onUpdateStatus }: { booking: BookingRequest; onUpdateStatus: (s: string, n?: string) => void }) {
  const [notes, setNotes] = useState(booking.conciergeNotes || "");
  const [showNotes, setShowNotes] = useState(false);
  const statusOptions = [
    { value: "requested", label: "Pending" },
    { value: "confirmed", label: "Confirmed" },
    { value: "completed", label: "Completed" },
    { value: "cancelled", label: "Cancelled" },
  ];
  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium">Booking #{booking.id}</span>
              <Badge variant="outline" className="text-xs">Retreat #{booking.retreatId}</Badge>
            </div>
            <div className="text-sm text-muted-foreground flex items-center gap-3 flex-wrap">
              <span>User: {booking.userId}</span>
              <span>{booking.guestCount} guest{booking.guestCount > 1 ? "s" : ""}</span>
              <span>{new Date(booking.createdAt!).toLocaleDateString()}</span>
            </div>
          </div>
          <Select value={booking.status} onValueChange={(v) => onUpdateStatus(v, notes || undefined)}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              {statusOptions.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {booking.specialRequests && <p className="text-sm text-muted-foreground">Member notes: {booking.specialRequests}</p>}
        <div className="space-y-2">
          <Button variant="ghost" size="sm" onClick={() => setShowNotes(!showNotes)}>
            {showNotes ? "Hide" : "Add"} Concierge Notes
          </Button>
          {showNotes && (
            <div className="flex gap-2">
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Internal notes..." className="resize-none flex-1" />
              <Button variant="outline" onClick={() => onUpdateStatus(booking.status, notes)}>Save</Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN ADMIN PORTAL
// ═══════════════════════════════════════════════════════════════════════════

export default function AdminPortal() {
  const { user, isLoading: authLoading, isAuthenticated, logout } = useAuth();
  const { toast } = useToast();

  // ─── Top-level nav ─────────────────────────────────────────────────
  const [tab, setTab] = useState<AdminTab>("partners");

  // ─── Partners state ────────────────────────────────────────────────
  const [selectedPartner, setSelectedPartner] = useState<Partner | null>(null);
  const [showPartnerDialog, setShowPartnerDialog] = useState(false);
  const [editingPartner, setEditingPartner] = useState<Partner | null>(null);
  const [partnerForm, setPartnerForm] = useState<PartnerFormData>(emptyPartnerForm);
  const [showServiceDialog, setShowServiceDialog] = useState(false);
  const [editingService, setEditingService] = useState<PartnerService | null>(null);
  const [serviceForm, setServiceForm] = useState<ServiceFormData>(emptyServiceForm);

  // ─── Coaching state ────────────────────────────────────────────────
  const [coachingView, setCoachingView] = useState<"routines" | "habits">("routines");
  const [selectedRoutineId, setSelectedRoutineId] = useState<string | null>(null);
  const [routineDialogOpen, setRoutineDialogOpen] = useState(false);
  const [editingRoutine, setEditingRoutine] = useState<WellnessRoutine | null>(null);
  const [habitDialogOpen, setHabitDialogOpen] = useState(false);
  const [editingHabit, setEditingHabit] = useState<RoutineHabitTemplate | null>(null);

  // ─── Masterclass state ─────────────────────────────────────────────
  const [mcView, setMcView] = useState<"categories" | "videos">("categories");
  const [showMCCategoryDialog, setShowMCCategoryDialog] = useState(false);
  const [editingMCCategory, setEditingMCCategory] = useState<MasterclassCategory | null>(null);
  const [mcCategoryForm, setMcCategoryForm] = useState<MCCategoryFormData>(emptyMCCategoryForm);
  const [showMCVideoDialog, setShowMCVideoDialog] = useState(false);
  const [editingMCVideo, setEditingMCVideo] = useState<MasterclassVideo | null>(null);
  const [mcVideoForm, setMcVideoForm] = useState<MCVideoFormData>(emptyMCVideoForm);

  // ═══════════════════════════════════════════════════════════════════
  // ALL HOOKS — called unconditionally (React Rules of Hooks)
  // ═══════════════════════════════════════════════════════════════════

  const adminCheckQuery = useQuery<{ isAdmin: boolean }>({
    queryKey: ["/api/admin/check"],
    enabled: isAuthenticated,
  });

  const isAdmin = isAuthenticated && adminCheckQuery.data?.isAdmin === true;

  // Partners
  const partnersQuery = useQuery<Partner[]>({
    queryKey: ["/api/admin/partners"],
    enabled: isAdmin,
  });

  const servicesQuery = useQuery<PartnerService[]>({
    queryKey: ["/api/admin/partners", selectedPartner?.id, "services"],
    queryFn: async () => {
      if (!selectedPartner) return [];
      const res = await fetch(`/api/admin/partners/${selectedPartner.id}/services`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load services");
      return res.json();
    },
    enabled: isAdmin && !!selectedPartner,
  });

  const bookingsQuery = useQuery<BookingRequest[]>({
    queryKey: ["/api/admin/bookings"],
    enabled: isAdmin,
  });

  // Partner mutations
  const createPartnerMut = useMutation({
    mutationFn: async (data: PartnerFormData) => {
      const res = await apiRequest("POST", "/api/admin/partners", {
        ...data,
        contactName: data.contactName || null, contactEmail: data.contactEmail || null,
        contactPhone: data.contactPhone || null, website: data.website || null,
        imageUrl: data.imageUrl || null, notes: data.notes || null,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Partner Added" });
      setShowPartnerDialog(false); setPartnerForm(emptyPartnerForm);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/partners"] });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updatePartnerMut = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: PartnerFormData }) => {
      const res = await apiRequest("PATCH", `/api/admin/partners/${id}`, {
        ...data,
        contactName: data.contactName || null, contactEmail: data.contactEmail || null,
        contactPhone: data.contactPhone || null, website: data.website || null,
        imageUrl: data.imageUrl || null, notes: data.notes || null,
      });
      return res.json();
    },
    onSuccess: (updated: Partner) => {
      toast({ title: "Partner Updated" });
      setShowPartnerDialog(false); setEditingPartner(null); setPartnerForm(emptyPartnerForm);
      if (selectedPartner?.id === updated.id) setSelectedPartner(updated);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/partners"] });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deletePartnerMut = useMutation({
    mutationFn: async (id: number) => { await apiRequest("DELETE", `/api/admin/partners/${id}`); },
    onSuccess: () => {
      toast({ title: "Partner Removed" }); setSelectedPartner(null);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/partners"] });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const createServiceMut = useMutation({
    mutationFn: async (data: ServiceFormData & { partnerId: number }) => {
      const res = await apiRequest("POST", "/api/admin/services", {
        partnerId: data.partnerId, name: data.name, description: data.description,
        category: data.category, price: data.price ? parseInt(data.price) : null,
        priceUnit: data.priceUnit || "per session", duration: data.duration || null,
        imageUrl: data.imageUrl || null, amenities: null,
        maxCapacity: data.maxCapacity ? parseInt(data.maxCapacity) : null, available: data.available,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Service Added" }); setShowServiceDialog(false); setServiceForm(emptyServiceForm);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/partners", selectedPartner?.id, "services"] });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateServiceMut = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: ServiceFormData }) => {
      const res = await apiRequest("PATCH", `/api/admin/services/${id}`, {
        name: data.name, description: data.description, category: data.category,
        price: data.price ? parseInt(data.price) : null, priceUnit: data.priceUnit || "per session",
        duration: data.duration || null, imageUrl: data.imageUrl || null,
        maxCapacity: data.maxCapacity ? parseInt(data.maxCapacity) : null, available: data.available,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Service Updated" }); setShowServiceDialog(false); setEditingService(null); setServiceForm(emptyServiceForm);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/partners", selectedPartner?.id, "services"] });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteServiceMut = useMutation({
    mutationFn: async (id: number) => { await apiRequest("DELETE", `/api/admin/services/${id}`); },
    onSuccess: () => {
      toast({ title: "Service Removed" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/partners", selectedPartner?.id, "services"] });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateBookingMut = useMutation({
    mutationFn: async ({ id, status, conciergeNotes }: { id: number; status: string; conciergeNotes?: string }) => {
      const res = await apiRequest("PATCH", `/api/admin/bookings/${id}`, { status, conciergeNotes });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Booking Updated" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/bookings"] });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // Coaching
  const { data: routines, isLoading: routinesLoading } = useAdminRoutines();
  const createRoutineMut = useCreateRoutine();
  const updateRoutineMut = useUpdateRoutine();
  const deleteRoutineMut = useDeleteRoutine();
  const { data: habitsList, isLoading: habitsLoading } = useAdminRoutineHabits(selectedRoutineId);
  const createHabitMut = useCreateHabitTemplate();
  const updateHabitMut = useUpdateHabitTemplate();
  const deleteHabitMut = useDeleteHabitTemplate();

  // Masterclass
  const mcCategoriesQuery = useQuery<MasterclassCategory[]>({
    queryKey: ["/api/admin/masterclass/categories"],
    enabled: isAdmin,
  });

  const mcVideosQuery = useQuery<MasterclassVideo[]>({
    queryKey: ["/api/admin/masterclass/videos"],
    enabled: isAdmin,
  });

  const createMCCategoryMut = useMutation({
    mutationFn: async (data: MCCategoryFormData) => {
      const res = await apiRequest("POST", "/api/masterclass/categories", data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Category Created" }); setShowMCCategoryDialog(false); setMcCategoryForm(emptyMCCategoryForm);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/masterclass/categories"] });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateMCCategoryMut = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: MCCategoryFormData }) => {
      const res = await apiRequest("PUT", `/api/masterclass/categories/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Category Updated" }); setShowMCCategoryDialog(false); setEditingMCCategory(null); setMcCategoryForm(emptyMCCategoryForm);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/masterclass/categories"] });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMCCategoryMut = useMutation({
    mutationFn: async (id: string) => { await apiRequest("DELETE", `/api/masterclass/categories/${id}`); },
    onSuccess: () => {
      toast({ title: "Category Deleted" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/masterclass/categories"] });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const createMCVideoMut = useMutation({
    mutationFn: async (data: MCVideoFormData) => {
      const res = await apiRequest("POST", "/api/masterclass/videos", {
        ...data,
        tags: data.tags ? data.tags.split(",").map((t) => t.trim()).filter(Boolean) : [],
        searchKeywords: data.tags ? data.tags.split(",").map((t) => t.trim()).filter(Boolean) : [],
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Video Added" }); setShowMCVideoDialog(false); setMcVideoForm(emptyMCVideoForm);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/masterclass/videos"] });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateMCVideoMut = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: MCVideoFormData }) => {
      const res = await apiRequest("PUT", `/api/masterclass/videos/${id}`, {
        ...data,
        tags: data.tags ? data.tags.split(",").map((t) => t.trim()).filter(Boolean) : [],
        searchKeywords: data.tags ? data.tags.split(",").map((t) => t.trim()).filter(Boolean) : [],
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Video Updated" }); setShowMCVideoDialog(false); setEditingMCVideo(null); setMcVideoForm(emptyMCVideoForm);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/masterclass/videos"] });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMCVideoMut = useMutation({
    mutationFn: async (id: string) => { await apiRequest("DELETE", `/api/masterclass/videos/${id}`); },
    onSuccess: () => {
      toast({ title: "Video Deleted" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/masterclass/videos"] });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // ═══════════════════════════════════════════════════════════════════
  // DERIVED VALUES (safe after hooks)
  // ═══════════════════════════════════════════════════════════════════

  const mcCategoryMap = useMemo(() => {
    const map: Record<string, string> = {};
    mcCategoriesQuery.data?.forEach((c) => { map[c.id] = c.name; });
    return map;
  }, [mcCategoriesQuery.data]);

  // ═══════════════════════════════════════════════════════════════════
  // AUTH GATES (rendered AFTER all hooks)
  // ═══════════════════════════════════════════════════════════════════

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

  // ═══════════════════════════════════════════════════════════════════
  // HANDLER FUNCTIONS
  // ═══════════════════════════════════════════════════════════════════

  const initials = [user?.firstName?.[0], user?.lastName?.[0]].filter(Boolean).join("") || "A";
  const partnerCount = partnersQuery.data?.length || 0;
  const bookingCount = bookingsQuery.data?.filter((b) => b.status === "requested").length || 0;

  // Partners
  const openAddPartner = () => { setEditingPartner(null); setPartnerForm(emptyPartnerForm); setShowPartnerDialog(true); };
  const openEditPartner = (p: Partner) => {
    setEditingPartner(p);
    setPartnerForm({
      name: p.name, category: p.category, description: p.description, location: p.location,
      contactName: p.contactName || "", contactEmail: p.contactEmail || "",
      contactPhone: p.contactPhone || "", website: p.website || "",
      imageUrl: p.imageUrl || "", notes: p.notes || "", active: p.active,
    });
    setShowPartnerDialog(true);
  };
  const openAddService = () => { setEditingService(null); setServiceForm({ ...emptyServiceForm, category: selectedPartner?.category || "" }); setShowServiceDialog(true); };
  const openEditService = (s: PartnerService) => {
    setEditingService(s);
    setServiceForm({
      name: s.name, description: s.description, category: s.category,
      price: s.price?.toString() || "", priceUnit: s.priceUnit || "per session",
      duration: s.duration || "", imageUrl: s.imageUrl || "",
      maxCapacity: s.maxCapacity?.toString() || "", available: s.available,
    });
    setShowServiceDialog(true);
  };
  const handleSubmitPartner = () => {
    if (!partnerForm.name || !partnerForm.description || !partnerForm.location) {
      toast({ title: "Missing Fields", description: "Name, description, and location are required.", variant: "destructive" }); return;
    }
    if (editingPartner) updatePartnerMut.mutate({ id: editingPartner.id, data: partnerForm });
    else createPartnerMut.mutate(partnerForm);
  };
  const handleSubmitService = () => {
    if (!serviceForm.name || !serviceForm.description || !serviceForm.category) {
      toast({ title: "Missing Fields", description: "Name, description, and category are required.", variant: "destructive" }); return;
    }
    if (editingService) updateServiceMut.mutate({ id: editingService.id, data: serviceForm });
    else if (selectedPartner) createServiceMut.mutate({ ...serviceForm, partnerId: selectedPartner.id });
  };

  // Coaching
  const handleCreateRoutine = (d: RoutineFormData) => {
    createRoutineMut.mutate(d as unknown as Record<string, unknown>, { onSuccess: () => setRoutineDialogOpen(false) });
  };
  const handleUpdateRoutine = (d: RoutineFormData) => {
    if (!editingRoutine) return;
    updateRoutineMut.mutate({ id: editingRoutine.id, data: d as unknown as Record<string, unknown> }, { onSuccess: () => { setRoutineDialogOpen(false); setEditingRoutine(null); } });
  };
  const handleDeleteRoutine = (id: string) => { if (confirm("Delete this routine and all its habits?")) deleteRoutineMut.mutate(id); };
  const handleCreateHabit = (d: HabitFormData) => {
    const payload: Record<string, unknown> = { ...d };
    if (!d.routineId) delete payload.routineId;
    createHabitMut.mutate(payload, { onSuccess: () => setHabitDialogOpen(false) });
  };
  const handleUpdateHabit = (d: HabitFormData) => {
    if (!editingHabit) return;
    const payload: Record<string, unknown> = { ...d };
    if (!d.routineId) delete payload.routineId;
    updateHabitMut.mutate({ id: editingHabit.id, data: payload }, { onSuccess: () => { setHabitDialogOpen(false); setEditingHabit(null); } });
  };
  const handleDeleteHabit = (id: string) => { if (confirm("Delete this habit template?")) deleteHabitMut.mutate(id); };

  // Masterclass categories
  const openAddMCCategory = () => { setEditingMCCategory(null); setMcCategoryForm(emptyMCCategoryForm); setShowMCCategoryDialog(true); };
  const openEditMCCategory = (c: MasterclassCategory) => {
    setEditingMCCategory(c);
    setMcCategoryForm({
      name: c.name, slug: c.slug, description: c.description || "",
      coverImageUrl: c.coverImageUrl || "", icon: c.icon || "📚",
      sortOrder: c.sortOrder, active: c.active,
    });
    setShowMCCategoryDialog(true);
  };
  const handleSubmitMCCategory = () => {
    if (!mcCategoryForm.name || !mcCategoryForm.slug) {
      toast({ title: "Missing Fields", description: "Name and slug are required.", variant: "destructive" }); return;
    }
    if (editingMCCategory) updateMCCategoryMut.mutate({ id: editingMCCategory.id, data: mcCategoryForm });
    else createMCCategoryMut.mutate(mcCategoryForm);
  };

  // Masterclass videos
  const openAddMCVideo = () => { setEditingMCVideo(null); setMcVideoForm(emptyMCVideoForm); setShowMCVideoDialog(true); };
  const openEditMCVideo = (v: MasterclassVideo) => {
    setEditingMCVideo(v);
    setMcVideoForm({
      categoryId: v.categoryId, title: v.title, description: v.description || "",
      thumbnailUrl: v.thumbnailUrl || "", videoUrl: v.videoUrl,
      duration: v.duration || "", instructor: v.instructor || "",
      tags: v.tags?.join(", ") || "", isFeatured: v.isFeatured,
      sortOrder: v.sortOrder, active: v.active,
    });
    setShowMCVideoDialog(true);
  };
  const handleSubmitMCVideo = () => {
    if (!mcVideoForm.title || !mcVideoForm.videoUrl || !mcVideoForm.categoryId) {
      toast({ title: "Missing Fields", description: "Title, video URL, and category are required.", variant: "destructive" }); return;
    }
    if (editingMCVideo) updateMCVideoMut.mutate({ id: editingMCVideo.id, data: mcVideoForm });
    else createMCVideoMut.mutate(mcVideoForm);
  };

  // ═══════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 border-b border-border/50 bg-background/80 backdrop-blur-md" style={{ zIndex: 9999 }}>
        <div className="container max-w-6xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link href="/" className="font-display text-xl tracking-tight">Sakred Body</Link>
            <Badge variant="outline" className="text-xs gap-1"><ShieldCheck className="w-3 h-3" /> Admin</Badge>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/member"><Button variant="ghost" size="sm">Member View</Button></Link>
            <Avatar className="w-8 h-8">
              {user?.profileImageUrl && <AvatarImage src={user.profileImageUrl} alt={user.firstName || "Admin"} />}
              <AvatarFallback className="text-xs">{initials}</AvatarFallback>
            </Avatar>
            <Button variant="ghost" size="icon" onClick={() => logout()}><LogOut className="w-4 h-4" /></Button>
          </div>
        </div>
      </header>

      {/* Tab toggle */}
      <div className="container max-w-6xl mx-auto px-4 pt-6 pb-2">
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {([
            { key: "partners" as AdminTab, label: "Partners", icon: Building2, badge: partnerCount > 0 ? partnerCount : null },
            { key: "bookings" as AdminTab, label: "Bookings", icon: ClipboardList, badge: bookingCount > 0 ? bookingCount : null },
            { key: "coaching" as AdminTab, label: "Coaching", icon: Sparkles, badge: null },
            { key: "masterclass" as AdminTab, label: "Masterclass", icon: Film, badge: null },
          ]).map((t) => (
            <Button
              key={t.key}
              variant={tab === t.key ? "default" : "outline"}
              onClick={() => { setTab(t.key); setSelectedPartner(null); }}
              className="shrink-0"
            >
              <t.icon className="w-4 h-4 mr-1.5" />
              {t.label}
              {t.badge !== null && <Badge variant="secondary" className="ml-2 text-xs">{t.badge}</Badge>}
            </Button>
          ))}
        </div>
      </div>

      <div className="container max-w-6xl mx-auto px-4 py-6">

        {/* ═══════════════ PARTNERS TAB ═══════════════ */}
        {tab === "partners" && !selectedPartner && (
          <div className="space-y-6">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <h2 className="font-display text-2xl mb-1">Partner Network</h2>
                <p className="text-muted-foreground">Manage hotels, resorts, studios, and services.</p>
              </div>
              <Button onClick={openAddPartner}><Plus className="w-4 h-4 mr-2" /> Add Partner</Button>
            </div>
            {partnersQuery.isLoading ? (
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                {[1, 2, 3].map((i) => <Card key={i}><CardContent className="p-5 space-y-3"><Skeleton className="h-6 w-3/4" /><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-2/3" /></CardContent></Card>)}
              </div>
            ) : partnersQuery.data && partnersQuery.data.length > 0 ? (
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                {partnersQuery.data.map((p) => (
                  <Card key={p.id} className="overflow-visible hover-elevate cursor-pointer" onClick={() => setSelectedPartner(p)}>
                    {p.imageUrl && <img src={p.imageUrl} alt={p.name} className="w-full h-40 object-cover rounded-t-md" />}
                    <CardContent className={`p-5 space-y-3 ${!p.imageUrl ? "pt-5" : ""}`}>
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-display text-lg">{p.name}</h3>
                        <Badge variant={p.active ? "outline" : "secondary"} className="text-xs shrink-0">{p.active ? "Active" : "Inactive"}</Badge>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground"><CategoryIcon category={p.category} /><span>{getCategoryLabel(p.category)}</span></div>
                      <div className="flex items-center gap-1 text-sm text-muted-foreground"><MapPin className="w-3.5 h-3.5" /><span>{p.location}</span></div>
                      <p className="text-sm text-muted-foreground line-clamp-2">{p.description}</p>
                      <div className="flex items-center justify-end"><span className="flex items-center gap-1 text-sm font-medium text-gold-foreground">Manage <ChevronRight className="w-4 h-4" /></span></div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Card><CardContent className="p-12 text-center space-y-4">
                <Building2 className="w-12 h-12 mx-auto text-muted-foreground" />
                <h3 className="font-display text-lg">No Partners Yet</h3>
                <p className="text-sm text-muted-foreground">Start building your concierge network.</p>
                <Button onClick={openAddPartner}><Plus className="w-4 h-4 mr-2" /> Add Your First Partner</Button>
              </CardContent></Card>
            )}
          </div>
        )}

        {tab === "partners" && selectedPartner && (
          <div className="space-y-6">
            <Button variant="ghost" onClick={() => setSelectedPartner(null)} className="gap-1"><ArrowLeft className="w-4 h-4" /> Back to Partners</Button>
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="space-y-2">
                <div className="flex items-center gap-3 flex-wrap">
                  <h2 className="font-display text-2xl">{selectedPartner.name}</h2>
                  <Badge variant={selectedPartner.active ? "outline" : "secondary"}>{selectedPartner.active ? "Active" : "Inactive"}</Badge>
                </div>
                <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
                  <span className="flex items-center gap-1"><CategoryIcon category={selectedPartner.category} /> {getCategoryLabel(selectedPartner.category)}</span>
                  <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" /> {selectedPartner.location}</span>
                  {selectedPartner.website && <a href={selectedPartner.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 underline"><Globe className="w-3.5 h-3.5" /> Website</a>}
                </div>
                <p className="text-muted-foreground max-w-2xl">{selectedPartner.description}</p>
              </div>
              <div className="flex gap-2 flex-wrap">
                <Button variant="outline" onClick={() => openEditPartner(selectedPartner)}><Pencil className="w-4 h-4 mr-2" /> Edit</Button>
                <Button variant="outline" onClick={() => { if (confirm("Remove this partner?")) deletePartnerMut.mutate(selectedPartner.id); }}><Trash2 className="w-4 h-4 mr-2" /> Remove</Button>
              </div>
            </div>
            {(selectedPartner.contactName || selectedPartner.contactEmail || selectedPartner.contactPhone) && (
              <Card><CardContent className="p-4 flex items-center gap-6 flex-wrap">
                {selectedPartner.contactName && <span className="flex items-center gap-1.5 text-sm"><User className="w-3.5 h-3.5 text-muted-foreground" /> {selectedPartner.contactName}</span>}
                {selectedPartner.contactEmail && <span className="flex items-center gap-1.5 text-sm"><Mail className="w-3.5 h-3.5 text-muted-foreground" /> {selectedPartner.contactEmail}</span>}
                {selectedPartner.contactPhone && <span className="flex items-center gap-1.5 text-sm"><Phone className="w-3.5 h-3.5 text-muted-foreground" /> {selectedPartner.contactPhone}</span>}
              </CardContent></Card>
            )}
            <Separator />
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div><h3 className="font-display text-xl mb-1">Services & Offerings</h3><p className="text-sm text-muted-foreground">Manage what this partner offers.</p></div>
              <Button onClick={openAddService}><Plus className="w-4 h-4 mr-2" /> Add Service</Button>
            </div>
            {servicesQuery.isLoading ? (
              <div className="space-y-4">{[1, 2].map((i) => <Skeleton key={i} className="h-24 w-full rounded-md" />)}</div>
            ) : servicesQuery.data && servicesQuery.data.length > 0 ? (
              <div className="space-y-4">
                {servicesQuery.data.map((s) => (
                  <Card key={s.id}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-4 flex-wrap">
                        <div className="space-y-1 flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="font-medium">{s.name}</h4>
                            <Badge variant={s.available ? "outline" : "secondary"} className="text-xs">{s.available ? "Available" : "Unavailable"}</Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">{s.description}</p>
                          <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
                            {s.price && <span className="flex items-center gap-1"><DollarSign className="w-3.5 h-3.5" /> ${s.price} {s.priceUnit}</span>}
                            {s.duration && <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> {s.duration}</span>}
                            {s.maxCapacity && <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" /> Up to {s.maxCapacity}</span>}
                          </div>
                        </div>
                        <div className="flex gap-2 shrink-0">
                          <Button variant="ghost" size="icon" onClick={() => openEditService(s)}><Pencil className="w-4 h-4" /></Button>
                          <Button variant="ghost" size="icon" onClick={() => { if (confirm("Remove?")) deleteServiceMut.mutate(s.id); }}><Trash2 className="w-4 h-4" /></Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Card><CardContent className="p-8 text-center space-y-3">
                <p className="text-muted-foreground">No services yet.</p>
                <Button variant="outline" onClick={openAddService}><Plus className="w-4 h-4 mr-2" /> Add First Service</Button>
              </CardContent></Card>
            )}
          </div>
        )}

        {/* ═══════════════ BOOKINGS TAB ═══════════════ */}
        {tab === "bookings" && (
          <div className="space-y-6">
            <div><h2 className="font-display text-2xl mb-1">Booking Requests</h2><p className="text-muted-foreground">Review and manage member booking requests.</p></div>
            {bookingsQuery.isLoading ? (
              <div className="space-y-4">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-28 w-full rounded-md" />)}</div>
            ) : bookingsQuery.data && bookingsQuery.data.length > 0 ? (
              <div className="space-y-4 max-w-3xl">
                {bookingsQuery.data
                  .sort((a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime())
                  .map((b) => <BookingAdminCard key={b.id} booking={b} onUpdateStatus={(s, n) => updateBookingMut.mutate({ id: b.id, status: s, conciergeNotes: n })} />)}
              </div>
            ) : (
              <Card><CardContent className="p-8 text-center text-muted-foreground">No booking requests yet.</CardContent></Card>
            )}
          </div>
        )}

        {/* ═══════════════ COACHING TAB ═══════════════ */}
        {tab === "coaching" && (
          <div className="space-y-6">
            <div className="flex items-center gap-3 mb-4">
              <Button variant={coachingView === "routines" ? "default" : "outline"} onClick={() => { setCoachingView("routines"); setSelectedRoutineId(null); }}>
                <Sparkles className="w-4 h-4 mr-1" /> Routines
              </Button>
              <Button variant={coachingView === "habits" ? "default" : "outline"} onClick={() => setCoachingView("habits")}>
                <ListChecks className="w-4 h-4 mr-1" /> Habit Templates
              </Button>
            </div>

            {coachingView === "routines" && (
              <div className="space-y-6">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div><h2 className="font-display text-2xl">Wellness Routines</h2><p className="text-sm text-muted-foreground">Manage routine programs.</p></div>
                  <Button onClick={() => { setEditingRoutine(null); setRoutineDialogOpen(true); }} className="bg-gold text-white"><Plus className="w-4 h-4 mr-1" /> New Routine</Button>
                </div>
                {routinesLoading ? (
                  <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-36 rounded-md" />)}</div>
                ) : !routines || routines.length === 0 ? (
                  <Card><CardContent className="p-12 text-center text-muted-foreground">No routines yet. Create your first above.</CardContent></Card>
                ) : (
                  <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {routines.map((r) => (
                      <Card key={r.id} className="overflow-visible hover-elevate">
                        <CardContent className="p-4 space-y-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2">{r.icon && <span className="text-lg">{r.icon}</span>}<h4 className="font-display text-base">{r.name}</h4></div>
                            <Badge variant="outline" className="text-xs">{r.category}</Badge>
                          </div>
                          <p className="text-sm text-muted-foreground line-clamp-2">{r.description}</p>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {r.durationDays}d</span>
                            <Badge className={r.tier === "premium" ? "bg-gold/15 text-gold text-[10px]" : "text-[10px]"}>{r.tier}</Badge>
                            {r.isFeatured && <Badge className="bg-gold/15 text-gold text-[10px]">Featured</Badge>}
                          </div>
                          <Separator />
                          <div className="flex items-center gap-2">
                            <Button size="sm" variant="outline" onClick={() => { setSelectedRoutineId(r.id); setCoachingView("habits"); }}><ListChecks className="w-3.5 h-3.5 mr-1" /> Habits</Button>
                            <Button size="sm" variant="ghost" onClick={() => { setEditingRoutine(r); setRoutineDialogOpen(true); }}><Pencil className="w-3.5 h-3.5" /></Button>
                            <Button size="sm" variant="ghost" onClick={() => handleDeleteRoutine(r.id)} disabled={deleteRoutineMut.isPending} className="text-destructive"><Trash2 className="w-3.5 h-3.5" /></Button>
                          </div>
                          <p className="text-[10px] text-muted-foreground font-mono">{r.id}</p>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
                <RoutineFormDialog
                  open={routineDialogOpen}
                  onClose={() => { setRoutineDialogOpen(false); setEditingRoutine(null); }}
                  initial={editingRoutine ? {
                    name: editingRoutine.name, description: editingRoutine.description,
                    goal: editingRoutine.goal || "", goalDescription: editingRoutine.goalDescription || "",
                    durationDays: editingRoutine.durationDays, icon: editingRoutine.icon || "",
                    color: editingRoutine.color || "", tier: editingRoutine.tier,
                    category: editingRoutine.category, whoIsThisFor: editingRoutine.whoIsThisFor || "",
                    whatToExpect: editingRoutine.whatToExpect || "",
                    expectedResults: editingRoutine.expectedResults || "",
                    isFeatured: editingRoutine.isFeatured, sortOrder: editingRoutine.sortOrder,
                  } : emptyRoutineForm}
                  onSubmit={editingRoutine ? handleUpdateRoutine : handleCreateRoutine}
                  isPending={createRoutineMut.isPending || updateRoutineMut.isPending}
                  title={editingRoutine ? "Edit Routine" : "Create Routine"}
                />
              </div>
            )}

            {coachingView === "habits" && (
              <div className="space-y-6">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <h2 className="font-display text-2xl">Habit Templates</h2>
                    <p className="text-sm text-muted-foreground">{selectedRoutineId ? `Showing habits for selected routine` : "Select a routine to view its habits."}</p>
                  </div>
                  <Button onClick={() => { setEditingHabit(null); setHabitDialogOpen(true); }} className="bg-gold text-white"><Plus className="w-4 h-4 mr-1" /> New Habit</Button>
                </div>
                {routines && routines.length > 0 && (
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    <Badge variant={selectedRoutineId === null ? "default" : "outline"} className="cursor-pointer whitespace-nowrap" onClick={() => setSelectedRoutineId(null)}>All</Badge>
                    {routines.map((r) => (
                      <Badge key={r.id} variant={selectedRoutineId === r.id ? "default" : "outline"} className="cursor-pointer whitespace-nowrap" onClick={() => setSelectedRoutineId(selectedRoutineId === r.id ? null : r.id)}>
                        {r.icon} {r.name}
                      </Badge>
                    ))}
                  </div>
                )}
                {!selectedRoutineId ? (
                  <Card><CardContent className="p-8 text-center text-muted-foreground">Select a routine above to view its habits.</CardContent></Card>
                ) : habitsLoading ? (
                  <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 rounded-md" />)}</div>
                ) : !habitsList || habitsList.length === 0 ? (
                  <Card><CardContent className="p-8 text-center text-muted-foreground">No habits for this routine yet.</CardContent></Card>
                ) : (
                  <div className="space-y-3">
                    {habitsList.map((h) => (
                      <Card key={h.id}>
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                {h.icon && <span>{h.icon}</span>}
                                <h4 className="text-sm font-medium">{h.title}</h4>
                                <Badge variant="outline" className="text-[10px] px-1.5 py-0">{h.cadence}</Badge>
                                <Badge variant="outline" className="text-[10px] px-1.5 py-0">{h.intensity}</Badge>
                                {h.recommendedTime && <Badge variant="outline" className="text-[10px] px-1.5 py-0">{h.recommendedTime}</Badge>}
                              </div>
                              {h.shortDescription && <p className="text-xs text-muted-foreground mt-1">{h.shortDescription}</p>}
                              <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground">
                                {h.dayStart && <span>Days {h.dayStart}{h.dayEnd ? `–${h.dayEnd}` : "+"}</span>}
                                {h.durationMinutes && <span>{h.durationMinutes} min</span>}
                                <span className="font-mono">{h.id.slice(0, 8)}</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-1">
                              <Button size="sm" variant="ghost" onClick={() => { setEditingHabit(h); setHabitDialogOpen(true); }}><Pencil className="w-3.5 h-3.5" /></Button>
                              <Button size="sm" variant="ghost" onClick={() => handleDeleteHabit(h.id)} disabled={deleteHabitMut.isPending} className="text-destructive"><Trash2 className="w-3.5 h-3.5" /></Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
                <HabitFormDialog
                  open={habitDialogOpen}
                  onClose={() => { setHabitDialogOpen(false); setEditingHabit(null); }}
                  initial={editingHabit ? {
                    title: editingHabit.title, shortDescription: editingHabit.shortDescription || "",
                    detailedDescription: editingHabit.detailedDescription || "",
                    instructions: editingHabit.instructions || "",
                    scienceExplanation: editingHabit.scienceExplanation || "",
                    tips: editingHabit.tips || "", expectToNotice: editingHabit.expectToNotice || "",
                    cadence: editingHabit.cadence, recommendedTime: editingHabit.recommendedTime || "Morning",
                    durationMinutes: editingHabit.durationMinutes, dayStart: editingHabit.dayStart,
                    dayEnd: editingHabit.dayEnd, orderIndex: editingHabit.orderIndex,
                    intensity: editingHabit.intensity, icon: editingHabit.icon || "",
                    routineId: editingHabit.routineId || "",
                  } : { ...emptyHabitForm, routineId: selectedRoutineId || "" }}
                  onSubmit={editingHabit ? handleUpdateHabit : handleCreateHabit}
                  isPending={createHabitMut.isPending || updateHabitMut.isPending}
                  title={editingHabit ? "Edit Habit Template" : "Create Habit Template"}
                  routines={routines || []}
                />
              </div>
            )}
          </div>
        )}

        {/* ═══════════════ MASTERCLASS TAB ═══════════════ */}
        {tab === "masterclass" && (
          <div className="space-y-6">
            <div className="flex items-center gap-3 mb-4">
              <Button variant={mcView === "categories" ? "default" : "outline"} onClick={() => setMcView("categories")}>
                <FolderPlus className="w-4 h-4 mr-1" /> Categories
              </Button>
              <Button variant={mcView === "videos" ? "default" : "outline"} onClick={() => setMcView("videos")}>
                <Play className="w-4 h-4 mr-1" /> Videos
              </Button>
            </div>

            {/* Categories */}
            {mcView === "categories" && (
              <div className="space-y-6">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div><h2 className="font-display text-2xl">Masterclass Categories</h2><p className="text-sm text-muted-foreground">Folders users can follow. e.g. Building Muscle, Meditation, Nutrition.</p></div>
                  <Button onClick={openAddMCCategory} className="bg-gold text-white"><Plus className="w-4 h-4 mr-1" /> New Category</Button>
                </div>
                {mcCategoriesQuery.isLoading ? (
                  <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-28 rounded-md" />)}</div>
                ) : !mcCategoriesQuery.data || mcCategoriesQuery.data.length === 0 ? (
                  <Card><CardContent className="p-12 text-center space-y-4">
                    <Film className="w-12 h-12 mx-auto text-muted-foreground" />
                    <h3 className="font-display text-lg">No Categories Yet</h3>
                    <p className="text-sm text-muted-foreground">Create your first category to organize video content.</p>
                    <Button onClick={openAddMCCategory}><Plus className="w-4 h-4 mr-2" /> Add First Category</Button>
                  </CardContent></Card>
                ) : (
                  <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {mcCategoriesQuery.data.map((c) => (
                      <Card key={c.id} className="overflow-visible hover-elevate">
                        {c.coverImageUrl && <img src={c.coverImageUrl} alt={c.name} className="w-full h-32 object-cover rounded-t-md" />}
                        <CardContent className={`p-4 space-y-3 ${!c.coverImageUrl ? "pt-4" : ""}`}>
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2">
                              {c.icon && <span className="text-lg">{c.icon}</span>}
                              <h4 className="font-display text-base">{c.name}</h4>
                            </div>
                            <Badge variant={c.active ? "outline" : "secondary"} className="text-xs">{c.active ? "Active" : "Inactive"}</Badge>
                          </div>
                          {c.description && <p className="text-sm text-muted-foreground line-clamp-2">{c.description}</p>}
                          <div className="flex items-center gap-3 text-xs text-muted-foreground">
                            <span className="font-mono">{c.slug}</span>
                            <span>Order: {c.sortOrder}</span>
                          </div>
                          <Separator />
                          <div className="flex items-center gap-2">
                            <Button size="sm" variant="ghost" onClick={() => openEditMCCategory(c)}><Pencil className="w-3.5 h-3.5" /></Button>
                            <Button size="sm" variant="ghost" onClick={() => { if (confirm("Delete this category?")) deleteMCCategoryMut.mutate(c.id); }} disabled={deleteMCCategoryMut.isPending} className="text-destructive"><Trash2 className="w-3.5 h-3.5" /></Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Videos */}
            {mcView === "videos" && (
              <div className="space-y-6">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div><h2 className="font-display text-2xl">Masterclass Videos</h2><p className="text-sm text-muted-foreground">Manage individual video entries.</p></div>
                  <Button onClick={openAddMCVideo} className="bg-gold text-white"><Plus className="w-4 h-4 mr-1" /> New Video</Button>
                </div>
                {mcVideosQuery.isLoading ? (
                  <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-md" />)}</div>
                ) : !mcVideosQuery.data || mcVideosQuery.data.length === 0 ? (
                  <Card><CardContent className="p-12 text-center space-y-4">
                    <Play className="w-12 h-12 mx-auto text-muted-foreground" />
                    <h3 className="font-display text-lg">No Videos Yet</h3>
                    <p className="text-sm text-muted-foreground">Add videos to start building your masterclass library.</p>
                    <Button onClick={openAddMCVideo}><Plus className="w-4 h-4 mr-2" /> Add First Video</Button>
                  </CardContent></Card>
                ) : (
                  <div className="space-y-3">
                    {mcVideosQuery.data.map((v) => (
                      <Card key={v.id}>
                        <CardContent className="p-4">
                          <div className="flex items-start gap-4">
                            {v.thumbnailUrl && (
                              <img src={v.thumbnailUrl} alt={v.title} className="w-28 h-20 object-cover rounded-md shrink-0" />
                            )}
                            <div className="flex-1 min-w-0 space-y-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <h4 className="text-sm font-medium">{v.title}</h4>
                                <Badge variant={v.active ? "outline" : "secondary"} className="text-[10px]">{v.active ? "Active" : "Inactive"}</Badge>
                                {v.isFeatured && <Badge className="bg-gold/15 text-gold text-[10px]">Featured</Badge>}
                              </div>
                              {v.description && <p className="text-xs text-muted-foreground line-clamp-1">{v.description}</p>}
                              <div className="flex items-center gap-3 text-[10px] text-muted-foreground flex-wrap">
                                <span className="font-medium">{mcCategoryMap[v.categoryId] || "Unknown"}</span>
                                {v.instructor && <span>by {v.instructor}</span>}
                                {v.duration && <span>{v.duration}</span>}
                                {v.tags && v.tags.length > 0 && <span>{v.tags.join(", ")}</span>}
                              </div>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <Button size="sm" variant="ghost" onClick={() => openEditMCVideo(v)}><Pencil className="w-3.5 h-3.5" /></Button>
                              <Button size="sm" variant="ghost" onClick={() => { if (confirm("Delete this video?")) deleteMCVideoMut.mutate(v.id); }} disabled={deleteMCVideoMut.isPending} className="text-destructive"><Trash2 className="w-3.5 h-3.5" /></Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ═══════════════ DIALOGS ═══════════════ */}

      {/* Partner dialog */}
      <Dialog open={showPartnerDialog} onOpenChange={setShowPartnerDialog}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">{editingPartner ? "Edit Partner" : "Add New Partner"}</DialogTitle>
            <DialogDescription>{editingPartner ? "Update partner details." : "Add a new partner to your network."}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><label className="text-sm font-medium">Name *</label><Input value={partnerForm.name} onChange={(e) => setPartnerForm({ ...partnerForm, name: e.target.value })} placeholder="Dorado Beach Resort" /></div>
            <div className="space-y-2"><label className="text-sm font-medium">Category *</label>
              <Select value={partnerForm.category} onValueChange={(v) => setPartnerForm({ ...partnerForm, category: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{SERVICE_CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><label className="text-sm font-medium">Location *</label><Input value={partnerForm.location} onChange={(e) => setPartnerForm({ ...partnerForm, location: e.target.value })} placeholder="Dorado, Puerto Rico" /></div>
            <div className="space-y-2"><label className="text-sm font-medium">Description *</label><Textarea value={partnerForm.description} onChange={(e) => setPartnerForm({ ...partnerForm, description: e.target.value })} className="resize-none" /></div>
            <Separator />
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><label className="text-sm font-medium">Contact Name</label><Input value={partnerForm.contactName} onChange={(e) => setPartnerForm({ ...partnerForm, contactName: e.target.value })} /></div>
              <div className="space-y-2"><label className="text-sm font-medium">Contact Email</label><Input value={partnerForm.contactEmail} onChange={(e) => setPartnerForm({ ...partnerForm, contactEmail: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><label className="text-sm font-medium">Phone</label><Input value={partnerForm.contactPhone} onChange={(e) => setPartnerForm({ ...partnerForm, contactPhone: e.target.value })} /></div>
              <div className="space-y-2"><label className="text-sm font-medium">Website</label><Input value={partnerForm.website} onChange={(e) => setPartnerForm({ ...partnerForm, website: e.target.value })} placeholder="https://..." /></div>
            </div>
            <div className="space-y-2"><label className="text-sm font-medium">Image URL</label><Input value={partnerForm.imageUrl} onChange={(e) => setPartnerForm({ ...partnerForm, imageUrl: e.target.value })} placeholder="https://..." /></div>
            <div className="space-y-2"><label className="text-sm font-medium">Internal Notes</label><Textarea value={partnerForm.notes} onChange={(e) => setPartnerForm({ ...partnerForm, notes: e.target.value })} className="resize-none" /></div>
            <Button onClick={handleSubmitPartner} disabled={createPartnerMut.isPending || updatePartnerMut.isPending} className="w-full bg-gold text-white">
              {(createPartnerMut.isPending || updatePartnerMut.isPending) ? "Saving..." : editingPartner ? "Update Partner" : "Add Partner"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Service dialog */}
      <Dialog open={showServiceDialog} onOpenChange={setShowServiceDialog}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">{editingService ? "Edit Service" : "Add Service"}</DialogTitle>
            <DialogDescription>{editingService ? "Update service details." : `Add a service for ${selectedPartner?.name}.`}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><label className="text-sm font-medium">Name *</label><Input value={serviceForm.name} onChange={(e) => setServiceForm({ ...serviceForm, name: e.target.value })} /></div>
            <div className="space-y-2"><label className="text-sm font-medium">Category *</label>
              <Select value={serviceForm.category} onValueChange={(v) => setServiceForm({ ...serviceForm, category: v })}>
                <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent>{SERVICE_CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><label className="text-sm font-medium">Description *</label><Textarea value={serviceForm.description} onChange={(e) => setServiceForm({ ...serviceForm, description: e.target.value })} className="resize-none" /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><label className="text-sm font-medium">Price</label><Input type="number" value={serviceForm.price} onChange={(e) => setServiceForm({ ...serviceForm, price: e.target.value })} /></div>
              <div className="space-y-2"><label className="text-sm font-medium">Price Unit</label>
                <Select value={serviceForm.priceUnit} onValueChange={(v) => setServiceForm({ ...serviceForm, priceUnit: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="per session">Per Session</SelectItem><SelectItem value="per night">Per Night</SelectItem>
                    <SelectItem value="per person">Per Person</SelectItem><SelectItem value="per hour">Per Hour</SelectItem>
                    <SelectItem value="flat rate">Flat Rate</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><label className="text-sm font-medium">Duration</label><Input value={serviceForm.duration} onChange={(e) => setServiceForm({ ...serviceForm, duration: e.target.value })} placeholder="60 minutes" /></div>
              <div className="space-y-2"><label className="text-sm font-medium">Max Capacity</label><Input type="number" value={serviceForm.maxCapacity} onChange={(e) => setServiceForm({ ...serviceForm, maxCapacity: e.target.value })} /></div>
            </div>
            <div className="space-y-2"><label className="text-sm font-medium">Image URL</label><Input value={serviceForm.imageUrl} onChange={(e) => setServiceForm({ ...serviceForm, imageUrl: e.target.value })} /></div>
            <Button onClick={handleSubmitService} disabled={createServiceMut.isPending || updateServiceMut.isPending} className="w-full bg-gold text-white">
              {(createServiceMut.isPending || updateServiceMut.isPending) ? "Saving..." : editingService ? "Update Service" : "Add Service"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* MC Category dialog */}
      <Dialog open={showMCCategoryDialog} onOpenChange={setShowMCCategoryDialog}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">{editingMCCategory ? "Edit Category" : "New Category"}</DialogTitle>
            <DialogDescription>{editingMCCategory ? "Update category details." : "Create a new masterclass category folder."}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><label className="text-sm font-medium">Name *</label><Input value={mcCategoryForm.name} onChange={(e) => setMcCategoryForm({ ...mcCategoryForm, name: e.target.value })} placeholder="Building Muscle" /></div>
            <div className="space-y-2"><label className="text-sm font-medium">Slug *</label><Input value={mcCategoryForm.slug} onChange={(e) => setMcCategoryForm({ ...mcCategoryForm, slug: e.target.value })} placeholder="building-muscle" /><p className="text-xs text-muted-foreground">URL-safe identifier. Use lowercase with hyphens.</p></div>
            <div className="space-y-2"><label className="text-sm font-medium">Description</label><Textarea value={mcCategoryForm.description} onChange={(e) => setMcCategoryForm({ ...mcCategoryForm, description: e.target.value })} className="resize-none" rows={3} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><label className="text-sm font-medium">Icon (emoji)</label><Input value={mcCategoryForm.icon} onChange={(e) => setMcCategoryForm({ ...mcCategoryForm, icon: e.target.value })} placeholder="💪" /></div>
              <div className="space-y-2"><label className="text-sm font-medium">Sort Order</label><Input type="number" value={mcCategoryForm.sortOrder} onChange={(e) => setMcCategoryForm({ ...mcCategoryForm, sortOrder: parseInt(e.target.value) || 0 })} /></div>
            </div>
            <div className="space-y-2"><label className="text-sm font-medium">Cover Image URL</label><Input value={mcCategoryForm.coverImageUrl} onChange={(e) => setMcCategoryForm({ ...mcCategoryForm, coverImageUrl: e.target.value })} placeholder="https://..." /></div>
            <div className="flex items-center gap-2">
              <input type="checkbox" checked={mcCategoryForm.active} onChange={(e) => setMcCategoryForm({ ...mcCategoryForm, active: e.target.checked })} className="rounded" />
              <label className="text-sm">Active (visible to members)</label>
            </div>
            <Button onClick={handleSubmitMCCategory} disabled={createMCCategoryMut.isPending || updateMCCategoryMut.isPending} className="w-full bg-gold text-white">
              {(createMCCategoryMut.isPending || updateMCCategoryMut.isPending) ? "Saving..." : editingMCCategory ? "Update Category" : "Create Category"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* MC Video dialog */}
      <Dialog open={showMCVideoDialog} onOpenChange={setShowMCVideoDialog}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">{editingMCVideo ? "Edit Video" : "New Video"}</DialogTitle>
            <DialogDescription>{editingMCVideo ? "Update video details." : "Add a new video to the masterclass library."}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><label className="text-sm font-medium">Title *</label><Input value={mcVideoForm.title} onChange={(e) => setMcVideoForm({ ...mcVideoForm, title: e.target.value })} placeholder="How to Build Muscle" /></div>
            <div className="space-y-2"><label className="text-sm font-medium">Category *</label>
              <Select value={mcVideoForm.categoryId} onValueChange={(v) => setMcVideoForm({ ...mcVideoForm, categoryId: v })}>
                <SelectTrigger><SelectValue placeholder="Select category..." /></SelectTrigger>
                <SelectContent>
                  {mcCategoriesQuery.data?.map((c) => <SelectItem key={c.id} value={c.id}>{c.icon} {c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><label className="text-sm font-medium">Video URL *</label><Input value={mcVideoForm.videoUrl} onChange={(e) => setMcVideoForm({ ...mcVideoForm, videoUrl: e.target.value })} placeholder="https://youtube.com/embed/..." /><p className="text-xs text-muted-foreground">YouTube/Vimeo embed URL or direct video URL.</p></div>
            <div className="space-y-2"><label className="text-sm font-medium">Thumbnail URL</label><Input value={mcVideoForm.thumbnailUrl} onChange={(e) => setMcVideoForm({ ...mcVideoForm, thumbnailUrl: e.target.value })} placeholder="https://..." /></div>
            <div className="space-y-2"><label className="text-sm font-medium">Description</label><Textarea value={mcVideoForm.description} onChange={(e) => setMcVideoForm({ ...mcVideoForm, description: e.target.value })} className="resize-none" rows={3} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><label className="text-sm font-medium">Instructor</label><Input value={mcVideoForm.instructor} onChange={(e) => setMcVideoForm({ ...mcVideoForm, instructor: e.target.value })} placeholder="Jace Russell" /></div>
              <div className="space-y-2"><label className="text-sm font-medium">Duration</label><Input value={mcVideoForm.duration} onChange={(e) => setMcVideoForm({ ...mcVideoForm, duration: e.target.value })} placeholder="12:34" /></div>
            </div>
            <div className="space-y-2"><label className="text-sm font-medium">Tags</label><Input value={mcVideoForm.tags} onChange={(e) => setMcVideoForm({ ...mcVideoForm, tags: e.target.value })} placeholder="muscle, strength, training" /><p className="text-xs text-muted-foreground">Comma-separated. Used for search.</p></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><label className="text-sm font-medium">Sort Order</label><Input type="number" value={mcVideoForm.sortOrder} onChange={(e) => setMcVideoForm({ ...mcVideoForm, sortOrder: parseInt(e.target.value) || 0 })} /></div>
              <div className="space-y-2 flex flex-col justify-end">
                <div className="flex items-center gap-2">
                  <input type="checkbox" checked={mcVideoForm.isFeatured} onChange={(e) => setMcVideoForm({ ...mcVideoForm, isFeatured: e.target.checked })} className="rounded" />
                  <label className="text-sm">Featured</label>
                </div>
                <div className="flex items-center gap-2">
                  <input type="checkbox" checked={mcVideoForm.active} onChange={(e) => setMcVideoForm({ ...mcVideoForm, active: e.target.checked })} className="rounded" />
                  <label className="text-sm">Active</label>
                </div>
              </div>
            </div>
            <Button onClick={handleSubmitMCVideo} disabled={createMCVideoMut.isPending || updateMCVideoMut.isPending} className="w-full bg-gold text-white">
              {(createMCVideoMut.isPending || updateMCVideoMut.isPending) ? "Saving..." : editingMCVideo ? "Update Video" : "Add Video"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
