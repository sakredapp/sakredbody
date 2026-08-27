/**
 * Picking a day that is near — a controlled calendar, drawn by us.
 *
 * ── Why not `<input type="date">`, again ──────────────────────────────────
 *
 * The birth-date fields left it because the Samsung dialog is unusable: a
 * full-height sheet with the month grid collapsed to a sliver and SET and
 * CANCEL stranded at the bottom. That dialog is the same one behind every
 * other date field in the product — the retreat start, the plan start, the day
 * a practice happened. Fixing three surfaces and leaving four is how the iOS
 * zoom bug survived two rounds of being fixed.
 *
 * ── But not the same control ──────────────────────────────────────────────
 *
 * A birth date is one day out of a century and a calendar grid is the wrong
 * shape for it; nobody pages back three hundred months to 1978. These are the
 * opposite: this week, next week, last Tuesday. A grid is exactly right, and
 * the reason to draw it rather than ask for it is that then it is the same grid
 * on both platforms and it fits on the screen.
 *
 * ── Strings, throughout ───────────────────────────────────────────────────
 *
 * The value in and out is `YYYY-MM-DD` and never becomes an instant. `Date` is
 * used only to answer two questions about the calendar itself — how many days
 * are in a month, and which weekday one starts on — and both ends of that are
 * UTC, so no zone is implied and none is read. This is the rule the member-day
 * sweep enforces: the moment a calendar date is parsed into a moment, it
 * acquires a midnight that is yesterday somewhere.
 */

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatLocalDateString } from "@shared/utils/dates";

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

function parts(value: string): { y: number; m: number; d: number } | null {
  const x = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? "");
  return x ? { y: +x[1], m: +x[2], d: +x[3] } : null;
}

/** Calendar arithmetic only — both ends UTC, so no zone is implied. */
const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** Monday-first index of the 1st, 0–6. */
function firstWeekday(y: number, m: number): number {
  const sunday0 = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  return (sunday0 + 6) % 7;
}

/** "Sat 16 Aug 2026" — never a bare ISO string in front of a member. */
export function readableDate(value: string): string {
  const p = parts(value);
  if (!p) return "";
  return new Date(`${value}T12:00:00`).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function SakredDate({
  value,
  onChange,
  min,
  max,
  placeholder = "Choose a date",
  testId = "date",
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  /** Inclusive bounds, `YYYY-MM-DD`. Compared as strings, which is why they sort. */
  min?: string;
  max?: string;
  placeholder?: string;
  testId?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = parts(value);
  const today = formatLocalDateString();
  const start = selected ?? parts(min ?? "") ?? parts(today)!;
  const [view, setView] = useState({ y: start.y, m: start.m });

  /**
   * Opening on the selected month rather than wherever it was left. A picker
   * reopened three months away from the date it is showing reads as a bug, and
   * the fix is not a memory of the last scroll position.
   */
  useEffect(() => {
    if (!open) return;
    const p = parts(value) ?? parts(min ?? "") ?? parts(today)!;
    setView({ y: p.y, m: p.m });
  }, [open, value, min, today]);

  const blocked = (day: string) => Boolean((min && day < min) || (max && day > max));

  const shift = (by: number) => {
    const m = view.m + by;
    if (m < 1) return setView({ y: view.y - 1, m: 12 });
    if (m > 12) return setView({ y: view.y + 1, m: 1 });
    setView({ y: view.y, m });
  };

  /**
   * A whole month can be out of range — paging into it is allowed, choosing
   * nothing in it is not. The arrow is disabled rather than the taps silently
   * doing nothing, because a control that accepts a press and ignores it is
   * how somebody concludes the app is broken.
   */
  const monthEnd = ymd(view.y, view.m, daysInMonth(view.y, view.m));
  const monthStart = ymd(view.y, view.m, 1);
  const canGoBack = !min || monthStart > min;
  const canGoForward = !max || monthEnd < max;

  return (
    <div className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-11 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 text-base md:text-sm tap-clean"
        aria-expanded={open}
        data-testid={testId}
      >
        <span className={cn(!value && "text-muted-foreground")}>
          {value ? readableDate(value) : placeholder}
        </span>
        <Calendar className="h-4 w-4 shrink-0 text-muted-foreground" />
      </button>

      {open && (
        <div
          className="absolute z-50 mt-1 w-[19rem] max-w-[calc(100vw-2rem)] rounded-xl border border-border/60 bg-background p-3 shadow-xl"
          data-testid={`${testId}-panel`}
        >
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => shift(-1)}
              disabled={!canGoBack}
              className="h-8 w-8 grid place-items-center rounded-full text-muted-foreground disabled:opacity-30 tap-clean"
              aria-label="Previous month"
              data-testid={`${testId}-prev`}
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <p className="text-sm" data-testid={`${testId}-month`}>
              {MONTHS[view.m - 1]} {view.y}
            </p>
            <button
              type="button"
              onClick={() => shift(1)}
              disabled={!canGoForward}
              className="h-8 w-8 grid place-items-center rounded-full text-muted-foreground disabled:opacity-30 tap-clean"
              aria-label="Next month"
              data-testid={`${testId}-next`}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-2 grid grid-cols-7 gap-0.5">
            {WEEKDAYS.map((d, i) => (
              <span
                key={i}
                className="grid h-7 place-items-center text-[10px] uppercase text-muted-foreground/60"
              >
                {d}
              </span>
            ))}

            {Array.from({ length: firstWeekday(view.y, view.m) }, (_, i) => (
              <span key={`pad-${i}`} />
            ))}

            {Array.from({ length: daysInMonth(view.y, view.m) }, (_, i) => i + 1).map((d) => {
              const day = ymd(view.y, view.m, d);
              const isSelected = day === value;
              const isToday = day === today;
              return (
                <button
                  key={d}
                  type="button"
                  disabled={blocked(day)}
                  onClick={() => {
                    onChange(day);
                    setOpen(false);
                  }}
                  className={cn(
                    "grid h-9 place-items-center rounded-md text-sm tap-clean transition-colors",
                    isSelected
                      ? "bg-[hsl(var(--gold))]/20 text-gold"
                      : isToday
                        ? "text-gold"
                        : "text-foreground",
                    "disabled:text-muted-foreground/25 disabled:cursor-default",
                  )}
                  aria-current={isSelected ? "date" : undefined}
                  data-testid={`${testId}-day-${day}`}
                >
                  {d}
                </button>
              );
            })}
          </div>

          {/* A way out that is not "choose a date you did not mean". */}
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="mt-2 w-full text-xs text-muted-foreground tap-clean"
            data-testid={`${testId}-close`}
          >
            Close
          </button>
        </div>
      )}
    </div>
  );
}
