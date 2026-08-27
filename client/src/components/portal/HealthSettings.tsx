/**
 * Health and reminders, in Settings.
 *
 * Onboarding asks each of these once. This is where a member changes their
 * mind, and the reason it has to exist: a choice you can make and never unmake
 * is a trap, and "off" chosen while half-awake on the first morning would
 * otherwise be permanent.
 *
 * Everything here reflects real state rather than what we last asked for.
 * Permission can be revoked in iOS Settings without the app being told, so the
 * connection row reads from what has actually synced, and the notification row
 * reads the live permission rather than the stored preference.
 */

import { useEffect, useState } from "react";
import { Bell, HeartPulse, LayoutGrid, Check, ExternalLink } from "lucide-react";
import { Capacitor } from "@capacitor/core";
import { useHealthSync, useHealthView } from "@/hooks/use-health";
import { openHealthSettings } from "@/lib/health";
import {
  getNoticeDepth,
  setNoticeDepth,
  requestMorningNotice,
  scheduleMorningNotice,
  noticePermission,
} from "@/lib/morningNotice";
import type { NoticeDepth } from "@/lib/morningNoticeContent";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const DEPTHS: { key: NoticeDepth; title: string; example: string | null }[] = [
  { key: "brief", title: "Just the nudge", example: "Day 4 — Liver Clear · 5 practices today." },
  {
    key: "full",
    title: "The full morning brief",
    example: "…and: You slept 6h 40m, under your usual.",
  },
  { key: "off", title: "No notifications", example: null },
];

export function HealthSettings() {
  const { connect, disconnect } = useHealthSync();
  const { view, connection, reason, platform, summary } = useHealthView(30);
  const { toast } = useToast();

  const [depth, setDepth] = useState<NoticeDepth>(getNoticeDepth());
  const [granted, setGranted] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  /*
    Settings asks the connection question directly, because that is the
    question this screen is about — not "do we hold measurements". The two
    were the same expression before, which is how this panel and the Home
    screen could describe the same account differently on the same launch.
  */
  const connected = connection === "connected";
  const isNative = Capacitor.isNativePlatform();
  const isIos = Capacitor.getPlatform() === "ios";
  const storeName = platform === "healthconnect" ? "Health Connect" : "Apple Health";
  const metricCount = summary.data?.metrics?.length ?? 0;

  // The live answer, not the stored one. A member who turned notifications off
  // in iOS Settings should not see "Just the nudge" ticked here.
  useEffect(() => {
    let alive = true;
    noticePermission().then((ok) => alive && setGranted(ok));
    return () => {
      alive = false;
    };
  }, [depth]);

  const choose = async (next: NoticeDepth) => {
    setBusy(true);
    setDepth(next);
    setNoticeDepth(next);
    if (next === "off") {
      // Cancels what is already scheduled on the device, not just future ones.
      await scheduleMorningNotice();
    } else {
      const ok = await requestMorningNotice();
      setGranted(ok);
      if (!ok) {
        toast({
          title: "Notifications are off for this app",
          description: isIos
            ? "Turn them on in iOS Settings → Sakred Body → Notifications."
            : "Turn them on in Android Settings → Apps → Sakred Body → Notifications.",
        });
      }
    }
    setBusy(false);
  };

  if (!isNative && !connected) {
    return (
      <p className="text-xs text-muted-foreground">
        Health and reminders are set up in the phone app.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      {/* ── Health ─────────────────────────────────────────────────────────── */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <HeartPulse className="h-3.5 w-3.5 text-gold" />
          <p className="text-xs uppercase tracking-widest text-muted-foreground">
            {storeName}
          </p>
        </div>

        {connected ? (
          <>
            <p className="text-sm">
              Connected — {metricCount} {metricCount === 1 ? "measure" : "measures"} flowing.
            </p>
            <div className="flex flex-wrap gap-2">
              {platform === "healthconnect" && (
                <Button variant="outline" size="sm" onClick={() => openHealthSettings()}>
                  Change what you share
                  <ExternalLink className="h-3 w-3 ml-1.5" />
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-destructive"
                disabled={disconnect.isPending}
                onClick={async () => {
                  if (
                    !window.confirm(
                      "Disconnect and delete every health measurement we hold for you? This cannot be undone."
                    )
                  )
                    return;
                  const res = await disconnect.mutateAsync();
                  toast({
                    title: "Disconnected",
                    description: `${res.deletedDays ?? 0} days deleted.`,
                  });
                }}
                data-testid="settings-health-disconnect"
              >
                Disconnect and delete
              </Button>
            </div>
            {isIos && (
              // iOS gives an app no way to deep-link into its own Health
              // permissions, so pointing at the path is the most we can do.
              <p className="text-[11px] text-muted-foreground">
                To change categories: iOS Settings → Health → Data Access &amp; Devices → Sakred
                Body.
              </p>
            )}
          </>
        ) : connection === "unknown" ? (
          /*
            Still asking. This is the state the old code had no way to be in —
            and printing "Not connected" here is precisely the sentence a
            member reported seeing on a phone that was, in fact, connected.
          */
          <p className="text-sm text-muted-foreground">Checking your {storeName} connection…</p>
        ) : connection === "error" ? (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              We couldn't check your {storeName} connection. This says nothing about your phone —
              only that we couldn't ask.
            </p>
            <Button variant="outline" size="sm" onClick={() => summary.refetch()}>
              Try again
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Not connected. Your sleep, recovery and movement stay on your phone until you
              connect.
            </p>
            <Button
              size="sm"
              onClick={() => connect.mutate()}
              disabled={connect.isPending || view.kind !== "disconnected"}
              data-testid="settings-health-connect"
            >
              {connect.isPending ? "Connecting…" : `Connect ${storeName}`}
            </Button>
            {/* A disabled button with no explanation is the worst control in
                any app: it looks broken, and the member cannot tell whether
                they mis-tapped. This is the only place that says why nothing
                happened when they pressed it. */}
            {view.kind === "unavailable" && (
              <p className="text-[11px] text-destructive">
                {reason ?? `${storeName} isn't available on this phone.`}
              </p>
            )}
            {view.kind === "unknown" && (
              <p className="text-[11px] text-muted-foreground">Checking {storeName}…</p>
            )}
            {connect.isError && (
              <p className="text-[11px] text-destructive">
                {connect.error instanceof Error
                  ? connect.error.message
                  : "That didn't go through. Try again."}
              </p>
            )}
          </div>
        )}
      </div>

      {/* ── Morning notification ───────────────────────────────────────────── */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Bell className="h-3.5 w-3.5 text-gold" />
          <p className="text-xs uppercase tracking-widest text-muted-foreground">
            Morning notification
          </p>
        </div>

        <div className="space-y-2">
          {DEPTHS.map((option) => (
            <button
              key={option.key}
              onClick={() => choose(option.key)}
              disabled={busy}
              className={cn(
                "w-full text-left rounded-xl border p-3 tap-clean transition-colors",
                depth === option.key
                  ? "border-[hsl(var(--gold))]/50 bg-[hsl(var(--gold))]/5"
                  : "border-border/50 hover:border-[hsl(var(--gold))]/30",
              )}
              data-testid={`settings-notice-${option.key}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm">{option.title}</span>
                {depth === option.key && <Check className="h-3.5 w-3.5 text-gold" />}
              </div>
              {option.example && (
                <p className="text-[11px] text-muted-foreground mt-1 leading-snug">
                  {option.example}
                </p>
              )}
            </button>
          ))}
        </div>

        {/* The mismatch worth naming: a preference set here means nothing if
            the OS is refusing. Better to say so than to leave a ticked box
            that does not fire. */}
        {depth !== "off" && granted === false && (
          <p className="text-[11px] text-destructive">
            Notifications are turned off for Sakred Body in your phone's settings, so this will
            not fire.
          </p>
        )}
        <p className="text-[11px] text-muted-foreground">One a day, at 7am. Nothing else.</p>
      </div>

      {/* ── Widget ─────────────────────────────────────────────────────────── */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <LayoutGrid className="h-3.5 w-3.5 text-gold" />
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Home screen</p>
        </div>
        {/* Instructions, not a button — neither platform lets an app add its
            own widget, so a button here would be a promise the OS will not
            keep. */}
        <ol className="text-[11px] text-muted-foreground space-y-1 list-decimal pl-4">
          <li>Touch and hold anywhere on your home screen.</li>
          {isIos ? (
            <>
              <li>
                Tap the <span className="text-foreground">+</span> in the corner.
              </li>
              <li>
                Search for <span className="text-foreground">Sakred Body</span>.
              </li>
            </>
          ) : (
            <>
              <li>
                Tap <span className="text-foreground">Widgets</span>.
              </li>
              <li>
                Find <span className="text-foreground">Sakred Body</span> and drag it out.
              </li>
            </>
          )}
        </ol>
      </div>
    </div>
  );
}
