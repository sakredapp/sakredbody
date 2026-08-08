/**
 * React Query hooks for The Library
 */

import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import type { Ebook, EbookSection, EbookProgress } from "@shared/schema";

export type ShelfEntry = Ebook & {
  owned: boolean;
  progress: EbookProgress | null;
};

export type ReaderSection = EbookSection & { locked: boolean };

export type EbookDetail = Ebook & {
  owned: boolean;
  sections: ReaderSection[];
  pairedRoutine: { id: string; name: string; durationDays: number } | null;
  progress: EbookProgress | null;
};

async function get<T>(url: string, label: string): Promise<T> {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error(`Failed to load ${label}`);
  return res.json();
}

export function useShelf() {
  return useQuery<ShelfEntry[]>({
    queryKey: ["/api/library/ebooks"],
    queryFn: () => get("/api/library/ebooks", "the library"),
  });
}

export function useEbook(id: string | null) {
  return useQuery<EbookDetail>({
    queryKey: ["/api/library/ebooks", id],
    queryFn: () => get(`/api/library/ebooks/${id}`, "this guide"),
    enabled: !!id,
  });
}

/**
 * Progress is fire-and-forget. It's a bookmark, not a transaction — a failed
 * save costs the member a few paragraphs of scroll, and surfacing an error
 * toast for it would be worse than the loss.
 */
export function useSaveProgress() {
  return useMutation({
    mutationFn: async (vars: {
      ebookId: string;
      sectionId?: string | null;
      scrollFraction?: number;
      completed?: boolean;
    }) => {
      const { ebookId, ...body } = vars;
      const res = await fetch(`/api/library/ebooks/${ebookId}/progress`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Failed to save progress");
      return res.json();
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/library/ebooks", vars.ebookId] });
      queryClient.invalidateQueries({ queryKey: ["/api/library/ebooks"], exact: true });
    },
  });
}
