/**
 * Two questions, kept apart.
 *
 * ── The defect this file exists to make impossible ────────────────────────
 *
 * Every health surface in the app used to answer "is this member connected?"
 * by reading the *summary* payload:
 *
 *     const connected = data?.connected ?? false;
 *
 * The server is not wrong about it — `summaryFor` computes `connected` from
 * the live connection rows, which is the correct source. The mistake is on
 * this side, and it is a mistake of construction rather than of logic: while
 * that query is in flight `data` is undefined, so `?? false` turns *we do not
 * know yet* into *there is no connection*. Loading and disconnected become the
 * same value, and there is no expression downstream that can tell them apart
 * again, because the information was destroyed at the point it was read.
 *
 * What a member sees is Settings saying Connected and Stats offering to
 * connect, on the same phone, about the same account. It looks like a state
 * bug and reads like broken authorization, which is the expensive part: the
 * obvious response is to go looking at HealthKit permissions, and there is
 * nothing wrong there to find.
 *
 * So the two axes are named separately and never derived from one another:
 *
 *     connection — is a native store linked to this account, per the server
 *     data       — what measurements we currently hold
 *
 * A connection can exist with no data (just linked, or a member who granted
 * nothing). Data can exist with no connection (they disconnected; we keep
 * what was already synced until they delete it). Neither implies the other,
 * and neither implies anything about whether a query has finished.
 *
 * ── Why the resolution is a pure function ─────────────────────────────────
 *
 * `resolveHealthView` takes plain values and returns a tagged union. No hooks,
 * no react-query, no `import.meta.env` — so the state machine can be tested
 * exhaustively, including the timings that are awkward to reproduce on a real
 * phone (a status that resolves in 50ms against a native sync that takes a
 * minute). The React hooks in `use-health.ts` do nothing but gather the inputs
 * and hand them here.
 *
 * The union is closed on purpose. A component that switches on `view.kind`
 * cannot forget the hydrating case, and cannot invent a sixth state by
 * combining two booleans in a way nobody considered.
 */

/**
 * Is a native store linked to this account?
 *
 * Answered by `/api/health/status` and nothing else. Note that `unknown` is a
 * member of this union rather than an absence — that is the whole point. It is
 * what the old `?? false` had no room to say.
 */
export type ConnectionState = "unknown" | "connected" | "disconnected" | "error";

export function resolveConnection(input: {
  /** The status query has not answered yet. */
  isLoading: boolean;
  /** The status query failed. Distinct from answering "no". */
  error?: unknown;
  /** The answer, when there is one. */
  data?: { connected: boolean } | null;
}): ConnectionState {
  if (input.data) return input.data.connected ? "connected" : "disconnected";
  // Error is checked after data on purpose: react-query keeps the last good
  // answer through a failed refetch, and a member whose connection we already
  // read does not become unknown because a later poll timed out.
  if (input.error) return "error";
  if (input.isLoading) return "unknown";
  // Not loading, no error, no data: a query that is disabled or has not been
  // subscribed to yet. Still not evidence of a missing connection.
  return "unknown";
}

/**
 * Can this device read from a native store at all?
 *
 * `null` while the probe is outstanding. A browser is a definite `false` and
 * that is a different message from "you have not connected yet" — the member
 * is not being offered a button they cannot press.
 */
export type NativeAvailability = boolean | null;

export type HealthView =
  /** Nothing decided yet. Renders as neutral — never as a Connect prompt. */
  | { kind: "unknown" }
  /** Linked, and we hold measurements. `refreshing` is a caption, not a gate. */
  | { kind: "ready"; refreshing: boolean }
  /** Linked, and nothing has arrived yet while a read is still outstanding. */
  | { kind: "hydrating" }
  /** Linked, the read finished, and the member genuinely has no records. */
  | { kind: "empty" }
  /** No link, on a device that could make one. The only state with the CTA. */
  | { kind: "disconnected" }
  /** No link, on a device that cannot make one — a browser, or no provider. */
  | { kind: "unavailable" }
  /** The connection read itself failed. Say so and offer a retry. */
  | { kind: "error" };

export interface HealthViewInput {
  connection: ConnectionState;
  /** Native store reachable on this device; `null` while probing. */
  available: NativeAvailability;
  /** Do we hold at least one measurement to draw? */
  hasData: boolean;
  /** A read is outstanding — the summary query, a sync, or both. */
  refreshing: boolean;
  /**
   * Has any summary read completed since launch?
   *
   * The difference between "nothing yet" and "nothing at all". Without it a
   * member with no records would be told they have none before we had looked.
   */
  summarySettled: boolean;
}

export function resolveHealthView(input: HealthViewInput): HealthView {
  const { connection, available, hasData, refreshing, summarySettled } = input;

  /*
    Data first, and deliberately ahead of every other branch.

    Measurements we already hold are facts about the member's body that were
    true before this launch and are still true during it. Nothing about a
    query's progress, a probe's progress, or a native store's mood makes them
    less true — so once there is something to draw, it is drawn, and the rest
    of the machine only decides what caption goes underneath.

    This is what stops known data being blanked by a refresh: there is no path
    from `hasData: true` to a state that renders nothing.
  */
  if (hasData && connection !== "disconnected") return { kind: "ready", refreshing };

  switch (connection) {
    case "unknown":
      return { kind: "unknown" };

    case "error":
      // Holding data outranks this, handled above: a stale-but-real reading
      // beats an error card. With nothing to show, the honest answer is that
      // we could not find out.
      return { kind: "error" };

    case "connected":
      // Linked with nothing to draw. Whether that is "not yet" or "none"
      // depends entirely on whether anyone has finished looking.
      if (refreshing || !summarySettled) return { kind: "hydrating" };
      return { kind: "empty" };

    case "disconnected":
      /*
        The only branch that may offer the button — and only once the probe
        has answered. `available === null` is still deciding, and rendering
        either "connect" or "your browser cannot do this" during that beat
        flashes a wrong explanation at a member who is on a phone.
      */
      if (available === null) return { kind: "unknown" };
      return available ? { kind: "disconnected" } : { kind: "unavailable" };
  }
}

/** The one question every surface actually asks: may I offer Connect? */
export function offersConnect(view: HealthView): boolean {
  return view.kind === "disconnected";
}

/**
 * May this surface draw measurements?
 *
 * True only for `ready`, including while refreshing. Named rather than
 * open-coded so the two rules — show what we have, never blank it — stay in
 * one place.
 */
export function showsData(view: HealthView): boolean {
  return view.kind === "ready";
}
