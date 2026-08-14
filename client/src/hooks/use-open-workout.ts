/**
 * Whatever workout is currently running, wherever you are in the app.
 *
 * ── One query, one truth ──────────────────────────────────────────────────
 *
 * Build already asked this question; the banner needs the same answer on every
 * other screen. Two queries would mean two answers, and the failure mode is
 * specific and bad: a member finishes a session on Build and the strip on Home
 * keeps offering to resume a workout that ended ten minutes ago.
 *
 * So it is one query key, shared. React Query dedupes the request and any
 * invalidation moves every consumer at once.
 *
 * The session is the server's, not the navigation's. Nothing here is derived
 * from where the member happens to be standing, which is the whole point — a
 * workout is running because a row has no `finished_at`, not because a
 * particular component is mounted.
 */

import { useQuery } from "@tanstack/react-query";
import type { RunningSession } from "@/lib/startSession";

export type OpenWorkout = RunningSession & {
  /** How much has been logged, so the banner can say more than "a workout". */
  sets: number;
};

export const OPEN_WORKOUT_KEY = ["/api/training/sessions/open"] as const;

export function useOpenWorkout() {
  return useQuery<{ session: OpenWorkout | null }>({
    queryKey: OPEN_WORKOUT_KEY,
    queryFn: async () => {
      const r = await fetch("/api/training/sessions/open", { credentials: "include" });
      if (!r.ok) throw new Error("open");
      return r.json();
    },
    /**
     * Cheap, and the answer changes when the member acts on another device —
     * or when a session started on Build is finished from the banner.
     */
    staleTime: 15_000,
  });
}
