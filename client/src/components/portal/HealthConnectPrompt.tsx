/**
 * The ask, once, on the way in.
 *
 * A member who never opens Stats never discovers that the app can read their
 * ring, so the feature may as well not exist for them. This is the one moment
 * where asking is fair: they have just chosen to open the app.
 *
 * It is deliberately not a permission prompt. Tapping Connect is what raises
 * the real Apple Health or Health Connect sheet — this is the sentence that
 * explains why, before the system asks a question the member cannot answer
 * without context. Both stores expect that ordering, and a member who is
 * ambushed by the system sheet denies it, which is a decision we cannot
 * re-ask on iOS.
 */

import { useEffect, useState } from "react";
import { HeartPulse } from "lucide-react";
import { useHealthSummary, useHealthSync } from "@/hooks/use-health";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const DISMISSED_KEY = "sakred.health.promptDismissedAt";
/**
 * How long a "not now" lasts.
 *
 * Never asking again loses the member who tapped past it while walking; asking
 * every launch is the behaviour that makes people delete apps. A fortnight is
 * long enough that the second ask reads as a different moment.
 */
const SNOOZE_MS = 14 * 24 * 60 * 60 * 1000;

function snoozed(): boolean {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY);
    if (!raw) return false;
    return Date.now() - Number(raw) < SNOOZE_MS;
  } catch {
    // Private mode, or storage disabled. Treat as never asked rather than
    // never asking — a thrown getItem should not silently kill the feature.
    return false;
  }
}

function snooze(): void {
  try {
    localStorage.setItem(DISMISSED_KEY, String(Date.now()));
  } catch {
    /* nothing to do; it will ask again next launch */
  }
}

export function HealthConnectPrompt() {
  const { available, platform, connect } = useHealthSync();
  const { data, isLoading } = useHealthSummary(30);
  const [open, setOpen] = useState(false);

  const connected = data?.connected ?? false;
  const storeName = platform === "healthconnect" ? "Health Connect" : "Apple Health";

  useEffect(() => {
    // Every condition has to be settled before this can open. `available` is
    // null until the native probe resolves, and opening on that beat would
    // flash the dialog at web users for a frame.
    if (available !== true || isLoading || connected || snoozed()) return;
    // A beat after the dashboard paints. Opening on the same frame as the
    // first render lands the dialog before the screen behind it exists, which
    // reads as the app booting into a popup.
    const t = setTimeout(() => setOpen(true), 900);
    return () => clearTimeout(t);
  }, [available, isLoading, connected]);

  const notNow = () => {
    snooze();
    setOpen(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Dismissing by tapping outside is still a "not now" — otherwise it
        // reopens on the next screen and feels like a bug.
        if (!next) notNow();
      }}
    >
      <DialogContent className="max-w-sm" data-testid="health-connect-modal">
        <DialogHeader>
          <div className="h-11 w-11 rounded-full bg-[hsl(var(--gold))]/10 grid place-items-center mb-2">
            <HeartPulse className="h-5 w-5 text-[hsl(var(--gold))]" />
          </div>
          <DialogTitle className="font-display text-xl">
            Bring your body into it
          </DialogTitle>
          <DialogDescription className="text-sm leading-relaxed">
            Your phone already measures your sleep, recovery and movement. Connect {storeName} and
            your practice reflects what you actually did — not what you remembered to log.
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
              setOpen(false);
            }}
            disabled={connect.isPending}
            data-testid="health-connect-confirm"
          >
            {connect.isPending ? "Connecting…" : `Connect ${storeName}`}
          </Button>
          <Button variant="ghost" onClick={notNow} className="text-muted-foreground">
            Not now
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
