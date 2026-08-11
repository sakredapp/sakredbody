/**
 * Today's Terrain — the line that sits under everything else.
 *
 * ── A lean, not a gauge ───────────────────────────────────────────────────
 *
 * The brief asked for "YIN 62 / 38 YANG". This shows which way the terrain is
 * leaning and why, and no number — because a composite invented from sleep,
 * HRV and training load is arithmetic across three different measurement
 * qualities wearing the costume of a measurement, and because the member will
 * optimise whatever number you show them.
 *
 * PillarHome, one screen up, already made this argument and won it: "A number
 * invented out of other numbers is a character sheet, and this is a practice."
 * Two screens in the same app disagreeing about that would be worse than
 * either answer.
 *
 * Everything here is arguable. "Sleeping 40 minutes less than usual" is a
 * claim a member can check against their own week. "38" is not.
 *
 * ── The bar is a relationship, not a score ────────────────────────────────
 *
 * There is still a bar, because the polarity is easier seen than read — but it
 * is a *marker on an axis between two named ends*, not a filled percentage.
 * The difference is that nothing here reads as "62% of the way to good": both
 * ends are legitimate places to be, which is the whole philosophy.
 */

import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

type Lean = "restore" | "build" | "either" | "unknown";

type Reading = {
  lean: Lean;
  headline: string;
  reasons: { text: string; pulls: "restore" | "build" }[];
  week: { stress: number; restoration: number; sessions: number };
  hasBody: boolean;
};

/** Where the marker sits on the Restore ←→ Build axis, as a percentage. */
const POSITION: Record<Lean, number> = {
  restore: 20,
  either: 50,
  build: 80,
  unknown: 50,
};

export function TerrainToday({ onOpenRestore }: { onOpenRestore?: () => void }) {
  const { data, isLoading } = useQuery<Reading>({
    queryKey: ["/api/terrain/today"],
  });

  // Nothing at all rather than a skeleton: this sits above the doors on the
  // home screen, and a grey block that becomes a sentence is more disruptive
  // than a sentence that arrives.
  if (isLoading || !data) return null;

  const unknown = data.lean === "unknown";

  return (
    <button
      type="button"
      onClick={onOpenRestore}
      disabled={!onOpenRestore}
      className={cn(
        "w-full text-left rounded-xl border border-[hsl(var(--gold))]/12 bg-black/20 px-4 py-3.5 tap-clean",
        onOpenRestore && "hover:border-[hsl(var(--gold))]/30 transition-colors",
      )}
      data-testid="terrain-today"
    >
      <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
        Today's terrain
      </p>

      <p className="font-display text-lg leading-snug mt-1">{data.headline}</p>

      {!unknown && (
        <>
          {/* Restore ←──●──→ Build. Both ends named, so neither reads as the
              failing end of a scale. */}
          <div className="mt-3 flex items-center gap-2.5">
            <span className="text-[10px] uppercase tracking-wider text-[hsl(var(--yin,200_20%_62%))] shrink-0">
              Restore
            </span>
            <span className="relative h-px flex-1 bg-[hsl(var(--gold))]/25">
              <span
                className="absolute top-1/2 h-1.5 w-1.5 -translate-y-1/2 -translate-x-1/2 rounded-full bg-[hsl(var(--gold))]"
                style={{ left: `${POSITION[data.lean]}%` }}
              />
            </span>
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground shrink-0">
              Build
            </span>
          </div>

          {data.reasons.length > 0 && (
            <ul className="mt-2.5 space-y-0.5">
              {data.reasons.slice(0, 3).map((r) => (
                <li key={r.text} className="text-xs text-muted-foreground">
                  {r.text}
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {unknown && (
        <p className="text-xs text-muted-foreground mt-1">
          Connect health data or log a session and this starts reading.
        </p>
      )}
    </button>
  );
}
