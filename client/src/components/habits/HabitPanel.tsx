/**
 * One side of the lifestyle — the list, the way in, and anything a coach has
 * suggested.
 *
 * Dropped into Restore and into Build unchanged. The two sides differ in
 * exactly one thing, which is which half of the day they're about, so writing
 * them as two components would have been two places to fix every future bug.
 */

import { useState } from "react";
import { Plus } from "lucide-react";
import { Panel } from "@/components/portal/Panel";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { HabitList } from "./HabitList";
import { HabitPicker } from "./HabitPicker";
import { ProposalInbox } from "./ProposalInbox";
import { useTrackedHabits, type ResolvedHabit } from "./useHabits";

export function HabitPanel({
  emphasis,
  title,
  emptyLine,
  onConfigure,
}: {
  emphasis: "yin" | "yang";
  title: string;
  emptyLine: string;
  onConfigure?: (h: ResolvedHabit) => void;
}) {
  const [picking, setPicking] = useState(false);
  const today = useTrackedHabits();

  const mine = emphasis === "yin" ? today.data?.restore : today.data?.build;
  const adviceAt = today.data?.adviceAt ?? 5;

  return (
    <>
      <Panel title={title} data-testid={`habit-panel-${emphasis}`}>
        <ProposalInbox emphasis={emphasis} />

        {today.isLoading ? (
          <div className="space-y-1.5">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-12 w-full rounded-lg" />
            ))}
          </div>
        ) : today.isError ? (
          <p className="py-2 text-sm text-muted-foreground">
            We couldn't reach your list just now. It'll be here when the connection is.
          </p>
        ) : (
          <HabitList habits={mine ?? []} emptyLine={emptyLine} onConfigure={onConfigure} />
        )}

        <Button
          variant="ghost"
          onClick={() => setPicking(true)}
          className="mt-3 w-full justify-center text-sm text-muted-foreground hover:text-foreground"
          data-testid={`habit-add-${emphasis}`}
        >
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Add something
        </Button>

        {/* Advice, and only advice — see the note in trackedHabits.ts on why
            there is no cap. What somebody can carry is theirs to judge. */}
        {(mine?.length ?? 0) > adviceAt && (
          <p className="mt-1 text-center text-[11px] text-muted-foreground">
            Most people hold about {adviceAt} at a time. You know your own week.
          </p>
        )}
      </Panel>

      <HabitPicker open={picking} onClose={() => setPicking(false)} emphasis={emphasis} />
    </>
  );
}
