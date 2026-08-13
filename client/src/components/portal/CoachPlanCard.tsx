/**
 * What your coach has you on — and what your body is saying about it today.
 *
 * ── The tension is the point ──────────────────────────────────────────────
 *
 * Nick plans a Build week. Sarah slept 4h50m and reports heavy fatigue. There
 * are two easy answers and both are wrong: silently drop Nick's assignment, or
 * print the plan and say nothing.
 *
 * The first takes a coaching decision away from the human who made it, and the
 * member never learns it happened. The second hands somebody an instruction
 * their body is currently arguing with and calls it structure.
 *
 * So both are shown, plainly, and the member decides — which is the whole
 * proposition. Structure exists to build the capacity to read yourself, not to
 * replace it. A plan that can never be questioned produces compliance; a body
 * signal that overrides the plan without saying so produces confusion.
 */

import { useQuery } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

type MemberPlan = {
  id: string;
  title: string;
  focus: string | null;
  note: string | null;
  startsOn: string | null;
  endsOn: string | null;
  coach: { id: string; name: string; firstName: string | null; profileImageUrl: string | null } | null;
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

/**
 * Does this member have a plan from a human?
 *
 * `false` while the request is in flight, deliberately — arriving is fine,
 * vanishing is not.
 */
export function useHasActiveCoachPlan(): boolean {
  const { data, isLoading } = useCoachPlan();
  return !isLoading && Boolean(data?.plan);
}

export function CoachPlanCard({
  terrainLean,
  onOpen,
}: {
  /** The live reading. Null when nothing has synced — then there is no tension to show. */
  terrainLean?: "restore" | "build" | "either" | "unknown" | null;
  onOpen?: () => void;
}) {
  const { data } = useCoachPlan();
  const plan = data?.plan;

  // No plan is a complete state, not a degraded one. Most members have none and
  // the app is expected to be whole for them, so this says nothing at all
  // rather than printing "No plan assigned."
  if (!plan) return null;

  const buildInPlan = plan.items.some((i) => i.emphasis === "yang");
  const tension = buildInPlan && terrainLean === "restore";
  const coachName = plan.coach?.firstName || plan.coach?.name || "Your coach";

  return (
    <section
      className="rounded-xl border border-[hsl(var(--gold))]/12 bg-card/40 p-4 sm:p-5"
      data-testid="coach-plan-card"
    >
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          Coach's plan
        </p>
        {plan.endsOn && (
          <span className="text-[10px] text-muted-foreground/60">through {plan.endsOn}</span>
        )}
      </div>

      <p className="text-sm mt-2.5">
        {/* The human, named. Not "your coach has you on". */}
        <span className="text-muted-foreground">{coachName} has you on </span>
        {plan.focus || plan.title}
      </p>

      {plan.note && (
        <p className="text-xs text-muted-foreground mt-2 leading-relaxed">{plan.note}</p>
      )}

      {/*
        Both true at once, side by side.

        Not "ignore your coach" and not "ignore your body" — the two facts, and
        the person in the middle deciding. This is the moment the product is
        actually for.
      */}
      {tension && (
        <div className="mt-3 pt-3 border-t border-border/20 space-y-1">
          <p className="text-xs">
            <span className="text-muted-foreground/60">Your plan includes </span>
            Build today.
          </p>
          <p className="text-xs">
            <span className="text-muted-foreground/60">Your terrain is asking for </span>
            less.
          </p>
          <p className="text-[11px] text-muted-foreground/70 pt-0.5">
            Both are true. You're the one who knows which matters more today.
          </p>
        </div>
      )}

      {plan.items.length > 0 && (
        <div className="mt-3 space-y-0.5">
          {plan.items.slice(0, 5).map((i) => (
            <p key={i.routineHabitId} className="text-sm">
              {i.title}
            </p>
          ))}
          {plan.items.length > 5 && (
            <p className="text-[11px] text-muted-foreground">
              and {plan.items.length - 5} more
            </p>
          )}
        </div>
      )}

      {onOpen && (
        <button
          onClick={onOpen}
          className={cn(
            "flex items-center gap-0.5 text-xs text-[hsl(var(--gold))]",
            "hover:text-[hsl(var(--gold-light))] transition-colors tap-clean mt-3",
          )}
          data-testid="coach-plan-open"
        >
          Open plan
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      )}
    </section>
  );
}
