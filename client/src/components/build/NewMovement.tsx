/**
 * The catalogue doesn't have it, so describe it once and keep it.
 *
 * ── Why this is a form and not a text box ─────────────────────────────────
 *
 * "Can't find it? Add your own" used to send the name and nothing else, and
 * filled the rest in with a guess: category `full_body`, equipment `other`,
 * bilateral, tracked in reps, takes load. That guess is wrong often enough to
 * matter, and it is wrong permanently — the row is reused every time the
 * movement is logged again.
 *
 * A real example, from the account this was written for. Somebody doing a
 * loaded single-leg hinge searched "rdl", found only a bodyweight balance
 * drill, and added their own. What they got was a `full_body` movement with no
 * side, so their 35 lb × 13 per leg cannot be compared with any hinge in the
 * catalogue, will never appear as leg work in their terrain, and does not say
 * "per side" on the row where the number is entered. Four seconds of questions
 * at the point of creation is the difference.
 *
 * ── Four questions, and none of them optional-looking ────────────────────
 *
 * Only the ones that change what the app can do with the answer:
 *
 *   what part of you   the category, which is what every reading of their
 *                      training reasons over
 *   what you use       equipment, so it reads correctly in history
 *   how it counts      weight and reps, reps alone, time, or distance — this
 *                      decides which boxes appear on the set row
 *   per side           because a per-side number is not the same number
 *
 * Everything else the row needs has a defensible default and is not asked.
 */

import { useState } from "react";
import { EXERCISE_CATEGORIES, EXERCISE_GROUPS } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** What a member is realistically holding. The full vocabulary is for the seed. */
const EQUIPMENT = [
  "bodyweight",
  "dumbbell",
  "barbell",
  "kettlebell",
  "machine",
  "cable",
  "band",
  "other",
] as const;

const COUNTS = [
  { id: "load_reps", label: "Weight and reps", tracking: "reps", load: true },
  { id: "reps", label: "Reps only", tracking: "reps", load: false },
  { id: "time", label: "Time", tracking: "duration", load: false },
  { id: "distance", label: "Distance", tracking: "distance", load: false },
] as const;

export type NewMovementInput = {
  name: string;
  category: string;
  equipment: string;
  trackingType: "reps" | "duration" | "distance";
  takesLoad: boolean;
  unilateral: boolean;
};

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

export function NewMovement({
  name: initialName,
  saving,
  onCreate,
  onCancel,
}: {
  /** Whatever they had typed in the search box. Usually the whole answer. */
  name: string;
  saving: boolean;
  onCreate: (m: NewMovementInput) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initialName);
  const [group, setGroup] = useState<string | null>(null);
  const [category, setCategory] = useState<string | null>(null);
  const [equipment, setEquipment] = useState<string>("dumbbell");
  const [counts, setCounts] = useState<(typeof COUNTS)[number]["id"]>("load_reps");
  const [unilateral, setUnilateral] = useState(false);

  /**
   * Categories are shown a group at a time. Forty chips in a row is a list to
   * read rather than a question to answer, and the group somebody taps is
   * almost always obvious from the movement they just failed to find.
   */
  const groups = EXERCISE_GROUPS.filter((g) => g.id !== "practice");
  const inGroup = EXERCISE_CATEGORIES.filter((c) => c.group === group);

  const chosen = COUNTS.find((c) => c.id === counts)!;
  const ready = name.trim().length > 1 && !!category;

  return (
    <>
      <div className="shrink-0 px-4 pt-3 pb-2 border-b border-border/40">
        <p className="font-display text-lg">Add your own</p>
        <p className="text-[11px] text-muted-foreground">
          Described once, and it's there every time after.
        </p>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto scroll-touch px-4 py-4 space-y-5">
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">What is it called?</p>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Single-Leg Romanian Deadlift"
            maxLength={80}
            data-testid="new-movement-name"
          />
        </div>

        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">What does it work?</p>
          <div className="flex flex-wrap gap-2">
            {groups.map((g) => (
              <Chip
                key={g.id}
                on={group === g.id}
                onClick={() => {
                  setGroup(group === g.id ? null : g.id);
                  setCategory(null);
                }}
              >
                {g.label}
              </Chip>
            ))}
          </div>
          {inGroup.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-1">
              {inGroup.map((c) => (
                <Chip
                  key={c.id}
                  on={category === c.id}
                  onClick={() => setCategory(category === c.id ? null : c.id)}
                >
                  {c.label}
                </Chip>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">What do you use?</p>
          <div className="flex flex-wrap gap-2">
            {EQUIPMENT.map((e) => (
              <Chip key={e} on={equipment === e} onClick={() => setEquipment(e)}>
                {e === "bodyweight" ? "Bodyweight" : e[0].toUpperCase() + e.slice(1)}
              </Chip>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">How do you count it?</p>
          <div className="flex flex-wrap gap-2">
            {COUNTS.map((c) => (
              <Chip key={c.id} on={counts === c.id} onClick={() => setCounts(c.id)}>
                {c.label}
              </Chip>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">One side at a time?</p>
          <div className="flex flex-wrap gap-2">
            <Chip on={!unilateral} onClick={() => setUnilateral(false)}>
              Both together
            </Chip>
            <Chip on={unilateral} onClick={() => setUnilateral(true)}>
              Per side
            </Chip>
          </div>
        </div>
      </div>

      <div className="shrink-0 px-4 py-3 pb-safe border-t border-border/40 flex gap-2">
        <Button variant="ghost" onClick={onCancel} className="flex-1 text-muted-foreground">
          Cancel
        </Button>
        <Button
          className="flex-1"
          disabled={!ready || saving}
          onClick={() =>
            onCreate({
              name: name.trim(),
              category: category!,
              equipment,
              trackingType: chosen.tracking,
              takesLoad: chosen.load,
              unilateral,
            })
          }
          data-testid="new-movement-save"
        >
          {saving ? "Adding…" : "Add it"}
        </Button>
      </div>
    </>
  );
}
