/**
 * React Query hooks for the daily ritual.
 */

import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import type { AlmanacDay } from "@shared/utils/almanac";
import type { DailyIntention, UserCosmology, Frequency } from "@shared/schema";

export interface DailyNoteView {
  headline: string;
  body: string;
  invitation: string | null;
}

export interface Today {
  date: string;
  note: DailyNoteView | null;
  /** True while the written note is still being generated behind the response. */
  pending: boolean;
  intention: DailyIntention | null;
  almanac: AlmanacDay;
  /** 0–1 — how much of their chart we hold. Drives whether to invite more. */
  chartDepth: number;
}

async function get<T>(url: string, label: string): Promise<T> {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error(`Failed to load ${label}`);
  return res.json();
}

export function useToday() {
  return useQuery<Today>({
    queryKey: ["/api/daily"],
    queryFn: () => get("/api/daily", "today"),
    // While a note is being written behind the response, ask again shortly.
    // Generation was measured between 1.4s and 25.5s, so this backs off rather
    // than hammering — and it stops the moment the written note lands.
    refetchInterval: (query) => (query.state.data?.pending ? 6000 : false),
  });
}

export function useSetIntention() {
  return useMutation({
    mutationFn: async (intention: string) => {
      const res = await fetch("/api/daily/intention", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ intention }),
      });
      if (!res.ok) throw new Error("Couldn't save that");
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/daily"] }),
  });
}

export function useMarkIntentionMet() {
  return useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/daily/intention/met", {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Couldn't save that");
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/daily"] }),
  });
}

export function useChart() {
  return useQuery<UserCosmology | null>({
    queryKey: ["/api/daily/chart"],
    queryFn: () => get("/api/daily/chart", "your chart"),
  });
}

export function useSaveChart() {
  return useMutation({
    mutationFn: async (input: Record<string, unknown>) => {
      const res = await fetch("/api/daily/chart", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error((await res.json()).message ?? "Couldn't save that");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/daily/chart"] });
      // The note is written from the chart, so more chart means a better note
      // tomorrow — and the almanac in today's payload changes immediately.
      queryClient.invalidateQueries({ queryKey: ["/api/daily"] });
    },
  });
}

export function useFrequencies(moment?: string) {
  const qs = moment && moment !== "all" ? `?moment=${encodeURIComponent(moment)}` : "";
  return useQuery<Frequency[]>({
    queryKey: ["/api/frequencies", moment ?? null],
    queryFn: () => get(`/api/frequencies${qs}`, "the frequencies"),
  });
}
