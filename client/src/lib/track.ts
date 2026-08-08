/**
 * Telemetry — the client half.
 *
 * Most events are recorded on the server, where the thing actually happened
 * and where a member can't lie about it. This exists for the facts that only
 * exist in a browser: a buy link opening, a product being looked at, a note
 * being read.
 *
 * Three rules, all of which the app previously broke by having no telemetry at
 * all and a scattering of `.catch(() => {})`:
 *
 *   1. It never throws. A tracking failure must never break the thing being
 *      tracked.
 *   2. It never blocks. Fire and continue; the response is a 202 anyway.
 *   3. It never delays navigation. `openBuyLink` sends the beacon and opens
 *      the tab in the same tick, so the click is not held up by a network
 *      round trip.
 */

import type { EventName } from "@shared/models/telemetry";

interface TrackOptions {
  /** Where in the app — "shop_detail", "shopping_list", "today". */
  surface?: string;
  /** The thing it happened to. */
  subjectId?: string;
  props?: Record<string, unknown>;
}

/**
 * Record that something happened.
 *
 * `keepalive` so the request survives the page being navigated away from,
 * which is the normal case for the one event that matters most — a click that
 * leaves the site.
 */
export function track(name: EventName, opts: TrackOptions = {}): void {
  try {
    void fetch("/api/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      keepalive: true,
      body: JSON.stringify({
        name,
        surface: opts.surface,
        subjectId: opts.subjectId,
        props: opts.props ?? {},
      }),
    }).catch(() => {
      // Deliberately silent, and the only place in the app where that's the
      // right call: the failure of a telemetry write is not itself worth
      // telling anyone about, and reporting it would need telemetry.
    });
  } catch {
    // fetch itself can throw synchronously on a malformed input. Same reasoning.
  }
}

/**
 * Open an outbound buy link, and record the click.
 *
 * This is the event the business runs on, and it had none. Every place that
 * opened an affiliate URL did so with a bare anchor, so there was no way to
 * tell which surface, which product, or whether anyone ever clicked.
 *
 * Use this instead of an `<a target="_blank">` on any commercial link. Call it
 * from the click handler and let the anchor's default behaviour open the tab —
 * that keeps the browser's own "user gesture" semantics, which a
 * `window.open` after an await would lose to the popup blocker.
 */
export function trackBuyClick(opts: {
  productId: string;
  url: string;
  surface: string;
  name?: string;
}): void {
  track("product.buy_click", {
    surface: opts.surface,
    subjectId: opts.productId,
    props: {
      url: opts.url,
      name: opts.name,
      // Cheap to record, and the first question anyone asks of this data.
      host: safeHost(opts.url),
    },
  });
}

function safeHost(url: string): string | null {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}
