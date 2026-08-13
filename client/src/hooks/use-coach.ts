/**
 * The coach's side of the app.
 *
 * Every one of these reads a projection the server assembled — terrain, plan,
 * habits, activity — rather than assembling one here. A React component that
 * received `target`, `entries` and `healthDays` and worked out adherence would
 * eventually disagree with the member's own screen about whether Wednesday was
 * missed, and the coach would be the last to know.
 *
 * The roster is scoped server-side by the authenticated coach's own id. There
 * is nothing to filter here and deliberately no parameter to pass: a client
 * that fetched everybody and hid the rest would be one `display:none` away from
 * handing over the membership.
 */

import { useQuery } from "@tanstack/react-query";
import type { HealthWorkout } from "@shared/schema";
import type { TerrainLean, TerrainReason } from "@shared/models/terrain";

async function read<T>(url: string, fallback?: T): Promise<T> {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) {
    if (fallback !== undefined) return fallback;
    /**
     * 404 is the deliberate answer for "not your client", so it is not special
     * -cased into something friendlier. The screen says the same thing whether
     * the member does not exist or is somebody else's, which is the point.
     */
    throw new Error(
      res.status === 404 ? "That client isn't on your roster." : "Could not load that.",
    );
  }
  return res.json();
}

export type TerrainSummary = {
  headline: string;
  lean: TerrainLean | null;
  onDate: string;
};

/**
 * Build and Restore over the last seven days.
 *
 * Two counts, never a ratio. They are complementary capacities in this model
 * rather than opposing scores, and a single number is something a coach starts
 * chasing on a member's behalf.
 */
export type WeekBalance = { build: number; restore: number; days: number };

export type ClientCard = {
  id: string;
  name: string;
  firstName: string | null;
  lastName: string | null;
  profileImageUrl: string | null;
  since: string;
  terrain: TerrainSummary | null;
  plan: { name: string | null; currentDay: number; totalDays: number } | null;
  lastMessage: { at: string | null; from: string } | null;
  /** Messages from this client the coach hasn't read. A number, and nothing else. */
  unread: number;
};

export function useMyClients() {
  return useQuery<{ clients: ClientCard[] }>({
    queryKey: ["/api/coach/clients"],
    queryFn: () => read("/api/coach/clients", { clients: [] }),
    staleTime: 60_000,
  });
}

export type MovementEntry = {
  onDate: string;
  category: string;
  source: "sakred" | "imported";
  orientation: string | null;
};

export type ClientOverview = {
  member: { id: string; name: string; profileImageUrl: string | null };
  onDate: string;
  terrain: {
    headline: string;
    lean: TerrainLean;
    /** What the reading is reasoning from, so a coach can see why. */
    reasons: TerrainReason[];
    week: { stress: number; restoration: number; sessions: number };
    hasBody: boolean;
    movement: MovementEntry[];
    onDate: string;
  };
  weekBalance: WeekBalance;
  todaysWorkouts: HealthWorkout[];
  plan: {
    name: string | null;
    description: string | null;
    intensity: string;
    startedAt: string;
    currentDay: number;
    totalDays: number;
  } | null;
  checkin: Record<string, unknown> | null;
  access: "relationship" | "admin";
};

export function useClientOverview(memberId: string | null) {
  return useQuery<ClientOverview>({
    queryKey: ["/api/coach/clients", memberId, "overview"],
    queryFn: () => read(`/api/coach/clients/${memberId}/overview`),
    enabled: Boolean(memberId),
    /**
     * Terrain is live, not frozen. A coach who left the tab open while their
     * client trained should not be reading this morning's version of them.
     */
    staleTime: 60_000,
    retry: false,
  });
}

export type ClientActivity = {
  onDate: string;
  days: number;
  workouts: HealthWorkout[];
  movement: MovementEntry[];
  weekBalance: WeekBalance;
};

export function useClientActivity(memberId: string | null, days = 30) {
  return useQuery<ClientActivity>({
    queryKey: ["/api/coach/clients", memberId, "activity", days],
    queryFn: () => read(`/api/coach/clients/${memberId}/activity?days=${days}`),
    enabled: Boolean(memberId),
    retry: false,
  });
}

/** The phase a habit is under, plus the coach's own note — never the member's view. */
export type ClientPhase = {
  trackedHabitId: string;
  status: string;
  startsOn: string;
  endsOn: string | null;
  target: number | null;
  source: string;
  assignedByUserId: string | null;
  assignedByName: string | null;
  memberReason: string | null;
  coachNote: string | null;
};

export type ResolvedHabitView = {
  id: string;
  title: string;
  emphasis: string;
  progressLabel?: string | null;
  target?: number | null;
  unit?: string | null;
  expected?: string | null;
  state?: string | null;
  [key: string]: unknown;
};

export type ClientHabits = {
  onDate: string;
  restore: ResolvedHabitView[];
  build: ResolvedHabitView[];
  phases: ClientPhase[];
};

export function useClientHabits(memberId: string | null) {
  return useQuery<ClientHabits>({
    queryKey: ["/api/coach/clients", memberId, "habits"],
    queryFn: () => read(`/api/coach/clients/${memberId}/habits`),
    enabled: Boolean(memberId),
    retry: false,
  });
}

export type ClientPlan = {
  onDate: string;
  plan: ClientOverview["plan"];
  habits: ResolvedHabitView[];
  phases: ClientPhase[];
  history: {
    id: string;
    routineId: string;
    status: string;
    startDate: string;
    endDate: string;
  }[];
};

export function useClientPlan(memberId: string | null) {
  return useQuery<ClientPlan>({
    queryKey: ["/api/coach/clients", memberId, "plan"],
    queryFn: () => read(`/api/coach/clients/${memberId}/plan`),
    enabled: Boolean(memberId),
    retry: false,
  });
}

export type ClientTrends = {
  days: Record<string, number | string>[];
  workouts: HealthWorkout[];
  connected: boolean;
  metrics: string[];
};

export function useClientTrends(memberId: string | null, days = 30) {
  return useQuery<ClientTrends>({
    queryKey: ["/api/coach/clients", memberId, "trends", days],
    queryFn: () => read(`/api/coach/clients/${memberId}/trends?days=${days}`),
    enabled: Boolean(memberId),
    retry: false,
  });
}

/*
 * The thread is read by `Conversation`, which both sides share — so there is
 * deliberately no coach-only message hook here. A second one would be a second
 * shape for one conversation.
 */
