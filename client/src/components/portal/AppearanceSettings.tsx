/**
 * Night, daylight, or whatever the phone is doing.
 *
 * ── Why there is no Save button ───────────────────────────────────────────
 *
 * A theme is the one setting whose preview *is* its confirmation. Staging the
 * change behind a Save would mean showing a member a control that claims to
 * change the app's appearance and then not changing it, which is a worse
 * interaction than any amount of undo affordance is worth. Tapping applies.
 *
 * ── Why it is device-local ────────────────────────────────────────────────
 *
 * This follows the phone, not the account. Someone reading in bed on a phone
 * and reviewing a plan on a laptop in daylight has two different answers, and
 * syncing the preference would force them to keep correcting whichever device
 * they touched second. It is also why nothing here is a mutation: there is no
 * request to fail, so there is no error state and no pending state — which is
 * the whole reason this panel can be honest about applying instantly.
 */

import { Monitor, Moon, SunMedium } from "lucide-react";
import type { Appearance } from "@/lib/appearance";
import { useAppearance } from "@/hooks/use-appearance";
import { InfoTip } from "@/components/ui/info-tip";
import { cn } from "@/lib/utils";

const OPTIONS: { value: Appearance; label: string; Icon: typeof Monitor }[] = [
  { value: "system", label: "System", Icon: Monitor },
  { value: "light", label: "Light", Icon: SunMedium },
  { value: "dark", label: "Dark", Icon: Moon },
];

export function AppearanceSettings() {
  const { preference, systemDark, choose } = useAppearance();

  return (
    <div className="space-y-3">
      <div
        className="grid grid-cols-3 gap-1 rounded-xl border border-border/60 p-1"
        role="radiogroup"
        aria-label="Appearance"
      >
        {OPTIONS.map(({ value, label, Icon }) => {
          const selected = preference === value;
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => choose(value)}
              className={cn(
                "flex flex-col items-center gap-1.5 rounded-lg px-2 py-3 text-sm transition-colors tap-clean",
                selected
                  ? "bg-[hsl(var(--gold))]/15 text-[hsl(var(--gold-text))]"
                  : "text-muted-foreground hover:text-foreground",
              )}
              data-testid={`button-appearance-${value}`}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              {label}
            </button>
          );
        })}
      </div>

      <p className="text-xs text-muted-foreground">
        {preference === "system"
          ? `Following your phone, which is in ${systemDark ? "dark" : "light"} mode.`
          : "Your choice, whatever your phone is set to."}
        <InfoTip label="About appearance" title="This phone only">
          Appearance is stored on the device rather than on your account, so a phone
          you read on at night and a laptop you plan on in daylight can each be set
          the way that suits them. Nothing about your health, your training or what
          Sakred reads from them changes with the light.
        </InfoTip>
      </p>
    </div>
  );
}
