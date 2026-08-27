/**
 * What you've actually been doing — all of it, in one list.
 *
 * `GET /api/training/sessions` existed and had no caller anywhere in the app.
 * Every path in Build wrote to it — prescribed sessions, self-written
 * workouts, ad-hoc logging, and now practices — and none of them read it back.
 * So a member logged a fifty-minute Lagree class, got a toast, and it was gone:
 * no screen in the product could tell them they had done it.
 *
 * That is a strange hole in a training app, and a fatal one for what Build is
 * meant to become. Everything downstream — noticing that pulling has not been
 * trained in four days, that this week has been all output and no restoration,
 * that today might be better spent on a ride — begins with the member being
 * able to see their own week. If they cannot, neither can anything else.
 *
 * ── Why the phone's sessions belong in the same list ──────────────────────
 *
 * The second half of the same hole: a member whose ring wrote a 54-minute run
 * into Apple Health had that run stored, visible on the Health card, and absent
 * from the one screen that claims to be their week. Two lists in two places is
 * how somebody concludes the app does not know what they did — and it is not a
 * display problem, it is the same fact told twice, badly.
 *
 * Both are shown, including when they are plausibly the same effort. A watch
 * that recorded the session a member also logged in Sakred is not a duplicate
 * to hide; the source is on every line, so two entries read as two recordings
 * rather than two workouts. The terrain reading, which has to decide whether
 * somebody has trained, does dedupe by day and category — that is a different
 * question, asked where it matters.
 *
 * Deliberately quiet. Seven days, one line per movement, no totals and no
 * score. The summary comes from `summariseSession` in the shared model, which
 * is the same function that writes the message into the coaching thread — so a
 * coach and a member reading the same session read the same sentence.
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  isPracticeCategory,
  summariseSession,
  effectivePlacement,
  PLACEMENT_LABEL,
  type LoggedSet,
  type WeightUnit,
  type WorkoutPlacement,
} from "@shared/models/training";
import type { HealthWorkout } from "@shared/schema";
import { useHealthSummary } from "@/hooks/use-health";
import { Panel } from "@/components/portal/Panel";
import { cn } from "@/lib/utils";
import { formatLocalDateString, addDaysToString } from "@shared/utils/dates";
import {
  foldsAt,
  sakredLens,
  summarise,
  summariseTally,
  type SummarisableEntry,
  type Tally,
} from "@shared/models/history";

type Session = {
  id: string;
  onDate: string;
  title: string | null;
  durationMinutes: number | null;
  finishedAt: string | null;
  sets: (LoggedSet & { id: string })[];
};

/** One thing that happened, whoever recorded it. */
type Entry = SummarisableEntry & {
  id: string;
  onDate: string;
  /** For ordering within a day. Sakred sessions have no start time; see below. */
  at: number;
  title: string;
  lines: string[];
  source: string;
};

/** "Today", "Yesterday", then the weekday. Nobody needs a date for this week. */
function when(onDate: string, today: string): string {
  if (onDate === today) return "Today";
  const d = new Date(`${onDate}T12:00:00`);
  const t = new Date(`${today}T12:00:00`);
  const days = Math.round((t.getTime() - d.getTime()) / 86_400_000);
  if (days === 1) return "Yesterday";
  if (days < 7) return d.toLocaleDateString(undefined, { weekday: "long" });
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function minutes(seconds: number | null): string | null {
  if (!seconds) return null;
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

/** The platform, and the app behind it when we recognise one. */
function importedSource(w: HealthWorkout): string {
  const platform = w.source === "healthconnect" ? "Health Connect" : "Apple Health";
  const id = w.sourceApp?.toLowerCase() ?? "";
  const known = ["oura", "strava", "whoop", "garmin", "peloton", "fitbit", "zwift"];
  const match = known.find((k) => id.includes(k));
  return match ? `${match[0].toUpperCase()}${match.slice(1)} via ${platform}` : platform;
}

const PLACEMENT_TONE: Record<WorkoutPlacement, string> = {
  build: "text-gold",
  restore: "text-[hsl(var(--element-water))]",
  both: "text-muted-foreground",
};

/**
 * Which half of the practice a list is about.
 *
 * `null` is everything, which is what Build's own week has always shown and
 * still does. The two named lenses exist because Restore had no history at all
 * — a member logged a fifty-minute mobility session and the only screen that
 * could tell them so was on the other side of the app, under a heading about
 * training.
 *
 * ── How a session is placed ───────────────────────────────────────────────
 *
 * An imported workout carries a placement already, derived from its type and
 * whatever the member overrode it to. A Sakred session does not, deliberately:
 * one session can span several categories and a single badge would be a claim
 * the data does not support.
 *
 * So it is judged by its sets. A session whose movements are all practice
 * categories — breath, mobility, tissue work, restorative movement — belongs
 * to Restore; anything with load in it belongs to Build; and a session with
 * both appears in both, because it genuinely was both and hiding it from one
 * list would be the same lie in a smaller place.
 */
export type HistoryLens = "restore" | "build" | null;

/* The judgement itself lives in `shared/models/history.ts`, because the server
   counts a folded window with the same rule and the two have to agree about
   what a Restore session is. */

export function RecentSessions({
  days = 7,
  lens = null,
  title,
  preview,
}: {
  days?: number;
  lens?: HistoryLens;
  /** Defaults to the honest description of the window being shown. */
  title?: string;
  /**
   * How many entries to show before the member asks for the rest.
   *
   * Build shows this week unfiltered and then thirty days of training, so the
   * six rows a member has just read reappear immediately underneath as the top
   * of the longer list. Neither panel is wrong — the week is everything, the
   * history is Build — but reading the same six activities twice on the way
   * down one screen is what it felt like, and it was thirty days of rows
   * rendered because the API had already returned them.
   *
   * Summary first, then as much as was asked for. Undefined keeps the old
   * behaviour of rendering everything, so a caller that wants a wall can still
   * have one.
   */
  preview?: number;
}) {
  const [open, setOpen] = useState(false);

  // The member's own date, which is what `onDate` is written against. This read
  // `toISOString()`, which is the UTC date and not anybody's calendar: after
  // 20:00 in Toronto it is already tomorrow, so the session somebody had just
  // finished came back labelled "Yesterday". The comment here claimed the fix
  // while the line underneath it did the opposite.
  const today = formatLocalDateString();
  const cutoff = addDaysToString(today, -days);

  /*
    ── Folded is a read, not a `display: none` ───────────────────────────────

    A panel that shows no rows until you ask for them used to fetch sixty
    sessions with every set inside them, plus thirty days of imported
    workouts, and then render four of them. Hiding a wall is not the same as
    not building one: on a phone the fetch is the cost, not the DOM.

    So a folded panel asks the server to count the window instead — categories,
    no measures — and the rows are fetched when somebody opens them. `preview`
    undefined means a caller that wants everything listed, and it still gets
    everything, immediately.
  */
  /*
    The count decides whether folding is even appropriate, and the count is the
    cheap read — so it comes first and the rows follow only if they are wanted.

    Without this the fold ignored its own floor. `foldsAt` exists because "2
    sessions — All 2" asks somebody to press a button to see what would have
    fit anyway, and a panel that folds before it knows how much it is folding
    does exactly that. Below the floor this costs one small round trip before
    the rows; a member with three sessions is not the one this saves.
  */
  const summaryQuery = useQuery<Tally>({
    queryKey: [`/api/training/sessions/tally?since=${cutoff}&lens=${lens ?? ""}`],
    staleTime: 60_000,
    enabled: preview === 0 && !open,
  });
  const counted = summaryQuery.data;
  const folded = preview === 0 && !open && (counted === undefined || foldsAt(counted.count, preview));

  const { data, isLoading } = useQuery<{ unit: WeightUnit; sessions: Session[] }>({
    queryKey: ["/api/training/sessions"],
    staleTime: 60_000,
    enabled: !folded,
  });
  // Already fetched by the Health card on Stats, so on most navigations this
  // is a cache read rather than a second request.
  const health = useHealthSummary(30, !folded);

  if (folded) {
    /* Nothing in the window is nothing to fold, and a panel that appears only
       to say "0 sessions" is noise on a screen that is otherwise about
       today — the listed path returns null for an empty window too. */
    const t = counted;
    if (!t || t.count === 0) return null;
    return (
      <Folded
        title={title ?? (days <= 7 ? "This week" : `The last ${days} days`)}
        summary={summariseTally(t)}
        count={t.count}
        onOpen={() => setOpen(true)}
      />
    );
  }

  if (isLoading || !data) return null;

  // An unfinished session is one somebody is in the middle of, or abandoned.
  // Either way it is not history yet, and showing it as a completed day is a
  // small lie the rest of the screen would inherit.
  const logged: Entry[] = data.sessions
    .filter((s) => s.finishedAt && s.onDate >= cutoff && s.sets.length > 0)
    .filter((s) => {
      if (!lens) return true;
      const has = sakredLens(s.sets.map((x) => x.category), isPracticeCategory);
      return lens === "restore" ? has.restore : has.build;
    })
    .map((s) => ({
      id: s.id,
      onDate: s.onDate,
      // `finishedAt` when there is one. A Sakred session has no start time
      // recorded — the same gap the terrain dedupe works around — so this
      // orders by when it ended, which for a single day is close enough and is
      // at least a real timestamp rather than an invented one.
      at: s.finishedAt ? new Date(s.finishedAt).getTime() : new Date(`${s.onDate}T12:00:00`).getTime(),
      title: s.title?.trim() || "Training",
      lines: summariseSession(s.sets, data.unit),
      source: "Sakred",
      // Left to the sets rather than asserted here: a Sakred session can span
      // several categories, and reducing it to one badge would be a claim the
      // data does not support.
      placement: null,
      seconds: null,
    }));

  const imported: Entry[] = (health.data?.workouts ?? [])
    .filter((w) => w.onDate >= cutoff)
    .map((w) => ({
      id: w.id,
      onDate: w.onDate,
      at: new Date(w.startAt).getTime(),
      title: w.workoutType ?? "Workout",
      lines: [minutes(w.durationSeconds)].filter(Boolean) as string[],
      source: importedSource(w),
      placement: effectivePlacement(
        w.workoutType,
        (w.userOrientationOverride ?? null) as WorkoutPlacement | null,
      ),
      seconds: w.durationSeconds ?? null,
    }));

  /*
    An imported workout's placement is already the answer. `both` belongs to
    either lens — a long walk is restorative and it is also movement — and an
    entry with no placement at all is not claimed by a filtered list, because
    guessing would put somebody's unclassified activity under a heading it may
    not belong to.
  */
  const importedInLens = lens
    ? imported.filter((e) => e.placement === lens || e.placement === "both")
    : imported;

  /*
    No cap.

    This used to keep the newest twenty, which was the right defence when the
    only alternative was a wall. Folding is that defence now, and the cap has
    become a liability: the summary above the list is counted by the server
    over the whole window, so a member with twenty-five Restore entries would
    read "25 sessions" above a list of twenty. A count that disagrees with the
    list under it is worse than no count.
  */
  const recent = [...logged, ...importedInLens].sort((a, b) => b.at - a.at);

  if (recent.length === 0) return null;

  return (
    <Sessions
      title={title ?? (days <= 7 ? "This week" : `The last ${days} days`)}
      entries={recent}
      today={today}
      preview={preview}
      open={open}
      onToggle={() => setOpen((v) => !v)}
    />
  );
}

/**
 * The window before anybody has asked to see inside it.
 *
 * Deliberately the same two elements as the summary row on an expanded panel —
 * a sentence and a way in — so opening one does not feel like arriving
 * somewhere else.
 */
function Folded({
  title,
  summary,
  count,
  onOpen,
}: {
  title: string;
  summary: string;
  count: number;
  onOpen: () => void;
}) {
  return (
    <Panel title={title}>
      <button
        type="button"
        onClick={onOpen}
        aria-expanded={false}
        className="flex w-full items-center justify-between gap-3 text-left tap-clean"
        data-testid={`sessions-summary-${title.toLowerCase().replace(/[^a-z]+/g, "-")}`}
      >
        <span className="text-sm text-muted-foreground">{summary}</span>
        <span className="shrink-0 text-xs text-gold">{`All ${count}`}</span>
      </button>
    </Panel>
  );
}

/**
 * The rows, and what to say instead of all of them.
 *
 * Split out so the summary is derived from exactly the entries that would have
 * been rendered — a count that disagrees with the list underneath it is worse
 * than no count.
 */
function Sessions({
  title,
  entries,
  today,
  preview,
  open,
  onToggle,
}: {
  title: string;
  entries: Entry[];
  today: string;
  preview?: number;
  open: boolean;
  onToggle: () => void;
}) {
  /*
    A summary is worth reading in place of a wall, and silly in place of two
    rows: "2 sessions — All 2" asks the member to press a button to see what
    would have fit anyway. So collapsing has a floor as well as a preview.
  */
  const limited = foldsAt(entries.length, preview);
  const shown = limited && !open ? entries.slice(0, preview) : entries;

  return (
    <Panel title={title}>
      {limited && (
        /*
          What the window amounts to, before any of it. A member scanning down
          Build wants "four sessions, mostly Build, about three hours" — the
          rows are for when that raises a question.
        */
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="mb-3 flex w-full items-center justify-between gap-3 text-left tap-clean"
          data-testid={`sessions-summary-${title.toLowerCase().replace(/[^a-z]+/g, "-")}`}
        >
          <span className="text-sm text-muted-foreground">{summarise(entries)}</span>
          <span className="shrink-0 text-xs text-gold">
            {open ? "Show less" : `All ${entries.length}`}
          </span>
        </button>
      )}
      <div className="space-y-3">
        {shown.map((e) => (
          <div key={e.id} className="space-y-1" data-testid={`recent-session-${e.id}`}>
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-sm truncate capitalize">{e.title}</p>
              <span className="text-[11px] text-muted-foreground shrink-0">
                {when(e.onDate, today)}
              </span>
            </div>
            <ul className="space-y-0.5">
              {e.lines.map((line, i) => (
                <li key={i} className="text-[11px] text-muted-foreground truncate">
                  {line}
                </li>
              ))}
            </ul>
            {/*
              Who recorded it, on every line rather than only the imported
              ones. "Sakred" next to a session the member logged is what makes
              "Oura via Apple Health" next to the one they did not read as an
              explanation instead of a mystery.
            */}
            <p className="text-[10px] text-muted-foreground/70 truncate">{e.source}</p>
            {e.placement && (
              <span
                className={cn(
                  "inline-block text-[9px] uppercase tracking-widest",
                  PLACEMENT_TONE[e.placement],
                )}
              >
                {PLACEMENT_LABEL[e.placement]}
              </span>
            )}
          </div>
        ))}
      </div>
    </Panel>
  );
}


