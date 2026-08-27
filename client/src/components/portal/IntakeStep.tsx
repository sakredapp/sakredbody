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
import { explainY } from "@shared/utils/almanac";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BirthDateField, BirthTimeField } from "./BirthFields";
import { cn } from "@/lib/utils";

export type IntakeValues = {
  firstName: string;
  middleName: string;
  lastName: string;
  birthDate: string;
  birthTime: string;
  /**
   * Male or female, or null when not yet answered.
   *
   * Nullable because everyone who signed up before this field existed has no
   * answer, and defaulting them to either one would be inventing data about a
   * person — the same rule the health tables follow.
   */
  sex: "male" | "female" | null;
  /**
   * 'private' means asked and declined, which is different from null meaning
   * never asked — so nothing prompts a member who already said no.
   */
  relationshipStatus: "single" | "dating" | "married" | "private" | null;
  /** Per-Y overrides, keyed `word:index`, when the member disagrees with us. */
  yOverrides: Record<string, boolean>;
};

export function IntakeStep({
  initial,
  saving,
  error,
  onSubmit,
}: {
  initial: Partial<IntakeValues>;
  saving: boolean;
  error?: string | null;
  onSubmit: (values: IntakeValues) => void;
}) {
  const [firstName, setFirstName] = useState(initial.firstName ?? "");
  const [middleName, setMiddleName] = useState(initial.middleName ?? "");
  const [lastName, setLastName] = useState(initial.lastName ?? "");
  const [birthDate, setBirthDate] = useState(initial.birthDate ?? "");
  const [birthTime, setBirthTime] = useState(initial.birthTime ?? "");
  const [sex, setSex] = useState<"male" | "female" | null>(initial.sex ?? null);
  const [relationshipStatus, setRelationshipStatus] = useState<
    "single" | "dating" | "married" | "private" | null
  >(initial.relationshipStatus ?? null);
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

  const canSubmit = firstName.trim().length > 0 && Boolean(birthDate) && !saving;

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <div className="space-y-1.5">
          {/* Your full name, said as a heading, with each field labelled
              underneath. A placeholder is not a label: the moment somebody
              types, "First name" vanishes and three stacked boxes become
              three anonymous ones — which is exactly how it read on a device,
              where the only visible words were "Name at birth" and "Middle
              name" and the other two fields explained nothing. */}
          <label className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Your full name at birth
          </label>
          <div className="space-y-1">
            <span className="block text-[11px] text-muted-foreground">First</span>
            <Input
              placeholder="First name"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              autoComplete="given-name"
              data-testid="intake-first-name"
            />
          </div>
          <div className="space-y-1">
            <span className="block text-[11px] text-muted-foreground">
              Middle <em className="text-gold not-italic">— recommended</em>
            </span>
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
              The middle name changes your expression number. Leave it out if you'd rather.
            </p>
          </div>
          <div className="space-y-1">
            <span className="block text-[11px] text-muted-foreground">Last</span>
            <Input
            placeholder="Last name"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            autoComplete="family-name"
            data-testid="intake-last-name"
          />
          </div>
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
            {/* Quoted, because a bare letter next to "The" reads as the word
                "They" at a glance — which is a different sentence entirely.
                The icon that used to sit here made it worse by pulling the eye
                past the gap. */}
            <p className="text-xs uppercase tracking-[0.18em] text-gold">
              The &ldquo;Y&rdquo; in your name
            </p>
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
                            ? "bg-[hsl(var(--gold))]/20 text-gold"
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

        {/*
          ── One layout, because there is one question ──

          These two were side by side at some widths and stacked at others,
          because the native controls they were built on have different
          intrinsic widths on every platform. Three rounds of layout work went
          into holding them together — `min-w-0` on the columns, then `min-w-0`
          on the inputs because WebKit enforces its own minimum, then an uneven
          `1.4fr 1fr` split — and all of it was downstream of controls that
          could not be made to agree.

          Now they are lists (see `BirthFields`), which every platform draws the
          same way, so both stack full-width and nothing depends on how wide the
          phone happens to be. `max={today}` is gone with the date input and is
          not missed: the year list ends at this year, so a future date of birth
          is not something the control can express.
        */}
        <div className="space-y-4">
          <div className="space-y-1.5">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Date of birth
            </p>
            <BirthDateField
              value={birthDate}
              onChange={setBirthDate}
              testId="intake-birth-date"
            />
          </div>
          <div className="space-y-1.5">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Time <span className="normal-case tracking-normal">(optional)</span>
            </p>
            <BirthTimeField
              value={birthTime}
              onChange={setBirthTime}
              testId="intake-birth-time"
            />
          </div>
        </div>

        {/* Sex, because several health readings mean different things by it —
            resting heart rate and HRV baselines especially. Asked rather than
            read from Apple Health on purpose: HealthKit exposes it, but
            reading it would mean requesting another permission and another
            prompt for one value the member can give us in a single tap. */}
        <div className="space-y-1.5">
          <span className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Sex</span>
          <div className="grid grid-cols-2 gap-2">
            {(["male", "female"] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setSex(option)}
                aria-pressed={sex === option}
                className={cn(
                  "rounded-lg border px-3 py-2.5 text-sm capitalize transition-colors",
                  sex === option
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border/60 text-muted-foreground hover:text-foreground",
                )}
                data-testid={`intake-sex-${option}`}
              >
                {option}
              </button>
            ))}
          </div>
        </div>

        {/* Relationship, because the lifestyle guidance that actually helps
            differs when somebody else is in the week. "Prefer not to say" is
            stored as a real answer rather than left empty — it means asked and
            declined, so nothing asks again. */}
        <div className="space-y-1.5">
          <span className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Relationship <span className="normal-case tracking-normal">(optional)</span>
          </span>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                ["single", "Single"],
                ["dating", "Dating"],
                ["married", "Married"],
                ["private", "Prefer not to say"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() =>
                  setRelationshipStatus((prev) => (prev === value ? null : value))
                }
                aria-pressed={relationshipStatus === value}
                className={cn(
                  "rounded-lg border px-3 py-2.5 text-sm transition-colors",
                  relationshipStatus === value
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border/60 text-muted-foreground hover:text-foreground",
                )}
                data-testid={`intake-relationship-${value}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {/* Says what the optional field buys, so it reads as an offer rather
            than as another box to fill. */}
        <p className="text-[11px] text-muted-foreground">
          Your time of birth is what makes the full astrological alignment possible — the sign
          on the horizon at the moment you were born, which the date alone cannot give. Skip it
          if you don't know; most people don't, and everything else works without it.
        </p>
      </div>

      {error && <p className="text-[11px] text-destructive">{error}</p>}

      <div className="flex flex-col gap-2">
        <Button onClick={() => onSubmit({ firstName, middleName, lastName, birthDate, birthTime, sex, relationshipStatus, yOverrides })}
          disabled={!canSubmit}
          data-testid="intake-save"
        >
          {saving ? "Saving…" : "Continue"}
        </Button>
      </div>
    </div>
  );
}
