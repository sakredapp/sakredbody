/**
 * React Query hooks for The Body Map
 */

import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import type { EnergyCentre, UserCentreReading, UserCosmology, CentreState } from "@shared/schema";

export type Reading = {
  state: CentreState;
  note: string | null;
  recordedBy: "member" | "coach";
  recordedAt: string;
};

export type MappedCentre = EnergyCentre & { reading: Reading | null };

export type CentreDetail = EnergyCentre & {
  practices: { id: string; title: string; shortDescription: string | null; action: string }[];
  protocols: { id: string; name: string; durationDays: number; isPrimary: boolean }[];
};

async function get<T>(url: string, label: string): Promise<T> {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error(`Failed to load ${label}`);
  return res.json();
}

export function useBodyMap() {
  return useQuery<MappedCentre[]>({
    queryKey: ["/api/energy/centres"],
    queryFn: () => get("/api/energy/centres", "the body map"),
  });
}

export function useCentre(id: string | null) {
  return useQuery<CentreDetail>({
    queryKey: ["/api/energy/centres", id],
    queryFn: () => get(`/api/energy/centres/${id}`, "this centre"),
    enabled: !!id,
  });
}

export function useCentreHistory(centreId: string | null) {
  return useQuery<UserCentreReading[]>({
    queryKey: ["/api/energy/readings", centreId],
    queryFn: () => get(`/api/energy/readings/${centreId}`, "this history"),
    enabled: !!centreId,
  });
}

export function useRecordReading() {
  return useMutation({
    mutationFn: async (vars: { centreId: string; state: CentreState; note?: string }) => {
      const res = await fetch("/api/energy/readings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(vars),
      });
      if (!res.ok) throw new Error("Failed to record");
      return res.json();
    },
    onSuccess: (_data, vars) => {
      // Readings are append-only, so the map's "latest per centre" has moved.
      queryClient.invalidateQueries({ queryKey: ["/api/energy/centres"] });
      queryClient.invalidateQueries({ queryKey: ["/api/energy/readings", vars.centreId] });
    },
  });
}

export function useCosmology() {
  return useQuery<UserCosmology | null>({
    queryKey: ["/api/energy/cosmology"],
    queryFn: () => get("/api/energy/cosmology", "your chart"),
  });
}

export function useSaveCosmology() {
  return useMutation({
    mutationFn: async (vars: Partial<UserCosmology>) => {
      const res = await fetch("/api/energy/cosmology", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(vars),
      });
      if (!res.ok) throw new Error("Failed to save");
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/energy/cosmology"] }),
  });
}
