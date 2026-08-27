/**
 * Sessions, with everything we actually stored about them.
 *
 * Shared by the member's card and the coach's panel so a session reads the
 * same to both. It previously showed type and duration only, while
 * health_workouts was already holding distance, calories and both heart rates
 * — four columns written on every sync and displayed nowhere.
 *
 * ── Three separate claims about one session ───────────────────────────────
 *
 *   what happened   the imported event: type, duration, distance, source
 *   what it asks    Restore or Build, from CATEGORY_LOAD via the shared model
 *   how it landed   the member's own answer, and only theirs
 *
 * The first two arrive without anybody being asked anything, which is the
 * point: a member who ran this morning opens the app to a run already placed.
 * The third is offered and never required — and a session nobody answers looks
 * exactly like a session somebody answered, minus the answer.
 */

import { useState } from "react";
import type { HealthWorkout } from "@shared/schema";
import {
  effectivePlacement,
  placementOfOrientation,
  externalActivityOrientation,
  PLACEMENT_LABEL,
  WORKOUT_PLACEMENTS,
  WORKOUT_RESPONSES,
  WORKOUT_RESPONSE_LABEL,
  type WorkoutPlacement,
  type WorkoutResponse,
} from "@shared/models/training";
import { useWorkoutFeedback } from "@/hooks/use-health";
import { cn } from "@/lib/utils";

/**
 * The source, in words a member recognises.
 *
 * `sourceApp` arrives as a bundle or package id — `com.ouraring.oura`,
 * `com.strava` — which is the right thing to store and the wrong thing to show.
 * The last meaningful segment is close enough for the common cases and honest
 * about the rest: an unrecognised id becomes the platform name rather than a
 * guess at a brand.
 */
function sourceLabel(w: HealthWorkout): string {
  const platform = w.source === "healthconnect" ? "Health Connect" : "Apple Health";
  const id = w.sourceApp?.trim();
  if (!id) return platform;

  const known: Record<string, string> = {
    oura: "Oura",
    strava: "Strava",
    whoop: "WHOOP",
    garmin: "Garmin",
    peloton: "Peloton",
    nike: "Nike",
    fitbit: "Fitbit",
    apple: "Apple Watch",
    zwift: "Zwift",
  };
  const lower = id.toLowerCase();
  const match = Object.keys(known).find((k) => lower.includes(k));
  return match ? `${known[match]} via ${platform}` : platform;
}

function minutes(seconds: number | null): string | null {
  if (!seconds) return null;
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

/** Only the facts this session actually has. An empty stat is not a stat. */
function facts(w: HealthWorkout): string[] {
  const out: string[] = [];
  const t = minutes(w.durationSeconds);
  if (t) out.push(t);
  if (w.distanceMeters && w.distanceMeters > 0) {
    out.push(
      w.distanceMeters >= 1000
        ? `${(w.distanceMeters / 1000).toFixed(2)} km`
        : `${Math.round(w.distanceMeters)} m`
    );
  }
  if (w.activeCalories && w.activeCalories > 0) out.push(`${Math.round(w.activeCalories)} kcal`);
  if (w.avgHeartRate && w.avgHeartRate > 0) {
    // Max only alongside average — on its own it reads as the session's
    // intensity when it is really one spike.
    out.push(
      w.maxHeartRate && w.maxHeartRate > 0
        ? `${Math.round(w.avgHeartRate)}/${Math.round(w.maxHeartRate)} bpm`
        : `${Math.round(w.avgHeartRate)} bpm`
    );
  }
  return out;
}

const PLACEMENT_TONE: Record<WorkoutPlacement, string> = {
  build: "text-gold",
  restore: "text-[hsl(var(--element-water))]",
  both: "text-muted-foreground",
};

/** A small pill that is a button, in the two states it has. */
function Chip({
  children,
  active,
  disabled,
  onClick,
  testId,
}: {
  children: React.ReactNode;
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  testId?: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      data-testid={testId}
      className={cn(
        "rounded-full border px-2 py-0.5 text-[10px] transition-colors disabled:opacity-50",
        active
          ? "border-foreground/40 bg-foreground/10 text-foreground"
          : "border-border/40 text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function WorkoutRow({ w, editable }: { w: HealthWorkout; editable: boolean }) {
  const [openPlacement, setOpenPlacement] = useState(false);
  const feedback = useWorkoutFeedback();

  const stats = facts(w);
  const override = (w.userOrientationOverride ?? null) as WorkoutPlacement | null;
  const canonical = placementOfOrientation(externalActivityOrientation(w.workoutType));
  const placement = effectivePlacement(w.workoutType, override);
  const response = (w.userResponse ?? null) as WorkoutResponse | null;

  /**
   * Tapping the answer you already gave takes it back.
   *
   * A question about how something felt that can only ever be answered once is
   * a worse question. The clear is an explicit null rather than an omitted
   * field, which is the distinction the API is built around.
   */
  const setResponse = (value: WorkoutResponse) =>
    feedback.mutate({ id: w.id, response: response === value ? null : value });

  const setPlacement = (value: WorkoutPlacement) => {
    feedback.mutate({ id: w.id, placement: override === value ? null : value });
    setOpenPlacement(false);
  };

  return (
    <div className="border border-border/30 rounded-lg px-3 py-2 text-xs">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="capitalize truncate">{w.workoutType ?? "Workout"}</p>
          {stats.length > 0 && <p className="text-muted-foreground mt-0.5">{stats.join(" · ")}</p>}
          {/*
            Where it came from. A member who never logged this session in
            Sakred should be able to see instantly why it is here, and a coach
            reading the same list needs to know the difference between a
            session the member recorded and one a ring reported.
          */}
          <p className="text-muted-foreground/70 mt-0.5 text-[10px] truncate">{sourceLabel(w)}</p>
        </div>
        <div className="shrink-0 text-right">
          <span className="text-muted-foreground text-[11px] block">{w.onDate}</span>
          {/*
            Restore or Build. Sakred's own reading unless the member moved it,
            and absent entirely when we cannot place the activity — a guess
            here would be the app asserting something about their week that it
            does not know.
          */}
          {placement && (
            <span
              className={cn(
                "mt-1 inline-block text-[9px] uppercase tracking-widest",
                PLACEMENT_TONE[placement],
              )}
              data-testid={`workout-placement-${w.id}`}
            >
              {PLACEMENT_LABEL[placement]}
            </span>
          )}
        </div>
      </div>

      {/*
        The coach's copy: what the member said, and that they said it.
        Read-only and clearly attributed — a coach seeing "Taxed me" next to a
        session they programmed is the useful part, and it stops being useful
        the moment it could have been typed by anyone but the member.
      */}
      {!editable && (response || override) && (
        <p className="mt-1.5 text-[10px] text-muted-foreground/70">
          {[
            response ? `Member: ${WORKOUT_RESPONSE_LABEL[response].toLowerCase()}` : null,
            override ? `moved to ${PLACEMENT_LABEL[override]}` : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      )}

      {editable && (
        <div className="mt-2 space-y-1.5">
          {/*
            Asked, not demanded. The row reads the same whether or not it is
            ever answered, and nothing anywhere waits on it — no badge, no
            prompt, no count of sessions left to rate.
          */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] text-muted-foreground/70">
              {response ? "Landed" : "How did that land?"}
            </span>
            {WORKOUT_RESPONSES.map((r) => (
              <Chip
                key={r}
                active={response === r}
                disabled={feedback.isPending}
                onClick={() => setResponse(r)}
                testId={`workout-response-${r}-${w.id}`}
              >
                {WORKOUT_RESPONSE_LABEL[r]}
              </Chip>
            ))}
          </div>

          {/*
            Moving a session is a second question, and a rarer one, so it hides
            behind a word rather than sitting open. Offered whenever we placed
            the activity at all: hot power yoga and restorative yoga arrive from
            Apple as the same word, and the person who did one of them is the
            only one who knows which.
          */}
          {canonical && (
            <div className="flex flex-wrap items-center gap-1.5">
              {!openPlacement ? (
                <button
                  type="button"
                  onClick={() => setOpenPlacement(true)}
                  className="text-[10px] text-muted-foreground/70 hover:text-foreground"
                  data-testid={`workout-placement-change-${w.id}`}
                >
                  {override
                    ? `You moved this to ${PLACEMENT_LABEL[override]} · change`
                    : "Change how Sakred treats this"}
                </button>
              ) : (
                <>
                  <span className="text-[10px] text-muted-foreground/70">Treat as</span>
                  {WORKOUT_PLACEMENTS.map((p) => (
                    <Chip
                      key={p}
                      active={placement === p}
                      disabled={feedback.isPending}
                      onClick={() => setPlacement(p)}
                      testId={`workout-treat-${p}-${w.id}`}
                    >
                      {PLACEMENT_LABEL[p]}
                    </Chip>
                  ))}
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function HealthWorkouts({
  workouts,
  limit = 5,
  editable = false,
}: {
  workouts: HealthWorkout[];
  limit?: number;
  /**
   * Whether the reader is the person this happened to.
   *
   * False on the coach's panel, and not because a coach cannot be trusted: how
   * a session landed is an answer to a question only the member was asked, and
   * a coach able to fill it in would turn it into their assessment wearing the
   * member's voice.
   */
  editable?: boolean;
}) {
  if (!workouts.length) return null;

  return (
    <div className="space-y-1.5">
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Sessions</p>
      {workouts.slice(0, limit).map((w) => (
        <WorkoutRow key={w.id} w={w} editable={editable} />
      ))}
      {workouts.length > limit && (
        <p className="text-[10px] text-muted-foreground">
          and {workouts.length - limit} more in the last 30 days
        </p>
      )}
    </div>
  );
}
