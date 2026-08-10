/**
 * The way in. Three questions, once.
 *
 * Each step asks for one thing and says what it is for before the system does.
 * That ordering is the whole design: iOS raises its own sheet the instant you
 * call the API, and a member ambushed by "Sakred Body would like to read your
 * Health data" denies it. On iOS that denial cannot be re-asked in-app — the
 * member has to find it in Settings, which means they never will.
 *
 * So every step here is the sentence before the sheet, not the sheet.
 *
 * A member can leave at any point and nothing is lost: each answer is recorded
 * as it is given, and what they skipped is asked again in a fortnight.
 */

import { useEffect, useRef, useState } from "react";
import { HeartPulse, Bell, LayoutGrid, Check } from "lucide-react";
import { Capacitor } from "@capacitor/core";
import { useAuth } from "@/hooks/use-auth";
import { useHealthSummary, useHealthSync } from "@/hooks/use-health";
import { track } from "@/lib/track";
import { requestMorningNotice, setNoticeDepth, getNoticeDepth } from "@/lib/morningNotice";
import type { NoticeDepth } from "@/lib/morningNoticeContent";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Answered-state is per account, not per device.
 *
 * These keys were flat — `sakred.onboarding.completedAt` — which is one answer
 * for a phone rather than one per person. A coach signing in after a member on
 * the same handset was never asked anything, and inherited whatever the first
 * person chose. Scoping by user id is what makes "every account has answered"
 * a statement that can actually be true.
 *
 * Still local rather than on the server, deliberately: what is being recorded
 * is a decision about *this device* — its notification permission, its
 * widgets, its Health store. The same person on a new phone has genuinely not
 * answered for that phone yet, and should be asked again.
 */
const keyFor = (userId: string, kind: "done" | "snoozed") =>
  `sakred.onboarding.${kind}.${userId}`;

/** Long enough that a second ask reads as a different moment, not a nag. */
const SNOOZE_MS = 14 * 24 * 60 * 60 * 1000;

function shouldAsk(userId: string): boolean {
  try {
    if (localStorage.getItem(keyFor(userId, "done"))) return false;
    const snoozed = localStorage.getItem(keyFor(userId, "snoozed"));
    if (snoozed && Date.now() - Number(snoozed) < SNOOZE_MS) return false;
    return true;
  } catch {
    // Storage disabled. Ask rather than never ask — a thrown getItem should
    // not silently remove the only moment this feature is introduced.
    return true;
  }
}

function remember(userId: string, kind: "done" | "snoozed"): void {
  try {
    localStorage.setItem(keyFor(userId, kind), String(Date.now()));
  } catch {
    /* it will ask again; that is the safe direction */
  }
}

type Step = "health" | "notifications" | "widget";

export function Onboarding() {
  const { available, platform, connect } = useHealthSync();
  const { data, isLoading } = useHealthSummary(30);
  const isNative = Capacitor.isNativePlatform();
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("health");
  const [depth, setDepth] = useState<NoticeDepth>(getNoticeDepth());
  const [notifyBusy, setNotifyBusy] = useState(false);

  const connected = data?.connected ?? false;
  const isIos = Capacitor.getPlatform() === "ios";
  const storeName = platform === "healthconnect" ? "Health Connect" : "Apple Health";

  /**
   * Opened at most once per mount, and never re-stepped underneath the member.
   *
   * The effect below re-runs as `available` resolves from null to a boolean.
   * Without this guard that second run would call setStep again — moving
   * someone who had already tapped through to the widget step back to the
   * start, which looks like the modal is broken.
   */
  const openedRef = useRef(false);

  useEffect(() => {
    // ── The gate this used to have, and why it was wrong ──────────────────
    //
    // This read `if (available !== true) return`, so the entire flow was
    // conditional on HealthKit being available. When that probe returned
    // anything other than true — an Android phone with no Health Connect, a
    // plugin that failed to load, a promise that never resolved — the member
    // was asked about *nothing*. No health step, which is arguable, but also
    // no notifications and no widget, which is not: neither of those has
    // anything to do with HealthKit.
    //
    // Observed on a real device: onboarding never appeared, and because
    // HealthSwatches carried the same gate, the home screen showed no trace of
    // health either. One unresolved probe silently removed three features.
    //
    // Native is the only real precondition. All three things this asks about
    // are things only a phone can do.
    if (!isNative || isLoading || !userId || !shouldAsk(userId) || openedRef.current) return;

    const t = setTimeout(() => {
      openedRef.current = true;
      track("onboarding.shown", { surface: "onboarding" });
      // Health is skipped when it cannot work or is already done — but the
      // rest of the flow runs regardless. `available === null` means the probe
      // has not answered; treat that as "don't ask", since a Connect button
      // that cannot raise the system sheet is worse than no button.
      setStep(available === true && !connected ? "health" : "notifications");
      setOpen(true);
    }, 900);
    return () => clearTimeout(t);
  }, [isNative, available, isLoading, connected, userId]);

  /**
   * What this account actually answered, reported once at the end.
   *
   * Held in a ref rather than state because nothing renders from it and a
   * re-render between steps would be pure waste. `null` means the member never
   * reached that question — which is different from answering "no" to it, and
   * the difference is the whole point of auditing this.
   */
  const answers = useRef<{ health: boolean | null; notice: NoticeDepth | null }>({
    health: null,
    notice: null,
  });

  const close = (completed: boolean) => {
    if (!userId) return;
    remember(userId, completed ? "done" : "snoozed");
    // Server-side, so "every account has answered" can be checked from the
    // database instead of taken on faith from a device we cannot see. Sent on
    // dismissal too — someone who closed the modal at step two has still
    // answered step one, and recording only completions would report them as
    // never having been asked.
    track("onboarding.answered", {
      surface: "onboarding",
      props: {
        completed,
        stoppedAt: step,
        health: answers.current.health,
        notice: answers.current.notice,
        platform: Capacitor.getPlatform(),
        healthAvailable: available,
      },
    });
    setOpen(false);
  };

  const chooseDepth = async (next: NoticeDepth) => {
    setDepth(next);
    setNoticeDepth(next);
    answers.current.notice = next;
    if (next === "off") {
      setStep("widget");
      return;
    }
    setNotifyBusy(true);
    // The system sheet is raised here, after the member has chosen — never on
    // arrival, and never for someone who picked "off".
    const granted = await requestMorningNotice();
    // What the OS actually said, not what we asked for. A member who chose
    // "the full brief" and then denied the system prompt has notifications
    // off, and the audit should say so.
    answers.current.notice = granted ? next : "off";
    setNotifyBusy(false);
    setStep("widget");
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && close(false)}>
      <DialogContent className="max-w-sm" data-testid={`onboarding-${step}`}>
        {step === "health" && (
          <>
            <DialogHeader>
              <div className="h-11 w-11 rounded-full bg-[hsl(var(--gold))]/10 grid place-items-center mb-2">
                <HeartPulse className="h-5 w-5 text-[hsl(var(--gold))]" />
              </div>
              <DialogTitle className="font-display text-xl">Bring your body into it</DialogTitle>
              <DialogDescription className="text-sm leading-relaxed">
                Your phone already measures your sleep, recovery and movement. Connect{" "}
                {storeName} and your practice reflects what you actually did — not what you
                remembered to log.
              </DialogDescription>
            </DialogHeader>

            <ul className="text-xs text-muted-foreground space-y-1.5 py-1">
              <li>· We only read. Nothing is ever written back.</li>
              <li>· You choose which categories to share.</li>
              <li>· Disconnecting deletes everything we hold.</li>
            </ul>

            <div className="flex flex-col gap-2 pt-1">
              <Button
                onClick={async () => {
                  try {
                    await connect.mutateAsync();
                    answers.current.health = true;
                  } catch {
                    // A refused permission sheet rejects the mutation. That is
                    // an answer — "asked, declined" — not a reason to trap the
                    // member on a step they cannot leave.
                    answers.current.health = false;
                  }
                  setStep("notifications");
                }}
                disabled={connect.isPending}
                data-testid="onboarding-connect"
              >
                {connect.isPending ? "Connecting…" : `Connect ${storeName}`}
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  answers.current.health = false;
                  setStep("notifications");
                }}
                className="text-muted-foreground"
              >
                Not now
              </Button>
            </div>
          </>
        )}

        {step === "notifications" && (
          <>
            <DialogHeader>
              <div className="h-11 w-11 rounded-full bg-[hsl(var(--gold))]/10 grid place-items-center mb-2">
                <Bell className="h-5 w-5 text-[hsl(var(--gold))]" />
              </div>
              <DialogTitle className="font-display text-xl">How much, in the morning?</DialogTitle>
              <DialogDescription className="text-sm leading-relaxed">
                One notification a day, at 7am. Nothing else — we will not message you about
                anything you did not ask for.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-2 py-1">
              {(
                [
                  {
                    key: "brief" as const,
                    title: "Just the nudge",
                    example: "Day 4 — Liver Clear · 5 practices today.",
                  },
                  {
                    key: "full" as const,
                    title: "The full morning brief",
                    example: "Day 4 — Liver Clear · 5 practices today. You slept 6h 40m, under your usual.",
                  },
                  { key: "off" as const, title: "No notifications", example: null },
                ]
              ).map((option) => (
                <button
                  key={option.key}
                  onClick={() => chooseDepth(option.key)}
                  disabled={notifyBusy}
                  className={cn(
                    "w-full text-left rounded-xl border p-3 tap-clean transition-colors",
                    depth === option.key
                      ? "border-[hsl(var(--gold))]/50 bg-[hsl(var(--gold))]/5"
                      : "border-border/50 hover:border-[hsl(var(--gold))]/30",
                  )}
                  data-testid={`notice-depth-${option.key}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm">{option.title}</span>
                    {depth === option.key && (
                      <Check className="h-3.5 w-3.5 text-[hsl(var(--gold))]" />
                    )}
                  </div>
                  {option.example && (
                    <p className="text-[11px] text-muted-foreground mt-1 leading-snug">
                      {option.example}
                    </p>
                  )}
                </button>
              ))}
            </div>

            <Button
              variant="ghost"
              onClick={() => setStep("widget")}
              className="text-muted-foreground"
            >
              Skip
            </Button>
          </>
        )}

        {step === "widget" && (
          <>
            <DialogHeader>
              <div className="h-11 w-11 rounded-full bg-[hsl(var(--gold))]/10 grid place-items-center mb-2">
                <LayoutGrid className="h-5 w-5 text-[hsl(var(--gold))]" />
              </div>
              <DialogTitle className="font-display text-xl">Put it on your home screen</DialogTitle>
              <DialogDescription className="text-sm leading-relaxed">
                A widget shows today's practices and last night's sleep without opening anything.
              </DialogDescription>
            </DialogHeader>

            {/* Instructions rather than a button: neither platform lets an app
                add its own widget, so a button here would be a promise the OS
                will not keep. */}
            <ol className="text-xs text-muted-foreground space-y-1.5 py-1 list-decimal pl-4">
              {isIos ? (
                <>
                  <li>Touch and hold anywhere on your home screen.</li>
                  <li>Tap the <span className="text-foreground">+</span> in the corner.</li>
                  <li>Search for <span className="text-foreground">Sakred Body</span>.</li>
                </>
              ) : (
                <>
                  <li>Touch and hold anywhere on your home screen.</li>
                  <li>Tap <span className="text-foreground">Widgets</span>.</li>
                  <li>Find <span className="text-foreground">Sakred Body</span> and drag it out.</li>
                </>
              )}
            </ol>

            <Button onClick={() => close(true)} data-testid="onboarding-done">
              Done
            </Button>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
