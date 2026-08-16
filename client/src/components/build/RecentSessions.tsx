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

import { useQuery } from "@tanstack/react-query";
import {
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
import { localToday, localDaysAgo } from "@/lib/localDate";

type Session = {
  id: string;
  onDate: string;
  title: string | null;
  durationMinutes: number | null;
  finishedAt: string | null;
  sets: (LoggedSet & { id: string })[];
};

/** One thing that happened, whoever recorded it. */
type Entry = {
  id: string;
  onDate: string;
  /** For ordering within a day. Sakred sessions have no start time; see below. */
  at: number;
  title: string;
  lines: string[];
  source: string;
  placement: WorkoutPlacement | null;
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
  build: "text-[hsl(var(--gold))]",
  restore: "text-[hsl(var(--element-water))]",
  both: "text-muted-foreground",
};

export function RecentSessions({ days = 7 }: { days?: number }) {
  const { data, isLoading } = useQuery<{ unit: WeightUnit; sessions: Session[] }>({
    queryKey: ["/api/training/sessions"],
    staleTime: 60_000,
  });
  // Already fetched by the Health card on Stats, so on most navigations this
  // is a cache read rather than a second request.
  const health = useHealthSummary(30);

  if (isLoading || !data) return null;

  // The member's own date, which is what `onDate` is written against. This read
  // `toISOString()`, which is the UTC date and not anybody's calendar: after
  // 20:00 in Toronto it is already tomorrow, so the session somebody had just
  // finished came back labelled "Yesterday". The comment here claimed the fix
  // while the line underneath it did the opposite.
  const today = localToday();
  const cutoff = localDaysAgo(days);

  // An unfinished session is one somebody is in the middle of, or abandoned.
  // Either way it is not history yet, and showing it as a completed day is a
  // small lie the rest of the screen would inherit.
  const logged: Entry[] = data.sessions
    .filter((s) => s.finishedAt && s.onDate >= cutoff && s.sets.length > 0)
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
    }));

  const recent = [...logged, ...imported].sort((a, b) => b.at - a.at).slice(0, 12);

  if (recent.length === 0) return null;

  return (
    <Panel title="This week">
      <div className="space-y-3">
        {recent.map((e) => (
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
