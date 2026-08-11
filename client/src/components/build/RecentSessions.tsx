/**
 * What you've actually been doing.
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
 * Deliberately quiet. Seven days, one line per movement, no totals and no
 * score. The summary comes from `summariseSession` in the shared model, which
 * is the same function that writes the message into the coaching thread — so a
 * coach and a member reading the same session read the same sentence.
 */

import { useQuery } from "@tanstack/react-query";
import { summariseSession, type LoggedSet, type WeightUnit } from "@shared/models/training";
import { Panel } from "@/components/portal/Panel";

type Session = {
  id: string;
  onDate: string;
  title: string | null;
  durationMinutes: number | null;
  finishedAt: string | null;
  sets: (LoggedSet & { id: string })[];
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

export function RecentSessions({ days = 7 }: { days?: number }) {
  const { data, isLoading } = useQuery<{ unit: WeightUnit; sessions: Session[] }>({
    queryKey: ["/api/training/sessions"],
    staleTime: 60_000,
  });

  if (isLoading || !data) return null;

  // The member's own date, which is what `onDate` is written against — using
  // the device's today would put a late-evening session in the wrong bucket
  // for anybody whose timezone differs from the one they logged it in.
  const today = new Date().toISOString().slice(0, 10);
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);

  // An unfinished session is one somebody is in the middle of, or abandoned.
  // Either way it is not history yet, and showing it as a completed day is a
  // small lie the rest of the screen would inherit.
  const recent = data.sessions
    .filter((s) => s.finishedAt && s.onDate >= cutoff && s.sets.length > 0)
    .slice(0, 10);

  if (recent.length === 0) return null;

  return (
    <Panel title="This week">
      <div className="space-y-3">
        {recent.map((s) => {
          const lines = summariseSession(s.sets, data.unit);
          return (
            <div key={s.id} className="space-y-1" data-testid={`recent-session-${s.id}`}>
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-sm truncate">{s.title?.trim() || "Training"}</p>
                <span className="text-[11px] text-muted-foreground shrink-0">
                  {when(s.onDate, today)}
                </span>
              </div>
              <ul className="space-y-0.5">
                {lines.map((line, i) => (
                  <li key={i} className="text-[11px] text-muted-foreground truncate">
                    {line}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}
