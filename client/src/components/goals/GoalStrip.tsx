/**
 * The member's goals, small, beside what they are about to do.
 *
 * Titles and targets only — no best, no latest, no trend. Build and Restore
 * are screens about today; the goal belongs there as a reminder of direction,
 * and the moment it starts carrying figures it becomes a second Goals page in
 * the middle of a page about something else. The whole panel is a door: the
 * numbers live one tap away, where there is room for them.
 *
 * ── Why the lens does not hide anything ───────────────────────────────────
 *
 * `lens` orders rather than filters, and the server does the ordering. A
 * running goal is not irrelevant on Restore — somebody chasing a mile needs
 * their hips to open and their sleep to hold, and hiding it there would say
 * the two halves of a body are separate systems. Emphasis decides what leads.
 *
 * Renders nothing at all when there are no goals. A member who has not set one
 * should not find an empty box on Build asking them to; the invitation lives
 * on the Goals screen, where it can carry examples.
 */

import { useQuery } from "@tanstack/react-query";
import { Panel } from "@/components/portal/Panel";
import { formatMeasurement, type GoalTarget, type Measurement } from "@shared/models/goals";

type Brief = {
  id: string;
  title: string;
  emphasis: string;
  measurement: Measurement;
  target: GoalTarget;
};

/** How many fit before the panel stops being compact. */
const SHOWN = 3;

export function GoalStrip({
  lens,
  unit,
  onOpen,
}: {
  lens: "build" | "restore";
  unit: "kg" | "lb";
  onOpen?: () => void;
}) {
  const { data } = useQuery<Brief[]>({
    queryKey: [`/api/goals/brief?lens=${lens}`],
    staleTime: 60_000,
  });

  if (!data?.length) return null;

  return (
    <Panel
      title="Your goals"
      action={onOpen ? "All" : undefined}
      onAction={onOpen}
      data-testid={`goal-strip-${lens}`}
    >
      <ul className="space-y-1.5">
        {data.slice(0, SHOWN).map((g) => (
          <li key={g.id} className="flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate text-foreground">{g.title}</span>
            <span className="shrink-0 font-serif tabular-nums text-muted-foreground">
              {formatMeasurement(g.measurement, g.target, unit)}
            </span>
          </li>
        ))}
      </ul>
      {data.length > SHOWN && (
        <p className="mt-2 text-[11px] text-muted-foreground/60">
          and {data.length - SHOWN} more
        </p>
      )}
    </Panel>
  );
}
