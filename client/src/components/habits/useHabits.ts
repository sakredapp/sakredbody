/**
 * The client's whole relationship with the habit loop.
 *
 * Everything here is a thin wrapper over an endpoint that already did the
 * thinking. The server sends resolved objects — `progressLabel`, `expected`,
 * `phaseDay`, `entryOp` — precisely so that no component ever computes "is
 * this due today" or "what does 148 out of 165 look like". A component that
 * asks `h.progressLabel` cannot get the arithmetic wrong; a component handed
 * a target, some entries and a health day eventually will.
 *
 * So there is deliberately no derivation in this file. If something needs
 * working out, it belongs in shared/models and the server sends the answer.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { ResolvedHabit } from "@shared/models/habitResolve";
import type { Schedule } from "@shared/models/habitSchedule";

export type { ResolvedHabit };

export type TrackedDay = {
  onDate: string;
  restore: ResolvedHabit[];
  build: ResolvedHabit[];
  adviceAt: number;
};

export type CatalogueItem = {
  id: string;
  habitKey: string | null;
  title: string;
  shortDescription: string | null;
  emphasis: string | null;
  trackingType: string;
  unit: string | null;
  defaultTarget: number | null;
  itemType: "practice" | "target" | "metric";
  healthMetric: string | null;
  loadClass: string | null;
  priorityLevel: string | null;
  maxPerWeek: number | null;
  terrainTags: string[] | null;
  recommendedTime: string | null;
  durationMinutes: number | null;
  /** 'active' | 'paused' | 'completed' when they're already on it, else null. */
  alreadyTracking: string | null;
};

export type HabitConfig = {
  target?: number | null;
  schedule?: Schedule;
  phaseType?: "ongoing" | "fixed";
  durationDays?: number | null;
  recommendedTime?: string | null;
  /** Shown to the member — the answer to "why am I doing this?". */
  memberReason?: string | null;
  /** Never shown to the member. Coach routes only; ignored on a member's own. */
  coachNote?: string | null;
};

export type Proposal = {
  id: string;
  routineHabitId: string;
  emphasis: string;
  title: string;
  shortDescription: string | null;
  reason: string | null;
  target: number | null;
  trackingType: string;
  unit: string | null;
  phaseType: string;
  durationDays: number | null;
};

const TRACKED = ["/api/habits/tracked"];

export function useTrackedHabits(onDate?: string) {
  return useQuery<TrackedDay>({
    queryKey: onDate ? [...TRACKED, onDate] : TRACKED,
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        onDate ? `/api/habits/tracked?onDate=${onDate}` : "/api/habits/tracked",
      );
      return res.json();
    },
  });
}

export function useHabitCatalogue(emphasis: "yin" | "yang", q: string, enabled: boolean) {
  return useQuery<CatalogueItem[]>({
    queryKey: ["/api/habits/catalogue", emphasis, q],
    enabled,
    queryFn: async () => {
      const params = new URLSearchParams({ emphasis });
      if (q.trim()) params.set("q", q.trim());
      const res = await apiRequest("GET", `/api/habits/catalogue?${params}`);
      return res.json();
    },
  });
}

export function useProposals() {
  return useQuery<Proposal[]>({
    queryKey: ["/api/habits/proposals"],
    queryFn: async () => (await apiRequest("GET", "/api/habits/proposals")).json(),
  });
}

/**
 * One invalidator for every mutation below.
 *
 * Adding a habit changes the tracked list; logging changes it; accepting a
 * proposal changes both lists. Refreshing everything the loop touches is
 * cheaper than a table of which mutation invalidates what, and cheaper still
 * than the bug where one of them is missing and a card shows yesterday.
 */
function useLoopInvalidation() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: TRACKED });
    qc.invalidateQueries({ queryKey: ["/api/habits/proposals"] });
    qc.invalidateQueries({ queryKey: ["/api/habits/catalogue"] });
  };
}

export function useAddHabit() {
  const invalidate = useLoopInvalidation();
  return useMutation({
    mutationFn: async (v: { routineHabitId: string; config?: HabitConfig }) =>
      (await apiRequest("POST", "/api/habits/tracked", v)).json(),
    onSuccess: invalidate,
  });
}

export function useReconfigureHabit() {
  const invalidate = useLoopInvalidation();
  return useMutation({
    mutationFn: async (v: { id: string; config: HabitConfig }) =>
      (await apiRequest("PATCH", `/api/habits/tracked/${v.id}`, v.config)).json(),
    onSuccess: invalidate,
  });
}

/**
 * Log a value.
 *
 * `op` comes from the habit the caller is rendering — the server told it
 * whether this thing accumulates or is observed, and a client that decides for
 * itself is how four taps of +20oz become 20oz on one screen and 80 on
 * another.
 */
export function useLogEntry() {
  const invalidate = useLoopInvalidation();
  return useMutation({
    mutationFn: async (v: {
      trackedHabitId: string;
      value: number;
      op: "add" | "set";
      kind?: "manual" | "override";
      onDate?: string;
      note?: string | null;
    }) => {
      const { trackedHabitId, ...body } = v;
      return (
        await apiRequest("POST", `/api/habits/tracked/${trackedHabitId}/entries`, body)
      ).json();
    },
    onSuccess: invalidate,
  });
}

/**
 * Pause, resume, finish, remove — written out rather than generated.
 *
 * A loop that calls `useMutation` from inside a helper is four hooks whose
 * order depends on a literal array, which happens to work and is one edit away
 * from not working. Four named mutations is longer and cannot break that way.
 */
export function useHabitLifecycle() {
  const invalidate = useLoopInvalidation();

  const pause = useMutation({
    mutationFn: async (id: string) =>
      (await apiRequest("POST", `/api/habits/tracked/${id}/pause`)).json(),
    onSuccess: invalidate,
  });
  const resume = useMutation({
    mutationFn: async (id: string) =>
      (await apiRequest("POST", `/api/habits/tracked/${id}/resume`)).json(),
    onSuccess: invalidate,
  });
  const complete = useMutation({
    mutationFn: async (v: { id: string; then: "stop" | "continue" }) =>
      (await apiRequest("POST", `/api/habits/tracked/${v.id}/complete`, { then: v.then })).json(),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: async (id: string) =>
      (await apiRequest("DELETE", `/api/habits/tracked/${id}`)).json(),
    onSuccess: invalidate,
  });

  return { pause, resume, complete, remove };
}

export function useProposalResponse() {
  const invalidate = useLoopInvalidation();
  return {
    accept: useMutation({
      mutationFn: async (id: string) =>
        (await apiRequest("POST", `/api/habits/proposals/${id}/accept`)).json(),
      onSuccess: invalidate,
    }),
    decline: useMutation({
      mutationFn: async (id: string) =>
        (await apiRequest("POST", `/api/habits/proposals/${id}/decline`)).json(),
      onSuccess: invalidate,
    }),
  };
}
