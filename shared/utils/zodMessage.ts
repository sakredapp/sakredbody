/**
 * A validation failure a human can act on.
 *
 * zod's default message for a missing field is the bare word "Required", with
 * the field name only in `path`. Handlers throughout this app returned
 * `err.errors[0].message`, so a caller who omitted `startDate` got a 400
 * reading `{"message":"Required"}` — true, useless, and impossible to act on
 * without reading the source.
 *
 * This puts the field back in the sentence. Messages that were already written
 * deliberately ("Valid email is required") are left exactly as they are: they
 * read as prose and prefixing them with a field name would make them worse.
 */

import type { ZodError } from "zod";

/** Field names come out of zod as `dateOfBirth`; people read "date of birth". */
function humanise(path: (string | number)[]): string {
  return path
    .filter((p) => typeof p === "string")
    .join(" ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .toLowerCase();
}

export function zodMessage(err: ZodError): string {
  const issue = err.errors[0];
  if (!issue) return "That request wasn't valid.";

  const field = humanise(issue.path);

  // Only zod's own terse defaults get a field name attached. Anything an
  // author wrote is already a sentence.
  const TERSE = ["Required", "Invalid input", "Invalid"];
  if (field && TERSE.includes(issue.message)) {
    return issue.message === "Required"
      ? `${field} is required.`
      : `That ${field} isn't valid.`;
  }

  return issue.message;
}
