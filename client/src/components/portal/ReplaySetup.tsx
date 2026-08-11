/**
 * Run the setup flow again.
 *
 * Onboarding records per device that it has asked — correct for notification
 * permission, widgets and the Health store, since those are facts about a
 * handset rather than a person. The gap was that there was no way to simply
 * see it again, so the only route back to the intake was to delete the account
 * and register a new one: destroying real data to look at a screen.
 *
 * Clearing the two keys is the whole mechanism. A reload is deliberate rather
 * than lazy: the modal decides whether to open in an effect on mount, reading
 * those keys, and the honest way to re-run that decision is to remount the app
 * — anything cleverer would be a second copy of the opening logic that could
 * disagree with the first.
 */

import { useState } from "react";
import { RotateCcw } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { replayOnboarding } from "./Onboarding";
import { Button } from "@/components/ui/button";

export function ReplaySetup() {
  const { user } = useAuth();
  const [going, setGoing] = useState(false);

  if (!user?.id) return null;

  return (
    <div className="pt-4 mt-4 border-t border-border/50 space-y-2">
      <p className="text-[11px] text-muted-foreground leading-relaxed">
        Want to walk through setup again — your birth details, a photo, health, reminders and the
        widget? Nothing is deleted; you'll see what you already answered.
      </p>
      <Button
        size="sm"
        variant="outline"
        disabled={going}
        onClick={() => {
          setGoing(true);
          replayOnboarding(user.id);
          window.location.reload();
        }}
        data-testid="settings-replay-onboarding"
      >
        <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
        {going ? "Starting…" : "Run setup again"}
      </Button>
    </div>
  );
}
