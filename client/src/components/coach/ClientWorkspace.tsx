/**
 * One client, in one place.
 *
 * ── The three kinds of thing on this screen ───────────────────────────────
 *
 * They are labelled, and never blended:
 *
 *   MEMBER REPORTED     what this person said about themselves
 *   HEALTH DATA         what a sensor recorded
 *   SAKRED INTERPRETATION  what the model concluded from both
 *
 * A hard run somebody says restored them is `taxed` by the model and `restored`
 * by them at the same time, and both are true. A screen that reconciles those
 * into one number has deleted the most useful thing on it — and has quietly
 * taught the coach that the sensor is the real answer and the person is noise.
 *
 * ── Nothing here is calculated ────────────────────────────────────────────
 *
 * Every reading, count and label arrives resolved from the server, from the
 * same functions the member's own screens read. This file is a renderer.
 */

import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { TERRAIN_SIGNALS, type TerrainSignalId } from "@shared/models/terrainSignals";
import {
  effectivePlacement,
  PLACEMENT_LABEL,
  WORKOUT_RESPONSE_LABEL,
  type WorkoutPlacement,
  type WorkoutResponse,
} from "@shared/models/training";
import { METRIC_DISPLAY, dayLabel } from "@/lib/healthDisplay";
import type { HealthMetric } from "@shared/schema";
import { workoutSource } from "@/components/portal/TodaysMovement";
import { Conversation } from "@/components/coach/Conversation";
import { PlanEditor } from "@/components/coach/PlanEditor";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
  useClientActivity,
  useClientHabits,
  useClientOverview,
  useClientPlans,
  useClientTrends,
  type ClientPhase,
  type ResolvedHabitView,
} from "@/hooks/use-coach";
import type { HealthWorkout } from "@shared/schema";
import { cn } from "@/lib/utils";

type Tab = "overview" | "activity" | "habits" | "plan" | "messages";

const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "activity", label: "Activity" },
  { id: "habits", label: "Habits" },
  { id: "plan", label: "Plan" },
  { id: "messages", label: "Messages" },
];

const PLACEMENT_TONE: Record<WorkoutPlacement, string> = {
  build: "text-[hsl(var(--gold))]",
  restore: "text-[hsl(var(--element-water))]",
  both: "text-muted-foreground",
};

// ─── Small shared pieces ───────────────────────────────────────────────────

function Section({
  title,
  kind,
  children,
}: {
  title: string;
  /** The provenance label. Omitted where the heading already says it. */
  kind?: "member" | "health" | "sakred";
  children: React.ReactNode;
}) {
  const KIND_LABEL = {
    member: "Member reported",
    health: "Health data",
    sakred: "Sakred interpretation",
  } as const;

  return (
    <section className="rounded-xl border border-[hsl(var(--gold))]/12 bg-card/40 p-4 sm:p-5">
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <h3 className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{title}</h3>
        {kind && (
          <span className="text-[9px] uppercase tracking-[0.16em] text-muted-foreground/50 shrink-0">
            {KIND_LABEL[kind]}
          </span>
        )}
      </div>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}

function Loading() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-28 w-full rounded-xl" />
      <Skeleton className="h-40 w-full rounded-xl" />
    </div>
  );
}

function minutes(seconds: number | null): string | null {
  if (!seconds) return null;
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

function distance(metres: number | null): string | null {
  if (!metres || metres <= 0) return null;
  return metres >= 1000 ? `${(metres / 1000).toFixed(1)} km` : `${Math.round(metres)} m`;
}

/**
 * One imported session, with both readings of it kept apart.
 *
 * The canonical load is what it cost. The member's response is how it landed.
 * The member's placement is where they say it belongs. None of the three is a
 * correction of the others.
 */
function WorkoutRow({ w, today }: { w: HealthWorkout; today: string }) {
  const override = (w.userOrientationOverride ?? null) as WorkoutPlacement | null;
  const placement = effectivePlacement(w.workoutType, override);
  const response = (w.userResponse ?? null) as WorkoutResponse | null;
  const facts = [minutes(w.durationSeconds), distance(w.distanceMeters)].filter(Boolean);

  return (
    <div
      className="rounded-lg border border-border/30 px-3 py-2.5"
      data-testid={`client-workout-${w.id}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm capitalize truncate">{w.workoutType ?? "Workout"}</p>
          {facts.length > 0 && (
            <p className="text-[11px] text-muted-foreground mt-0.5">{facts.join(" · ")}</p>
          )}
          <p className="text-[10px] text-muted-foreground/70 mt-0.5 truncate">{workoutSource(w)}</p>
        </div>
        <span className="text-[10px] text-muted-foreground/70 shrink-0">
          {dayLabel(w.onDate, today)}
        </span>
      </div>

      {(response || override) && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 pt-2 border-t border-border/20">
          {response && (
            <span className="text-[11px]">
              <span className="text-muted-foreground/60">They said </span>
              {WORKOUT_RESPONSE_LABEL[response]}
            </span>
          )}
          {override && (
            <span className={cn("text-[11px]", PLACEMENT_TONE[override])}>
              <span className="text-muted-foreground/60">They placed it in </span>
              {PLACEMENT_LABEL[override]}
            </span>
          )}
        </div>
      )}

      {/*
        Where Sakred put it, shown only when the member has not said otherwise —
        two labels for the same slot would read as the app arguing with itself.
      */}
      {!override && placement && (
        <p className={cn("text-[10px] mt-1.5", PLACEMENT_TONE[placement])}>
          {PLACEMENT_LABEL[placement]}
        </p>
      )}
    </div>
  );
}

function WeekBalance({ build, restore, days }: { build: number; restore: number; days: number }) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <div>
        <p className="text-[10px] uppercase tracking-widest text-[hsl(var(--gold))]">Build</p>
        <p className="text-lg mt-0.5">{build}</p>
        <p className="text-[11px] text-muted-foreground">
          demanding {build === 1 ? "session" : "sessions"}
        </p>
      </div>
      <div>
        <p className="text-[10px] uppercase tracking-widest text-[hsl(var(--element-water))]">
          Restore
        </p>
        <p className="text-lg mt-0.5">{restore}</p>
        <p className="text-[11px] text-muted-foreground">
          restorative {restore === 1 ? "session" : "sessions"}
        </p>
      </div>
      <p className="col-span-2 text-[10px] text-muted-foreground/60">
        Last {days} days. Not a ratio to hit — context.
      </p>
    </div>
  );
}

// ─── Overview ──────────────────────────────────────────────────────────────

function Overview({ memberId }: { memberId: string }) {
  const { data, isLoading, error } = useClientOverview(memberId);

  if (isLoading) return <Loading />;
  if (error) return <Empty>{(error as Error).message}</Empty>;
  if (!data) return null;

  const { terrain, weekBalance, todaysWorkouts, plan, checkin, onDate } = data;

  return (
    <div className="space-y-4">
      <Section title="Terrain now" kind="sakred">
        {terrain.hasBody ? (
          <>
            <p className="text-lg">{terrain.headline}</p>
            {terrain.reasons.length > 0 && (
              /*
                The reasons, not just the conclusion. A coach who can see what
                the reading is standing on can disagree with it — and a member
                who slept fine all week has somewhere to point when it's wrong.
              */
              <ul className="mt-2.5 space-y-1">
                {terrain.reasons.map((r, i) => (
                  <li key={i} className="text-xs text-muted-foreground">
                    {r.text}
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <Empty>
            No connected health data. Member-entered habits and check-ins still appear.
          </Empty>
        )}
      </Section>

      <Section title={`Last ${weekBalance.days} days`} kind="sakred">
        <WeekBalance {...weekBalance} />
      </Section>

      {todaysWorkouts.length > 0 && (
        <Section title="Today's movement" kind="health">
          <div className="space-y-2">
            {todaysWorkouts.map((w) => (
              <WorkoutRow key={w.id} w={w} today={onDate} />
            ))}
          </div>
        </Section>
      )}

      {checkin && <Checkin checkin={checkin} today={onDate} />}

      {plan && (
        <Section title="Coach's plan">
          <p className="text-sm">{plan.name ?? "Plan"}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Day {plan.currentDay} of {plan.totalDays}
          </p>
        </Section>
      )}
    </div>
  );
}

/**
 * What the member said about themselves.
 *
 * Carries its own date because it is not necessarily today's — a check-in from
 * four days ago presented without a date is a claim about now, and a coach
 * would act on it.
 */
function Checkin({ checkin, today }: { checkin: Record<string, unknown>; today: string }) {
  const onDate = String(checkin.onDate ?? "");
  const answered = TERRAIN_SIGNALS.filter(
    (s) => typeof checkin[s.id as TerrainSignalId] === "number",
  );
  const note = typeof checkin.note === "string" ? checkin.note : null;

  if (answered.length === 0 && !note) return null;

  return (
    <Section title="How they said they felt" kind="member">
      <p className="text-[11px] text-muted-foreground/70 mb-2.5">
        {onDate ? dayLabel(onDate, today) : ""}
      </p>
      {answered.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2">
          {answered.map((s) => (
            <div key={s.id}>
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
                {s.label}
              </p>
              <p className="text-sm">{String(checkin[s.id as TerrainSignalId])} / 5</p>
            </div>
          ))}
        </div>
      )}
      {note && <p className="text-sm mt-3 text-muted-foreground">{note}</p>}
    </Section>
  );
}

// ─── Activity ──────────────────────────────────────────────────────────────

function Activity({ memberId }: { memberId: string }) {
  const { data, isLoading, error } = useClientActivity(memberId);

  if (isLoading) return <Loading />;
  if (error) return <Empty>{(error as Error).message}</Empty>;
  if (!data) return null;

  if (data.workouts.length === 0 && data.movement.length === 0) {
    return (
      <Section title="Movement">
        <Empty>No recent movement recorded.</Empty>
      </Section>
    );
  }

  /** Grouped by day so a coach reads a week rather than a list of rows. */
  const byDay = new Map<string, HealthWorkout[]>();
  for (const w of data.workouts) {
    const list = byDay.get(w.onDate) ?? [];
    list.push(w);
    byDay.set(w.onDate, list);
  }

  return (
    <div className="space-y-4">
      <Section title={`Last ${data.weekBalance.days} days`} kind="sakred">
        <WeekBalance {...data.weekBalance} />
      </Section>

      <Section title={`Movement · ${data.days} days`} kind="health">
        {byDay.size === 0 ? (
          <Empty>Nothing imported from a phone in this window.</Empty>
        ) : (
          <div className="space-y-4">
            {Array.from(byDay.entries()).map(([day, list]) => (
              <div key={day} className="space-y-2">
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
                  {dayLabel(day, data.onDate)}
                </p>
                {list.map((w) => (
                  <WorkoutRow key={w.id} w={w} today={data.onDate} />
                ))}
              </div>
            ))}
          </div>
        )}
      </Section>

      {/*
        What the terrain reading actually counted, including sessions logged
        inside Sakred that never touched a phone. Shown because the numbers
        above come from it, and a count nobody can inspect is a count nobody
        can catch being wrong.
      */}
      <Section title="What the reading counted" kind="sakred">
        {data.movement.length === 0 ? (
          <Empty>Nothing in the window.</Empty>
        ) : (
          <div className="space-y-1.5">
            {data.movement.map((m, i) => (
              <div key={`${m.onDate}-${m.category}-${i}`} className="flex items-baseline justify-between gap-3">
                <span className="text-sm capitalize">{m.category.replace(/_/g, " ")}</span>
                <span className="text-[11px] text-muted-foreground shrink-0">
                  {dayLabel(m.onDate, data.onDate)} ·{" "}
                  {m.source === "sakred" ? "Logged in Sakred" : "Imported"}
                </span>
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

// ─── Habits ────────────────────────────────────────────────────────────────

function HabitRow({ h, phase }: { h: ResolvedHabitView; phase?: ClientPhase }) {
  return (
    <div className="rounded-lg border border-border/30 px-3 py-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm truncate">{h.title}</p>
          {/* Resolved server-side. The client never computes adherence. */}
          {h.progressLabel && (
            <p className="text-[11px] text-muted-foreground mt-0.5">{String(h.progressLabel)}</p>
          )}
          {h.scheduleLabel != null && (
            <p className="text-[10px] text-muted-foreground/60 mt-0.5">
              {String(h.scheduleLabel)}
            </p>
          )}
        </div>
        {phase?.assignedByName && (
          <span className="text-[10px] text-muted-foreground/70 shrink-0">
            {phase.assignedByName}
          </span>
        )}
      </div>

      {/*
        The coach's own note, on a coach's screen. It is stripped from every
        member-facing response and is not the same field as memberReason, which
        the member wrote and can read.
      */}
      {phase?.coachNote && (
        <p className="text-[11px] text-muted-foreground mt-2 pt-2 border-t border-border/20">
          <span className="text-muted-foreground/50">Your note · </span>
          {phase.coachNote}
        </p>
      )}
    </div>
  );
}

function Habits({ memberId }: { memberId: string }) {
  const { data, isLoading, error } = useClientHabits(memberId);

  if (isLoading) return <Loading />;
  if (error) return <Empty>{(error as Error).message}</Empty>;
  if (!data) return null;

  const phaseBy = new Map(data.phases.map((p) => [p.trackedHabitId, p]));
  const both = [...data.build, ...data.restore];

  if (both.length === 0) {
    return (
      <Section title="Habits">
        <Empty>Nothing tracked yet.</Empty>
      </Section>
    );
  }

  return (
    <div className="space-y-4">
      {data.build.length > 0 && (
        <Section title="Build">
          <div className="space-y-2">
            {data.build.map((h) => (
              <HabitRow
                key={String(h.trackedHabitId ?? h.id)}
                h={h}
                phase={phaseBy.get(String(h.trackedHabitId ?? h.id))}
              />
            ))}
          </div>
        </Section>
      )}
      {data.restore.length > 0 && (
        <Section title="Restore">
          <div className="space-y-2">
            {data.restore.map((h) => (
              <HabitRow
                key={String(h.trackedHabitId ?? h.id)}
                h={h}
                phase={phaseBy.get(String(h.trackedHabitId ?? h.id))}
              />
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

// ─── Plan ──────────────────────────────────────────────────────────────────

/**
 * The Coach's Plan tab.
 *
 * A plan, a draft, and what came before. The habits and health context below it
 * are the same canonical readers the rest of the workspace uses — the plan does
 * not get its own copy of what the member is on.
 */
function Plan({ memberId, memberName }: { memberId: string; memberName: string }) {
  const plans = useClientPlans(memberId);
  const trends = useClientTrends(memberId);
  const [editing, setEditing] = useState(false);
  const qc = useQueryClient();
  const { toast } = useToast();

  const create = useMutation({
    mutationFn: async () =>
      apiRequest("POST", `/api/coach/clients/${memberId}/plans`, {
        title: `Plan for ${memberName.split(" ")[0] || memberName}`,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/coach/clients", memberId, "plans"] });
      setEditing(true);
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const end = useMutation({
    mutationFn: async (planId: string) => apiRequest("POST", `/api/coach/plans/${planId}/end`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/coach/clients", memberId, "plans"] });
      /*
        Ending a plan does not end the member's practices — see endPlan. So the
        habit views do not need invalidating, and saying otherwise here would
        imply a change that did not happen.
      */
      toast({ title: "Plan ended" });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  if (plans.isLoading) return <Loading />;
  if (plans.error) return <Empty>{(plans.error as Error).message}</Empty>;

  const { active, draft, history } = plans.data ?? { active: null, draft: null, history: [] };

  if (editing && draft) {
    return (
      <PlanEditor
        memberId={memberId}
        memberName={memberName}
        plan={draft}
        onDone={() => setEditing(false)}
      />
    );
  }

  return (
    <div className="space-y-4">
      <Section title="Coach's plan">
        {active ? (
          <>
            <p className="text-sm">{active.title}</p>
            {active.focus && (
              <p className="text-xs text-muted-foreground mt-1">{active.focus}</p>
            )}
            <p className="text-xs text-muted-foreground mt-2">
              {active.items.length} {active.items.length === 1 ? "practice" : "practices"}
              {active.endsOn ? ` · through ${active.endsOn}` : ""}
            </p>
            <div className="mt-3 space-y-1">
              {active.items.map((i) => (
                <p key={i.routineHabitId} className="text-sm">
                  {i.title}
                  {i.target != null && (
                    <span className="text-muted-foreground"> · {i.target}</span>
                  )}
                </p>
              ))}
            </div>
            {active.internalNote && (
              /* The coach's own note. Never sent to the member. */
              <p className="text-[11px] text-muted-foreground mt-3 pt-3 border-t border-border/20">
                <span className="text-muted-foreground/50">Your note · </span>
                {active.internalNote}
              </p>
            )}
            <button
              onClick={() => end.mutate(active.id)}
              className="text-xs text-muted-foreground hover:text-destructive transition-colors mt-3"
              data-testid="plan-end"
            >
              End this plan
            </button>
          </>
        ) : (
          <Empty>No active Coach's Plan.</Empty>
        )}
      </Section>

      {draft ? (
        <Section title="Draft">
          <p className="text-sm">{draft.title}</p>
          {/* Said plainly, because the whole point of a draft is that it is not
              doing anything to the member yet. */}
          <p className="text-xs text-muted-foreground mt-1">
            Not active. Nothing has changed for them.
          </p>
          <Button size="sm" className="mt-3" onClick={() => setEditing(true)} data-testid="plan-edit-draft">
            Continue editing
          </Button>
        </Section>
      ) : (
        <Button size="sm" onClick={() => create.mutate()} disabled={create.isPending} data-testid="plan-create">
          {create.isPending ? "Creating…" : active ? "Draft a new plan" : "Create plan"}
        </Button>
      )}

      {history.length > 0 && (
        <Section title="Earlier plans">
          <div className="space-y-1.5">
            {history.map((h) => (
              <div key={h.id} className="flex items-baseline justify-between gap-3">
                <span className="text-sm">{h.title}</span>
                <span className="text-[11px] text-muted-foreground shrink-0">
                  {h.startsOn ?? ""}
                  {h.endsOn ? `–${h.endsOn}` : ""}
                  {h.ranItsCourse ? "" : " · ended early"}
                </span>
              </div>
            ))}
          </div>
        </Section>
      )}

      <Section title="Health context" kind="health">
        {trends.isLoading ? (
          <Skeleton className="h-16 w-full" />
        ) : !trends.data?.connected ? (
          <Empty>
            No connected health data. Member-entered habits and check-ins still appear.
          </Empty>
        ) : (
          <HealthContext days={trends.data.days} metrics={trends.data.metrics} />
        )}
      </Section>
    </div>
  );
}

/**
 * A few averages, each named with its window.
 *
 * "Sleeping 41m less than usual" without saying against what cannot be checked
 * or argued with. The windows are stated for the same reason they are stated on
 * the member's own card.
 */
function HealthContext({
  days,
  metrics,
}: {
  days: Record<string, number | string>[];
  metrics: string[];
}) {
  /**
   * The four that inform a coaching conversation — the three the terrain
   * reading uses, plus daily movement. Not everything Apple Health holds: the
   * coach view is not a second copy of the member's own health screens, and a
   * grid of nineteen metrics is a place nobody looks twice.
   */
  const SHOW: HealthMetric[] = [
    "sleepMinutes",
    "restingHeartRate",
    "heartRateVariability",
    "steps",
  ];
  const shown = SHOW.filter((m) => metrics.includes(m));
  if (shown.length === 0) return <Empty>Nothing synced in this window.</Empty>;

  /**
   * Today is excluded from every average here.
   *
   * Steps at 11am are a fraction of a day, and averaging them in makes a normal
   * week read as a decline purely because of the clock. `isStillCounting`
   * exists for exactly this on the member's side; here the whole window is
   * historical, which is the same fix stated once.
   */
  const complete = days.slice(0, -1);
  const recent = complete.slice(-7);

  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-3">
      {shown.map((metric) => {
        const values = recent
          .map((d) => d[metric])
          .filter((v): v is number => typeof v === "number");
        if (values.length === 0) return null;
        const avg = values.reduce((a, b) => a + b, 0) / values.length;
        const display = METRIC_DISPLAY[metric];
        return (
          <div key={metric}>
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
              {display.label}
            </p>
            <p className="text-sm mt-0.5">{display.format(avg)}</p>
            {/* The window, named — an average against nothing can't be checked. */}
            <p className="text-[10px] text-muted-foreground/60">
              {values.length}-day average
            </p>
          </div>
        );
      })}
    </div>
  );
}

// ─── Messages ──────────────────────────────────────────────────────────────

/**
 * The coach's side of the same conversation the member sees.
 *
 * `Conversation` is shared with the member's screen — one component, because
 * there is one conversation, and two renderings is how two people end up
 * disagreeing about what was said.
 */
function Messages({ memberId, memberName }: { memberId: string; memberName: string }) {
  const first = memberName.split(" ")[0] || memberName;
  return (
    <Section title="Messages">
      <Conversation
        side={{
          threadUrl: `/api/coach/clients/${memberId}/messages`,
          sendUrl: `/api/coach/clients/${memberId}/messages`,
          readUrl: `/api/coach/clients/${memberId}/messages/read`,
          uploadUrl: `/api/coaching/attachments?memberId=${encodeURIComponent(memberId)}`,
          mine: "coach",
          otherName: first,
          emptyTitle: "No messages yet.",
          // Restrained on purpose — the overview already told the coach about
          // this member's terrain, and the chat does not need to repeat it.
          emptyBody: "Start the conversation.",
        }}
      />
    </Section>
  );
}

// ─── The workspace ─────────────────────────────────────────────────────────

export function ClientWorkspace({
  memberId,
  memberName,
  onBack,
}: {
  memberId: string;
  memberName: string;
  onBack: () => void;
}) {
  const [tab, setTab] = useState<Tab>("overview");
  const overview = useClientOverview(memberId);
  const name = overview.data?.member.name ?? memberName;
  const image = overview.data?.member.profileImageUrl ?? null;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="text-muted-foreground hover:text-foreground transition-colors tap-clean"
          data-testid="client-back"
          aria-label="Back to clients"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <Avatar className="h-9 w-9">
          {image && <AvatarImage src={image} alt="" />}
          <AvatarFallback className="text-xs">
            {name.split(" ").map((p) => p[0]).filter(Boolean).slice(0, 2).join("").toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <h2 className="text-base truncate">{name}</h2>
      </div>

      {/*
        An admin reading somebody who is not their client is doing something
        legitimate and different, and the screen says so rather than letting it
        look like a coaching relationship that exists.
      */}
      {overview.data?.access === "admin" && (
        <p className="text-[11px] text-muted-foreground/70">
          You're viewing this as an administrator, not as their coach.
        </p>
      )}

      <div className="flex items-center gap-1 overflow-x-auto -mx-1 px-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            data-testid={`client-tab-${t.id}`}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs whitespace-nowrap transition-colors tap-clean",
              tab === t.id
                ? "bg-[hsl(var(--gold))]/12 text-[hsl(var(--gold))]"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" && <Overview memberId={memberId} />}
      {tab === "activity" && <Activity memberId={memberId} />}
      {tab === "habits" && <Habits memberId={memberId} />}
      {tab === "plan" && <Plan memberId={memberId} memberName={name} />}
      {tab === "messages" && <Messages memberId={memberId} memberName={name} />}
    </div>
  );
}
