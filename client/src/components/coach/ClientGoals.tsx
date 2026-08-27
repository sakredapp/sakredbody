/**
 * What this member is trying to accomplish — the coach's view of it.
 *
 * ── Why this is not the member's screen with a different border ───────────
 *
 * A coach and a member are asking different questions of the same rows. The
 * member's screen is a place to set direction and record where they are; this
 * is a place to notice things — a target that has not moved in six weeks, a
 * goal set down the week a plan started, a best that is well past the target
 * with the goal still open.
 *
 * So the ordering is different (paused and reached first, because those are
 * the ones worth a conversation), the figures carry their dates, and the whole
 * thing is read-only apart from writing a new goal during a call. A coach who
 * wants to change somebody's target does it with them, not for them.
 *
 * ── Attribution ──────────────────────────────────────────────────────────
 *
 * A goal a coach wrote appears on the member's own screen the moment it is
 * written. There is no private coach-only target, and the API has no way to
 * make one — see server/goals/routes.ts. Something being tracked about a
 * person without their knowledge is not coaching.
 */

import { useQuery } from "@tanstack/react-query";
import { formatMeasurement, type GoalTarget, type Measurement } from "@shared/models/goals";

type CoachGoal = {
  id: string;
  title: string;
  status: string;
  measurement: Measurement;
  target: GoalTarget;
  targetDate: string | null;
  createdBy: string;
  latest: { observedAt: string; value: GoalTarget; source: string } | null;
  best: { observedAt: string; value: GoalTarget; source: string } | null;
  observations: number;
  reached: boolean;
};

const DAY = { month: "short", day: "numeric" } as const;
const when = (iso: string) => new Date(iso).toLocaleDateString(undefined, DAY);

/**
 * Paused first, then reached, then the rest.
 *
 * The two at the top are the ones a coach can act on today. A goal somebody
 * set down is often the clearest signal that a plan stopped working for them,
 * and a target reached with the goal still open is a conversation somebody has
 * been putting off.
 */
const ORDER: Record<string, number> = { paused: 0, active: 2, achieved: 3, archived: 4 };
const rank = (g: CoachGoal) => (g.status === "active" && g.reached ? 1 : (ORDER[g.status] ?? 5));

const STATUS_NOTE: Record<string, string> = {
  paused: "Set down",
  achieved: "Achieved",
  archived: "Put away",
};

export function ClientGoals({ memberId, unit }: { memberId: string; unit: "kg" | "lb" }) {
  const { data } = useQuery<CoachGoal[]>({
    queryKey: [`/api/coach/clients/${memberId}/goals`],
    staleTime: 30_000,
  });

  if (!data?.length) {
    return (
      <p className="text-sm text-muted-foreground">
        No goals set. That is a fine place to be — not everybody is working toward something
        nameable, and a goal invented to fill this space would tell you nothing.
      </p>
    );
  }

  const ordered = [...data].sort((a, b) => rank(a) - rank(b));

  return (
    <ul className="space-y-3" data-testid="coach-goals">
      {ordered.map((g) => (
        <li key={g.id} className="border-b border-[hsl(var(--gold))]/8 pb-3 last:border-0 last:pb-0">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-sm text-foreground">{g.title}</span>
            {(STATUS_NOTE[g.status] || (g.reached && g.status === "active")) && (
              <span className="shrink-0 text-[10px] uppercase tracking-widest text-muted-foreground/60">
                {STATUS_NOTE[g.status] ?? "Target reached"}
              </span>
            )}
          </div>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
            <span>
              Target{" "}
              <span className="tabular-nums text-foreground/80">
                {formatMeasurement(g.measurement, g.target, unit)}
              </span>
            </span>
            {g.best && (
              <span>
                Best{" "}
                <span className="tabular-nums text-foreground/80">
                  {formatMeasurement(g.measurement, g.best.value, unit)}
                </span>{" "}
                · {when(g.best.observedAt)}
              </span>
            )}
            {g.latest && g.latest.observedAt !== g.best?.observedAt && (
              <span>
                Latest{" "}
                <span className="tabular-nums text-foreground/80">
                  {formatMeasurement(g.measurement, g.latest.value, unit)}
                </span>{" "}
                · {when(g.latest.observedAt)}
              </span>
            )}
            {/*
              Zero observations said out loud rather than left blank. A goal
              with a target and no evidence under it is a real and common
              state — it means nobody has measured yet — and a card that simply
              omits the line makes it look like data went missing.
            */}
            {g.observations === 0 && <span className="text-muted-foreground/50">Nothing recorded yet</span>}
          </div>
        </li>
      ))}
    </ul>
  );
}
