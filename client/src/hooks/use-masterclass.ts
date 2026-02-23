/**
 * React Query hooks for the Masterclass video library
 */

import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type {
  MasterclassCategory,
  MasterclassVideo,
  UserCategorySub,
} from "@shared/schema";

// ─── Categories ────────────────────────────────────────────────────────────

export function useCategories() {
  return useQuery<MasterclassCategory[]>({
    queryKey: ["/api/masterclass/categories"],
    queryFn: async () => {
      const res = await fetch("/api/masterclass/categories", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load categories");
      return res.json();
    },
  });
}

// ─── Videos ────────────────────────────────────────────────────────────────

export function useVideos(opts?: { category?: string; search?: string; subscribed?: boolean }) {
  const params = new URLSearchParams();
  if (opts?.category) params.set("category", opts.category);
  if (opts?.search) params.set("search", opts.search);
  if (opts?.subscribed) params.set("subscribed", "true");
  const qs = params.toString();

  return useQuery<MasterclassVideo[]>({
    queryKey: ["/api/masterclass/videos", opts?.category, opts?.search, opts?.subscribed],
    queryFn: async () => {
      const res = await fetch(`/api/masterclass/videos${qs ? `?${qs}` : ""}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load videos");
      return res.json();
    },
  });
}

export function useFeaturedVideos() {
  return useQuery<MasterclassVideo[]>({
    queryKey: ["/api/masterclass/videos/featured"],
    queryFn: async () => {
      const res = await fetch("/api/masterclass/videos/featured", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load featured videos");
      return res.json();
    },
  });
}

export function useVideo(id: string | null) {
  return useQuery<MasterclassVideo>({
    queryKey: ["/api/masterclass/videos", id],
    queryFn: async () => {
      const res = await fetch(`/api/masterclass/videos/${id}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load video");
      return res.json();
    },
    enabled: !!id,
  });
}

// ─── Subscriptions ─────────────────────────────────────────────────────────

export function useSubscriptions() {
  return useQuery<UserCategorySub[]>({
    queryKey: ["/api/masterclass/subscriptions"],
    queryFn: async () => {
      const res = await fetch("/api/masterclass/subscriptions", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load subscriptions");
      return res.json();
    },
  });
}

export function useSubscribe() {
  return useMutation({
    mutationFn: async (categoryId: string) => {
      const res = await apiRequest("POST", "/api/masterclass/subscriptions", { categoryId });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/masterclass/subscriptions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/masterclass/videos"] });
    },
  });
}

export function useUnsubscribe() {
  return useMutation({
    mutationFn: async (categoryId: string) => {
      const res = await apiRequest("DELETE", `/api/masterclass/subscriptions/${categoryId}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/masterclass/subscriptions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/masterclass/videos"] });
    },
  });
}
