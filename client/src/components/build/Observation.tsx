/**
 * How that felt — in your words, and one of theirs if it helps.
 *
 * ── The vocabulary is short on purpose ────────────────────────────────────
 *
 * Five words and a sentence. Not a symptom checklist, not a pain scale, not a
 * body diagram — those belong to a different product and they change what a
 * member thinks they are being asked. "Tight" and "weak connection" are how
 * people describe training; "moderate anterior knee pain, 4/10" is how people
 * describe an injury, and an app that asks the second question every evening
 * teaches somebody to think of their training as a series of complaints.
 *
 * ── And the sentence outranks the word ────────────────────────────────────
 *
 * The word is there so a member in a hurry can leave something rather than
 * nothing, and so a reader has something to filter on. The sentence is the
 * actual record: "left glute didn't seem to connect" cannot be reconstructed
 * from `weak · left`, and it is the half that turns out to matter when the
 * same movement comes round again.
 *
 * Nothing here is required. Either half is a complete answer.
 */

import { useState } from "react";
import { OBSERVATION_QUALITIES, OBSERVATION_SIDES } from "@shared/models/training";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  OBSERVATION_QUALITY_LABEL,
  OBSERVATION_SIDE_LABEL,
} from "@shared/models/labels";
import type { ObservationQuality, ObservationSide } from "@shared/models/training";

export type Observation = {
  id?: string;
  exerciseId: string | null;
  note: string | null;
  quality: string | null;
  side: string | null;
};

/** The one-word summary a row shows when something has already been said. */
export function observationSummary(o: Observation): string {
  const word = o.quality ? OBSERVATION_QUALITY_LABEL[o.quality as ObservationQuality] : null;
  const side = o.side ? OBSERVATION_SIDE_LABEL[o.side as ObservationSide] : null;
  if (word && side) return `${word} · ${side.toLowerCase()}`;
  if (word) return word;
  return "Noted";
}

function Chip({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={cn(
        "rounded-full border px-3 py-1.5 text-xs tap-clean transition-colors shrink-0",
        on
          ? "border-[hsl(var(--gold))]/60 bg-[hsl(var(--gold))]/10 text-foreground"
          : "border-border/60 text-muted-foreground",
      )}
    >
      {children}
    </button>
  );
}

export function ObservationForm({
  title,
  /** Only a per-side movement makes the question worth asking. */
  unilateral,
  existing,
  saving,
  onSave,
  onCancel,
}: {
  title: string;
  unilateral?: boolean;
  existing?: Observation | null;
  saving: boolean;
  onSave: (o: { note: string | null; quality: string | null; side: string | null }) => void;
  onCancel: () => void;
}) {
  const [quality, setQuality] = useState<string | null>(existing?.quality ?? null);
  const [side, setSide] = useState<string | null>(existing?.side ?? null);
  const [note, setNote] = useState(existing?.note ?? "");

  const ready = note.trim().length > 0 || !!quality;

  return (
    <>
      <div className="shrink-0 px-4 pt-3 pb-2 border-b border-border/40">
        <p className="font-display text-lg">{title}</p>
        <p className="text-[11px] text-muted-foreground">How did that land?</p>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto scroll-touch px-4 py-4 space-y-5">
        <div className="flex flex-wrap gap-2">
          {OBSERVATION_QUALITIES.map((q) => (
            <Chip key={q} on={quality === q} onClick={() => setQuality(quality === q ? null : q)}>
              {OBSERVATION_QUALITY_LABEL[q]}
            </Chip>
          ))}
        </div>

        {/*
          Asked only where it is a real question. A bench press has no side, and
          offering one would make the form look like a triage sheet.
        */}
        {unilateral && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">Which side?</p>
            <div className="flex flex-wrap gap-2">
              {OBSERVATION_SIDES.map((s) => (
                <Chip key={s} on={side === s} onClick={() => setSide(side === s ? null : s)}>
                  {OBSERVATION_SIDE_LABEL[s]}
                </Chip>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">In your words</p>
          {/*
            The half that matters. A textarea rather than an input because
            people write a sentence here, and a single line that scrolls
            sideways discourages the sentence.
          */}
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Slight low-back discomfort on the left leg. Glute didn't feel like it was firing."
            maxLength={1000}
            rows={4}
            className="w-full rounded-lg border border-border/60 bg-transparent px-3 py-2 text-base md:text-sm leading-relaxed resize-none"
            data-testid="observation-note"
          />
        </div>
      </div>

      <div className="shrink-0 px-4 py-3 pb-safe border-t border-border/40 flex gap-2">
        <Button variant="ghost" onClick={onCancel} className="flex-1 text-muted-foreground">
          Back
        </Button>
        <Button
          className="flex-1"
          disabled={!ready || saving}
          onClick={() =>
            onSave({ note: note.trim() || null, quality, side: unilateral ? side : null })
          }
          data-testid="observation-save"
        >
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
    </>
  );
}
