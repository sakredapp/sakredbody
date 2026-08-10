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

import { useEffect, useState } from "react";
import { HeartPulse, Bell, LayoutGrid, Check } from "lucide-react";
import { Capacitor } from "@capacitor/core";
import { useHealthSummary, useHealthSync } from "@/hooks/use-health";
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

const DONE_KEY = "sakred.onboarding.completedAt";
const SNOOZE_KEY = "sakred.onboarding.snoozedAt";
/** Long enough that a second ask reads as a different moment, not a nag. */
const SNOOZE_MS = 14 * 24 * 60 * 60 * 1000;

function shouldAsk(): boolean {
  try {
    if (localStorage.getItem(DONE_KEY)) return false;
    const snoozed = localStorage.getItem(SNOOZE_KEY);
    if (snoozed && Date.now() - Number(snoozed) < SNOOZE_MS) return false;
    return true;
  } catch {
    // Storage disabled. Ask rather than never ask — a thrown getItem should
    // not silently remove the only moment this feature is introduced.
    return true;
  }
}

function remember(key: string): void {
  try {
    localStorage.setItem(key, String(Date.now()));
  } catch {
    /* it will ask again; that is the safe direction */
  }
}

type Step = "health" | "notifications" | "widget";

export function Onboarding() {
  const { available, platform, connect } = useHealthSync();
  const { data, isLoading } = useHealthSummary(30);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("health");
  const [depth, setDepth] = useState<NoticeDepth>(getNoticeDepth());
  const [notifyBusy, setNotifyBusy] = useState(false);

  const connected = data?.connected ?? false;
  const isIos = Capacitor.getPlatform() === "ios";
  const storeName = platform === "healthconnect" ? "Health Connect" : "Apple Health";

  useEffect(() => {
    // `available` is null until the native probe resolves; opening on that beat
    // would flash this at web users for a frame.
    if (available !== true || isLoading || !shouldAsk()) return;
    // Already connected? Skip straight past the first question rather than
    // asking someone to do something they have done.
    if (connected) setStep("notifications");
    const t = setTimeout(() => setOpen(true), 900);
    return () => clearTimeout(t);
  }, [available, isLoading, connected]);

  const close = (completed: boolean) => {
    remember(completed ? DONE_KEY : SNOOZE_KEY);
    setOpen(false);
  };

  const chooseDepth = async (next: NoticeDepth) => {
    setDepth(next);
    setNoticeDepth(next);
    if (next === "off") {
      setStep("widget");
      return;
    }
    setNotifyBusy(true);
    // The system sheet is raised here, after the member has chosen — never on
    // arrival, and never for someone who picked "off".
    await requestMorningNotice();
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
                  await connect.mutateAsync();
                  setStep("notifications");
                }}
                disabled={connect.isPending}
                data-testid="onboarding-connect"
              >
                {connect.isPending ? "Connecting…" : `Connect ${storeName}`}
              </Button>
              <Button
                variant="ghost"
                onClick={() => setStep("notifications")}
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
