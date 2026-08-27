/**
 * Entering a target, in whatever the goal is measured in.
 *
 * One component and one draft rather than seven forms. A member who starts
 * typing a rep count and then realises the goal is really about load should
 * not lose the number, and seven forms would be seven places for the same
 * rounding to be done slightly differently.
 *
 * Everything here is entry only. What the numbers mean, and whether they are a
 * valid target at all, is `draftToTarget` — which calls the same validator the
 * API does, so the form refuses exactly what the server would.
 */

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  DISTANCE_UNITS,
  FREQUENCY_WINDOWS,
  type TargetDraft,
} from "@/lib/goals";
import type { Measurement } from "@shared/models/goals";

const FIELD = "h-10 bg-background/60 border-[hsl(var(--gold))]/15";

function Labelled({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-1.5 block text-[10px] uppercase tracking-widest text-muted-foreground/70">
        {label}
      </span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-muted-foreground/60">{hint}</span>}
    </label>
  );
}

/** A row of small buttons where a native select would be one tap deeper. */
function Choice<T extends string | number>({
  value,
  options,
  onChange,
  testId,
}: {
  value: T;
  options: readonly { id: T; label: string }[];
  onChange: (next: T) => void;
  testId?: string;
}) {
  return (
    <div className="flex gap-1" data-testid={testId}>
      {options.map((o) => (
        <button
          key={String(o.id)}
          type="button"
          onClick={() => onChange(o.id)}
          data-testid={`${testId}-${o.id}`}
          className={cn(
            "tap-clean rounded-md border px-2.5 py-1.5 text-xs transition-colors",
            o.id === value
              ? "border-[hsl(var(--gold))]/40 bg-[hsl(var(--gold))]/10 text-gold"
              : "border-[hsl(var(--gold))]/12 text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function TargetFields({
  measurement,
  draft,
  onChange,
  weightUnit,
  /** "Target" when setting the goal, "Where you are now" when logging progress. */
  noun = "Target",
}: {
  measurement: Measurement;
  draft: TargetDraft;
  onChange: (next: TargetDraft) => void;
  weightUnit: "kg" | "lb";
  noun?: string;
}) {
  const set = <K extends keyof TargetDraft>(key: K, value: TargetDraft[K]) =>
    onChange({ ...draft, [key]: value });

  const distance = (
    <Labelled label="Distance">
      <div className="flex gap-2">
        <Input
          inputMode="decimal"
          value={draft.distance}
          onChange={(e) => set("distance", e.target.value)}
          placeholder="1"
          className={cn(FIELD, "flex-1")}
          data-testid="goal-distance"
        />
        <Choice
          value={draft.distanceUnit}
          options={DISTANCE_UNITS.map((u) => ({ id: u.id, label: u.label }))}
          onChange={(id) => set("distanceUnit", id)}
          testId="goal-distance-unit"
        />
      </div>
    </Labelled>
  );

  switch (measurement) {
    case "time_for_distance":
      return (
        <div className="space-y-3">
          {distance}
          <Labelled label={`${noun} time`} hint="Minutes and seconds — 6:00">
            <Input
              inputMode="numeric"
              value={draft.time}
              onChange={(e) => set("time", e.target.value)}
              placeholder="6:00"
              className={FIELD}
              data-testid="goal-time"
            />
          </Labelled>
        </div>
      );

    case "reps":
      return (
        <Labelled label={noun === "Target" ? "Repetitions" : "How many"}>
          <Input
            inputMode="numeric"
            value={draft.reps}
            onChange={(e) => set("reps", e.target.value)}
            placeholder="15"
            className={FIELD}
            data-testid="goal-reps"
          />
        </Labelled>
      );

    case "load_reps":
      return (
        <div className="grid grid-cols-2 gap-3">
          <Labelled label={`Load (${weightUnit})`}>
            <Input
              inputMode="decimal"
              value={draft.weight}
              onChange={(e) => set("weight", e.target.value)}
              placeholder={weightUnit === "lb" ? "225" : "100"}
              className={FIELD}
              data-testid="goal-weight"
            />
          </Labelled>
          <Labelled label="For how many reps">
            <Input
              inputMode="numeric"
              value={draft.reps}
              onChange={(e) => set("reps", e.target.value)}
              placeholder="1"
              className={FIELD}
              data-testid="goal-reps"
            />
          </Labelled>
        </div>
      );

    case "duration":
      return (
        <Labelled label="Minutes">
          <Input
            inputMode="numeric"
            value={draft.minutes}
            onChange={(e) => set("minutes", e.target.value)}
            placeholder="60"
            className={FIELD}
            data-testid="goal-minutes"
          />
        </Labelled>
      );

    case "distance":
      return distance;

    case "frequency":
      return (
        <div className="space-y-3">
          <Labelled label="How many times">
            <Input
              inputMode="numeric"
              value={draft.count}
              onChange={(e) => set("count", e.target.value)}
              placeholder="4"
              className={FIELD}
              data-testid="goal-count"
            />
          </Labelled>
          <Labelled label="Over">
            <Choice
              value={draft.perDays}
              options={FREQUENCY_WINDOWS.map((w) => ({ id: w.id, label: w.label }))}
              onChange={(id) => set("perDays", id)}
              testId="goal-window"
            />
          </Labelled>
        </div>
      );

    case "custom":
      return (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Labelled label="Amount">
              <Input
                inputMode="decimal"
                value={draft.amount}
                onChange={(e) => set("amount", e.target.value)}
                placeholder="3"
                className={FIELD}
                data-testid="goal-amount"
              />
            </Labelled>
            <Labelled label="Measured in">
              <Input
                value={draft.unit}
                onChange={(e) => set("unit", e.target.value)}
                placeholder="sessions"
                className={FIELD}
                data-testid="goal-unit"
              />
            </Labelled>
          </div>
          {/*
            The only kind that has to be told which way is better. Six of the
            seven know — a time goes down, a rep count goes up — and this one
            cannot be guessed from anything the member has typed.
          */}
          <Labelled label="Better is">
            <Choice
              value={draft.direction}
              options={[
                { id: "up" as const, label: "More" },
                { id: "down" as const, label: "Less" },
              ]}
              onChange={(id) => set("direction", id)}
              testId="goal-direction"
            />
          </Labelled>
        </div>
      );
  }
}
