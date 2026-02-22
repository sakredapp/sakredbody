/**
 * Shared Date Utilities — Part 9 Critical Date Handling
 *
 * All dates must be in the user's local timezone. These utilities prevent
 * the #1 source of bugs: UTC conversion shifting dates.
 *
 * Rules:
 * - Never use toISOString().split('T')[0] — converts to UTC
 * - Never use new Date('YYYY-MM-DD') — parses as UTC midnight
 * - Use formatLocalDateString() for current date
 * - Use parseLocalDate() for parsing date strings
 */

/** Format a Date as "YYYY-MM-DD" in LOCAL timezone */
export function formatLocalDateString(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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
