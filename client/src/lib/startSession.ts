/**
 * Begin a workout, or find out one is already running.
 *
 * ── Why this is not `apiRequest` ──────────────────────────────────────────
 *
 * `apiRequest` throws on any non-2xx, flattening the response into
 * `Error("409: {…json…}")`. A caller wanting the session it collided with
 * would have to parse a status code and a JSON document back out of an error
 * message, which works right up until somebody changes the wording.
 *
 * A refusal here is not an error. The server is answering the question
 * correctly — there is already a workout open, here it is — and the only
 * sensible response is to offer to resume it. So the two outcomes are two
 * shapes, and the caller has to look at which one it got.
 */

import { apiFetch } from "@/lib/apiFetch";

export type RunningSession = {
  id: string;
  title: string | null;
  habitId: string | null;
  startedAt: string;
  /**
   * How much is logged in it. Optional, because a bundled client meets a server
   * that predates it and vice versa — and because the recovery card has to
   * render either way, just without the count.
   */
  sets?: number;
};

export type StartResult =
  | { started: RunningSession }
  /** A workout is already open. Not a failure — a different true answer. */
  | { conflict: RunningSession };

export async function startSession(body: {
  habitId?: string | null;
  title?: string | null;
}): Promise<StartResult> {
  const res = await apiFetch("/api/training/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (res.status === 409) {
    const data = (await res.json()) as { session: RunningSession };
    return { conflict: data.session };
  }
  if (!res.ok) throw new Error((await res.text()) || "Couldn't start that session");

  return { started: (await res.json()) as RunningSession };
}
