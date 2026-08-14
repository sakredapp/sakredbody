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

import { useQuery } from "@tanstack/react-query";
import { useToday } from "@/components/TodayRead";
import { Panel } from "@/components/portal/Panel";
import { buildGate, REPORT_INVITE } from "@shared/models/buildToday";
import { EXERCISE_CATEGORIES } from "@shared/models/training";
import { ChevronRight } from "lucide-react";

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

export function TodaysBuild({ onCheckIn }: { onCheckIn?: () => void }) {
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

        {/* No chevron and no tap target on these rows. Starting one means
            composing a session, which is the builder further down the screen —
            and a row that looks tappable and is not is a worse screen than one
            that plainly reads as information. */}
        {gate.options.length > 0 && (
          <div className="space-y-2">
            {gate.options.map((s) => (
              <div
                key={s.category}
                className="rounded-xl border border-border/50 px-3 py-2.5"
                data-testid={`build-option-${s.category}`}
              >
                <p className="text-sm">{s.label}</p>
                <p className="text-xs text-muted-foreground leading-relaxed">{s.headline}</p>
                {/* Only where the engine had a basis. An invented because is
                    worse than none — see recommend.ts. */}
                {s.because && (
                  <p className="text-[11px] text-muted-foreground/70 mt-0.5">{s.because}</p>
                )}
              </div>
            ))}
          </div>
        )}

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
  const terrain = useQuery<TerrainReading>({ queryKey: ["/api/terrain/today"] });
  const events = terrain.data?.movementEvents ?? [];

  const demanding = events.filter((e) =>
    (e.orientations ?? [e.orientation]).some((o) => o === "yang" || o === "both"),
  );

  // Nothing yet is a real answer on somebody's first week, and an empty
  // bordered box announcing it is not.
  if (!demanding.length) return null;

  return (
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
      </div>
    </Panel>
  );
}
