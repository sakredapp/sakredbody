/**
 * What we actually know about this person, on the home screen.
 *
 * Home was five doors and nothing else — every card the same size, every card
 * a link, nothing on it that differed from one member to the next. A home
 * screen that is only navigation is a menu, and a member with an Oura ring
 * feeding Apple Health should see their own numbers before they see a menu.
 *
 * Deliberately derived, never fixed: the tiles are whatever that member has
 * data for, in priority order. Two members open this and see different things,
 * which is the point — a hard-coded set of four would show empty boxes to
 * someone who never granted sleep, and empty boxes read as broken.
 */

import { ChevronRight } from "lucide-react";
import { useHealthSummary, useHealthSync } from "@/hooks/use-health";
import { METRIC_DISPLAY, pickSwatches, summarise } from "@/lib/healthDisplay";
import type { DaySeries } from "@/lib/healthDisplay";
import type { HealthMetric } from "@shared/schema";
import { Button } from "@/components/ui/button";

const MAX_TILES = 4;

export function HealthSwatches({ onOpenStats }: { onOpenStats?: () => void }) {
  const { data } = useHealthSummary(30);
  const { available, platform, connect } = useHealthSync();

  const days = (data?.days ?? []) as DaySeries[];
  const connected = data?.connected ?? false;
  const storeName = platform === "healthconnect" ? "Health Connect" : "Apple Health";

  // Only what this member actually has, best first. pickSwatches is the rule;
  // see the note on it in healthDisplay.ts.
  const tiles = pickSwatches(days, MAX_TILES)
    .map((metric) => ({ metric, stat: summarise(days, metric) }))
    .filter((t): t is { metric: HealthMetric; stat: NonNullable<typeof t.stat> } => t.stat !== null);

  // Nothing to say and nothing to offer: a browser cannot read health data, so
  // a prompt there would be an instruction the member cannot follow.
  if (!connected && available !== true) return null;

  if (!connected) {
    return (
      <button
        onClick={() => connect.mutate()}
        disabled={connect.isPending}
        className="w-full rounded-xl border border-[hsl(var(--gold))]/20 bg-white/[0.03] p-4 text-left tap-clean hover:border-[hsl(var(--gold))]/40 transition-colors"
        data-testid="health-connect-prompt"
      >
        <p className="font-display text-base">
          {connect.isPending ? "Connecting…" : `Connect ${storeName}`}
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Your sleep, recovery and movement — already measured, on this phone.
        </p>
      </button>
    );
  }

  if (!tiles.length) {
    return (
      <div className="rounded-xl border border-border/40 bg-white/[0.03] p-4">
        <p className="text-xs text-muted-foreground">
          {storeName} is connected. Nothing has come through yet — if you only just allowed it,
          give it a minute.
        </p>
      </div>
    );
  }

  return (
    <button
      onClick={onOpenStats}
      disabled={!onOpenStats}
      className="w-full text-left tap-clean group"
      data-testid="health-swatches"
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
          Your body, lately
        </p>
        {onOpenStats && (
          <ChevronRight className="h-3.5 w-3.5 text-[hsl(var(--gold))] opacity-60 group-hover:opacity-100 transition-opacity" />
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {tiles.map(({ metric, stat }) => (
          <div
            key={metric}
            className="rounded-xl border border-[hsl(var(--gold))]/12 bg-white/[0.03] p-3"
          >
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground truncate">
              {METRIC_DISPLAY[metric].label}
            </div>
            <div className="mt-1 font-display text-lg text-[hsl(var(--gold))]">
              {METRIC_DISPLAY[metric].format(stat.value)}
            </div>
          </div>
        ))}
      </div>
    </button>
  );
}
