/**
 * Today's Build, and what you've actually been building.
 *
 * ── Why Build had amnesia ─────────────────────────────────────────────────
 *
 * The recommendation engine this screen needed already existed and Build was
 * the one surface never wired into it. `readReadiness` decides how much
 * capacity is available and `suggestToday` decides what kind of work suits it,
 * and both were reachable only from Today — so Build opened on an empty
 * prescription panel and a blank habits card, as though the app had never met
 * the person using it.
 *
 * So almost nothing here is new judgement. It is the existing readers, the
 * existing movement history and the existing Terrain reading, arranged on the
 * screen somebody opens when they intend to train.
 *
 * ── Terrain says how much; the engine says what kind ─────────────────────
 *
 * The one piece of real logic lives in `shared/models/buildToday.ts`, and it
 * is a gate rather than a model. Canonical Terrain Now owns every capacity
 * claim a member reads; `suggestToday` only chooses the modality inside
 * whatever room Terrain has allowed. That split is not tidiness — the two
 * readers genuinely disagree on real data, and letting the recommendation
 * engine speak is how Build came to say "You've got room to push today" under
 * a Home screen reading "Keep today adjustable".
 */

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useToday } from "@/components/TodayRead";
import { Panel } from "@/components/portal/Panel";
import { buildGate, actionFor, REPORT_INVITE, type BuildAction } from "@shared/models/buildToday";
import { EXERCISE_CATEGORIES } from "@shared/models/training";
import { ChevronRight, Plus } from "lucide-react";
import { LogPractice } from "@/components/build/LogPractice";
import { useTrainingMemory } from "@/components/build/TrainingMemory";
import { MEMORY_DISCLOSURE, recallForCategory, recallLine } from "@shared/models/trainingMemory";

const CATEGORY_LABEL = new Map(EXERCISE_CATEGORIES.map((c) => [c.id as string, c.label as string]));

type MovementEvent = {
  id?: string;
  onDate: string;
  category: string;
  categories?: string[];
  orientations?: ("yin" | "yang" | "both" | "neutral")[];
  activity: string | null;
  orientation: "yin" | "yang" | "both" | "neutral";
  source: "sakred" | "imported";
};

type TerrainReading = { movementEvents?: MovementEvent[]; movement?: MovementEvent[] };

/** The same small-caps label the rest of the portal uses for a sub-heading. */
function Label({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground/70">{children}</p>
  );
}

/** Matches Restore, deliberately — one history, described the same way twice. */
function whenShort(onDate: string): string {
  return new Date(`${onDate}T12:00:00`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

/**
 * What the member would call it.
 *
 * The activity name where the source gave one, the Sakred category where it did
 * not. A logged session's identity *is* its categories — it is a set of
 * exercises, not an activity with a name — so falling through to the category
 * is the honest label rather than a placeholder.
 */
function eventLabel(e: MovementEvent): string {
  if (e.activity) return e.activity.charAt(0).toUpperCase() + e.activity.slice(1);
  const cats = e.categories ?? [e.category];
  return cats.map((c) => CATEGORY_LABEL.get(c) ?? c).join(" · ");
}

export function TodaysBuild({
  onCheckIn,
  /**
   * Act on a recommendation. Absent on surfaces that can only show one — the
   * card stays readable rather than becoming a dead tap target.
   */
  onAct,
}: {
  onCheckIn?: () => void;
  onAct?: (action: BuildAction, why: string) => void;
}) {
  const { data } = useToday();

  /**
   * No reading, no card — and crucially, no crash.
   *
   * `terrain` is absent whenever the server predates this client, which is the
   * normal condition for a bundled native app between a store release and a
   * deploy rather than an exotic one. Build 23 shipped dereferencing it
   * unconditionally and took down the entire section with
   * `undefined is not an object (evaluating 's.terrain.lean')` — the
   * prescription, the history, the habits and the session builder all gone,
   * because the recommendation on top of them could not be formed.
   *
   * Today's Build is optional. Build is not. Anything that cannot honestly
   * produce a recommendation omits itself and leaves the rest of the screen
   * standing.
   */
  if (!data?.terrain) return null;

  const gate = buildGate({
    lean: data.terrain.lean,
    // Same rule as `terrain` itself: an older server is a legitimate peer, and
    // a missing array must degrade rather than throw inside the gate.
    reasons: data.terrain.reasons ?? [],
    hasReport: data.terrain.hasReport,
    read: data.read,
    suggestions: data.suggestions ?? [],
  });

  /**
   * The one being recommended is the one the headline already named — the first
   * demanding option where Terrain allows one, and otherwise the first
   * restorative one. Derived from the gate's own ordering rather than chosen
   * again here, so the card underneath can never disagree with the sentence
   * above it.
   */
  const primary = gate.allowsBuild
    ? (gate.options.find((s) => s.side === "build") ?? gate.options[0])
    : gate.options[0];
  const alternates = gate.options.filter((s) => s !== primary);

  return (
    <Panel title="Today's Build">
      <div className="space-y-4">
        <p className="font-display text-lg leading-snug" data-testid="build-headline">
          {gate.headline}
        </p>

        {/* Terrain's own sentences, not a second account of the same day. */}
        {gate.rationale.length > 0 && (
          <p className="text-sm text-muted-foreground leading-relaxed" data-testid="build-rationale">
            {gate.rationale.join(" ")}
          </p>
        )}

        {/*
          One recommendation, then alternatives — not three peers.

          The engine returns a spread on purpose, so that a single suggestion
          never reads as a command. But rendering all three identically made
          the screen argue with itself: three equal cards, each repeating "You
          slept well — 8h 51m", which is one fact about the day rather than
          three reasons for three different sessions.

          So the `because` appears once, on the option actually being
          recommended, and the rest are listed as what else the day is good
          for. Same options, same order, honest about which is which.

          Tapping one starts it. Where the surface cannot act — anywhere
          `onAct` is absent — the rows render as plain information rather than
          as tap targets that do nothing, which is the state they shipped in
          for one build.
        */}
        {primary && (
          <div className="space-y-2">
            <Label>Suggested</Label>
            <button
              type="button"
              disabled={!onAct}
              onClick={() => onAct?.(actionFor(primary), gate.rationale.join(" "))}
              className="w-full text-left rounded-xl border border-border/50 px-3 py-2.5 flex items-start gap-3 tap-clean disabled:cursor-default"
              data-testid={`build-option-${primary.category}`}
            >
              <span className="min-w-0 flex-1">
                <span className="block text-sm">{primary.label}</span>
                <span className="block text-xs text-muted-foreground leading-relaxed">
                  {primary.headline}
                </span>
                {/* Only where the engine had a basis. An invented because is
                    worse than none — see recommend.ts. */}
                {primary.because && (
                  <span className="block text-[11px] text-muted-foreground/70 mt-0.5">
                    {primary.because}
                  </span>
                )}
              </span>
              {onAct && (
                <ChevronRight className="h-4 w-4 text-muted-foreground/40 mt-0.5 shrink-0" />
              )}
            </button>
          </div>
        )}

        {alternates.length > 0 && (
          <div className="space-y-2">
            <Label>Other good uses of today</Label>
            <div className="space-y-1.5">
              {alternates.map((s) => (
                <button
                  key={s.category}
                  type="button"
                  disabled={!onAct}
                  onClick={() => onAct?.(actionFor(s), gate.rationale.join(" "))}
                  className="w-full flex items-baseline justify-between gap-3 text-left tap-clean disabled:cursor-default"
                  data-testid={`build-option-${s.category}`}
                >
                  <span className="text-sm">{s.label}</span>
                  <span className="text-xs text-muted-foreground text-right">{s.headline}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/*
          ── What they told Sakred last time ──

          Above the check-in invitation and below the options, because it is
          about the thing they are choosing rather than about today's readings.
          Only where the movement being recommended is one they have said
          something about — a card that appeared every day saying nothing would
          make the one that matters invisible.
        */}
        {primary && <SuggestionMemory category={primary.category} label={primary.label} />}

        {/*
          The one thing no sensor can supply.

          Offered when the reading is standing on measurements alone, which is
          exactly the case where the member knows something the app does not.
          It routes to the canonical check-in; Build has no questions of its
          own, because a second subjective system is how somebody ends up
          reporting two different days four minutes apart.
        */}
        {gate.invitesReport && onCheckIn && (
          <button
            onClick={onCheckIn}
            className="w-full text-left rounded-xl border border-[hsl(var(--gold))]/25 px-3 py-2.5 tap-clean"
            data-testid="build-check-in"
          >
            <p className="text-sm text-[hsl(var(--gold))]">{REPORT_INVITE.title}</p>
            <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">
              {REPORT_INVITE.body}
            </p>
            <span className="text-xs text-[hsl(var(--gold))] inline-flex items-center gap-1 mt-1.5">
              {REPORT_INVITE.action}
              <ChevronRight className="h-3 w-3" />
            </span>
          </button>
        )}
      </div>
    </Panel>
  );
}

/**
 * What they have actually been building.
 *
 * Events, not the terrain projection — a projection collapses two workouts
 * sharing a category into one and keeps whichever name the query happened to
 * return first. History has to be per thing-you-did.
 *
 * Restorative-only events are left out: they belong to Restore, which already
 * shows them under their own heading. A session that is *both* — real strength
 * work that also included mobility — stays, because leaving it out would lose a
 * session the member definitely did.
 */
export function RecentBuild() {
  const qc = useQueryClient();
  const terrain = useQuery<TerrainReading>({ queryKey: ["/api/terrain/today"] });
  const events = terrain.data?.movementEvents ?? [];
  const [adding, setAdding] = useState(false);

  const demanding = events.filter((e) =>
    (e.orientations ?? [e.orientation]).some((o) => o === "yang" || o === "both"),
  );

  return (
    <>
      {/*
        Nothing yet is a real answer on somebody's first week, so the list is
        omitted rather than shown empty — but the way to correct history is not,
        because a member with no history is exactly who might have a fortnight
        of training the app never saw.
      */}
      {demanding.length > 0 ? (
        <Panel title="Recent Build">
          <div className="space-y-1.5" data-testid="recent-build">
            {demanding.slice(0, 8).map((e, i) => (
              <div
                key={e.id ?? `${e.onDate}-${i}`}
                className="flex items-baseline justify-between gap-3 py-1"
                data-testid="recent-build-row"
              >
                <span className="text-sm truncate">{eventLabel(e)}</span>
                <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                  {whenShort(e.onDate)}
                </span>
              </div>
            ))}

            {/*
              ── The way to correct it ──

              A member could see a day was missing and do nothing about it. The
              phone was on the bench, the session was at somebody else's gym,
              the app was closed. A history you cannot correct is one you stop
              trusting, and every reading built on it inherits the gap.

              Deliberately quiet and at the bottom: this is a repair, not a
              second way to log training.
            */}
            <button
              onClick={() => setAdding(true)}
              className="pt-2 text-xs text-muted-foreground tap-clean inline-flex items-center gap-1"
              data-testid="add-past-activity"
            >
              <Plus className="h-3 w-3" />
              Add something Sakred missed
            </button>
          </div>
        </Panel>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="w-full text-xs text-muted-foreground tap-clean inline-flex items-center justify-center gap-1 py-1"
          data-testid="add-past-activity"
        >
          <Plus className="h-3 w-3" />
          Add something Sakred missed
        </button>
      )}

      {adding && (
        <LogPractice
          past
          onClose={() => setAdding(false)}
          onLogged={() => qc.invalidateQueries({ queryKey: ["/api/terrain/today"] })}
        />
      )}
    </>
  );
}


/**
 * Why leaving a note is worth the five seconds.
 *
 * Stated once, on the screen where training is chosen, rather than as a
 * tooltip beside every note field. Somebody who does not know that what they
 * type changes anything will not type anything — and the feature is worth
 * exactly what people put into it.
 *
 * Only after they have actually left one, so it reads as an explanation of
 * something happening rather than as an ask.
 */
export function MemoryDisclosure() {
  const { data } = useTrainingMemory();
  if (!data?.observations?.length) return null;

  return (
    <p className="text-[11px] text-muted-foreground leading-relaxed" data-testid="memory-disclosure">
      <span className="text-foreground/80">{MEMORY_DISCLOSURE.title}.</span>{" "}
      {MEMORY_DISCLOSURE.body}
    </p>
  );
}

/**
 * What was said about work like this, before they commit to more of it.
 *
 * The suggestion names a category rather than a movement — "Chest", "Ground
 * movement" — so the match is by category, which is the resolution the
 * recommendation itself has. Matching more precisely than the thing being
 * recommended would be inventing precision.
 */
function SuggestionMemory({ category, label }: { category: string; label: string }) {
  const { data } = useTrainingMemory();
  const found = recallForCategory(data?.observations ?? [], category);
  if (!found) return null;

  const line = recallLine(found, label);
  return (
    <div
      className="rounded-xl border border-border/50 px-3 py-2.5 space-y-1.5"
      data-testid="build-memory"
    >
      <p className="text-xs leading-relaxed">{line.headline}</p>
      {line.quote && (
        <p className="text-xs text-muted-foreground italic leading-relaxed border-l border-border/60 pl-2">
          “{line.quote}”
        </p>
      )}
      <p className="text-[11px] text-muted-foreground leading-relaxed">{line.guidance}</p>
    </div>
  );
}
