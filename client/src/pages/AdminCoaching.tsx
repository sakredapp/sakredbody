/**
 * AdminCoaching — Admin CRUD for routines + habit templates (Part 6)
 */

import { useState, useMemo } from "react";
import { Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
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
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  Pencil,
  Trash2,
  LogOut,
  ShieldCheck,
  ArrowRight,
  ArrowLeft,
  ChevronRight,
  X,
  ListChecks,
  Sparkles,
  Calendar,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";

import sakredLogo from "@assets/full_png_image_sakred__1771268151990.png";

const CATEGORIES = [
  "Sleep",
  "Gut Health",
  "Detox",
  "Movement",
  "Mindfulness",
  "Nutrition",
  "Recovery",
  "Energy",
  "Stress",
  "Performance",
];

// ─── Auth Gates ───────────────────────────────────────────────────────────

function LoginGate() {
  window.location.href = "/login";
  return null;
}

function AccessDenied() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b border-border/50 bg-background/80 backdrop-blur-md" style={{ zIndex: 9999 }}>
        <div className="container max-w-6xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
          <Link href="/" className="font-display text-xl tracking-tight">Sakred Body</Link>
        </div>
      </header>
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="max-w-md w-full text-center space-y-6">
          <ShieldCheck className="w-12 h-12 mx-auto text-destructive" />
          <h1 className="font-display text-2xl">Access Denied</h1>
          <p className="text-muted-foreground">You need admin privileges to access this page.</p>
          <Link href="/">
            <Button variant="outline">
              <ArrowLeft className="w-4 h-4 mr-2" /> Back to Home
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

// ─── Routine Form ─────────────────────────────────────────────────────────

interface RoutineFormData {
  name: string;
  description: string;
  goal: string;
  goalDescription: string;
  durationDays: number;
  icon: string;
  color: string;
  tier: string;
  category: string;
  whoIsThisFor: string;
  whatToExpect: string;
  expectedResults: string;
  isFeatured: boolean;
  sortOrder: number;
}

const emptyRoutineForm: RoutineFormData = {
  name: "",
  description: "",
  goal: "",
  goalDescription: "",
  durationDays: 14,
  icon: "🌙",
  color: "#D4A574",
  tier: "free",
  category: "Sleep",
  whoIsThisFor: "",
  whatToExpect: "",
  expectedResults: "",
  isFeatured: false,
  sortOrder: 0,
};

function RoutineFormDialog({
  open,
  onClose,
  initial,
  onSubmit,
  isPending,
  title,
}: {
  open: boolean;
  onClose: () => void;
  initial: RoutineFormData;
  onSubmit: (data: RoutineFormData) => void;
  isPending: boolean;
  title: string;
}) {
  const [form, setForm] = useState(initial);
  const set = (key: keyof RoutineFormData, value: string | number | boolean) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1 col-span-2">
              <label className="text-sm font-medium">Name</label>
              <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Sleep Mastery" />
            </div>
            <div className="space-y-1 col-span-2">
              <label className="text-sm font-medium">Description</label>
              <Textarea
                value={form.description}
                onChange={(e) => set("description", e.target.value)}
                className="resize-none"
                rows={3}
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Category</label>
              <Select value={form.category} onValueChange={(v) => set("category", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
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
              <Input
                type="number"
                value={form.durationDays}
                onChange={(e) => set("durationDays", parseInt(e.target.value) || 14)}
                min={1}
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Sort Order</label>
              <Input
                type="number"
                value={form.sortOrder}
                onChange={(e) => set("sortOrder", parseInt(e.target.value) || 0)}
              />
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
            <input
              type="checkbox"
              checked={form.isFeatured}
              onChange={(e) => set("isFeatured", e.target.checked)}
              className="rounded"
            />
            <label className="text-sm">Featured routine</label>
          </div>

          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button
              onClick={() => onSubmit(form)}
              disabled={isPending || !form.name || !form.description}
              className="bg-[hsl(var(--gold))] text-white hover:bg-[hsl(var(--gold-dark))]"
            >
              {isPending ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Habit Template Form ──────────────────────────────────────────────────

interface HabitFormData {
  title: string;
  shortDescription: string;
  detailedDescription: string;
  instructions: string;
  scienceExplanation: string;
  tips: string;
  expectToNotice: string;
  cadence: string;
  recommendedTime: string;
  durationMinutes: number | null;
  dayStart: number | null;
  dayEnd: number | null;
  orderIndex: number;
  intensity: string;
  icon: string;
  routineId: string;
}

const emptyHabitForm: HabitFormData = {
  title: "",
  shortDescription: "",
  detailedDescription: "",
  instructions: "",
  scienceExplanation: "",
  tips: "",
  expectToNotice: "",
  cadence: "daily",
  recommendedTime: "Morning",
  durationMinutes: null,
  dayStart: 1,
  dayEnd: null,
  orderIndex: 0,
  intensity: "lite",
  icon: "",
  routineId: "",
};

function HabitFormDialog({
  open,
  onClose,
  initial,
  onSubmit,
  isPending,
  title,
  routines,
}: {
  open: boolean;
  onClose: () => void;
  initial: HabitFormData;
  onSubmit: (data: HabitFormData) => void;
  isPending: boolean;
  title: string;
  routines: WellnessRoutine[];
}) {
  const [form, setForm] = useState(initial);
  const set = (key: keyof HabitFormData, value: string | number | null) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">{title}</DialogTitle>
        </DialogHeader>
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
              <Input
                type="number"
                value={form.durationMinutes ?? ""}
                onChange={(e) => set("durationMinutes", e.target.value ? parseInt(e.target.value) : null)}
                placeholder="10"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Day Start</label>
              <Input
                type="number"
                value={form.dayStart ?? ""}
                onChange={(e) => set("dayStart", e.target.value ? parseInt(e.target.value) : null)}
                min={1}
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Day End</label>
              <Input
                type="number"
                value={form.dayEnd ?? ""}
                onChange={(e) => set("dayEnd", e.target.value ? parseInt(e.target.value) : null)}
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Order Index</label>
              <Input
                type="number"
                value={form.orderIndex}
                onChange={(e) => set("orderIndex", parseInt(e.target.value) || 0)}
              />
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
                {routines.map((r) => (
                  <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button
              onClick={() => onSubmit(form)}
              disabled={isPending || !form.title}
              className="bg-[hsl(var(--gold))] text-white hover:bg-[hsl(var(--gold-dark))]"
            >
              {isPending ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Admin Coaching Page ─────────────────────────────────────────────

type AdminView = "routines" | "habits";

export default function AdminCoaching() {
  const { user, isLoading: authLoading, isAuthenticated, logout } = useAuth();
  const { toast } = useToast();
  const [view, setView] = useState<AdminView>("routines");
  const [selectedRoutineId, setSelectedRoutineId] = useState<string | null>(null);

  // Routine CRUD
  const { data: routines, isLoading: routinesLoading } = useAdminRoutines();
  const createRoutineMutation = useCreateRoutine();
  const updateRoutineMutation = useUpdateRoutine();
  const deleteRoutineMutation = useDeleteRoutine();
  const [routineDialogOpen, setRoutineDialogOpen] = useState(false);
  const [editingRoutine, setEditingRoutine] = useState<WellnessRoutine | null>(null);

  // Habit CRUD
  const { data: habitsList, isLoading: habitsLoading } = useAdminRoutineHabits(selectedRoutineId);
  const createHabitMutation = useCreateHabitTemplate();
  const updateHabitMutation = useUpdateHabitTemplate();
  const deleteHabitMutation = useDeleteHabitTemplate();
  const [habitDialogOpen, setHabitDialogOpen] = useState(false);
  const [editingHabit, setEditingHabit] = useState<RoutineHabitTemplate | null>(null);

  // Auth checks
  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Skeleton className="h-48 w-full max-w-md rounded-md" />
      </div>
    );
  }

  if (!isAuthenticated) return <LoginGate />;
  if (user?.isAdmin !== "true") return <AccessDenied />;

  const initials = [user?.firstName?.[0], user?.lastName?.[0]].filter(Boolean).join("") || "A";

  // ── Routine handlers ─────────────────────────────────────────────

  const handleCreateRoutine = (data: RoutineFormData) => {
    createRoutineMutation.mutate(data as unknown as Record<string, unknown>, {
      onSuccess: () => setRoutineDialogOpen(false),
    });
  };

  const handleUpdateRoutine = (data: RoutineFormData) => {
    if (!editingRoutine) return;
    updateRoutineMutation.mutate(
      { id: editingRoutine.id, data: data as unknown as Record<string, unknown> },
      { onSuccess: () => { setRoutineDialogOpen(false); setEditingRoutine(null); } }
    );
  };

  const handleDeleteRoutine = (id: string) => {
    if (!confirm("Delete this routine and all its habits?")) return;
    deleteRoutineMutation.mutate(id);
  };

  // ── Habit handlers ───────────────────────────────────────────────

  const handleCreateHabit = (data: HabitFormData) => {
    const payload: Record<string, unknown> = { ...data };
    if (!data.routineId) delete payload.routineId;
    createHabitMutation.mutate(payload, {
      onSuccess: () => setHabitDialogOpen(false),
    });
  };

  const handleUpdateHabit = (data: HabitFormData) => {
    if (!editingHabit) return;
    const payload: Record<string, unknown> = { ...data };
    if (!data.routineId) delete payload.routineId;
    updateHabitMutation.mutate(
      { id: editingHabit.id, data: payload },
      { onSuccess: () => { setHabitDialogOpen(false); setEditingHabit(null); } }
    );
  };

  const handleDeleteHabit = (id: string) => {
    if (!confirm("Delete this habit template?")) return;
    deleteHabitMutation.mutate(id);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 border-b border-border/50 bg-background/90 backdrop-blur-md" style={{ zIndex: 9999 }}>
        <div className="container max-w-6xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-2">
              <img src={sakredLogo} alt="Sakred Body" className="h-9 w-9 object-contain" />
            </Link>
            <span className="font-display text-sm hidden sm:inline">Admin Coaching</span>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/admin">
              <Button variant="ghost" size="sm" className="text-xs">
                <ArrowLeft className="w-3.5 h-3.5 mr-1" /> Main Admin
              </Button>
            </Link>
            <Avatar className="w-8 h-8">
              {user?.profileImageUrl && <AvatarImage src={user.profileImageUrl} alt={user.firstName || "Admin"} />}
              <AvatarFallback className="text-xs">{initials}</AvatarFallback>
            </Avatar>
            <Button variant="ghost" size="icon" onClick={() => logout()}>
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>

      <div className="container max-w-6xl mx-auto px-4 py-8">
        {/* Tab nav */}
        <div className="flex items-center gap-4 mb-8 flex-wrap">
          <Button
            variant={view === "routines" ? "default" : "outline"}
            onClick={() => { setView("routines"); setSelectedRoutineId(null); }}
          >
            <Sparkles className="w-4 h-4 mr-1" /> Routines
          </Button>
          <Button
            variant={view === "habits" ? "default" : "outline"}
            onClick={() => setView("habits")}
          >
            <ListChecks className="w-4 h-4 mr-1" /> Habit Templates
          </Button>
        </div>

        {/* ═══════════════════════════════════════════════════════════════ */}
        {/* ROUTINES VIEW */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        {view === "routines" && (
          <div className="space-y-6">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <h2 className="font-display text-2xl">Wellness Routines</h2>
                <p className="text-sm text-muted-foreground">
                  Manage routine programs. Habits are linked via FK or junction table.
                </p>
              </div>
              <Button
                onClick={() => {
                  setEditingRoutine(null);
                  setRoutineDialogOpen(true);
                }}
                className="bg-[hsl(var(--gold))] text-white hover:bg-[hsl(var(--gold-dark))]"
              >
                <Plus className="w-4 h-4 mr-1" /> New Routine
              </Button>
            </div>

            {routinesLoading ? (
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-36 rounded-md" />
                ))}
              </div>
            ) : !routines || routines.length === 0 ? (
              <Card>
                <CardContent className="p-12 text-center text-muted-foreground">
                  No routines yet. Create your first routine above.
                </CardContent>
              </Card>
            ) : (
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {routines.map((routine) => (
                  <Card key={routine.id} className="overflow-visible hover-elevate">
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          {routine.icon && <span className="text-lg">{routine.icon}</span>}
                          <h4 className="font-display text-base">{routine.name}</h4>
                        </div>
                        <Badge variant="outline" className="text-xs">{routine.category}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground line-clamp-2">{routine.description}</p>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" /> {routine.durationDays}d
                        </span>
                        <Badge className={routine.tier === "premium" ? "bg-[hsl(var(--gold))]/15 text-[hsl(var(--gold))] text-[10px]" : "text-[10px]"}>
                          {routine.tier}
                        </Badge>
                        {routine.isFeatured && (
                          <Badge className="bg-[hsl(var(--gold))]/15 text-[hsl(var(--gold))] text-[10px]">
                            Featured
                          </Badge>
                        )}
                      </div>
                      <Separator />
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setSelectedRoutineId(routine.id);
                            setView("habits");
                          }}
                        >
                          <ListChecks className="w-3.5 h-3.5 mr-1" /> Habits
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setEditingRoutine(routine);
                            setRoutineDialogOpen(true);
                          }}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDeleteRoutine(routine.id)}
                          disabled={deleteRoutineMutation.isPending}
                          className="text-destructive"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                      <p className="text-[10px] text-muted-foreground font-mono">{routine.id}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {/* Routine form dialog */}
            <RoutineFormDialog
              open={routineDialogOpen}
              onClose={() => { setRoutineDialogOpen(false); setEditingRoutine(null); }}
              initial={
                editingRoutine
                  ? {
                      name: editingRoutine.name,
                      description: editingRoutine.description,
                      goal: editingRoutine.goal || "",
                      goalDescription: editingRoutine.goalDescription || "",
                      durationDays: editingRoutine.durationDays,
                      icon: editingRoutine.icon || "",
                      color: editingRoutine.color || "",
                      tier: editingRoutine.tier,
                      category: editingRoutine.category,
                      whoIsThisFor: editingRoutine.whoIsThisFor || "",
                      whatToExpect: editingRoutine.whatToExpect || "",
                      expectedResults: editingRoutine.expectedResults || "",
                      isFeatured: editingRoutine.isFeatured,
                      sortOrder: editingRoutine.sortOrder,
                    }
                  : emptyRoutineForm
              }
              onSubmit={editingRoutine ? handleUpdateRoutine : handleCreateRoutine}
              isPending={createRoutineMutation.isPending || updateRoutineMutation.isPending}
              title={editingRoutine ? "Edit Routine" : "Create Routine"}
            />
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════ */}
        {/* HABITS VIEW */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        {view === "habits" && (
          <div className="space-y-6">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <h2 className="font-display text-2xl">Habit Templates</h2>
                <p className="text-sm text-muted-foreground">
                  {selectedRoutineId
                    ? `Showing habits for routine: ${selectedRoutineId}`
                    : "Select a routine from the routine filter tabs below, or create a new template."}
                </p>
              </div>
              <Button
                onClick={() => {
                  setEditingHabit(null);
                  setHabitDialogOpen(true);
                }}
                className="bg-[hsl(var(--gold))] text-white hover:bg-[hsl(var(--gold-dark))]"
              >
                <Plus className="w-4 h-4 mr-1" /> New Habit
              </Button>
            </div>

            {/* Routine filter tabs */}
            {routines && routines.length > 0 && (
              <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
                <Badge
                  variant={selectedRoutineId === null ? "default" : "outline"}
                  className="cursor-pointer whitespace-nowrap"
                  onClick={() => setSelectedRoutineId(null)}
                >
                  All
                </Badge>
                {routines.map((r) => (
                  <Badge
                    key={r.id}
                    variant={selectedRoutineId === r.id ? "default" : "outline"}
                    className="cursor-pointer whitespace-nowrap"
                    onClick={() => setSelectedRoutineId(selectedRoutineId === r.id ? null : r.id)}
                  >
                    {r.icon} {r.name}
                  </Badge>
                ))}
              </div>
            )}

            {!selectedRoutineId ? (
              <Card>
                <CardContent className="p-8 text-center text-muted-foreground">
                  Select a routine above to view and manage its habits.
                </CardContent>
              </Card>
            ) : habitsLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-20 rounded-md" />
                ))}
              </div>
            ) : !habitsList || habitsList.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center text-muted-foreground">
                  No habits for this routine yet.
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {habitsList.map((habit) => (
                  <Card key={habit.id} className="overflow-visible">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            {habit.icon && <span>{habit.icon}</span>}
                            <h4 className="text-sm font-medium">{habit.title}</h4>
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                              {habit.cadence}
                            </Badge>
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                              {habit.intensity}
                            </Badge>
                            {habit.recommendedTime && (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                {habit.recommendedTime}
                              </Badge>
                            )}
                          </div>
                          {habit.shortDescription && (
                            <p className="text-xs text-muted-foreground mt-1">
                              {habit.shortDescription}
                            </p>
                          )}
                          <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground">
                            {habit.dayStart && (
                              <span>
                                Days {habit.dayStart}
                                {habit.dayEnd ? `–${habit.dayEnd}` : "+"}
                              </span>
                            )}
                            {habit.durationMinutes && <span>{habit.durationMinutes} min</span>}
                            <span className="font-mono">{habit.id.slice(0, 8)}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setEditingHabit(habit);
                              setHabitDialogOpen(true);
                            }}
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleDeleteHabit(habit.id)}
                            disabled={deleteHabitMutation.isPending}
                            className="text-destructive"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {/* Habit form dialog */}
            <HabitFormDialog
              open={habitDialogOpen}
              onClose={() => { setHabitDialogOpen(false); setEditingHabit(null); }}
              initial={
                editingHabit
                  ? {
                      title: editingHabit.title,
                      shortDescription: editingHabit.shortDescription || "",
                      detailedDescription: editingHabit.detailedDescription || "",
                      instructions: editingHabit.instructions || "",
                      scienceExplanation: editingHabit.scienceExplanation || "",
                      tips: editingHabit.tips || "",
                      expectToNotice: editingHabit.expectToNotice || "",
                      cadence: editingHabit.cadence,
                      recommendedTime: editingHabit.recommendedTime || "Morning",
                      durationMinutes: editingHabit.durationMinutes,
                      dayStart: editingHabit.dayStart,
                      dayEnd: editingHabit.dayEnd,
                      orderIndex: editingHabit.orderIndex,
                      intensity: editingHabit.intensity,
                      icon: editingHabit.icon || "",
                      routineId: editingHabit.routineId || "",
                    }
                  : { ...emptyHabitForm, routineId: selectedRoutineId || "" }
              }
              onSubmit={editingHabit ? handleUpdateHabit : handleCreateHabit}
              isPending={createHabitMutation.isPending || updateHabitMutation.isPending}
              title={editingHabit ? "Edit Habit Template" : "Create Habit Template"}
              routines={routines || []}
            />
          </div>
        )}
      </div>
    </div>
  );
}
