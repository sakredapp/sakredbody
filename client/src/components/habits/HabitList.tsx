/**
 * A member's Restore or Build list, for today.
 *
 * ── Three item types, one row ─────────────────────────────────────────────
 *
 * A practice is done or not. A target is a number they enter. A metric is a
 * number their phone already knows. The temptation is three components; the
 * result of three components is three slightly different ideas of what "done"
 * looks like on the same screen.
 *
 * So: one row, and the control changes. A practice gets a tick. A target gets
 * a quick +, and a field for the real number. A metric gets neither by default
 * — it is already answered — and gains a correction affordance only when the
 * phone was silent and the thing is one a person can honestly say.
 *
 * ── What this component does not decide ───────────────────────────────────
 *
 * Whether the habit is due today, what the number means, whether the value
 * came from the phone, and what "148 / 165 g" should read as. All of that
 * arrives resolved. This file renders.
 */

import { useState } from "react";
import { Check, Plus, Watch, Pause, Play, Trash2, MoreHorizontal, Flag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useLogEntry, useHabitLifecycle, type ResolvedHabit } from "./useHabits";

export function HabitList({
  habits,
  emptyLine,
  onConfigure,
}: {
  habits: ResolvedHabit[];
  emptyLine: string;
  onConfigure?: (h: ResolvedHabit) => void;
}) {
  if (habits.length === 0) {
    return <p className="text-sm text-muted-foreground py-2">{emptyLine}</p>;
  }

  // Off-today items sink to the bottom rather than disappearing: a member who
  // set a Mon/Wed/Fri sauna should still be able to see it on Tuesday and know
  // it exists, without it reading as something they failed to do.
  const due = habits.filter((h) => h.expected !== "off");
  const notToday = habits.filter((h) => h.expected === "off");

  return (
    <div className="space-y-1.5">
      {due.map((h) => (
        <HabitRow key={h.trackedHabitId} habit={h} onConfigure={onConfigure} />
      ))}
      {notToday.length > 0 && (
        <div className="pt-3 space-y-1.5">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Not today
          </p>
          {notToday.map((h) => (
            <HabitRow key={h.trackedHabitId} habit={h} onConfigure={onConfigure} muted />
          ))}
        </div>
      )}
    </div>
  );
}

function HabitRow({
  habit: h,
  onConfigure,
  muted,
}: {
  habit: ResolvedHabit;
  onConfigure?: (h: ResolvedHabit) => void;
  muted?: boolean;
}) {
  const log = useLogEntry();
  const { pause, resume, complete, remove } = useHabitLifecycle();
  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState("");

  const done = h.progressState === "met" || h.progressState === "over";
  const busy = log.isPending;

  const send = (value: number, op: "add" | "set", kind?: "manual" | "override") =>
    log.mutate({ trackedHabitId: h.trackedHabitId, value, op, kind });

  const submitDraft = () => {
    const n = Number(draft);
    if (Number.isFinite(n) && n >= 0) {
      // A correction to something the phone answered is an override, not
      // another reading to be folded in alongside it.
      send(n, "set", h.valueSource === "health" ? "override" : undefined);
    }
    setDraft("");
    setTyping(false);
  };

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-lg border border-[hsl(var(--gold))]/10 bg-card/30 px-3 py-2.5 transition-colors",
        done && "border-[hsl(var(--gold))]/30 bg-[hsl(var(--gold))]/[0.06]",
        muted && "opacity-55",
      )}
      data-testid={`habit-row-${h.trackedHabitId}`}
    >
      {h.itemType === "practice" ? (
        <button
          type="button"
          disabled={busy || muted}
          onClick={() => send(done ? 0 : 1, "set")}
          aria-label={done ? `Undo ${h.title}` : `Mark ${h.title} done`}
          className={cn(
            "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-colors",
            done
              ? "border-[hsl(var(--gold))] bg-[hsl(var(--gold))] text-background"
              : "border-muted-foreground/40 hover:border-[hsl(var(--gold))]",
          )}
          data-testid={`habit-tick-${h.trackedHabitId}`}
        >
          {done && <Check className="h-3.5 w-3.5" />}
        </button>
      ) : (
        <div
          className={cn(
            "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border",
            done ? "border-[hsl(var(--gold))] text-[hsl(var(--gold))]" : "border-muted-foreground/25",
          )}
          aria-hidden
        >
          {h.valueSource === "health" ? (
            <Watch className="h-3 w-3" />
          ) : (
            done && <Check className="h-3.5 w-3.5" />
          )}
        </div>
      )}

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="truncate text-sm">{h.title}</span>
          {h.phaseLength && (
            <span className="shrink-0 text-[10px] uppercase tracking-wider text-muted-foreground">
              Day {h.phaseDay} of {h.phaseLength}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <span className={cn(done && "text-[hsl(var(--gold))]/80")}>{h.progressLabel}</span>
          {h.expected === "off" && <span>· {h.scheduleLabel}</span>}
          {h.expected === "open" && <span>· {h.scheduleLabel}</span>}
          {/* Said plainly, because a zero that means "your phone didn't tell
              us" and a zero that means "you didn't do it" are different news. */}
          {h.healthMissing && h.valueSource === "none" && (
            <span>· nothing from your phone yet</span>
          )}
          {h.phaseSource !== "member" && <span>· from your coach</span>}
        </div>
        {h.memberReason && (
          <p className="mt-0.5 text-[11px] italic text-muted-foreground/80">{h.memberReason}</p>
        )}
      </div>

      {h.itemType !== "practice" && !muted && (
        <div className="flex shrink-0 items-center gap-1">
          {typing ? (
            <Input
              autoFocus
              type="number"
              inputMode="decimal"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={submitDraft}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitDraft();
                if (e.key === "Escape") {
                  setDraft("");
                  setTyping(false);
                }
              }}
              placeholder={h.target ? String(h.target) : h.unit ?? ""}
              className="h-7 w-20 text-right text-sm"
              data-testid={`habit-input-${h.trackedHabitId}`}
            />
          ) : (
            <>
              {/* A quick + only makes sense for something that accumulates.
                  Nobody adds an hour to last night's sleep. */}
              {h.entryOp === "add" && h.target != null && (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => send(quickStep(h.target!), "add")}
                  className="h-7 px-2 text-xs"
                  data-testid={`habit-plus-${h.trackedHabitId}`}
                >
                  <Plus className="h-3 w-3" />
                  {formatStep(quickStep(h.target!))}
                </Button>
              )}
              {(h.valueSource !== "health" || h.manualFallbackAllowed) && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setTyping(true)}
                  className="h-7 px-2 text-xs text-muted-foreground"
                  data-testid={`habit-edit-${h.trackedHabitId}`}
                >
                  {h.valueSource === "health" ? "Correct" : "Enter"}
                </Button>
              )}
            </>
          )}
        </div>
      )}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 shrink-0 p-0 text-muted-foreground"
            aria-label={`Options for ${h.title}`}
            data-testid={`habit-menu-${h.trackedHabitId}`}
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          {h.awaitingReview && (
            <>
              <DropdownMenuItem
                onClick={() => complete.mutate({ id: h.trackedHabitId, then: "continue" })}
              >
                <Flag className="mr-2 h-3.5 w-3.5" />
                Keep going on the same terms
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => complete.mutate({ id: h.trackedHabitId, then: "stop" })}
              >
                <Check className="mr-2 h-3.5 w-3.5" />
                Finished — mark it done
              </DropdownMenuItem>
            </>
          )}
          {onConfigure && (
            <DropdownMenuItem onClick={() => onConfigure(h)}>Change the plan</DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={() => pause.mutate(h.trackedHabitId)}>
            <Pause className="mr-2 h-3.5 w-3.5" />
            Pause — days off won't count against you
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => resume.mutate(h.trackedHabitId)}>
            <Play className="mr-2 h-3.5 w-3.5" />
            Pick it back up
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-destructive"
            onClick={() => remove.mutate(h.trackedHabitId)}
          >
            <Trash2 className="mr-2 h-3.5 w-3.5" />
            Take it off my list
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

/**
 * A sensible increment, from the target.
 *
 * A quarter of the goal, rounded to something a person would say out loud —
 * 40g of a 165g protein target, 500 of a 2,000 step target. Hard-coding a step
 * per tracking type would be one more list to keep in sync with the catalogue.
 */
function quickStep(target: number): number {
  const quarter = target / 4;
  const magnitude = Math.pow(10, Math.floor(Math.log10(Math.max(quarter, 1))));
  const rounded = Math.round(quarter / (magnitude / 2)) * (magnitude / 2);
  return Math.max(rounded, 1);
}

function formatStep(n: number): string {
  return n >= 1000 ? `${n / 1000}k` : String(n);
}
