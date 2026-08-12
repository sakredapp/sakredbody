/**
 * Coaching data-fetching hooks — wraps all coaching API endpoints
 * with TanStack React Query for caching, optimistic updates, and refetching.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

// ─── Types ────────────────────────────────────────────────────────────────

/**
 * ── Derived from the table, not retyped from it ───────────────────────────
 *
 * These two were hand-written interfaces that listed every column again, and
 * that is the mechanism behind the oldest complaint about this admin: a field
 * you can fill in that never reaches the database.
 *
 * The failure is completely silent and runs in either direction. Add a column
 * and forget to add it here, and the admin form can't read it back — you
 * save, reopen, the box is empty, and pressing Save again writes the blank
 * over your work. Remove a column and leave the line here, and the form
 * happily collects a value the server drops on the floor. Nothing throws in
 * either case; TypeScript is satisfied, because the lie is internally
 * consistent.
 *
 * `$inferSelect` on the Drizzle table makes the column list the single source
 * of it. A column added to shared/models/coaching.ts appears here for free,
 * and one removed becomes a compile error at every place that reads it —
 * which is the difference between a bug you find in production and one the
 * build refuses to ship. `date`/`timestamp` come back over JSON as strings,
 * so those are remapped; the rest carry through exactly.
 */
import type {
  WellnessRoutine as WellnessRoutineRow,
  RoutineHabit as RoutineHabitRow,
} from "@shared/schema";

export type WellnessRoutine = Omit<WellnessRoutineRow, "createdAt" | "updatedAt"> & {
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type RoutineHabitTemplate = Omit<RoutineHabitRow, "createdAt" | "updatedAt"> & {
  createdAt?: string | null;
  updatedAt?: string | null;
};

export interface Habit {
  id: string;
  userId: string;
  userRoutineId: string | null;
  routineHabitId: string | null;
  title: string;
  description: string | null;
  cadence: string;
  completed: boolean;
  scheduledDate: string;
  dayNumber: number | null;
  isFromRoutine: boolean;
  completedAt: string | null;

  // Joined from the habit's template by GET /api/habits/today, not stored on
  // the daily row — see the join there for why. All three are optional
  // because a custom habit somebody added themselves has no template, and
  // `/api/habits/date/:date` doesn't join them.
  recommendedTime?: string | null;
  durationMinutes?: number | null;
  icon?: string | null;
}

export interface TodayResponse {
  habits: Habit[];
  grouped: {
    daily: Habit[];
    weekly: Habit[];
    "as-needed": Habit[];
  };
  date: string;
}

export interface RangeDataPoint {
  scheduledDate: string;
  total: number;
  completed: number;
}

export interface CoachingStats {
  sakredCoins: number;
  currentStreak: number;
  longestStreak: number;
  activeRoutineId: string | null;
  routineIntensity: string;
  membershipTier: string;
  totalCompleted: number;
  totalScheduled: number;
  completionRate: number;
  activeEnrollment: UserRoutine | null;
}

export interface UserRoutine {
  id: string;
  userId: string;
  routineId: string;
  startDate: string;
  endDate: string;
  status: string;
  intensity: string;
  routine?: WellnessRoutine;
}

export interface CatalogHabit extends RoutineHabitTemplate {
  routineNames: string[];
}

export interface UserAssignedHabit {
  id: string;
  userId: string;
  routineHabitId: string | null;
  title: string;
  description: string | null;
  cadence: string;
  recommendedTime: string | null;
  isActive: boolean;
  isCustom: boolean;
}

export interface HabitDetail {
  habit: Habit;
  template: {
    detailedDescription: string | null;
    scienceExplanation: string | null;
    tips: string | null;
    expectToNotice: string | null;
    instructions: string | null;
    durationMinutes: number | null;
    recommendedTime: string | null;
  } | null;
}

// ─── User Coaching Hooks ──────────────────────────────────────────────────

export function useCoachingStats() {
  return useQuery<CoachingStats>({
    queryKey: ["/api/coaching/stats"],
    queryFn: async () => {
      const res = await fetch("/api/coaching/stats", { credentials: "include" });
      if (res.status === 401) return null;
      if (!res.ok) throw new Error("Failed to load coaching stats");
      return res.json();
    },
  });
}

export function useTodayHabits() {
  return useQuery<TodayResponse>({
    queryKey: ["/api/habits/today"],
    queryFn: async () => {
      const res = await fetch("/api/habits/today", { credentials: "include" });
      if (res.status === 401) return null;
      if (!res.ok) throw new Error("Failed to load today's habits");
      return res.json();
    },
    staleTime: 30_000,
  });
}

export function useDateHabits(date: string) {
  return useQuery<Habit[]>({
    queryKey: ["/api/habits/date", date],
    queryFn: async () => {
      const res = await fetch(`/api/habits/date/${date}`, { credentials: "include" });
      if (res.status === 401) return [];
      if (!res.ok) throw new Error("Failed to load habits for date");
      return res.json();
    },
    enabled: !!date,
  });
}

export function useHabitDetail(habitId: string | null) {
  return useQuery<HabitDetail>({
    queryKey: ["/api/habits", habitId, "detail"],
    queryFn: async () => {
      const res = await fetch(`/api/habits/${habitId}/detail`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load habit detail");
      return res.json();
    },
    enabled: !!habitId,
  });
}

export function useHabitRange(start: string, end: string) {
  return useQuery<RangeDataPoint[]>({
    queryKey: ["/api/habits/range", start, end],
    queryFn: async () => {
      const res = await fetch(`/api/habits/range?start=${start}&end=${end}`, { credentials: "include" });
      if (res.status === 401) return [];
      if (!res.ok) throw new Error("Failed to load habit range data");
      return res.json();
    },
    enabled: !!start && !!end,
  });
}

export function useToggleHabit() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ habitId, completed }: { habitId: string; completed: boolean }) => {
      const res = await apiRequest("PATCH", `/api/habits/${habitId}/toggle`, { completed });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/habits/today"] });
      queryClient.invalidateQueries({ queryKey: ["/api/coaching/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/habits/range"] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });
}

export function useReconcileHabits() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/habits/reconcile");
      return res.json();
    },
    onSuccess: (data) => {
      if (data.reconciled) {
        queryClient.invalidateQueries({ queryKey: ["/api/habits/today"] });
      }
    },
  });
}

// ─── Routine Hooks ────────────────────────────────────────────────────────

export function useRoutines() {
  return useQuery<WellnessRoutine[]>({
    queryKey: ["/api/routines"],
    queryFn: async () => {
      const res = await fetch("/api/routines", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load routines");
      return res.json();
    },
  });
}

export function useRoutineDetail(routineId: string | null) {
  return useQuery<WellnessRoutine & { habits: RoutineHabitTemplate[] }>({
    queryKey: ["/api/routines", routineId],
    queryFn: async () => {
      const res = await fetch(`/api/routines/${routineId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load routine");
      return res.json();
    },
    enabled: !!routineId,
  });
}

/**
 * The enrollment, with the routine it points at joined on.
 *
 * GET /api/routines/active has always answered `{ ...enrollment, routine }`,
 * but the hook was typed as the bare enrollment — so the one field callers
 * actually want, the plan's name, was invisible to TypeScript and every caller
 * re-declared its own shape inline.
 */
export type ActiveEnrollment = UserRoutine & {
  routine?: { name?: string | null } | null;
};

export function useActiveEnrollment() {
  return useQuery<ActiveEnrollment | null>({
    queryKey: ["/api/routines/active"],
    queryFn: async () => {
      const res = await fetch("/api/routines/active", { credentials: "include" });
      if (res.status === 401) return null;
      if (!res.ok) throw new Error("Failed to load active enrollment");
      return res.json();
    },
  });
}

/**
 * Does this member actually have a coach's plan?
 *
 * The one place that answer is computed, because the app kept disagreeing with
 * itself about it: Home already hid its lead card when there was no plan, while
 * the More sheet listed "Coach's Plan — what your coach has you on" to everyone
 * and opened an empty checklist. A member with no coach was being shown a door
 * to a room that does not exist for them.
 *
 * Most members do not have a plan, and the app has to be worth opening anyway.
 * So this is not a loading flag with a fallback — it is the fact, and the UI is
 * expected to be complete in both of its states rather than treating the
 * planless one as a degraded version of the real thing.
 *
 * `false` while the request is in flight, deliberately. The alternative is
 * showing the entry and withdrawing it a moment later, which reads as a glitch;
 * arriving is fine, vanishing is not.
 */
export function useHasCoachPlan(): boolean {
  const { data, isLoading } = useActiveEnrollment();
  return !isLoading && Boolean(data?.routine?.name);
}

/**
 * Is anybody actually coaching this member?
 *
 * Distinct from `useHasCoachPlan`, which asks whether a coach has written them
 * a protocol. A member can be coached without one — the conversation is the
 * service, and the plan is one of the things it produces.
 *
 * ── Why this decides whether the tab exists ──────────────────────────────
 *
 * Coach was a permanent primary destination for everyone, and for a member
 * without a coach it opened a full-height empty panel reading "Start the
 * Conversation — they'll respond here." Nobody was going to respond. An
 * unpurchased service dressed as an empty feature is worse than no entry at
 * all: it reads as something broken, or as something the member has failed to
 * use.
 *
 * Two signals, either of which is sufficient:
 *
 *   a coach's plan     somebody wrote them a protocol
 *   a coach's message  somebody has spoken to them
 *
 * The second matters on its own so that an existing thread can never vanish
 * because a protocol ended. Their own messages do not count — writing into an
 * empty room is the symptom, not the evidence.
 */
export function useHasCoach(): boolean {
  const hasPlan = useHasCoachPlan();

  const { data } = useQuery<{ senderRole?: string }[]>({
    queryKey: ["/api/coaching/messages"],
    queryFn: async () => {
      const res = await fetch("/api/coaching/messages", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    // The thread is small and the answer decides a navigation item, so it is
    // worth one request — but not worth re-asking on every remount.
    staleTime: 5 * 60_000,
  });

  return hasPlan || (data ?? []).some((m) => m.senderRole === "coach");
}

export function useEnrollmentHistory() {
  return useQuery<UserRoutine[]>({
    queryKey: ["/api/routines/history"],
    queryFn: async () => {
      const res = await fetch("/api/routines/history", { credentials: "include" });
      if (res.status === 401) return [];
      if (!res.ok) throw new Error("Failed to load enrollment history");
      return res.json();
    },
  });
}

export function useEnrollInRoutine() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: { routineId: string; startDate: string; intensity: string }) => {
      const res = await apiRequest("POST", "/api/routines/enroll", data);
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Enrolled",
        description: `${data.habitsScheduled} habits scheduled.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/routines"] });
      queryClient.invalidateQueries({ queryKey: ["/api/routines/active"] });
      queryClient.invalidateQueries({ queryKey: ["/api/coaching/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/habits/today"] });
    },
    onError: (error: Error) => {
      toast({ title: "Enrollment failed", description: error.message, variant: "destructive" });
    },
  });
}

export function usePauseRoutine() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/routines/pause");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Routine paused" });
      queryClient.invalidateQueries({ queryKey: ["/api/routines/active"] });
      queryClient.invalidateQueries({ queryKey: ["/api/coaching/stats"] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });
}

export function useAbandonRoutine() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/routines/abandon");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Routine abandoned" });
      queryClient.invalidateQueries({ queryKey: ["/api/routines/active"] });
      queryClient.invalidateQueries({ queryKey: ["/api/coaching/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/habits/today"] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });
}

// ─── Catalog Hooks ────────────────────────────────────────────────────────

export function useCatalogHabits() {
  return useQuery<CatalogHabit[]>({
    queryKey: ["/api/catalog/habits"],
    queryFn: async () => {
      const res = await fetch("/api/catalog/habits", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load catalog");
      return res.json();
    },
  });
}

export function useAssignedHabits() {
  return useQuery<UserAssignedHabit[]>({
    queryKey: ["/api/catalog/assigned"],
    queryFn: async () => {
      const res = await fetch("/api/catalog/assigned", { credentials: "include" });
      if (res.status === 401) return [];
      if (!res.ok) throw new Error("Failed to load assigned habits");
      return res.json();
    },
  });
}

export function useAssignHabit() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (routineHabitId: string) => {
      const res = await apiRequest("POST", "/api/catalog/assign", { routineHabitId });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Habit added to your routine" });
      queryClient.invalidateQueries({ queryKey: ["/api/catalog/assigned"] });
      queryClient.invalidateQueries({ queryKey: ["/api/habits/today"] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });
}

export function useCreateCustomHabit() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: { title: string; description?: string; cadence: string; recommendedTime?: string }) => {
      const res = await apiRequest("POST", "/api/catalog/custom", data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Custom habit created" });
      queryClient.invalidateQueries({ queryKey: ["/api/catalog/assigned"] });
      queryClient.invalidateQueries({ queryKey: ["/api/habits/today"] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });
}

export function useUnassignHabit() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (assignedId: string) => {
      const res = await apiRequest("DELETE", `/api/catalog/assigned/${assignedId}`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Habit removed" });
      queryClient.invalidateQueries({ queryKey: ["/api/catalog/assigned"] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });
}

// ─── Admin Hooks ──────────────────────────────────────────────────────────

export function useAdminRoutines() {
  return useQuery<WellnessRoutine[]>({
    queryKey: ["/api/admin/routines"],
    queryFn: async () => {
      const res = await fetch("/api/admin/routines", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load routines");
      return res.json();
    },
  });
}

export function useAdminRoutineHabits(routineId: string | null) {
  return useQuery<RoutineHabitTemplate[]>({
    queryKey: ["/api/admin/routines", routineId, "habits"],
    queryFn: async () => {
      const res = await fetch(`/api/admin/routines/${routineId}/habits`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load habits");
      return res.json();
    },
    enabled: !!routineId,
  });
}

export function useCreateRoutine() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await apiRequest("POST", "/api/admin/routines", data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Routine created" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/routines"] });
      queryClient.invalidateQueries({ queryKey: ["/api/routines"] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });
}

export function useUpdateRoutine() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Record<string, unknown> }) => {
      const res = await apiRequest("PATCH", `/api/admin/routines/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Routine updated" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/routines"] });
      queryClient.invalidateQueries({ queryKey: ["/api/routines"] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });
}

export function useDeleteRoutine() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/admin/routines/${id}`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Routine deleted" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/routines"] });
      queryClient.invalidateQueries({ queryKey: ["/api/routines"] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });
}

export function useCreateHabitTemplate() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await apiRequest("POST", "/api/admin/habits", data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Habit template created" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/routines"] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });
}

export function useUpdateHabitTemplate() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Record<string, unknown> }) => {
      const res = await apiRequest("PATCH", `/api/admin/habits/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Habit template updated" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/routines"] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });
}

export function useDeleteHabitTemplate() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/admin/habits/${id}`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Habit template deleted" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/routines"] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });
}
