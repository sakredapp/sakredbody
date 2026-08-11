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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { HabitList } from "./HabitList";
import { HabitPicker, Configure } from "./HabitPicker";
import { ProposalInbox } from "./ProposalInbox";
import { useTrackedHabits, useReconfigureHabit, type ResolvedHabit } from "./useHabits";

export function HabitPanel({
  emphasis,
  title,
  emptyLine,
}: {
  emphasis: "yin" | "yang";
  title: string;
  emptyLine: string;
}) {
  const [picking, setPicking] = useState(false);
  const [editing, setEditing] = useState<ResolvedHabit | null>(null);
  const today = useTrackedHabits();
  const reconfigure = useReconfigureHabit();

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
          <HabitList habits={mine ?? []} emptyLine={emptyLine} onConfigure={setEditing} />
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

      {/* Changing the plan opens a new phase rather than editing the old one,
          which is why the copy says so out loud: what they've already logged
          keeps grading against what they were asked for at the time. */}
      <Dialog open={Boolean(editing)} onOpenChange={() => setEditing(null)}>
        <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">{editing?.title}</DialogTitle>
          </DialogHeader>
          {editing && (
            <Configure
              item={{
                trackingType: editing.trackingType,
                unit: editing.unit,
                defaultTarget: editing.target,
                recommendedTime: editing.recommendedTime,
                shortDescription: editing.shortDescription,
                healthMetric: editing.healthMetric,
              }}
              initialSchedule={editing.schedule}
              pending={reconfigure.isPending}
              saveLabel="Save the change"
              note="This starts fresh from today. Everything you've already logged stays as it was."
              onSave={(config) =>
                reconfigure.mutate(
                  { id: editing.trackedHabitId, config },
                  { onSuccess: () => setEditing(null) },
                )
              }
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
