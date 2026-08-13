/**
 * Does this member have a Coach's Plan right now?
 *
 * ── One answer, and it comes from `coaching_plans` ────────────────────────
 *
 * This used to be inferred from legacy routine enrollment (`/api/routines/active`),
 * which is a different feature wearing this one's name: enrollment is a member
 * choosing a published routine off a shelf, and a Coach's Plan is a human
 * deciding what somebody should be doing. The two were never the same fact, and
 * once `coaching_plans` became canonical they could disagree outright — the nav
 * and Home hiding a plan the member demonstrably has, or offering a door to one
 * they don't.
 *
 * So there is one reader, here, and every current-plan decision in the app calls
 * it. `useActiveEnrollment` still exists for the routines feature, which is its
 * own job; it is no longer an authority on this question.
 *
 * ── Plan UI is plan-driven, coach UI is relationship-driven ───────────────
 *
 * Deliberately not "does this member have a coach". A plan whose contracts are
 * still governing somebody's day does not stop existing because a coaching
 * arrangement lapsed — the habits are live, and making the explanation for them
 * disappear would leave a member with practices and no account of where they
 * came from. `/api/coaching/plan` answers from the plan itself for the same
 * reason.
 *
 * ── `false` while loading, on purpose ─────────────────────────────────────
 *
 * Arriving is fine; vanishing reads as a glitch. Most members have no plan and
 * the app is expected to be whole for them, so the planless state is not a
 * degraded version of the real one.
 */

import { useQuery } from "@tanstack/react-query";

export type MemberPlan = {
  id: string;
  title: string;
  focus: string | null;
  note: string | null;
  startsOn: string | null;
  endsOn: string | null;
  coach: {
    id: string;
    name: string;
    firstName: string | null;
    profileImageUrl: string | null;
  } | null;
  items: {
    routineHabitId: string;
    title: string;
    emphasis: string | null;
    /** Written to them. The coach's private note never comes down this pipe. */
    memberReason: string | null;
  }[];
};

export function useCoachPlan() {
  return useQuery<{ plan: MemberPlan | null }>({
    queryKey: ["/api/coaching/plan"],
    queryFn: async () => {
      const res = await fetch("/api/coaching/plan", { credentials: "include" });
      if (!res.ok) return { plan: null };
      return res.json();
    },
    staleTime: 5 * 60_000,
  });
}

export function useHasActiveCoachPlan(): boolean {
  const { data, isLoading } = useCoachPlan();
  return !isLoading && Boolean(data?.plan);
}
