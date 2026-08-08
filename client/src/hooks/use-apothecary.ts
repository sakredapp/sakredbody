/**
 * React Query hooks for The Apothecary
 */

import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import type { Product, ProductLink } from "@shared/schema";

export type ProductWithLinks = Product & { links: ProductLink[] };

export type SupplyItem = ProductWithLinks & {
  note: string | null;
  isEssential: boolean;
  attachmentId: string;
};

export interface SupplyList {
  routineId: string | null;
  routineName: string | null;
  phases: { phase: "prepare" | "clear" | "rebuild"; items: SupplyItem[] }[];
  checkedIds: string[];
}

async function get<T>(url: string, label: string): Promise<T> {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error(`Failed to load ${label}`);
  return res.json();
}

// ─── Catalog ───────────────────────────────────────────────────────────────

export function useProducts(opts?: { category?: string; q?: string }) {
  const params = new URLSearchParams();
  if (opts?.category && opts.category !== "all") params.set("category", opts.category);
  if (opts?.q?.trim()) params.set("q", opts.q.trim());
  const qs = params.toString();

  return useQuery<ProductWithLinks[]>({
    queryKey: ["/api/apothecary/products", opts?.category, opts?.q],
    queryFn: () =>
      get(`/api/apothecary/products${qs ? `?${qs}` : ""}`, "the apothecary"),
  });
}

// ─── Supply list for the active protocol ───────────────────────────────────

export function useSupplyList(routineId?: string) {
  const qs = routineId ? `?routineId=${encodeURIComponent(routineId)}` : "";
  return useQuery<SupplyList>({
    queryKey: ["/api/apothecary/supply", routineId ?? null],
    queryFn: () => get(`/api/apothecary/supply${qs}`, "your supply list"),
  });
}

// ─── Check-offs ────────────────────────────────────────────────────────────

export function useCheckoffs() {
  return useQuery<string[]>({
    queryKey: ["/api/apothecary/checkoffs"],
    queryFn: () => get("/api/apothecary/checkoffs", "your shelf"),
  });
}

/**
 * Optimistic by design — a check-off is a low-stakes toggle and a member
 * running down a list of fifteen items shouldn't wait on a round trip for each.
 * On failure the snapshot is restored.
 */
export function useToggleCheckoff() {
  return useMutation({
    mutationFn: async ({ productId, checked }: { productId: string; checked: boolean }) => {
      const res = await fetch(`/api/apothecary/checkoffs/${productId}`, {
        method: checked ? "POST" : "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to update");
      return res.json();
    },
    onMutate: async ({ productId, checked }) => {
      await queryClient.cancelQueries({ queryKey: ["/api/apothecary/checkoffs"] });
      const previous = queryClient.getQueryData<string[]>(["/api/apothecary/checkoffs"]);

      queryClient.setQueryData<string[]>(["/api/apothecary/checkoffs"], (old = []) =>
        checked ? Array.from(new Set([...old, productId])) : old.filter((id) => id !== productId),
      );

      // The supply list carries its own copy so it can render in one request.
      queryClient.setQueriesData<SupplyList>(
        { queryKey: ["/api/apothecary/supply"] },
        (old) =>
          old && {
            ...old,
            checkedIds: checked
              ? Array.from(new Set([...old.checkedIds, productId]))
              : old.checkedIds.filter((id) => id !== productId),
          },
      );

      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["/api/apothecary/checkoffs"], context.previous);
      }
      queryClient.invalidateQueries({ queryKey: ["/api/apothecary/supply"] });
    },
  });
}
