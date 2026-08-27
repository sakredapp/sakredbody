/**
 * Asking to notify — once, in context, and only of people it would serve.
 *
 * ── Why this exists instead of a call at launch ───────────────────────────
 *
 * iOS grants an app exactly one system prompt per install. Spend it on a cold
 * start and the member is answering "Allow notifications?" before they know
 * what Sakred would ever send them, which is how an app earns a permanent no.
 * So the OS dialog is never the first thing asked: this panel is, and the
 * system prompt only follows the member saying yes to a sentence that names the
 * actual events.
 *
 * ── And only where it is true ─────────────────────────────────────────────
 *
 * A self-guided member with no coach, no plan and no open request has nothing
 * to be notified about, and is never shown this. That is the same rule as the
 * rest of the coaching UI: no relationship means no coaching surface, not a
 * greyed-out one explaining what they are missing. The infrastructure stays
 * invisible to the people it does not serve.
 *
 * ── Asked once ───────────────────────────────────────────────────────────
 *
 * If they decline, this does not come back. A declined OS permission cannot be
 * re-prompted on iOS anyway — a second `requestPermissions` returns denied
 * without showing anything — so a panel that reappeared would be nagging toward
 * a button that does nothing. Everything keeps working: the durable
 * notifications are still written, the Coach badge still counts, and Sakred
 * still knows the message happened.
 */

import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  isNative,
  hasAskedForPush,
  pushPermissionState,
  pushPromptDeferred,
  deferPushPrompt,
  initNativeNotifications,
  PUSH_DELIVERY_ENABLED,
} from "@/lib/nativeNotifications";

const COPY = {
  member: {
    title: "Stay connected to your coach",
    body: "Get notified when your coach sends a message, asks for a check-in, or updates your plan.",
  },
  coach: {
    title: "Stay connected to your clients",
    body: "Get notified when a client messages you or completes a requested check-in.",
  },
} as const;

export function NotificationPrompt({
  audience,
  /**
   * Whether this person has a coaching relationship at all. Passed in rather
   * than read here, because the answer differs by side and both callers already
   * know it — and because a component that fetches to decide whether to render
   * is a component that renders a flash of itself first.
   */
  relevant,
}: {
  audience: "member" | "coach";
  relevant: boolean;
}) {
  const [show, setShow] = useState(false);
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    if (!relevant || !isNative() || !PUSH_DELIVERY_ENABLED) return;
    let cancelled = false;
    void (async () => {
      // Both conditions, not either: the stored flag covers a member who
      // declined, and the OS state covers a reinstall, a restored backup, or
      // permission granted or revoked in Settings since we last looked.
      const [asked, deferred, state] = await Promise.all([
        hasAskedForPush(),
        pushPromptDeferred(),
        pushPermissionState(),
      ]);
      if (!cancelled && !asked && !deferred && state === "prompt") setShow(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [relevant]);

  if (!show) return null;

  const copy = COPY[audience];

  return (
    <div
      className="rounded-2xl border border-border/60 bg-card/60 p-5 space-y-3"
      data-testid="notification-prompt"
    >
      <div className="flex items-start gap-3">
        <Bell className="w-4 h-4 mt-0.5 text-gold shrink-0" />
        <div className="space-y-1">
          <p className="text-sm font-medium">{copy.title}</p>
          <p className="text-sm text-muted-foreground leading-relaxed">{copy.body}</p>
        </div>
      </div>
      <div className="flex items-center gap-2 pl-7">
        <Button
          size="sm"
          disabled={asking}
          onClick={async () => {
            setAsking(true);
            // Dismissed either way. Granted, and there is nothing left to ask;
            // declined, and asking again would show nothing.
            try {
              await initNativeNotifications();
            } finally {
              setShow(false);
            }
          }}
          data-testid="button-enable-notifications"
        >
          Enable notifications
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            void deferPushPrompt();
            setShow(false);
          }}
          data-testid="button-dismiss-notifications"
        >
          Not now
        </Button>
      </div>
    </div>
  );
}
