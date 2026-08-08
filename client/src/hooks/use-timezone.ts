/**
 * Keep the server's idea of the member's day in sync with the device's.
 *
 * Every habit is scheduled by calendar date, and the server runs in UTC on
 * Vercel. Without this the member's "today" is wrong from late afternoon
 * onward for anyone west of UTC, and completions land on the wrong day.
 *
 * Posts once per session, and again if the zone actually changes — which does
 * happen: people fly, and a retreat in France is nine hours from Los Angeles.
 */

import { useEffect, useRef } from "react";

const STORAGE_KEY = "sakred:tz";

export function useTimezoneSync(enabled: boolean) {
  const sent = useRef(false);

  useEffect(() => {
    if (!enabled || sent.current) return;

    let timezone: string;
    try {
      timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      return;
    }
    if (!timezone) return;

    // Skip the round trip when nothing has moved since last time.
    if (window.localStorage?.getItem(STORAGE_KEY) === timezone) {
      sent.current = true;
      return;
    }

    sent.current = true;
    fetch("/api/coaching/timezone", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ timezone }),
    })
      .then((res) => {
        if (res.ok) window.localStorage?.setItem(STORAGE_KEY, timezone);
      })
      // A failure here is not worth surfacing — the member keeps their old
      // zone, which is at worst what they had a moment ago.
      .catch(() => {});
  }, [enabled]);
}
