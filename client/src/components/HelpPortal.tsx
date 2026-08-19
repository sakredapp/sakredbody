/**
 * How to Use Sakred.
 *
 * ── Why the walkthrough gets a permanent home ─────────────────────────────
 *
 * Because it was reachable exactly once, on the day somebody signed up, and a
 * tutorial you can only meet on your first morning is a tutorial you have to
 * remember perfectly while also learning what a terrain reading is. The parts
 * a member wants later — how sets and RPE work, what LAST TIME is for, why
 * Sakred suggested what it suggested — are the parts nobody absorbs on day
 * one.
 *
 * So this is an operating manual rather than an onboarding artifact, and it is
 * named as one. "Tutorial" is something you outgrow.
 *
 * ── One destination, three doors ──────────────────────────────────────────
 *
 *   More      the functional door: it is where a member goes to *do* something
 *   Settings  the recovery door: "I paused it and want it back"
 *   Library   the educational door, beside the other things worth reading
 *
 * All three resolve here. Three implementations of a help screen would be
 * three sets of copy to keep true about one walkthrough, which is how a
 * product ends up telling somebody they have completed a tour they paused.
 *
 * ── What it does not contain ──────────────────────────────────────────────
 *
 * The lessons. Every title below is read from `SAKRED_INTRO` at render, so the
 * index cannot drift from what the walkthrough actually teaches, and a lesson
 * added next month appears here without anybody remembering to add it. The
 * first version is deliberately an index rather than an encyclopedia: an
 * accurate map into the real thing beats a set of articles that quietly stop
 * describing the app.
 */

import { useMemo } from "react";
import { BookOpen, Play, RotateCcw, UserCog } from "lucide-react";
import { Panel } from "@/components/portal/Panel";
import { SAKRED_INTRO } from "@/lib/tour/sakredIntro";
import { chapters, stateSentence, walkthroughState } from "@/lib/tour/help";
import { readProgress } from "@/lib/tour/progress";
import { requestReplay } from "@/lib/tour/rollout";
import { cn } from "@/lib/utils";

/**
 * Start the walkthrough, from the beginning or from one chapter.
 *
 * A full reload rather than a state change, because the tour's preconditions
 * are about a settled screen — it refuses to start over skeletons — and the
 * honest way to give it one is to let the app boot into it. The request
 * survives in storage; see `requestReplay`.
 */
function play(from: string | null): void {
  requestReplay(from);
  window.location.assign("/member");
}

export function HelpPortal({ isCoach = false }: { isCoach?: boolean }) {
  /*
    Read once. This screen is not live — the walkthrough cannot be running
    while somebody is reading about it, because starting one navigates away.
  */
  const { state, list } = useMemo(() => {
    const progress = readProgress(SAKRED_INTRO);
    const completed = new Set(progress?.completed ?? []);
    return {
      state: walkthroughState(progress, SAKRED_INTRO),
      list: chapters(SAKRED_INTRO, completed),
    };
  }, []);

  const paused = state.kind === "paused" ? state : null;

  return (
    <div className="space-y-4" data-testid="help-portal">
      <header className="space-y-1.5">
        <h1 className="font-serif text-2xl tracking-tight text-foreground">How to Use Sakred</h1>
        <p className="text-sm text-muted-foreground">
          Learn the system, replay the walkthrough, and find your way around each part of the app.
        </p>
      </header>

      {/* ── Start here ───────────────────────────────────────────────────── */}

      <Panel title="Start here" data-testid="help-start">
        <p className="text-sm text-muted-foreground mb-4">{stateSentence(state, SAKRED_INTRO)}</p>

        <div className="flex flex-wrap gap-2">
          {/*
            Resume comes first when there is something to resume, because
            somebody who paused in Build wants their place back, not the
            welcome screen again. It is absent otherwise rather than disabled:
            an offer to resume nothing is a control that teaches distrust.
          */}
          {paused && (
            <button
              type="button"
              onClick={() => play(paused.stepId)}
              className="inline-flex items-center gap-2 rounded-full bg-[hsl(var(--gold))]/15 px-4 py-2 text-sm text-[hsl(var(--gold-text))] tap-clean hover:bg-[hsl(var(--gold))]/25 transition-colors"
              data-testid="button-help-resume"
            >
              <Play className="h-4 w-4" aria-hidden="true" />
              Resume the walkthrough
            </button>
          )}

          <button
            type="button"
            onClick={() => play(null)}
            className={cn(
              "inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm tap-clean transition-colors",
              paused
                ? "border border-border/60 text-muted-foreground hover:text-foreground"
                : "bg-[hsl(var(--gold))]/15 text-[hsl(var(--gold-text))] hover:bg-[hsl(var(--gold))]/25",
            )}
            data-testid="button-help-replay"
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            Replay the Sakred walkthrough
          </button>
        </div>

        {/*
          Said out loud, because "replay" is a word people have been trained to
          distrust by apps that reset things with it.
        */}
        <p className="text-xs text-muted-foreground/80 mt-3">
          Replaying changes nothing — not your training, not your check-ins, not your record of
          having been through it.
        </p>
      </Panel>

      {/* ── The map ──────────────────────────────────────────────────────── */}

      {list.map((chapter) => (
        <Panel
          key={chapter.name}
          title={chapter.name}
          data-testid={`help-chapter-${chapter.name.toLowerCase().replace(/\s+/g, "-")}`}
        >
          <ul className="space-y-1.5 mb-3">
            {chapter.lessons.map((lesson) => (
              <li key={lesson.id} className="flex items-baseline gap-2 text-sm text-muted-foreground">
                <span aria-hidden="true" className="text-[hsl(var(--gold))]/50">·</span>
                <span>{lesson.title}</span>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => play(chapter.fromStepId)}
            className="text-xs text-muted-foreground hover:text-foreground tap-clean transition-colors"
            data-testid={`button-help-replay-${chapter.fromStepId}`}
          >
            Replay this part →
          </button>
        </Panel>
      ))}

      {/* ── The coach's half ─────────────────────────────────────────────── */}

      {/*
        Shown by role and never by default. A member has no use for a section
        about client workspaces, and a portal that lists them anyway is telling
        them the app has rooms they cannot enter.
      */}
      {isCoach && (
        <Panel title="Coaching" data-testid="help-coach">
          <ul className="space-y-1.5 text-sm text-muted-foreground">
            <li>The coach workspace, and what a client sees of it</li>
            <li>Needs Attention, and what puts somebody there</li>
            <li>Writing and revising a plan</li>
            <li>Movement and progress, as your client records it</li>
          </ul>
          <p className="text-xs text-muted-foreground/80 mt-3">
            <UserCog className="inline h-3.5 w-3.5 mr-1 -mt-0.5" aria-hidden="true" />
            Only you see this. Members see the member half.
          </p>
        </Panel>
      )}

      <p className="flex items-start gap-2 text-xs text-muted-foreground/80 px-1">
        <BookOpen className="h-3.5 w-3.5 mt-0.5 shrink-0" aria-hidden="true" />
        <span>
          Longer reading lives in the Library. This is the map — what each part of Sakred is for,
          and how to reach it.
        </span>
      </p>
    </div>
  );
}
