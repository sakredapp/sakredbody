/**
 * Choosing something to track.
 *
 * Two steps, in this order, deliberately: find the thing, then say what it
 * means for you. A picker that adds on tap is faster and produces a list of
 * habits nobody has decided anything about — a protein target of whatever the
 * catalogue happened to default to, on a schedule nobody chose.
 *
 * The configure step is where the phase comes from. Every field on it becomes
 * frozen the moment it's saved, which is what makes "you were asked for 140g
 * in August" a fact rather than a reconstruction.
 */

import { useState } from "react";
import { Search, X, Watch, ArrowLeft } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { WEEKDAY_LABELS, type Schedule } from "@shared/models/habitSchedule";
import { loadClassMeta } from "@shared/models/loadClass";
import {
  useHabitCatalogue,
  useAddHabit,
  type CatalogueItem,
  type HabitConfig,
} from "./useHabits";

export function HabitPicker({
  open,
  onClose,
  emphasis,
}: {
  open: boolean;
  onClose: () => void;
  emphasis: "yin" | "yang";
}) {
  const [q, setQ] = useState("");
  const [chosen, setChosen] = useState<CatalogueItem | null>(null);
  const catalogue = useHabitCatalogue(emphasis, q, open);
  const add = useAddHabit();

  const close = () => {
    setQ("");
    setChosen(null);
    onClose();
  };

  const side = emphasis === "yin" ? "Restore" : "Build";

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">
            {chosen ? chosen.title : `Add to ${side}`}
          </DialogTitle>
        </DialogHeader>

        {chosen ? (
          <Configure
            item={chosen}
            onBack={() => setChosen(null)}
            pending={add.isPending}
            onSave={(config) =>
              add.mutate(
                { routineHabitId: chosen.id, config },
                { onSuccess: close },
              )
            }
          />
        ) : (
          <>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Magnesium, sleep, steps, sunlight…"
                className="pl-9"
                data-testid="habit-picker-search"
              />
              {q && (
                <button
                  type="button"
                  onClick={() => setQ("")}
                  aria-label="Clear search"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            <div className="space-y-1.5">
              {catalogue.isLoading &&
                [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}

              {catalogue.isError && (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  We couldn't load the list just now. Try again in a moment.
                </p>
              )}

              {catalogue.data?.length === 0 && (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  {q
                    ? `Nothing matching "${q}" on the ${side} side.`
                    : `Nothing in the ${side} catalogue yet.`}
                </p>
              )}

              {catalogue.data?.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  disabled={item.alreadyTracking === "active"}
                  onClick={() => setChosen(item)}
                  className={cn(
                    "w-full rounded-lg border border-[hsl(var(--gold))]/10 bg-card/30 px-3 py-2.5 text-left transition-colors",
                    item.alreadyTracking === "active"
                      ? "opacity-50"
                      : "hover:border-[hsl(var(--gold))]/40",
                  )}
                  data-testid={`habit-option-${item.id}`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm">{item.title}</span>
                    {item.healthMetric && (
                      <Watch className="h-3 w-3 shrink-0 text-muted-foreground" />
                    )}
                    {item.alreadyTracking === "active" && (
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        Already on it
                      </span>
                    )}
                    {item.alreadyTracking && item.alreadyTracking !== "active" && (
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        {item.alreadyTracking === "paused" ? "Paused" : "Finished"}
                      </span>
                    )}
                  </div>
                  {item.shortDescription && (
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {item.shortDescription}
                    </p>
                  )}
                  <div className="mt-1 flex flex-wrap gap-2 text-[10px] text-muted-foreground">
                    {item.loadClass && <span>{loadClassMeta(item.loadClass).label}</span>}
                    {item.priorityLevel === "foundational" && <span>· Foundational</span>}
                    {item.maxPerWeek && <span>· at most {item.maxPerWeek}× a week</span>}
                    {item.durationMinutes && <span>· {item.durationMinutes} min</span>}
                  </div>
                </button>
              ))}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * The step that writes the contract.
 *
 * Defaults come from the catalogue so that somebody who wants none of this can
 * press Add and get something sensible; every field is here so that somebody
 * who does can say it once and have it hold.
 *
 * Exported because reconfiguring is the same act: it produces a phase, from the
 * same fields, with the same rules. Two forms would be two chances for one path
 * to allow something the other refuses.
 */
export function Configure({
  item,
  onBack,
  onSave,
  pending,
  saveLabel = "Add it",
  note,
  initialSchedule,
}: {
  item: Pick<
    CatalogueItem,
    "trackingType" | "unit" | "defaultTarget" | "recommendedTime" | "shortDescription" | "healthMetric"
  >;
  onBack?: () => void;
  onSave: (c: HabitConfig) => void;
  pending: boolean;
  saveLabel?: string;
  note?: string;
  initialSchedule?: Schedule;
}) {
  const [target, setTarget] = useState<string>(
    item.defaultTarget != null ? String(item.defaultTarget) : "",
  );
  const [kind, setKind] = useState<Schedule["kind"]>(initialSchedule?.kind ?? "daily");
  const [days, setDays] = useState<number[]>(
    initialSchedule?.kind === "days_of_week" ? initialSchedule.days : [1, 3, 5],
  );
  const [count, setCount] = useState(
    initialSchedule?.kind === "times_per_week" ? initialSchedule.count : 3,
  );
  const [fixed, setFixed] = useState(false);
  const [durationDays, setDurationDays] = useState(21);
  const [time, setTime] = useState(item.recommendedTime ?? "");

  const schedule: Schedule =
    kind === "days_of_week"
      ? { kind, days }
      : kind === "times_per_week"
        ? { kind, count }
        : { kind };

  const needsTarget = item.trackingType !== "boolean";
  const targetOk = !needsTarget || (Number(target) > 0 && Number.isFinite(Number(target)));
  const daysOk = kind !== "days_of_week" || days.length > 0;

  return (
    <div className="space-y-4">
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1 text-xs text-muted-foreground"
        >
          <ArrowLeft className="h-3 w-3" /> Back to the list
        </button>
      )}

      {note && <p className="text-[11px] text-muted-foreground">{note}</p>}

      {item.shortDescription && (
        <p className="text-sm text-muted-foreground">{item.shortDescription}</p>
      )}

      {needsTarget && (
        <div className="space-y-1">
          <label className="text-sm font-medium">
            {item.healthMetric ? "Aim for" : "Your number"}
          </label>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              inputMode="decimal"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              className="w-32"
              data-testid="habit-config-target"
            />
            {item.unit && <span className="text-sm text-muted-foreground">{item.unit}</span>}
          </div>
          {item.healthMetric && (
            <p className="text-[11px] text-muted-foreground">
              Your phone answers this one — you won't have to log it.
            </p>
          )}
        </div>
      )}

      <div className="space-y-1">
        <label className="text-sm font-medium">How often</label>
        <Select value={kind} onValueChange={(v) => setKind(v as Schedule["kind"])}>
          <SelectTrigger data-testid="habit-config-schedule">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="daily">Every day</SelectItem>
            <SelectItem value="days_of_week">Certain days</SelectItem>
            <SelectItem value="times_per_week">A number of times a week</SelectItem>
            <SelectItem value="weekly">Once a week</SelectItem>
            <SelectItem value="as_needed">When I need it</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {kind === "days_of_week" && (
        <div className="flex gap-1.5">
          {WEEKDAY_LABELS.map((label, i) => (
            <button
              key={label}
              type="button"
              onClick={() =>
                setDays((d) => (d.includes(i) ? d.filter((x) => x !== i) : [...d, i].sort()))
              }
              className={cn(
                "h-9 flex-1 rounded-md border text-xs transition-colors",
                days.includes(i)
                  ? "border-[hsl(var(--gold))] bg-[hsl(var(--gold))]/10 text-foreground"
                  : "border-muted-foreground/25 text-muted-foreground",
              )}
              data-testid={`habit-config-day-${i}`}
            >
              {label[0]}
            </button>
          ))}
        </div>
      )}

      {kind === "times_per_week" && (
        <div className="flex items-center gap-2">
          <Input
            type="number"
            min={1}
            max={7}
            value={count}
            onChange={(e) => setCount(Math.max(1, Math.min(7, Number(e.target.value) || 1)))}
            className="w-20"
          />
          <span className="text-sm text-muted-foreground">times a week</span>
        </div>
      )}

      <div className="space-y-1">
        <label className="text-sm font-medium">For how long</label>
        <Select value={fixed ? "fixed" : "ongoing"} onValueChange={(v) => setFixed(v === "fixed")}>
          <SelectTrigger data-testid="habit-config-length">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ongoing">Ongoing — until I change it</SelectItem>
            <SelectItem value="fixed">A set number of days</SelectItem>
          </SelectContent>
        </Select>
        {fixed && (
          <div className="flex items-center gap-2 pt-1">
            <Input
              type="number"
              min={1}
              max={365}
              value={durationDays}
              onChange={(e) => setDurationDays(Math.max(1, Number(e.target.value) || 1))}
              className="w-20"
              data-testid="habit-config-duration"
            />
            <span className="text-sm text-muted-foreground">days</span>
          </div>
        )}
      </div>

      <div className="space-y-1">
        <label className="text-sm font-medium">When in the day</label>
        <Select value={time || "_any"} onValueChange={(v) => setTime(v === "_any" ? "" : v)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_any">Whenever it fits</SelectItem>
            <SelectItem value="Morning">Morning</SelectItem>
            <SelectItem value="Midday">Midday</SelectItem>
            <SelectItem value="Evening">Evening</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Button
        className="w-full bg-[hsl(var(--gold))] text-background hover:bg-[hsl(var(--gold))]/90"
        disabled={pending || !targetOk || !daysOk}
        onClick={() =>
          onSave({
            target: needsTarget ? Number(target) : null,
            schedule,
            phaseType: fixed ? "fixed" : "ongoing",
            durationDays: fixed ? durationDays : null,
            recommendedTime: time || null,
          })
        }
        data-testid="habit-config-save"
      >
        {pending ? "Saving…" : saveLabel}
      </Button>
    </div>
  );
}
