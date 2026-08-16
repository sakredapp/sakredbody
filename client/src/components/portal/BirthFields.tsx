/**
 * A date of birth, asked the same way on every device.
 *
 * ── Why this is not `<input type="date">` ─────────────────────────────────
 *
 * Because there is no such thing as "the" date input. On iOS it is a compact
 * pill with a chunky intrinsic width that ignores `width: 100%`. On Chrome it
 * is a three-segment field. On a Samsung it opens a full-height dialog with the
 * month grid collapsed to a sliver and SET and CANCEL stranded at the bottom of
 * an empty sheet — unusable, and not something a stylesheet can reach.
 *
 * The layout work that tried to hold those together is still readable in the
 * git history: `min-w-0` on both grid columns because a grid item defaults to
 * `min-width: auto`, then `min-w-0` on the inputs as well because WebKit
 * enforces its own minimum, then an uneven `1.4fr 1fr` split because the two
 * controls wanted different amounts of room. Each of those fixed a real
 * symptom. None of them could fix the dialog that opens when you tap.
 *
 * ── Three lists instead ───────────────────────────────────────────────────
 *
 * Day, month, year. A `<select>` is the one form control every platform draws
 * as a plain list, and a birth date is the case where a calendar grid is the
 * wrong shape anyway: nobody scrolls back three hundred months to 1978. Each
 * part is labelled, so there is no question whether 08/09 is August or
 * September — the ambiguity native inputs inherit from the locale.
 *
 * ── And a birth date has no timezone ──────────────────────────────────────
 *
 * It is assembled as a string, part by part, and never passes through a `Date`.
 * Somebody born on 12 January was born on 12 January in every zone they will
 * ever live in, and the moment a calendar date is parsed into an instant it
 * acquires a midnight that can be yesterday somewhere. That is the same failure
 * that labelled a finished workout "Yesterday" and served a second Confirm
 * Activity card six seconds after the first.
 *
 * ── Empty means empty ─────────────────────────────────────────────────────
 *
 * Every part starts on its own name — "Day", "Month", "Year" — not on today.
 * The Samsung dialog opens on the current date and writing it back is one tap,
 * which is how a member's date of birth became 16 August 2026. A control that
 * suggests an answer to a question about 1978 is a control that will collect
 * wrong answers.
 */

import { useMemo } from "react";
import { cn } from "@/lib/utils";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/**
 * 16px on a phone, so focusing it cannot make WebKit zoom the viewport and
 * leave the member on a page wider than their screen. Held by
 * `script/test-ios-zoom.ts`, which sweeps every control in the client.
 */
const FIELD =
  "h-11 w-full min-w-0 rounded-md border border-input bg-background px-2 " +
  "text-base md:text-sm [color-scheme:dark] disabled:opacity-50";

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Days in a month, honestly — February included, leap years included. */
function daysIn(year: number | null, month: number | null): number {
  if (!month) return 31;
  if (!year) return month === 2 ? 29 : [4, 6, 9, 11].includes(month) ? 30 : 31;
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

type Parts = { year: number | null; month: number | null; day: number | null };

function parse(value: string): Parts {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? "");
  if (!m) return { year: null, month: null, day: null };
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

export function BirthDateField({
  value,
  onChange,
  testId = "birth-date",
}: {
  value: string;
  onChange: (v: string) => void;
  testId?: string;
}) {
  const parts = parse(value);
  const thisYear = new Date().getFullYear();
  const years = useMemo(
    () => Array.from({ length: 120 }, (_, i) => thisYear - i),
    [thisYear],
  );

  /**
   * A part changes, and the date is only emitted once all three are known.
   * Half a date is not a date, and writing `1978--12` back would be a value
   * nothing downstream can read.
   *
   * The day is clamped rather than cleared when the month shrinks under it:
   * somebody who picked the 31st and then chose February meant the end of
   * February, and taking their answer away to make a point about calendars
   * would be the less helpful of the two options.
   */
  const set = (next: Partial<Parts>) => {
    const p = { ...parts, ...next };
    if (p.day && p.month) p.day = Math.min(p.day, daysIn(p.year, p.month));
    if (!p.year || !p.month || !p.day) return onChange("");
    onChange(`${p.year}-${pad(p.month)}-${pad(p.day)}`);
  };

  return (
    <div className="grid grid-cols-[1fr_1.4fr_1fr] gap-2">
      <select
        value={parts.day ?? ""}
        onChange={(e) => set({ day: e.target.value ? Number(e.target.value) : null })}
        className={cn(FIELD)}
        aria-label="Day of birth"
        data-testid={`${testId}-day`}
      >
        <option value="">Day</option>
        {Array.from({ length: daysIn(parts.year, parts.month) }, (_, i) => i + 1).map((d) => (
          <option key={d} value={d}>{d}</option>
        ))}
      </select>

      <select
        value={parts.month ?? ""}
        onChange={(e) => set({ month: e.target.value ? Number(e.target.value) : null })}
        className={cn(FIELD)}
        aria-label="Month of birth"
        data-testid={`${testId}-month`}
      >
        <option value="">Month</option>
        {MONTHS.map((name, i) => (
          <option key={name} value={i + 1}>{name}</option>
        ))}
      </select>

      <select
        value={parts.year ?? ""}
        onChange={(e) => set({ year: e.target.value ? Number(e.target.value) : null })}
        className={cn(FIELD)}
        aria-label="Year of birth"
        data-testid={`${testId}-year`}
      >
        <option value="">Year</option>
        {years.map((y) => (
          <option key={y} value={y}>{y}</option>
        ))}
      </select>
    </div>
  );
}

/**
 * And the time, which most people do not know.
 *
 * Two lists rather than a native time control for the same reason, and a third
 * option that is the honest answer for most members: leaving both on their own
 * name records nothing, which is what "optional" should mean. Twenty-four hour
 * values are labelled with the twelve-hour reading beside them, because a birth
 * certificate says 1:10 AM and the member should not have to convert it.
 */
export function BirthTimeField({
  value,
  onChange,
  testId = "birth-time",
}: {
  value: string;
  onChange: (v: string) => void;
  testId?: string;
}) {
  const m = /^(\d{2}):(\d{2})$/.exec(value ?? "");
  const hour = m ? Number(m[1]) : null;
  const minute = m ? Number(m[2]) : null;

  const set = (next: { hour?: number | null; minute?: number | null }) => {
    const h = next.hour !== undefined ? next.hour : hour;
    // A stated hour with no minute is on the hour, which is what somebody
    // reading "born around 3" means. A minute with no hour is not a time.
    const mi = next.minute !== undefined ? next.minute : minute;
    if (h == null) return onChange("");
    onChange(`${pad(h)}:${pad(mi ?? 0)}`);
  };

  const twelve = (h: number) =>
    `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? "AM" : "PM"}`;

  return (
    <div className="grid grid-cols-2 gap-2">
      <select
        value={hour ?? ""}
        onChange={(e) => set({ hour: e.target.value ? Number(e.target.value) : null })}
        className={cn(FIELD)}
        aria-label="Hour of birth"
        data-testid={`${testId}-hour`}
      >
        <option value="">Hour</option>
        {Array.from({ length: 24 }, (_, h) => (
          <option key={h} value={h}>{pad(h)} · {twelve(h)}</option>
        ))}
      </select>

      <select
        value={minute ?? ""}
        onChange={(e) => set({ minute: e.target.value ? Number(e.target.value) : null })}
        disabled={hour == null}
        className={cn(FIELD)}
        aria-label="Minute of birth"
        data-testid={`${testId}-minute`}
      >
        <option value="">Minute</option>
        {Array.from({ length: 60 }, (_, mi) => (
          <option key={mi} value={mi}>{pad(mi)}</option>
        ))}
      </select>
    </div>
  );
}
