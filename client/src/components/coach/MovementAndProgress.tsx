/**
 * What a client has actually been lifting, and what they chose to show.
 *
 * ── Two sources, two different gates ──────────────────────────────────────
 *
 * Training history is coaching data: it comes from the same `sessionHistory`
 * the member reads, behind `requireCoachOf`, so an administrator running the
 * programme can see it and a coach and their client are never looking at two
 * different weeks.
 *
 * Progress photographs are not. They are behind a relationship-only check, and
 * an administrator gets the same empty answer a stranger does. Which is why
 * this component asks for them separately and treats "none" as a fact rather
 * than an error — an admin viewing a client with photographs sees a panel that
 * says there are none to show them, and that is correct.
 *
 * ── Thumbnails first ──────────────────────────────────────────────────────
 *
 * A client with six months of photographs is forty images. They load at 320px
 * and only when they come near the viewport; the larger one is fetched when a
 * photograph is opened, and not before.
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Panel } from "@/components/portal/Panel";
import { Skeleton } from "@/components/ui/skeleton";
import { MediaImage } from "@/components/MediaImage";
import { MovementHistory } from "@/components/build/MovementHistory";
import { summariseSession, type LoggedSet, type WeightUnit } from "@shared/models/training";
import type { ProgressPhoto } from "@/components/ProgressPhotos";

type Session = {
  id: string;
  onDate: string;
  title: string | null;
  durationMinutes: number | null;
  /*
    The route returns the exercise id alongside every set — `LoggedSet` is the
    shape the summariser wants and deliberately does not carry it, so the two
    are intersected here rather than widening the shared model for one screen.
  */
  sets: (LoggedSet & { exerciseId: string })[];
};

async function readJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error("Couldn't load that");
  return res.json();
}

export function MovementAndProgress({ memberId }: { memberId: string }) {
  const [open, setOpen] = useState<ProgressPhoto | null>(null);
  /** The client's own history of one movement, opened from a session line. */
  const [inspecting, setInspecting] = useState<{ id: string; name: string } | null>(null);

  const movement = useQuery<{ unit: WeightUnit; sessions: Session[] }>({
    queryKey: ["/api/coach/clients", memberId, "movement"],
    queryFn: () => readJson(`/api/coach/clients/${memberId}/movement`),
  });

  const photos = useQuery<ProgressPhoto[]>({
    queryKey: ["/api/coach/clients", memberId, "progress-photos"],
    /*
      A 404 here means "not their coach", which is the deliberate answer for an
      administrator — so it is an empty list, not a red error. The panel below
      says plainly that there is nothing to show.
    */
    queryFn: async () => {
      const res = await fetch(`/api/coach/clients/${memberId}/progress-photos`, {
        credentials: "include",
      });
      if (res.status === 404) return [];
      if (!res.ok) throw new Error("Couldn't load their photos");
      return res.json();
    },
  });

  return (
    <div className="space-y-5">
      <Panel title="Movement">
        {movement.isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : !movement.data?.sessions.length ? (
          <p className="text-[11px] text-muted-foreground/70">
            Nothing logged in Sakred yet.
          </p>
        ) : (
          <ul className="space-y-4">
            {movement.data.sessions.slice(0, 20).map((s) => (
              <li key={s.id} data-testid={`coach-session-${s.id}`}>
                <div className="flex items-baseline gap-2">
                  <span className="text-sm">{s.title ?? "Training"}</span>
                  <span className="ml-auto text-[11px] tabular-nums text-muted-foreground/70">
                    {s.onDate}
                    {s.durationMinutes ? ` · ${s.durationMinutes} min` : ""}
                  </span>
                </div>
                {/*
                  The same summariser that writes the member's own history and
                  the message in the coaching thread. Three readers, one
                  sentence — a coach quoting a session back should be quoting
                  what their client is looking at.
                */}
                <ul className="mt-1 space-y-0.5">
                  {summariseSession(s.sets, movement.data!.unit).map((line, i) => (
                    <li key={i} className="text-[11px] text-muted-foreground/80">
                      {line}
                    </li>
                  ))}
                </ul>

                {/*
                  Each movement in the session opens the client's own history of
                  it. A coach adjusting a weight is asking "what have they been
                  doing here", and the answer is three taps away rather than a
                  question they have to ask in the thread.
                */}
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
                  {Array.from(new Map(s.sets.map((x) => [x.exerciseId, x.name])).entries()).map(
                    ([id, label]) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setInspecting({ id, name: label })}
                        className="text-[10px] uppercase tracking-wide text-muted-foreground/60 hover:text-foreground tap-clean"
                        data-testid={`button-coach-movement-${id}`}
                      >
                        {label}
                      </button>
                    ),
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Progress photos">
        {photos.isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : !photos.data?.length ? (
          <p className="text-[11px] text-muted-foreground/70">
            None shared with you.
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
            {photos.data.map((p) => (
              <figure key={p.id} className="space-y-1">
                <MediaImage
                  assetId={p.assetId}
                  variant="thumb"
                  alt={`Progress photo from ${p.onDate}`}
                  aspect="3 / 4"
                  onClick={() => setOpen(p)}
                />
                <figcaption className="text-[10px] tabular-nums text-muted-foreground/70">
                  {p.onDate}
                </figcaption>
              </figure>
            ))}
          </div>
        )}
      </Panel>

      {inspecting && (
        <MovementHistory
          exerciseId={inspecting.id}
          name={inspecting.name}
          memberId={memberId}
          onClose={() => setInspecting(null)}
        />
      )}

      {open && (
        <div
          className="fixed inset-0 z-[10002] grid place-items-center bg-background/95 p-6"
          onClick={() => setOpen(null)}
          data-testid="overlay-coach-photo"
        >
          <div className="w-full max-w-md space-y-2">
            <MediaImage
              assetId={open.assetId}
              variant="display"
              alt={`Progress photo from ${open.onDate}`}
              aspect="3 / 4"
              /* The same crop the Room had: a photo opened full size that
                 still only showed the middle of itself. */
              fit="contain"
            />
            <p className="text-xs text-muted-foreground">
              {open.onDate}
              {open.note ? ` · ${open.note}` : ""}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
