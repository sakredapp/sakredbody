/**
 * Restore — the other half of the product.
 *
 * ── Why this screen had to exist ──────────────────────────────────────────
 *
 * Restore and Build are the two forces the whole of Sakred Body is built on —
 * territories.ts has said so since it was written, in those words. But in the
 * app only one of them was a place. The Restore door on the home screen
 * pointed at `coaching`, which is Today: the daily checklist. So the product
 * presented a pair and delivered a screen and a redirect.
 *
 * That asymmetry is not cosmetic. It is the app telling a member which half it
 * takes seriously, on the screen where it introduces the philosophy.
 *
 * ── What it is, and what it deliberately is not ───────────────────────────
 *
 * Everything here is read from data that already exists: the terrain reading,
 * the health days the phone has synced, and the catalogue's own account of
 * which movement gives capacity back. Nothing is invented, and there is no new
 * checklist — Today already owns the checklist, and a second one that also
 * ticked things off would be two sources of truth about the same morning.
 *
 * No score. See TerrainToday for the argument; it applies here twice over,
 * because "recovery score" is the single most over-claimed number in this
 * category of app.
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Moon, Wind, HeartPulse } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { seedOpenWorkout } from "@/hooks/use-open-workout";
import { type RunningSession } from "@/lib/startSession";
import { useWorkoutSheet } from "@/components/build/WorkoutSheet";
import { RestoreMemory } from "@/components/build/TrainingMemory";
import { RecentSessions } from "@/components/build/RecentSessions";
import { TodayRead } from "@/components/TodayRead";
import { RhythmSection } from "@/components/RhythmCards";
import { Panel, SectionHeading } from "@/components/portal/Panel";
import { GoalStrip } from "@/components/goals/GoalStrip";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useHealthConnection, useHealthSummary } from "@/hooks/use-health";
import { EXERCISE_CATEGORIES, CATEGORY_LOAD } from "@shared/models/training";
import { categoryLabel, healthActivityLabel } from "@shared/models/labels";
import { HabitPanel } from "@/components/habits/HabitPanel";
import { TerrainCheckin } from "@/components/habits/TerrainCheckin";
import type { MemberSection } from "@/components/MemberNav";
import { cn } from "@/lib/utils";

type MovementEntry = {
  /** Stable per event, so rows key on identity rather than on position. */
  id?: string;
  onDate: string;
  category: string;
  /**
   * Every category one event contributed to, when the row is an event rather
   * than a projection. A logged session can be several things at once without
   * being several sessions.
   */
  categories?: string[];
  orientations?: ("yin" | "yang" | "both" | "neutral")[];
  /** What the member would call it, when the source gave us a name. */
  activity: string | null;
  orientation: "yin" | "yang" | "both" | "neutral";
  source: "sakred" | "imported";
};

type Reading = {
  lean: "restore" | "build" | "either" | "unknown";
  headline: string;
  reasons: { source: "measured" | "reported"; text: string; pulls: "restore" | "build" }[];
  week: { stress: number; restoration: number; sessions: number };
  /** The (day, category) projection the reading reasons over. Not a diary. */
  movement?: MovementEntry[];
  /** What actually happened, every event, deterministically ordered. */
  movementEvents?: MovementEntry[];
  hasBody: boolean;
};

const CATEGORY_LABEL = new Map(EXERCISE_CATEGORIES.map((c) => [c.id as string, c.label as string]));

/**
 * A stable calendar date, localized.
 *
 * This used to say "today", "yesterday", then the weekday. That reads well in a
 * sentence and badly in a list: three rows of "Monday", "Tuesday", "yesterday"
 * give no way to tell which week you are looking at, and "Monday" is ambiguous
 * the moment the list reaches back more than seven days. History wants a date.
 */
function whenShort(onDate: string): string {
  return new Date(`${onDate}T12:00:00`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

/**
 * What you are recovering from, and what you have done about it.
 *
 * ── Two lists, and the distinction between them is the point ──────────────
 *
 * Demanding work belongs on this screen as *context*. A hard week is the reason
 * Restore is saying what it is saying, and hiding it left the member with a
 * conclusion — "9 demanding sessions this week" — and no way to check it. When
 * that number was wrong, because every walk was counting as a session, nothing
 * on screen would have shown them why.
 *
 * But appearing here does not make a run restorative. The first list is what
 * created the demand; the second is what has answered it. Collapsing them would
 * say that training hard counts as recovery, which is the opposite of what this
 * screen is for.
 *
 * Both are grouped by category and day, because "Legs · Tuesday" is what a
 * person remembers and eight rows of individual sets is not.
 */
function MovementBehindTheReading({ movement }: { movement: MovementEntry[] }) {
  if (!movement.length) return null;

  /**
   * Any contribution that pulls a given way puts the event in that list.
   *
   * One session can be both — "Back + Mobility" really did ask something of the
   * body and give something back — and appearing in both is honest, where
   * splitting it into two rows would say the member trained twice.
   */
  const pulls = (m: MovementEntry, ways: string[]) =>
    (m.orientations ?? [m.orientation]).some((o) => ways.includes(o));
  const demanding = movement.filter((m) => pulls(m, ["yang", "both"]));
  const restoring = movement.filter((m) => pulls(m, ["yin", "both"]));

  /**
   * What they did, then when.
   *
   * The activity name first where the source gave us one — "Yoga", "Running" —
   * falling back to the Sakred category only when it did not. The category is
   * what the load model reads; it was never meant to be the word a member sees,
   * and using it produced three rows of "Recovery" for a week of yoga, mobility
   * and a walk.
   */
  const line = (m: MovementEntry) => {
    const fallback = m.categories?.[0] ?? m.category;
    /*
      Never the raw category as a last resort — `fallback` is an id like
      `full_body`, and printing it is the exact defect this registry exists
      to end. "Movement" is vague and true; the id is precise and wrong.
    */
    const name = healthActivityLabel(m.activity) ?? categoryLabel(fallback) ?? "Movement";
    return `${name} · ${whenShort(m.onDate)}`;
  };

  return (
    <div className="space-y-3 pt-3 border-t border-[hsl(var(--gold))]/10">
      {demanding.length > 0 && (
        <div className="space-y-1">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
            Recent demanding movement
          </p>
          {/*
            No count here, deliberately.

            This list is grouped per (day, category) by `recentMovement`, so its
            length is a number of movement *days*, not of sessions — and it sat
            directly under a terrain line counting actual sessions, reading as
            "11 demanding sessions this week" above "5 demanding sessions this
            week". Both were right about different things and the shared noun
            made one of them a lie. The canonical session count stays where it
            is; this section simply stops competing with it.
          */}
          <ul className="space-y-0.5">
            {demanding.slice(0, 5).map((m, i) => (
              /*
                Provenance is retained on the row and deliberately not printed.
                "from your phone" on every imported line was most of the visual
                weight of the list while answering a question nobody asks twice.
              */
              <li key={m.id ?? `${m.onDate}-${m.category}-${i}`} className="text-xs truncate">
                {line(m)}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="space-y-1">
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
          Your restorative movement
        </p>
        {restoring.length > 0 ? (
          <ul className="space-y-0.5">
            {restoring.slice(0, 5).map((m, i) => (
              <li key={m.id ?? `${m.onDate}-${m.category}-${i}`} className="text-xs truncate">
                {line(m)}
              </li>
            ))}
          </ul>
        ) : (
          // Stated plainly rather than as a prompt. It is a fact about the
          // week, and the list of what gives capacity back is already above.
          <p className="text-xs text-muted-foreground">None this week.</p>
        )}
      </div>
    </div>
  );
}

/**
 * The movement that gives capacity back, taken from the catalogue rather than
 * listed here.
 *
 * Written as a derivation so it cannot drift: add a restorative category to
 * the taxonomy and it appears on this screen, with no second list to remember.
 */
const RESTORATIVE = EXERCISE_CATEGORIES.filter(
  (c) => (CATEGORY_LOAD[c.id]?.restoration ?? 0) >= 2,
);

/** Mean of a metric across whatever days actually carry it. */
function mean(days: Array<Record<string, unknown>>, metric: string): number | null {
  const vals = days
    .map((d) => d[metric])
    .filter((v): v is number => typeof v === "number");
  if (vals.length === 0) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function hoursMinutes(mins: number): string {
  return `${Math.floor(mins / 60)}h ${Math.round(mins % 60)}m`;
}

export function RestoreTab({ onOpen }: { onOpen: (s: MemberSection) => void }) {
  const terrain = useQuery<Reading>({ queryKey: ["/api/terrain/today"] });
  /**
   * What the Rhythm section below is already going to say in full.
   *
   * Same query key it uses, so this is the cache rather than a second fetch.
   * Restore prefers the fuller presentation and suppresses the teaser for the
   * same guidance id; every other surface that renders TodayRead without a
   * Rhythm section passes nothing and keeps the teaser.
   */
  const rhythm = useQuery<{ relating?: { id: string }[] }>({ queryKey: ["/api/rhythm"] });
  const rhythmRelatingIds = (rhythm.data?.relating ?? []).map((g) => g.id);
  const health = useHealthSummary(7);
  const qc = useQueryClient();

  /**
   * A restorative session, started here and logged by the Build engine.
   *
   * It used to be rendered inline on this screen, which meant a sauna and a
   * squat session — the same row in `workout_sessions` — were two different
   * looking things depending on which tab you happened to start them from. The
   * workout layer takes both now, so this screen's job is the way in.
   */
  const workout = useWorkoutSheet();

  const prefs = useQuery<{ weightUnit?: "kg" | "lb" }>({ queryKey: ["/api/auth/user"] });
  const unit = prefs.data?.weightUnit === "kg" ? "kg" : "lb";

  const start = useMutation({
    mutationFn: async (label: string) => {
      const res = await apiRequest("POST", "/api/training/sessions", { title: label });
      return (await res.json()) as RunningSession;
    },
    onSuccess: async (row) => {
      // Seeded, not invalidated — same reason as everywhere else a session is
      // created. See `seedOpenWorkout`.
      await seedOpenWorkout(qc, row);
      workout.open();
    },
  });

  const days = (health.data?.days ?? []) as Array<Record<string, unknown>>;
  const sleep = mean(days, "sleepMinutes");
  const hrv = mean(days, "heartRateVariability");
  const rhr = mean(days, "restingHeartRate");
  /**
   * Connected, and having readings, are two different questions.
   *
   * This used to be one: `sleep === null && hrv === null && rhr === null` was
   * treated as "not connected", so a member whose watch had simply not reported
   * sleep, HRV or resting heart rate was shown a **Connect health data** button
   * for data that was already connected — while the rest of the same screen
   * quoted their sleep back to them.
   *
   * `connected` is the server's own answer, from the health connection rows
   * rather than inferred from whether any metric happens to be non-null. Three
   * states, named, because two of them look identical if you only ask about
   * values:
   *
   *     loading      we do not know yet — say nothing
   *     !connected   genuinely nothing linked — offer the CTA
   *     connected    linked; may still have no readings this week
   *
   * It now asks `/api/health/status` rather than reading `connected` off the
   * summary. Same three states, but the third was unreachable before: the
   * summary answers both questions in one payload, so "still loading" arrived
   * here as `connected === false` and this screen offered the CTA anyway —
   * the exact wrong the comment above was written to prevent, reintroduced by
   * the source it trusted.
   */
  const connection = useHealthConnection();
  const connected = connection === "connected";
  const stillAsking = connection === "unknown";
  const noReadings = sleep === null && hrv === null && rhr === null;

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="font-display text-3xl leading-tight">Restore</h1>
        <p className="text-sm text-muted-foreground">
          Capacity is not only built. It is also returned.
        </p>
      </div>

      {/* The list comes first. Everything below it is context for the
          decisions on it, and context that sits above the thing it informs is
          a screen a member scrolls past. */}
      <HabitPanel
        emphasis="yin"
        title="What gives it back"
        emptyLine="Nothing here yet. Sleep, minerals and downshifting are where most people start."
      />

      <TerrainCheckin />

      {/* Direction, under the check-in and above the terrain read. Ordered
          restore-first by the server, never filtered: somebody chasing a mile
          time needs their hips to open and their sleep to hold, and hiding a
          running goal here would say the two halves of a body are separate
          systems. */}
      <GoalStrip lens="restore" unit={unit} onOpen={() => onOpen("goals")} />

      {/* ── What the terrain is asking for ── */}
      <Panel title="Your terrain" data-testid="restore-terrain">
        {terrain.isLoading ? (
          <Skeleton className="h-16 w-full" />
        ) : terrain.data ? (
          <div className="space-y-3">
            <p className="font-display text-lg leading-snug">{terrain.data.headline}</p>

            {terrain.data.reasons.length > 0 && (
              <ul className="space-y-1">
                {terrain.data.reasons.map((r) => (
                  <li key={r.text} className="text-sm text-muted-foreground flex gap-2">
                    {/* Which way each fact pulls, so the conclusion is shown
                        working rather than asserted. */}
                    <span
                      className={cn(
                        "mt-1.5 h-1 w-1 shrink-0 rounded-full",
                        r.pulls === "restore"
                          ? "bg-[hsl(var(--gold))]"
                          : "bg-muted-foreground/50",
                      )}
                      aria-hidden="true"
                    />
                    {r.text}
                  </li>
                ))}
              </ul>
            )}

            {/*
              The events, not the projection.

              `movement` collapses two workouts that share a Sakred category
              into one entry, so a day of yoga and mobility rendered as a single
              row — and which of the two names survived was not even stable.
              Whether a row belongs under demanding or restorative still comes
              from the canonical orientation, never from the activity's name.
            */}
            <MovementBehindTheReading
              movement={terrain.data.movementEvents ?? terrain.data.movement ?? []}
            />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            {/* Only suggest connecting to somebody who has not — and only
                once we know, which `stillAsking` is what makes possible. */}
            {connected || stillAsking
              ? "Nothing to read yet. Log a session and this starts filling in."
              : "Nothing to read yet. Connect health data or log a session."}
          </p>
        )}
      </Panel>

      {/* ── The numbers this half of the app runs on ── */}
      <Panel
        title="Sleep and recovery"
        action={noReadings ? undefined : "Stats"}
        onAction={noReadings ? undefined : () => onOpen("coaching")}
        data-testid="restore-recovery"
      >
        {/*
          A skeleton while either question is open. Falling through to the
          "Connect health data" branch during that beat is what made a
          connected member's Restore screen ask them to connect.
        */}
        {health.isLoading || stillAsking ? (
          <Skeleton className="h-14 w-full" />
        ) : !connected ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Nothing synced from your phone yet. Sleep, heart rate variability
              and resting heart rate are what this screen reads.
            </p>
            <Button variant="outline" size="sm" onClick={() => onOpen("settings")}>
              Connect health data
            </Button>
          </div>
        ) : noReadings ? (
          /*
            Connected, with nothing to show this week. Deliberately no CTA —
            there is nothing for the member to do, and offering one implies they
            failed a setup step they already completed.
          */
          <p className="text-sm text-muted-foreground">
            Nothing recorded in the last week. Sleep, heart rate variability and
            resting heart rate appear here once your phone reports them.
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            <Metric
              icon={Moon}
              label="Sleep"
              value={sleep === null ? null : hoursMinutes(sleep)}
            />
            <Metric
              icon={Wind}
              label="HRV"
              value={hrv === null ? null : `${Math.round(hrv)} ms`}
            />
            <Metric
              icon={HeartPulse}
              label="Resting"
              value={rhr === null ? null : `${Math.round(rhr)} bpm`}
            />
          </div>
        )}
        {!noReadings && !health.isLoading && (
          <p className="text-[11px] text-muted-foreground mt-3">Averaged over the last 7 days.</p>
        )}
      </Panel>

      {/*
        ── What their last session left them with ──

        The other half of an answer Build already gives. A member who reported a
        tight left low back after hinging does not need Restore repeating the
        training advice back at them; they need to be told that today might be
        better spent giving that area something than asking more of it. One
        observation, one reader, two useful readings — see `trainingMemory`.
      */}
      <RestoreMemory />

      {/*
        What they have actually been doing to restore, from both places it is
        recorded — logged practice and whatever their phone captured. Thirty
        days rather than seven: restorative work is weekly at best for most
        people, and a seven-day window shows an empty panel to somebody who has
        been perfectly consistent.
      */}
      <RecentSessions days={30} lens="restore" title="Your Restore history" preview={0} />

      {/* ── Restoring is something you do, not only something you skip ── */}
      <Panel title="Movement that restores" data-testid="restore-movement">
          <p className="text-sm text-muted-foreground mb-3">
            Rest is not the only way to give capacity back. These are logged the
            same as anything else, and they count on the other side of the ledger.
          </p>
          {/*
            Tappable, because "Open Build" was the wrong answer twice over: it
            sent somebody to the other half of the product to do the thing this
            half is about, and it made Restore a screen you read rather than
            one you use.
          */}
          <div className="flex flex-wrap gap-1.5">
            {RESTORATIVE.map((c) => (
              <button
                key={c.id}
                onClick={() => start.mutate(c.label)}
                disabled={start.isPending}
                className="rounded-full border border-[hsl(var(--gold))]/20 px-2.5 py-1 text-xs text-muted-foreground tap-clean hover:border-[hsl(var(--gold))]/50 hover:text-foreground transition-colors disabled:opacity-50"
                data-testid={`restore-start-${c.id}`}
                data-tour-id="restore-practice"
                data-tour-instance={c.id}
              >
                {c.label}
              </button>
            ))}
          </div>
        <p className="text-[11px] text-muted-foreground mt-3">
          Tap one to start logging it.
        </p>
      </Panel>

      {/*
        An idea, for somebody who has already decided to move.

        This lived at the top of Home for one build and was the first thing
        anybody saw on opening the app — which made an optional prompt feel
        like the product's opinion of your day. Here it sits below the habits
        and the terrain reading, on a screen a member reached deliberately.
        Restore only shows the restorative side; Build shows the other.
      */}
      <TodayRead side="restore" onOpenCategory={() => undefined} suppressRelatingIds={rhythmRelatingIds} />

      {/* Rhythm is terrain context, so it belongs on the terrain screen. */}
      <RhythmSection />

      {/* ── The reading from the inside ── */}
      {/*
        The door to The Body, which is now the Sakred Body Map — seven
        territories rather than nine centres. The nine centres remain a real
        tributary and return later as an optional traditional lens, but they are
        no longer the primary model, so this door should not advertise them as
        though they were.
      */}
      <Panel
        title="The Body Map"
        action="Open"
        onAction={() => onOpen("body")}
        data-testid="restore-body-map"
      >
        <p className="text-sm text-muted-foreground">
          What the phone measures is one account of your terrain. What you
          notice is another, and it is usually earlier. The map is where you
          learn to read it.
        </p>
      </Panel>
    </div>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Moon;
  label: string;
  value: string | null;
}) {
  return (
    <div className="rounded-lg border border-[hsl(var(--gold))]/10 bg-black/20 px-3 py-2.5">
      <Icon className="h-3.5 w-3.5 text-[hsl(var(--gold))]" />
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1.5">{label}</p>
      {/* An unsynced metric says so rather than showing a dash that reads as
          zero — three of these in a row with dashes looks like a broken screen. */}
      <p className="text-sm mt-0.5 tabular-nums">{value ?? <span className="text-muted-foreground">—</span>}</p>
    </div>
  );
}
