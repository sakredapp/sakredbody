/**
 * The intake — who this person actually is, asked once, on the way in.
 *
 * This existed as a form buried inside the Body Map, which meant the app was
 * generic for everyone who never went looking for it. Everything personal the
 * product does — the daily note, the personal day, the soul urge, the whole
 * numerology layer — is computed from two things: a birth date and a birth
 * name. Without them the app is a habit tracker with a nice background.
 *
 * So it is asked at the start, before permissions, because it is the only part
 * of onboarding that makes the app different tomorrow rather than merely
 * better-behaved.
 *
 * ── On the name ───────────────────────────────────────────────────────────
 *
 * The name wanted is the one on the birth certificate, including the middle
 * name — that is the convention numerology uses, and the middle name is not a
 * detail: it changes the expression number outright, because expression is
 * built from every letter. Marked recommended rather than required, because a
 * member who does not know theirs or does not want to give it should still get
 * through this screen.
 *
 * It is stored separately from the display name in `users`. People marry.
 * Changing what a screen calls you must never quietly change your numbers.
 *
 * ── On Y ──────────────────────────────────────────────────────────────────
 *
 * Y is a vowel in some names and a consonant in others, and it moves a letter
 * between soul urge and personality — two different numbers, both wrong if it
 * is guessed. The classifier gets the common cases right and cannot be perfect
 * (English names come from everywhere), so where a name contains a Y the
 * member is shown the call and can correct it. It is their name; they know how
 * they say it.
 */

import { useMemo, useState } from "react";
import { Sparkles } from "lucide-react";
import { explainY } from "@shared/utils/almanac";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type IntakeValues = {
  firstName: string;
  middleName: string;
  lastName: string;
  birthDate: string;
  birthTime: string;
  /** Per-Y overrides, keyed `word:index`, when the member disagrees with us. */
  yOverrides: Record<string, boolean>;
};

export function IntakeStep({
  initial,
  saving,
  error,
  onSubmit,
  onSkip,
}: {
  initial: Partial<IntakeValues>;
  saving: boolean;
  error?: string | null;
  onSubmit: (values: IntakeValues) => void;
  onSkip: () => void;
}) {
  const [firstName, setFirstName] = useState(initial.firstName ?? "");
  const [middleName, setMiddleName] = useState(initial.middleName ?? "");
  const [lastName, setLastName] = useState(initial.lastName ?? "");
  const [birthDate, setBirthDate] = useState(initial.birthDate ?? "");
  const [birthTime, setBirthTime] = useState(initial.birthTime ?? "");
  const [yOverrides, setYOverrides] = useState<Record<string, boolean>>(
    initial.yOverrides ?? {},
  );

  const fullName = [firstName, middleName, lastName]
    .map((s) => s.trim())
    .filter(Boolean)
    .join(" ");

  // Only recomputed when the name changes, because it walks every letter and
  // this runs on each keystroke otherwise.
  const ys = useMemo(() => explainY(fullName), [fullName]);

  // Today, as the picker's ceiling. A birth date in the future is not a
  // validation edge case, it is a typo, and the picker should not offer it.
  const today = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate(),
    ).padStart(2, "0")}`;
  }, []);

  const canSubmit = firstName.trim().length > 0 && Boolean(birthDate) && !saving;

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <div className="space-y-1.5">
          <label className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Name at birth
          </label>
          <Input
            placeholder="First name"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            autoComplete="given-name"
            data-testid="intake-first-name"
          />
          <div className="space-y-1">
            <Input
              placeholder="Middle name"
              value={middleName}
              onChange={(e) => setMiddleName(e.target.value)}
              autoComplete="additional-name"
              data-testid="intake-middle-name"
            />
            {/* Recommended, and said as a reason rather than a nag — the middle
                name genuinely changes the expression number, and a member who
                knows why is far more likely to type it. */}
            <p className="text-[11px] text-muted-foreground">
              <em className="text-[hsl(var(--gold))]">Recommended</em> — the middle name changes
              your expression number. Leave it out if you'd rather.
            </p>
          </div>
          <Input
            placeholder="Last name"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            autoComplete="family-name"
            data-testid="intake-last-name"
          />
          <p className="text-[11px] text-muted-foreground">
            As it appears on your birth certificate — not your married or chosen name. Changing
            what we call you later won't change this.
          </p>
        </div>

        {/* ── The Y question ──────────────────────────────────────────────
            Only ever shown when there is a Y to ask about, so most members
            never see it at all. */}
        {ys.length > 0 && (
          <div className="rounded-xl border border-[hsl(var(--gold))]/20 bg-[hsl(var(--gold))]/[0.04] p-3 space-y-2">
            <div className="flex items-center gap-1.5">
              <Sparkles className="h-3 w-3 text-[hsl(var(--gold))] shrink-0" />
              <p className="text-xs uppercase tracking-[0.18em] text-[hsl(var(--gold))]">
                The Y in your name
              </p>
            </div>
            <p className="text-[11px] text-muted-foreground leading-snug">
              A Y can sound like a vowel or a consonant, and the two give different numbers.
              Here's our reading — correct it if it's wrong.
            </p>
            {ys.map((y) => {
              const key = `${y.word}:${y.index}`;
              const isVowel = yOverrides[key] ?? y.isVowel;
              return (
                <div key={key} className="flex items-center justify-between gap-2">
                  <span className="text-[11px] min-w-0 truncate">
                    <span className="text-muted-foreground">{y.word}</span> — sounds like
                  </span>
                  <div className="flex rounded-lg border border-border/60 overflow-hidden shrink-0">
                    {[true, false].map((vowel) => (
                      <button
                        key={String(vowel)}
                        type="button"
                        onClick={() =>
                          setYOverrides((prev) => ({ ...prev, [key]: vowel }))
                        }
                        className={cn(
                          "px-2.5 py-1 text-[11px] tap-clean transition-colors",
                          isVowel === vowel
                            ? "bg-[hsl(var(--gold))]/20 text-[hsl(var(--gold))]"
                            : "text-muted-foreground",
                        )}
                        data-testid={`intake-y-${key}-${vowel ? "vowel" : "consonant"}`}
                      >
                        {vowel ? "ee / ih" : "yuh"}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="grid grid-cols-1 min-[380px]:grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <label
              htmlFor="intake-birth-date"
              className="text-xs uppercase tracking-[0.18em] text-muted-foreground"
            >
              Date of birth
            </label>
            <Input
              id="intake-birth-date"
              type="date"
              value={birthDate}
              max={today}
              onChange={(e) => setBirthDate(e.target.value)}
              className="[color-scheme:dark]"
              data-testid="intake-birth-date"
            />
          </div>
          <div className="space-y-1.5">
            <label
              htmlFor="intake-birth-time"
              className="text-xs uppercase tracking-[0.18em] text-muted-foreground"
            >
              Time <span className="normal-case tracking-normal">(optional)</span>
            </label>
            <Input
              id="intake-birth-time"
              type="time"
              value={birthTime}
              onChange={(e) => setBirthTime(e.target.value)}
              className="[color-scheme:dark]"
              data-testid="intake-birth-time"
            />
          </div>
        </div>
        {/* Says what the optional field buys, so it reads as an offer rather
            than as another box to fill. */}
        <p className="text-[11px] text-muted-foreground">
          Time of birth is what makes a rising sign possible. Skip it if you don't know — most
          people don't, and everything else works without it.
        </p>
      </div>

      {error && <p className="text-[11px] text-destructive">{error}</p>}

      <div className="flex flex-col gap-2">
        <Button onClick={() => onSubmit({ firstName, middleName, lastName, birthDate, birthTime, yOverrides })}
          disabled={!canSubmit}
          data-testid="intake-save"
        >
          {saving ? "Saving…" : "Continue"}
        </Button>
        <Button variant="ghost" onClick={onSkip} className="text-muted-foreground">
          I'll do this later
        </Button>
      </div>
    </div>
  );
}
