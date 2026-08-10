/**
 * The way in. Asked once, in the order that matters.
 *
 *   intake         who they are — the birth name and date every personal
 *                  number is computed from
 *   photo          a face instead of two letters
 *   health         Apple Health / Health Connect
 *   notifications  the morning brief, and how much of it
 *   widget         how to put it on the home screen
 *
 * Intake is first on purpose. It is the only step that changes what the app
 * *says* tomorrow rather than what it is permitted to do, and asking for
 * permissions before knowing who someone is gets the order backwards — the
 * app should earn the permission by already being personal.
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

import { useEffect, useMemo, useRef, useState } from "react";
import { HeartPulse, Bell, LayoutGrid, Check, Sparkles, Camera } from "lucide-react";
import { Capacitor } from "@capacitor/core";
import { useAuth } from "@/hooks/use-auth";
import { useHealthSummary, useHealthSync } from "@/hooks/use-health";
import { track } from "@/lib/track";
import { IntakeStep, type IntakeValues } from "./IntakeStep";
import { PhotoStep } from "./PhotoStep";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { apiFetch } from "@/lib/apiFetch";
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

type Step = "intake" | "photo" | "health" | "notifications" | "widget";

export function Onboarding() {
  const { available, platform, connect } = useHealthSync();
  const { data, isLoading } = useHealthSummary(30);
  const isNative = Capacitor.isNativePlatform();
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("intake");
  const [depth, setDepth] = useState<NoticeDepth>(getNoticeDepth());
  const [notifyBusy, setNotifyBusy] = useState(false);

  const connected = data?.connected ?? false;
  const isIos = Capacitor.getPlatform() === "ios";
  const storeName = platform === "healthconnect" ? "Health Connect" : "Apple Health";

  const initials =
    [user?.firstName?.[0], user?.lastName?.[0]].filter(Boolean).join("").toUpperCase() || "·";

  /**
   * What they already told us, so a second pass through onboarding is an edit
   * rather than a blank form. `enabled` on the query would be tidier, but this
   * modal is mounted on every dashboard load and the row is tiny.
   */
  const { data: cosmology } = useQuery<{
    birthDate?: string | null;
    birthTime?: string | null;
    birthName?: string | null;
    yOverrides?: Record<string, boolean> | null;
  }>({ queryKey: ["/api/energy/cosmology"] });

  // The birth name is stored as one string, because that is what the numbers
  // are computed from. Splitting it back out for the form is lossy for anyone
  // with two middle names — so first and last come from the account, and
  // whatever sits between them is treated as the middle.
  const intakeInitial = useMemo(() => {
    const parts = (cosmology?.birthName ?? "").trim().split(/\s+/).filter(Boolean);
    return {
      middleName: parts.length > 2 ? parts.slice(1, -1).join(" ") : "",
      birthDate: cosmology?.birthDate ?? "",
      birthTime: cosmology?.birthTime ?? "",
      yOverrides: cosmology?.yOverrides ?? {},
    };
  }, [cosmology]);

  const saveIntake = useMutation({
    mutationFn: async (v: IntakeValues) => {
      const birthName = [v.firstName, v.middleName, v.lastName]
        .map((s) => s.trim())
        .filter(Boolean)
        .join(" ");
      // Two writes, because they are two different records: the display name
      // on the account, and the birth data the numbers come from. See the note
      // in server/profile/routes.ts on why they must not be the same field.
      await apiRequest("PATCH", "/api/profile", {
        firstName: v.firstName.trim(),
        lastName: v.lastName.trim() || null,
      });
      const res = await apiRequest("PUT", "/api/energy/cosmology", {
        birthName,
        birthDate: v.birthDate || null,
        birthTime: v.birthTime || null,
        yOverrides: Object.keys(v.yOverrides).length ? v.yOverrides : null,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      queryClient.invalidateQueries({ queryKey: ["/api/energy/cosmology"] });
      setStep("photo");
    },
  });

  const savePhoto = useMutation({
    mutationFn: async (file: File) => {
      const body = new FormData();
      body.append("photo", file);
      // Not apiRequest: it sets a JSON content-type, and multipart needs the
      // browser to write its own boundary. apiFetch still adds the bearer.
      const res = await apiFetch("/api/profile/photo", { method: "POST", body });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message ?? "Upload failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
    },
  });

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
      // Intake first. It is the only step that changes what the app *says*
      // tomorrow rather than merely what it is allowed to do, and asking for
      // permissions before knowing who someone is gets the order backwards.
      setStep("intake");
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
  const answers = useRef<{
    intake: boolean | null;
    photo: boolean | null;
    health: boolean | null;
    notice: NoticeDepth | null;
  }>({ intake: null, photo: null, health: null, notice: null });

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
        intake: answers.current.intake,
        photo: answers.current.photo,
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
      {/* `max-h` and `overflow-y-auto` are load-bearing, not polish.
          DialogContent is centred with translate-y-[-50%] and has no height
          cap of its own, so content taller than the viewport runs off *both*
          edges — and the part above the fold cannot be scrolled to, because
          the overflow is on an element that is already half off-screen. The
          intake step is three name fields, the Y question, two date fields and
          two buttons; on a small phone that is over the line.

          `svh` rather than `vh`: on mobile Safari `vh` is the height with the
          address bar hidden, which is not the height you have while it is
          showing. */}
      <DialogContent
        className="max-w-sm max-h-[88svh] overflow-y-auto scroll-touch"
        data-testid={`onboarding-${step}`}
      >
        {step === "intake" && (
          <>
            <DialogHeader>
              <div className="h-11 w-11 rounded-full bg-[hsl(var(--gold))]/10 grid place-items-center mb-2">
                <Sparkles className="h-5 w-5 text-[hsl(var(--gold))]" />
              </div>
              <DialogTitle className="font-display text-xl">Let's make this yours</DialogTitle>
              <DialogDescription className="text-sm leading-relaxed">
                Your name and birth date are what the daily reading is built from. Without them
                this is a habit tracker; with them it's written for you.
              </DialogDescription>
            </DialogHeader>

            <IntakeStep
              initial={{
                firstName: user?.firstName ?? "",
                lastName: user?.lastName ?? "",
                middleName: intakeInitial.middleName,
                birthDate: intakeInitial.birthDate,
                birthTime: intakeInitial.birthTime,
                yOverrides: intakeInitial.yOverrides,
              }}
              saving={saveIntake.isPending}
              error={saveIntake.isError ? "That didn't save. Try again." : null}
              onSubmit={(values) => {
                answers.current.intake = true;
                saveIntake.mutate(values);
              }}
              onSkip={() => {
                answers.current.intake = false;
                setStep("photo");
              }}
            />
          </>
        )}

        {step === "photo" && (
          <>
            <DialogHeader>
              <div className="h-11 w-11 rounded-full bg-[hsl(var(--gold))]/10 grid place-items-center mb-2">
                <Camera className="h-5 w-5 text-[hsl(var(--gold))]" />
              </div>
              <DialogTitle className="font-display text-xl">Put a face to it</DialogTitle>
              <DialogDescription className="text-sm leading-relaxed">
                Your coach sees this, and so does the room. Initials work fine if you'd rather.
              </DialogDescription>
            </DialogHeader>

            <PhotoStep
              initials={initials}
              currentUrl={user?.profileImageUrl}
              saving={savePhoto.isPending}
              error={
                savePhoto.isError
                  ? savePhoto.error instanceof Error
                    ? savePhoto.error.message
                    : "That didn't upload."
                  : null
              }
              onUpload={(file) => {
                answers.current.photo = true;
                savePhoto.mutate(file);
              }}
              onSkip={() => setStep(available === true && !connected ? "health" : "notifications")}
            />
          </>
        )}

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
              <DialogTitle className="font-display text-xl">Your morning brief</DialogTitle>
              <DialogDescription className="text-sm leading-relaxed">
                One notification a day, at 7am — your protocol, your practices, your sleep.
                Nothing else, ever.
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
