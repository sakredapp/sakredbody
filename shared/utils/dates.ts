/**
 * Shared Date Utilities
 *
 * Rules:
 * - Never use toISOString().split('T')[0] — converts to UTC
 * - Never use new Date('YYYY-MM-DD') — parses as UTC midnight
 * - Use parseLocalDate() for parsing date strings
 *
 * ── On "local" ────────────────────────────────────────────────────────────
 *
 * `formatLocalDateString()` formats in the *process* timezone. In the browser
 * that is the member's. On the server it is whatever the host runs as — UTC on
 * Vercel — which is nobody's local time.
 *
 * So on the server it must never be used to answer "what day is it for this
 * member". Use `todayInZone(user.timezone)`. A member in Los Angeles rolls over
 * seven hours after the server does, and serving them tomorrow's habits from
 * 5pm onward is how completions go missing.
 */

/**
 * Format a Date as "YYYY-MM-DD" in the PROCESS timezone.
 *
 * Correct in the browser. On the server, only for formatting a Date whose
 * calendar fields were already computed in the right zone — see toDateString.
 */
export function formatLocalDateString(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** A member's timezone is optional; UTC is the fallback everywhere. */
export const DEFAULT_TIMEZONE = "UTC";

/**
 * Today's calendar date in an IANA zone, as "YYYY-MM-DD".
 *
 * `en-CA` is the shortest route to ISO ordering out of Intl. An unknown or
 * malformed zone throws inside Intl, so it falls back rather than 500ing a
 * member's whole day over a bad profile value.
 */
export function todayInZone(timeZone: string | null | undefined, now: Date = new Date()): string {
  const zone = timeZone || DEFAULT_TIMEZONE;
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
  } catch {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: DEFAULT_TIMEZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
  }
}

/** True when `timeZone` is a zone this runtime actually knows. */
export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

/** Parse "YYYY-MM-DD" as LOCAL midnight (not UTC) */
export function parseLocalDate(dateString: string): Date {
  const [year, month, day] = dateString.split("-").map(Number);
  return new Date(year, month - 1, day);
}

/** Add days to a Date (returns a new Date) */
export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/** Subtract days from a Date (returns a new Date) */
export function subtractDays(date: Date, days: number): Date {
  return addDays(date, -days);
}

/** Get difference in days between two dates (a - b) */
export function daysBetween(a: Date, b: Date): number {
  const msPerDay = 1000 * 60 * 60 * 24;
  const utcA = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const utcB = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.floor((utcA - utcB) / msPerDay);
}

/** Whole days between two "YYYY-MM-DD" strings (a - b). */
export function daysBetweenStrings(a: string, b: string): number {
  return daysBetween(parseLocalDate(a), parseLocalDate(b));
}

/** Add days to a "YYYY-MM-DD" string, returning the same shape. */
export function addDaysToString(dateString: string, days: number): string {
  return formatLocalDateString(addDays(parseLocalDate(dateString), days));
}

/**
 * Which day of a routine a date falls on, 1-based.
 * Day 1 is the start date itself.
 */
export function routineDayNumber(startDate: string, onDate: string): number {
  return daysBetweenStrings(onDate, startDate) + 1;
}
