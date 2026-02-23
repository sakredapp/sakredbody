/**
 * CoachingDashboard — Main coaching experience
 *
 * Tabs: Today | Journey | Routines | Analytics
 */

import { useState, useEffect, useRef, useMemo } from "react";
import { Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  useTodayHabits,
  useToggleHabit,
  useReconcileHabits,
  useHabitDetail,
  useHabitRange,
  useRoutines,
  useRoutineDetail,
  useActiveEnrollment,
  useEnrollInRoutine,
  usePauseRoutine,
  useAbandonRoutine,
  useDateHabits,
  useCatalogHabits,
  useAssignedHabits,
  useAssignHabit,
  useCreateCustomHabit,
  useUnassignHabit,
  type Habit,
  type WellnessRoutine,
  type RangeDataPoint,
  type CatalogHabit,
} from "@/hooks/use-coaching";
import { useToast } from "@/hooks/use-toast";
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
  Check,
  Circle,
  TrendingUp,
  Calendar,
  ChevronRight,
  ChevronDown,
  Clock,
  Lock,
  Search,
  Plus,
  X,
  ArrowLeft,
  LogOut,
  Sparkles,
  BarChart3,
  Map,
  ListChecks,
  Compass,
  Pause,
  Trash2,
  Info,
  Send,
  MessageCircle,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

import sakredLogo from "@assets/full_png_image_sakred__1771268151990.png";

// ─── Date Utilities (client-side, matches shared/utils/dates) ───────────

function formatLocalDate(date?: Date): string {
  const d = date || new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function parseLocalDate(str: string): Date {
  const [y, m, d] = str.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function formatShortDate(dateStr: string): string {
  const d = parseLocalDate(dateStr);
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function formatDayLabel(dateStr: string): string {
  const d = parseLocalDate(dateStr);
  return d.toLocaleDateString("en-US", { weekday: "short" }).slice(0, 3);
}

// ─── Login Gate ───────────────────────────────────────────────────────────

function LoginGate() {
  window.location.href = "/login";
  return null;
}



// ─── Habit Card (Part 3) ─────────────────────────────────────────────────

function HabitCard({
  habit,
  onToggle,
  isPending,
}: {
  habit: Habit;
  onToggle: (id: string, completed: boolean) => void;
  isPending: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const { data: detail } = useHabitDetail(detailId);

  const handleExpand = () => {
    if (!expanded) setDetailId(habit.id);
    setExpanded(!expanded);
  };

  return (
    <Card
      className={`overflow-visible transition-all duration-200 ${habit.completed ? "opacity-70" : "hover-elevate"}`}
    >
      <CardContent className="p-3 sm:p-4">
        <div className="flex items-start gap-3">
          {/* Completion toggle */}
          <button
            onClick={() => onToggle(habit.id, !habit.completed)}
            disabled={isPending}
            className={`mt-0.5 flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all duration-200 ${
              habit.completed
                ? "bg-[hsl(var(--gold))] border-[hsl(var(--gold))]"
                : "border-muted-foreground/40 hover:border-[hsl(var(--gold))]"
            }`}
          >
            {habit.completed && <Check className="w-3.5 h-3.5 text-white" />}
          </button>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h4
                className={`text-sm font-medium ${habit.completed ? "line-through text-muted-foreground" : ""}`}
              >
                {habit.title}
              </h4>
              {habit.cadence !== "daily" && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                  {habit.cadence === "weekly" ? "Weekly" : "As Needed"}
                </Badge>
              )}
              {habit.dayNumber && (
                <span className="text-[10px] text-muted-foreground">Day {habit.dayNumber}</span>
              )}
            </div>

            {habit.description && (
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                {habit.description}
              </p>
            )}

            {/* Expand toggle for details */}
            {habit.routineHabitId && (
              <button
                onClick={handleExpand}
                className="flex items-center gap-1 text-[10px] text-muted-foreground mt-1 hover:text-foreground transition-colors"
              >
                {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                {expanded ? "Less" : "Details"}
              </button>
            )}

            {/* Expanded detail */}
            {expanded && detail?.template && (
              <div className="mt-3 space-y-2 text-xs bg-muted/50 rounded-md p-3">
                {detail.template.detailedDescription && (
                  <div>
                    <span className="font-medium text-foreground">About:</span>{" "}
                    <span className="text-muted-foreground">{detail.template.detailedDescription}</span>
                  </div>
                )}
                {detail.template.scienceExplanation && (
                  <div>
                    <span className="font-medium text-foreground">Science:</span>{" "}
                    <span className="text-muted-foreground">{detail.template.scienceExplanation}</span>
                  </div>
                )}
                {detail.template.tips && (
                  <div>
                    <span className="font-medium text-foreground">Tips:</span>{" "}
                    <span className="text-muted-foreground">{detail.template.tips}</span>
                  </div>
                )}
                {detail.template.expectToNotice && (
                  <div>
                    <span className="font-medium text-foreground">Expect to notice:</span>{" "}
                    <span className="text-muted-foreground">{detail.template.expectToNotice}</span>
                  </div>
                )}
                {detail.template.instructions && (
                  <div>
                    <span className="font-medium text-foreground">Instructions:</span>{" "}
                    <span className="text-muted-foreground">{detail.template.instructions}</span>
                  </div>
                )}
                {(detail.template.durationMinutes || detail.template.recommendedTime) && (
                  <div className="flex items-center gap-3 pt-1">
                    {detail.template.durationMinutes && (
                      <span className="flex items-center gap-1 text-muted-foreground">
                        <Clock className="w-3 h-3" /> {detail.template.durationMinutes} min
                      </span>
                    )}
                    {detail.template.recommendedTime && (
                      <span className="flex items-center gap-1 text-muted-foreground">
                        <Clock className="w-3 h-3" /> {detail.template.recommendedTime}
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>


        </div>
      </CardContent>
    </Card>
  );
}

// ─── Today Tab (Part 3) ──────────────────────────────────────────────────

export function TodayTab() {
  const { data: todayData, isLoading } = useTodayHabits();
  const toggleMutation = useToggleHabit();
  const reconcileMutation = useReconcileHabits();
  const { data: activeEnrollment } = useActiveEnrollment();

  useEffect(() => {
    reconcileMutation.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-16 w-full rounded-md" />
        ))}
      </div>
    );
  }

  if (!todayData || todayData.habits.length === 0) {
    return (
      <Card>
        <CardContent className="p-12 text-center space-y-3">
          <ListChecks className="w-12 h-12 mx-auto text-muted-foreground" />
          <div>
            <h3 className="font-display text-lg mb-1">No Habits Today</h3>
            <p className="text-sm text-muted-foreground">
              {activeEnrollment
                ? "All caught up! Check back tomorrow."
                : "Browse routines to start your wellness journey."}
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const { grouped, date } = todayData;
  const totalCount = todayData.habits.length;
  const completedCount = todayData.habits.filter((h) => h.completed).length;

  const sections = [
    { label: "Daily", habits: grouped.daily },
    { label: "Weekly", habits: grouped.weekly },
    { label: "As Needed", habits: grouped["as-needed"] },
  ].filter((s) => s.habits.length > 0);

  return (
    <div className="space-y-6">
      {/* Progress summary */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h3 className="font-display text-lg">
            {formatShortDate(date)}
          </h3>
          <p className="text-sm text-muted-foreground">
            {completedCount} of {totalCount} completed
          </p>
        </div>
        <div className="h-2 w-32 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-[hsl(var(--gold))] rounded-full transition-all duration-500"
            style={{ width: `${totalCount > 0 ? (completedCount / totalCount) * 100 : 0}%` }}
          />
        </div>
      </div>

      {/* Habit sections */}
      {sections.map((section) => (
        <div key={section.label} className="space-y-2">
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            {section.label}
          </h4>
          {section.habits.map((habit) => (
            <HabitCard
              key={habit.id}
              habit={habit}
              onToggle={(id, completed) => toggleMutation.mutate({ habitId: id, completed })}
              isPending={toggleMutation.isPending}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

// ─── Journey Map (Part 5) ────────────────────────────────────────────────

export function JourneyMap() {
  const today = formatLocalDate();
  const start = formatLocalDate(addDays(new Date(), -13));
  const { data: rangeData, isLoading } = useHabitRange(start, today);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const { data: dayHabits } = useDateHabits(selectedDate || "");

  // Generate 14 days
  const days = useMemo(() => {
    const arr: { date: string; label: string; dayOfWeek: string; isToday: boolean; isFuture: boolean }[] = [];
    for (let i = 0; i < 14; i++) {
      const d = addDays(new Date(), i - 13 + 2); // today at index 11
      const dateStr = formatLocalDate(d);
      arr.push({
        date: dateStr,
        label: String(d.getDate()),
        dayOfWeek: formatDayLabel(dateStr),
        isToday: dateStr === today,
        isFuture: d > new Date(),
      });
    }
    return arr;
  }, [today]);

  // Auto-scroll to today
  useEffect(() => {
    if (scrollRef.current) {
      const todayIndex = days.findIndex((d) => d.isToday);
      const scrollTo = todayIndex * 85 - scrollRef.current.clientWidth / 2 + 42;
      scrollRef.current.scrollTo({ left: Math.max(0, scrollTo), behavior: "smooth" });
    }
  }, [days]);

  // Build lookup
  const dataMap = useMemo(() => {
    const map: Record<string, RangeDataPoint> = {};
    rangeData?.forEach((d) => { map[d.scheduledDate] = d; });
    return map;
  }, [rangeData]);

  const getNodeState = (
    day: (typeof days)[number]
  ): "today" | "completed" | "partial" | "no-data" | "future-near" | "future-locked" => {
    if (day.isToday) return "today";
    if (day.isFuture) {
      const daysAhead = Math.ceil(
        (parseLocalDate(day.date).getTime() - new Date().getTime()) / 86400000
      );
      return daysAhead <= 2 ? "future-near" : "future-locked";
    }
    const d = dataMap[day.date];
    if (!d || d.total === 0) return "no-data";
    return d.completed >= d.total ? "completed" : "partial";
  };

  if (isLoading) {
    return <Skeleton className="h-48 w-full rounded-md" />;
  }

  return (
    <div className="space-y-4">
      <h3 className="font-display text-lg">Your Journey</h3>

      {/* Scrollable timeline */}
      <div
        ref={scrollRef}
        className="overflow-x-auto pb-4 -mx-4 px-4 scrollbar-thin"
        style={{ scrollbarWidth: "thin" }}
      >
        <div className="flex items-end gap-0" style={{ minWidth: `${14 * 85}px`, height: "180px" }}>
          {days.map((day, i) => {
            const state = getNodeState(day);
            const data = dataMap[day.date];
            // Sine wave for Y position
            const yOffset = Math.sin((i / 13) * Math.PI * 2) * 20 + 60;

            return (
              <div
                key={day.date}
                className="flex flex-col items-center"
                style={{ width: "85px", position: "relative" }}
              >
                {/* Connection line */}
                {i > 0 && (
                  <div
                    className="absolute left-0 right-1/2 h-[2px] bg-muted-foreground/20"
                    style={{ top: `${yOffset + 20}px`, right: "50%", left: "-42px", width: "85px" }}
                  />
                )}

                {/* Node */}
                <button
                  onClick={() =>
                    state !== "future-locked" && setSelectedDate(day.date === selectedDate ? null : day.date)
                  }
                  disabled={state === "future-locked"}
                  className="relative z-10 flex flex-col items-center"
                  style={{ marginTop: `${yOffset}px` }}
                >
                  <div
                    className={`rounded-full flex items-center justify-center transition-all duration-300 ${
                      state === "today"
                        ? "w-[52px] h-[52px] bg-[hsl(var(--gold))] shadow-[0_0_16px_rgba(210,170,100,0.4)] ring-2 ring-[hsl(var(--gold))]/30"
                        : state === "completed"
                          ? "w-10 h-10 bg-[hsl(var(--gold))]/80"
                          : state === "partial"
                            ? "w-10 h-10 bg-muted border-2 border-[hsl(var(--gold))]/50"
                            : state === "no-data"
                              ? "w-10 h-10 bg-muted/50"
                              : state === "future-near"
                                ? "w-10 h-10 bg-muted/30 border border-dashed border-muted-foreground/30"
                                : "w-10 h-10 bg-muted/20"
                    } ${selectedDate === day.date ? "ring-2 ring-foreground/30" : ""}`}
                  >
                    {state === "today" && data ? (
                      <span className="text-xs font-bold text-white">
                        {data.completed}/{data.total}
                      </span>
                    ) : state === "completed" ? (
                      <Check className="w-4 h-4 text-white" />
                    ) : state === "partial" && data ? (
                      <span className="text-[10px] font-medium">
                        {data.completed}/{data.total}
                      </span>
                    ) : state === "future-locked" ? (
                      <Lock className="w-3.5 h-3.5 text-muted-foreground/40" />
                    ) : state === "future-near" ? (
                      <Circle className="w-3.5 h-3.5 text-muted-foreground/40" />
                    ) : null}
                  </div>

                  <span
                    className={`text-[10px] mt-1 ${day.isToday ? "font-bold text-[hsl(var(--gold))]" : "text-muted-foreground"}`}
                  >
                    {day.dayOfWeek}
                  </span>
                  <span
                    className={`text-[10px] ${day.isToday ? "font-bold" : "text-muted-foreground"}`}
                  >
                    {day.label}
                  </span>
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Day detail modal */}
      {selectedDate && (
        <Card>
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="font-medium text-sm">{formatShortDate(selectedDate)}</h4>
              <button onClick={() => setSelectedDate(null)} className="text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>
            {dayHabits && dayHabits.length > 0 ? (
              <div className="space-y-1.5">
                {dayHabits.map((h) => (
                  <div key={h.id} className="flex items-center gap-2 text-sm">
                    <div
                      className={`w-4 h-4 rounded-full flex items-center justify-center ${
                        h.completed
                          ? "bg-[hsl(var(--gold))]"
                          : "border border-muted-foreground/40"
                      }`}
                    >
                      {h.completed && <Check className="w-2.5 h-2.5 text-white" />}
                    </div>
                    <span className={h.completed ? "text-muted-foreground line-through" : ""}>
                      {h.title}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No habits scheduled for this day.</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Routine Browser (Part 7) ────────────────────────────────────────────

export function RoutinesTab() {
  const { data: routines, isLoading } = useRoutines();
  const { data: activeEnrollment } = useActiveEnrollment();
  const enrollMutation = useEnrollInRoutine();
  const pauseMutation = usePauseRoutine();
  const abandonMutation = useAbandonRoutine();

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [selectedRoutineId, setSelectedRoutineId] = useState<string | null>(null);
  const [enrollDialogOpen, setEnrollDialogOpen] = useState(false);
  const [intensity, setIntensity] = useState("lite");
  const [startDate, setStartDate] = useState(formatLocalDate());

  const { data: routineDetail } = useRoutineDetail(selectedRoutineId);

  // Filter & group
  const filtered = useMemo(() => {
    if (!routines) return [];
    let result = routines;

    if (search) {
      const s = search.toLowerCase();
      result = result.filter(
        (r) =>
          r.name.toLowerCase().includes(s) ||
          r.description.toLowerCase().includes(s) ||
          r.category.toLowerCase().includes(s) ||
          r.searchKeywords?.some((k) => k.toLowerCase().includes(s))
      );
    }

    if (categoryFilter) {
      result = result.filter((r) => r.category === categoryFilter);
    }

    return result;
  }, [routines, search, categoryFilter]);

  // Category chips
  const categories = useMemo(() => {
    if (!routines) return [];
    return Array.from(new Set(routines.map((r) => r.category))).sort();
  }, [routines]);

  // Variant consolidation: group by base name (strip Lite/Intense suffix)
  const consolidatedGroups = useMemo(() => {
    const groups: Record<string, WellnessRoutine[]> = {};
    for (const r of filtered) {
      const base = r.name.replace(/\s*\(?(lite|intense)\)?$/i, "").trim();
      if (!groups[base]) groups[base] = [];
      groups[base].push(r);
    }
    return Object.entries(groups);
  }, [filtered]);

  const handleEnroll = () => {
    if (!selectedRoutineId) return;
    enrollMutation.mutate(
      { routineId: selectedRoutineId, startDate, intensity },
      {
        onSuccess: () => {
          setEnrollDialogOpen(false);
          setSelectedRoutineId(null);
        },
      }
    );
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-32 w-full rounded-md" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Active enrollment banner */}
      {activeEnrollment && (
        <Card className="border-[hsl(var(--gold))]/30 bg-[hsl(var(--gold))]/5">
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <h4 className="font-display text-base">
                  {activeEnrollment.routine?.name || activeEnrollment.routineId}
                </h4>
                <p className="text-xs text-muted-foreground">
                  Active since {formatShortDate(activeEnrollment.startDate)} · Ends{" "}
                  {formatShortDate(activeEnrollment.endDate)}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => pauseMutation.mutate()}
                  disabled={pauseMutation.isPending}
                >
                  <Pause className="w-3.5 h-3.5 mr-1" />
                  Pause
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => abandonMutation.mutate()}
                  disabled={abandonMutation.isPending}
                  className="text-destructive"
                >
                  <Trash2 className="w-3.5 h-3.5 mr-1" />
                  End
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Search + Category filters */}
      <div className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search routines..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
          <Badge
            variant={categoryFilter === null ? "default" : "outline"}
            className="cursor-pointer whitespace-nowrap"
            onClick={() => setCategoryFilter(null)}
          >
            All
          </Badge>
          {categories.map((cat) => (
            <Badge
              key={cat}
              variant={categoryFilter === cat ? "default" : "outline"}
              className="cursor-pointer whitespace-nowrap"
              onClick={() => setCategoryFilter(categoryFilter === cat ? null : cat)}
            >
              {cat}
            </Badge>
          ))}
        </div>
      </div>

      {/* Routine cards */}
      {consolidatedGroups.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            No routines match your search.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {consolidatedGroups.map(([baseName, variants]: [string, WellnessRoutine[]]) => {
            const primary = variants[0];
            return (
              <Card key={baseName} className="overflow-visible hover-elevate">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {primary.icon && <span className="text-lg">{primary.icon}</span>}
                        <h4 className="font-display text-base">{baseName}</h4>
                        {primary.isFeatured && (
                          <Badge className="bg-[hsl(var(--gold))]/15 text-[hsl(var(--gold))] text-[10px]">
                            Featured
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                        {primary.description}
                      </p>
                    </div>
                    <Badge variant="outline" className="text-xs whitespace-nowrap">
                      {primary.category}
                    </Badge>
                  </div>

                  <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" /> {primary.durationDays} days
                    </span>
                    {primary.tier === "premium" && (
                      <Badge className="bg-[hsl(var(--gold))]/15 text-[hsl(var(--gold))] text-[10px]">
                        Premium
                      </Badge>
                    )}
                    {variants.length > 1 && (
                      <span>{variants.length} variants</span>
                    )}
                  </div>

                  {/* Variant buttons */}
                  <div className="flex gap-2 flex-wrap">
                    {variants.map((v) => (
                      <Button
                        key={v.id}
                        size="sm"
                        variant="outline"
                        disabled={!!activeEnrollment}
                        onClick={() => {
                          setSelectedRoutineId(v.id);
                          setEnrollDialogOpen(true);
                        }}
                      >
                        {variants.length > 1 ? v.name : "Start Routine"}
                        <ChevronRight className="w-3.5 h-3.5 ml-1" />
                      </Button>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Enrollment dialog */}
      <Dialog open={enrollDialogOpen} onOpenChange={setEnrollDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">Start Routine</DialogTitle>
            <DialogDescription>
              {routineDetail?.name || "Configure your routine enrollment."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {routineDetail && (
              <>
                <p className="text-sm text-muted-foreground">{routineDetail.description}</p>

                {routineDetail.whoIsThisFor && (
                  <div className="text-sm">
                    <span className="font-medium">Who is this for:</span>{" "}
                    <span className="text-muted-foreground">{routineDetail.whoIsThisFor}</span>
                  </div>
                )}

                {routineDetail.habits && routineDetail.habits.length > 0 && (
                  <div>
                    <h5 className="text-sm font-medium mb-2">
                      Habits ({routineDetail.habits.length})
                    </h5>
                    <div className="space-y-1 max-h-40 overflow-y-auto">
                      {routineDetail.habits.map((h) => (
                        <div key={h.id} className="flex items-center gap-2 text-sm">
                          <Circle className="w-3 h-3 text-muted-foreground" />
                          <span>{h.title}</span>
                          <Badge variant="outline" className="text-[10px] px-1 py-0 ml-auto">
                            {h.intensity}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            <Separator />

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Start Date</label>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  min={formatLocalDate()}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Intensity</label>
                <Select value={intensity} onValueChange={setIntensity}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="lite">Lite</SelectItem>
                    <SelectItem value="intense">Intense</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Button
              onClick={handleEnroll}
              disabled={enrollMutation.isPending || !!activeEnrollment}
              className="w-full bg-[hsl(var(--gold))] text-white hover:bg-[hsl(var(--gold-dark))]"
            >
              {enrollMutation.isPending ? "Enrolling..." : "Begin Routine"}
            </Button>

            {activeEnrollment && (
              <p className="text-xs text-center text-destructive">
                You have an active routine. Pause or end it before starting a new one.
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Catalog Tab (Part 4: Standalone Habits) ─────────────────────────────

export function CatalogSection() {
  const { data: catalog, isLoading: catalogLoading } = useCatalogHabits();
  const { data: assigned } = useAssignedHabits();
  const assignMutation = useAssignHabit();
  const unassignMutation = useUnassignHabit();
  const createCustomMutation = useCreateCustomHabit();

  const [search, setSearch] = useState("");
  const [showCustomDialog, setShowCustomDialog] = useState(false);
  const [customTitle, setCustomTitle] = useState("");
  const [customDesc, setCustomDesc] = useState("");
  const [customCadence, setCustomCadence] = useState("daily");

  const assignedIds = useMemo(
    () => new Set(assigned?.map((a) => a.routineHabitId).filter(Boolean)),
    [assigned]
  );

  const filteredCatalog = useMemo(() => {
    if (!catalog) return [];
    if (!search) return catalog;
    const s = search.toLowerCase();
    return catalog.filter(
      (h) =>
        h.title.toLowerCase().includes(s) ||
        h.shortDescription?.toLowerCase().includes(s) ||
        h.searchKeywords?.some((k) => k.toLowerCase().includes(s))
    );
  }, [catalog, search]);

  const handleCreateCustom = () => {
    if (!customTitle.trim()) return;
    createCustomMutation.mutate(
      { title: customTitle, description: customDesc || undefined, cadence: customCadence },
      {
        onSuccess: () => {
          setShowCustomDialog(false);
          setCustomTitle("");
          setCustomDesc("");
          setCustomCadence("daily");
        },
      }
    );
  };

  return (
    <div className="space-y-6">
      {/* Assigned habits */}
      {assigned && assigned.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Your Standalone Habits
          </h4>
          {assigned.map((a) => (
            <Card key={a.id} className="overflow-visible">
              <CardContent className="p-3 flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <h5 className="text-sm font-medium">{a.title}</h5>
                  <div className="flex items-center gap-2 mt-0.5">
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                      {a.cadence}
                    </Badge>
                    {a.isCustom && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                        Custom
                      </Badge>
                    )}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => unassignMutation.mutate(a.id)}
                  disabled={unassignMutation.isPending}
                  className="text-destructive"
                >
                  <X className="w-3.5 h-3.5" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Separator />

      {/* Browse catalog */}
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Browse Habits
          </h4>
          <Button size="sm" variant="outline" onClick={() => setShowCustomDialog(true)}>
            <Plus className="w-3.5 h-3.5 mr-1" /> Custom
          </Button>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search habits..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>

        {catalogLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-16 w-full rounded-md" />
            ))}
          </div>
        ) : filteredCatalog.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">No habits found.</p>
        ) : (
          <div className="space-y-2">
            {filteredCatalog.map((h) => {
              const isAssigned = assignedIds.has(h.id);
              return (
                <Card key={h.id} className="overflow-visible">
                  <CardContent className="p-3 flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <h5 className="text-sm font-medium">{h.title}</h5>
                      {h.shortDescription && (
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                          {h.shortDescription}
                        </p>
                      )}
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                          {h.cadence}
                        </Badge>
                        {h.recommendedTime && (
                          <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                            <Clock className="w-2.5 h-2.5" />
                            {h.recommendedTime}
                          </span>
                        )}
                        {h.routineNames.length > 0 && (
                          <span className="text-[10px] text-muted-foreground">
                            from {h.routineNames.slice(0, 2).join(", ")}
                            {h.routineNames.length > 2 && ` +${h.routineNames.length - 2}`}
                          </span>
                        )}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant={isAssigned ? "secondary" : "outline"}
                      disabled={isAssigned || assignMutation.isPending}
                      onClick={() => assignMutation.mutate(h.id)}
                    >
                      {isAssigned ? (
                        <>
                          <Check className="w-3.5 h-3.5 mr-1" /> Added
                        </>
                      ) : (
                        <>
                          <Plus className="w-3.5 h-3.5 mr-1" /> Add
                        </>
                      )}
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Custom habit dialog */}
      <Dialog open={showCustomDialog} onOpenChange={setShowCustomDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">Create Custom Habit</DialogTitle>
            <DialogDescription>
              Add a personal habit to your daily routine.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Title</label>
              <Input
                value={customTitle}
                onChange={(e) => setCustomTitle(e.target.value)}
                placeholder="e.g., 10-minute stretching"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Description (optional)</label>
              <Textarea
                value={customDesc}
                onChange={(e) => setCustomDesc(e.target.value)}
                placeholder="Brief description..."
                className="resize-none"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Frequency</label>
              <Select value={customCadence} onValueChange={setCustomCadence}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="as-needed">As Needed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={handleCreateCustom}
              disabled={!customTitle.trim() || createCustomMutation.isPending}
              className="w-full bg-[hsl(var(--gold))] text-white hover:bg-[hsl(var(--gold-dark))]"
            >
              {createCustomMutation.isPending ? "Creating..." : "Create Habit"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Analytics Tab (Part 8) ──────────────────────────────────────────────

export function AnalyticsTab() {
  const [range, setRange] = useState<7 | 30 | 90>(7);
  const start = formatLocalDate(addDays(new Date(), -(range - 1)));
  const end = formatLocalDate();
  const { data: rangeData, isLoading } = useHabitRange(start, end);

  const maxTotal = useMemo(() => {
    if (!rangeData) return 1;
    return Math.max(1, ...rangeData.map((d) => Number(d.total)));
  }, [rangeData]);

  const perfectDays = useMemo(() => {
    if (!rangeData) return 0;
    return rangeData.filter((d) => Number(d.total) > 0 && Number(d.completed) >= Number(d.total)).length;
  }, [rangeData]);

  const totalCompleted = useMemo(() => {
    if (!rangeData) return 0;
    return rangeData.reduce((sum, d) => sum + Number(d.completed), 0);
  }, [rangeData]);

  const periodRate = useMemo(() => {
    if (!rangeData) return 0;
    const totalAll = rangeData.reduce((sum, d) => sum + Number(d.total), 0);
    if (totalAll === 0) return 0;
    return Math.round((totalCompleted / totalAll) * 100);
  }, [rangeData, totalCompleted]);

  if (isLoading) {
    return <Skeleton className="h-64 w-full rounded-md" />;
  }

  return (
    <div className="space-y-6">
      {/* Range selector */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h3 className="font-display text-lg">Analytics</h3>
        <div className="flex gap-1">
          {([7, 30, 90] as const).map((r) => (
            <Button
              key={r}
              size="sm"
              variant={range === r ? "default" : "outline"}
              onClick={() => setRange(r)}
              className="text-xs"
            >
              {r}d
            </Button>
          ))}
        </div>
      </div>

      {/* Stats panel */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-lg font-bold">{periodRate}%</p>
            <p className="text-[10px] text-muted-foreground">Completion</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-lg font-bold">{perfectDays}</p>
            <p className="text-[10px] text-muted-foreground">Perfect Days</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-lg font-bold">{totalCompleted}</p>
            <p className="text-[10px] text-muted-foreground">Completed</p>
          </CardContent>
        </Card>
      </div>

      {/* Bar chart */}
      {rangeData && rangeData.length > 0 ? (
        <div className="space-y-2">
          <div
            className="flex items-end gap-[2px] overflow-x-auto pb-2"
            style={{ minHeight: "160px" }}
          >
            {rangeData.map((d) => {
              const totalHeight = (Number(d.total) / maxTotal) * 140;
              const completedHeight = (Number(d.completed) / maxTotal) * 140;
              return (
                <div
                  key={d.scheduledDate}
                  className="flex flex-col items-center flex-1"
                  style={{ minWidth: range <= 7 ? "40px" : range <= 30 ? "14px" : "6px" }}
                >
                  <div className="relative w-full" style={{ height: `${totalHeight}px` }}>
                    {/* Total (background) */}
                    <div
                      className="absolute bottom-0 w-full bg-muted rounded-t"
                      style={{ height: `${totalHeight}px` }}
                    />
                    {/* Completed (gold overlay) */}
                    <div
                      className="absolute bottom-0 w-full bg-[hsl(var(--gold))] rounded-t transition-all duration-300"
                      style={{ height: `${completedHeight}px` }}
                    />
                  </div>
                  {range <= 7 && (
                    <span className="text-[9px] text-muted-foreground mt-1">
                      {formatDayLabel(d.scheduledDate)}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
          <div className="flex items-center gap-4 text-[10px] text-muted-foreground justify-center">
            <span className="flex items-center gap-1">
              <div className="w-2.5 h-2.5 rounded-sm bg-muted" /> Scheduled
            </span>
            <span className="flex items-center gap-1">
              <div className="w-2.5 h-2.5 rounded-sm bg-[hsl(var(--gold))]" /> Completed
            </span>
          </div>
        </div>
      ) : (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            No data for this period. Start a routine to track your progress!
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Coach Chat / Share Progress ─────────────────────────────────────────

interface CoachingMessageData {
  id: string;
  userId: string;
  senderRole: string;
  messageType: string;
  content: string;
  imageUrl: string | null;
  metadata: string | null;
  readAt: string | null;
  createdAt: string;
}

export function CoachChat() {
  const { toast } = useToast();
  const [messageText, setMessageText] = useState("");
  const [messageType, setMessageType] = useState<"text" | "progress_update">("text");
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const messagesQuery = useQuery<CoachingMessageData[]>({
    queryKey: ["/api/coaching/messages"],
    queryFn: async () => {
      const res = await fetch("/api/coaching/messages", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load messages");
      return res.json();
    },
    refetchInterval: 15000, // poll every 15s for new coach replies
  });

  const sendMutation = useMutation({
    mutationFn: async (data: { content: string; messageType: string }) => {
      const res = await apiRequest("POST", "/api/coaching/messages", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/coaching/messages"] });
      setMessageText("");
      setMessageType("text");
    },
    onError: () => {
      toast({ title: "Failed to send", description: "Please try again.", variant: "destructive" });
    },
  });

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messagesQuery.data]);

  const handleSend = () => {
    const text = messageText.trim();
    if (!text || sendMutation.isPending) return;
    sendMutation.mutate({ content: text, messageType });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const messages = messagesQuery.data || [];

  // Group messages by date
  const groupedMessages = useMemo(() => {
    const groups: { date: string; messages: CoachingMessageData[] }[] = [];
    let currentDate = "";
    for (const msg of messages) {
      const d = new Date(msg.createdAt).toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
      });
      if (d !== currentDate) {
        currentDate = d;
        groups.push({ date: d, messages: [msg] });
      } else {
        groups[groups.length - 1].messages.push(msg);
      }
    }
    return groups;
  }, [messages]);

  if (messagesQuery.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-64 w-full rounded-md" />
        <Skeleton className="h-16 w-full rounded-md" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-180px)] max-h-[700px]">
      {/* Header */}
      <div className="mb-4">
        <h2 className="text-lg font-display font-semibold tracking-tight">Coach</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Share updates, progress, and connect with your coach
        </p>
      </div>

      {/* Messages area */}
      <Card className="flex-1 overflow-hidden flex flex-col">
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin"
        >
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center py-12 px-4">
              <div className="w-14 h-14 rounded-full bg-[hsl(var(--gold))]/10 flex items-center justify-center mb-4">
                <MessageCircle className="w-7 h-7 text-[hsl(var(--gold))]" />
              </div>
              <h3 className="text-sm font-medium mb-1">Start the Conversation</h3>
              <p className="text-xs text-muted-foreground max-w-xs">
                Share your progress, ask questions, or send updates to your coach.
                They'll respond here.
              </p>
            </div>
          ) : (
            groupedMessages.map((group) => (
              <div key={group.date}>
                {/* Date divider */}
                <div className="flex items-center gap-3 my-3">
                  <Separator className="flex-1" />
                  <span className="text-[10px] text-muted-foreground font-medium whitespace-nowrap">
                    {group.date}
                  </span>
                  <Separator className="flex-1" />
                </div>

                {/* Messages */}
                <div className="space-y-3">
                  {group.messages.map((msg) => {
                    const isMember = msg.senderRole === "member";
                    const isProgressUpdate = msg.messageType === "progress_update";
                    const time = new Date(msg.createdAt).toLocaleTimeString("en-US", {
                      hour: "numeric",
                      minute: "2-digit",
                    });

                    return (
                      <div
                        key={msg.id}
                        className={`flex ${isMember ? "justify-end" : "justify-start"}`}
                      >
                        <div
                          className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${
                            isMember
                              ? "bg-[hsl(var(--gold))]/15 text-foreground rounded-br-md"
                              : "bg-muted text-foreground rounded-bl-md"
                          }`}
                        >
                          {/* Sender label */}
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-[10px] font-medium opacity-70">
                              {isMember ? "You" : "Coach"}
                            </span>
                            {isProgressUpdate && (
                              <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4">
                                Progress Update
                              </Badge>
                            )}
                          </div>

                          {/* Message content */}
                          <p className="text-sm whitespace-pre-wrap break-words leading-relaxed">
                            {msg.content}
                          </p>

                          {/* Timestamp */}
                          <div className={`flex ${isMember ? "justify-end" : "justify-start"} mt-1`}>
                            <span className="text-[9px] text-muted-foreground">{time}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Input area */}
        <div className="border-t border-border/50 p-3 bg-background/50">
          {/* Message type toggle */}
          <div className="flex items-center gap-1.5 mb-2">
            <button
              onClick={() => setMessageType("text")}
              className={`text-[10px] px-2.5 py-1 rounded-full transition-colors ${
                messageType === "text"
                  ? "bg-foreground text-background font-medium"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Message
            </button>
            <button
              onClick={() => setMessageType("progress_update")}
              className={`text-[10px] px-2.5 py-1 rounded-full transition-colors ${
                messageType === "progress_update"
                  ? "bg-[hsl(var(--gold))]/20 text-[hsl(var(--gold))] font-medium"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Progress Update
            </button>
          </div>

          <div className="flex items-end gap-2">
            <Textarea
              ref={textareaRef}
              value={messageText}
              onChange={e => setMessageText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                messageType === "progress_update"
                  ? "Share what you accomplished today..."
                  : "Type a message to your coach..."
              }
              className="flex-1 min-h-[44px] max-h-32 resize-none text-sm"
              rows={1}
            />
            <Button
              size="icon"
              onClick={handleSend}
              disabled={!messageText.trim() || sendMutation.isPending}
              className="h-[44px] w-[44px] shrink-0 bg-[hsl(var(--gold))] hover:bg-[hsl(var(--gold))]/80 text-background"
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}

// ─── Main Dashboard ──────────────────────────────────────────────────────

type Tab = "today" | "journey" | "routines" | "catalog" | "analytics";

export default function CoachingDashboard() {
  const { user, isLoading: authLoading, isAuthenticated, logout } = useAuth();
  const [tab, setTab] = useState<Tab>("today");

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

  const initials =
    [user?.firstName?.[0], user?.lastName?.[0]].filter(Boolean).join("") || "M";

  const tabs: { id: Tab; label: string; icon: typeof ListChecks }[] = [
    { id: "today", label: "Today", icon: ListChecks },
    { id: "journey", label: "Journey", icon: Map },
    { id: "routines", label: "Routines", icon: Compass },
    { id: "catalog", label: "Habits", icon: Sparkles },
    { id: "analytics", label: "Stats", icon: BarChart3 },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header
        className="sticky top-0 border-b border-border/50 bg-background/90 backdrop-blur-md"
        style={{ zIndex: 9999 }}
      >
        <div className="container max-w-6xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-2">
              <img src={sakredLogo} alt="Sakred Body" className="h-9 w-9 object-contain" />
            </Link>
            <span className="text-sm font-display hidden sm:inline">Coaching</span>
          </div>

          <div className="flex items-center gap-3">
            <Link href="/member">
              <Button variant="ghost" size="sm" className="text-xs">
                Retreats
              </Button>
            </Link>
            <Avatar className="w-8 h-8">
              {user?.profileImageUrl && (
                <AvatarImage src={user.profileImageUrl} alt={user.firstName || "Member"} />
              )}
              <AvatarFallback className="text-xs">{initials}</AvatarFallback>
            </Avatar>
            <Button variant="ghost" size="icon" onClick={() => logout()}>
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* Tab navigation */}
      <div className="border-b border-border/50 bg-background/50 backdrop-blur-sm sticky top-16" style={{ zIndex: 9998 }}>
        <div className="container max-w-6xl mx-auto px-4">
          <div className="flex gap-1 overflow-x-auto py-1 scrollbar-thin">
            {tabs.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={`flex items-center gap-1.5 px-3 py-2 text-sm rounded-md whitespace-nowrap transition-colors ${
                  tab === id
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

      {/* Content */}
      <div className="container max-w-3xl mx-auto px-4 py-6">
        {tab === "today" && <TodayTab />}
        {tab === "journey" && <JourneyMap />}
        {tab === "routines" && <RoutinesTab />}
        {tab === "catalog" && <CatalogSection />}
        {tab === "analytics" && <AnalyticsTab />}
      </div>
    </div>
  );
}
