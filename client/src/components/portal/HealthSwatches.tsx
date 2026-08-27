/**
 * What we actually know about this person, on the home screen.
 *
 * Home was five doors and nothing else — every card the same size, every card
 * a link, nothing on it that differed from one member to the next. A home
 * screen that is only navigation is a menu, and a member with an Oura ring
 * feeding Apple Health should see their own numbers before they see a menu.
 *
 * ── Why the layout is uneven on purpose ───────────────────────────────────
 *
 * The first version of this was four identical boxes, each a label and a
 * number. It was correct and it was inert: nothing on it moved, nothing showed
 * a direction, and four equal boxes give four unequal things equal weight.
 * Sleep is not the same size as flights climbed.
 *
 * So the board is derived twice over. Which metrics appear comes from what the
 * member has (pickSwatches); how each one draws comes from what its data can
 * support (planTiles). A metric with a fortnight of history gets a chart; one
 * with three readings gets a number, because a three-point line is a shape
 * with no information in it. Two members see different boards, and the same
 * member's board changes as their history fills in — which is the honest
 * behaviour, not a stylistic choice.
 *
 * Nothing here fabricates a value to fill a slot. Missing days are skipped
 * rather than zero-filled, all-zero metrics never qualify, and a target only
 * exists where one exists outside this app. The failure this guards against is
 * specific: an empty or invented tile reads as the app being broken, and a
 * member cannot tell that apart from data they never shared.
 */

import { useState } from "react";
import { ChevronRight, TrendingDown, TrendingUp } from "lucide-react";
import { Capacitor } from "@capacitor/core";
import { useHealthSync, useHealthView } from "@/hooks/use-health";
import { METRIC_DISPLAY, planTiles, trendOf, dayLabel, localToday } from "@/lib/healthDisplay";
import type { DaySeries, Tile } from "@/lib/healthDisplay";
import type { HealthMetric } from "@shared/models/health";
import { MetricDetail } from "@/components/portal/MetricDetail";
import { cn } from "@/lib/utils";

/** Five is what fits above the fold beside a hero without becoming a page. */
const MAX_TILES = 5;

const GOLD = "hsl(var(--gold))";

// ─── Drawing ────────────────────────────────────────────────────────────────
//
// Hand-rolled SVG rather than a charting library. These are forty pixels tall
// with no axes, no legend, no tooltips and no interaction; a chart library
// would add a runtime dependency to the first screen after sign-in in exchange
// for features none of them use. The whole of the drawing code is below and
// fits on one screen.

/**
 * Points mapped into the viewBox, oldest left.
 *
 * The flat-series case is the one worth writing down: with every reading equal,
 * the normalised range is zero and the obvious formula divides by it. Pinning
 * a flat line to the vertical middle is right in a way that falling back to
 * "bottom" is not — a member whose weight held steady all fortnight should see
 * a level line, not one lying on the floor next to zero.
 */
function plot(points: number[], width: number, height: number, pad = 3): string {
  const min = Math.min(...points);
  const max = Math.max(...points);
  const inner = height - pad * 2;
  const step = points.length > 1 ? width / (points.length - 1) : 0;

  return points
    .map((value, i) => {
      const y = max === min ? pad + inner / 2 : pad + inner - ((value - min) / (max - min)) * inner;
      return `${(i * step).toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
}

function Sparkline({ points, className }: { points: number[]; className?: string }) {
  const W = 100;
  const H = 34;
  const line = plot(points, W, H);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      // The tile widths differ, so the drawing has to stretch. Without
      // non-scaling-stroke that stretch is applied to the line itself and a
      // 1px stroke becomes a 3px wedge on the wide tiles only.
      preserveAspectRatio="none"
      className={cn("w-full", className)}
      aria-hidden="true"
    >
      <polyline
        points={`0,${H} ${line} ${W},${H}`}
        fill={GOLD}
        fillOpacity="0.10"
        stroke="none"
      />
      <polyline
        points={line}
        fill="none"
        stroke={GOLD}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function Bars({ points }: { points: number[] }) {
  const W = 100;
  const H = 34;
  const max = Math.max(...points);
  const slot = W / points.length;
  const width = slot * 0.55;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full" aria-hidden="true">
      {points.map((value, i) => {
        // A floor of one unit so a genuinely low day is a short bar rather
        // than nothing at all — an invisible bar and a missing day would
        // otherwise look identical, and only one of them is real.
        const h = max > 0 ? Math.max(1, (value / max) * (H - 2)) : 1;
        return (
          <rect
            key={i}
            x={i * slot + (slot - width) / 2}
            y={H - h}
            width={width}
            height={h}
            rx="0.8"
            fill={GOLD}
            // The most recent day carries full weight; the rest recede.
            fillOpacity={i === points.length - 1 ? 0.95 : 0.38}
          />
        );
      })}
    </svg>
  );
}

function Ring({ value, target }: { value: number; target: number }) {
  const R = 26;
  const C = 2 * Math.PI * R;
  const ratio = target > 0 ? value / target : 0;
  // Clamped for the drawing only. The number beside it stays true, so a
  // 140% day reads as 140% while the ring simply closes.
  const drawn = Math.max(0, Math.min(1, ratio));

  return (
    <div className="relative h-[62px] w-[62px] shrink-0">
      <svg viewBox="0 0 62 62" className="h-full w-full -rotate-90">
        <circle cx="31" cy="31" r={R} fill="none" stroke={GOLD} strokeOpacity="0.14" strokeWidth="4" />
        <circle
          cx="31"
          cy="31"
          r={R}
          fill="none"
          stroke={GOLD}
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={C * (1 - drawn)}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center font-display text-xs text-[hsl(var(--gold))]">
        {Math.round(ratio * 100)}%
      </span>
    </div>
  );
}

/** Direction against the member's own earlier weeks. Silent when it's noise. */
function Trend({ tile }: { tile: Tile }) {
  const trend = trendOf(tile);
  if (!trend) return null;

  const up = trend.pct > 0;
  const Icon = up ? TrendingUp : TrendingDown;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-[10px]",
        // Neutral where the metric has no better direction. Weight is a goal,
        // not a virtue, and green-for-down is the app taking a position it has
        // no business taking.
        trend.good === null
          ? "text-muted-foreground"
          : trend.good
            ? "text-emerald-400/80"
            : "text-amber-400/80",
      )}
    >
      <Icon className="h-2.5 w-2.5" />
      {Math.abs(Math.round(trend.pct))}%
    </span>
  );
}

// ─── Tiles ──────────────────────────────────────────────────────────────────

function TileBody({ tile }: { tile: Tile }) {
  const display = METRIC_DISPLAY[tile.metric];
  const label = (
    <div className="text-[10px] uppercase tracking-wide text-muted-foreground truncate">
      {display.label}
    </div>
  );
  const value = (
    <div className="font-display text-lg text-[hsl(var(--gold))] leading-tight">
      {display.format(tile.value)}
    </div>
  );

  switch (tile.shape) {
    case "hero":
      return (
        <div className="flex h-full flex-col justify-between gap-2">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              {label}
              <div className="mt-0.5 flex items-baseline gap-2">
                <span className="font-display text-2xl text-[hsl(var(--gold))]">
                  {display.format(tile.value)}
                </span>
                <Trend tile={tile} />
              </div>
            </div>
            {tile.target !== null && <Ring value={tile.value} target={tile.target} />}
          </div>
          <Bars points={tile.points} />
        </div>
      );

    case "ring":
      return (
        <div className="flex h-full items-center gap-3">
          <Ring value={tile.value} target={tile.target ?? 0} />
          <div className="min-w-0">
            {label}
            {value}
            <Trend tile={tile} />
          </div>
        </div>
      );

    case "spark":
      return (
        <div className="flex h-full flex-col justify-between gap-1">
          <div>
            {label}
            <div className="flex items-baseline gap-2">
              {value}
              <Trend tile={tile} />
            </div>
          </div>
          <Sparkline points={tile.points} />
        </div>
      );

    case "stat":
    default:
      return (
        <div className="flex h-full flex-col justify-center">
          {label}
          {value}
          <Trend tile={tile} />
        </div>
      );
  }
}

// ─── The board ──────────────────────────────────────────────────────────────

export function HealthSwatches({ onOpenStats }: { onOpenStats?: () => void }) {
  /**
   * Which tile was tapped.
   *
   * Every tile used to call `onOpenStats`, so Sleep and Steps did the same
   * thing — and neither said what date the number was from. The detail opens
   * in place rather than navigating, because a member tapping a figure on the
   * home screen wants the figure explained, not to be moved to another screen.
   */
  const [openMetric, setOpenMetric] = useState<HealthMetric | null>(null);
  const { connect } = useHealthSync();
  const { view, reason, platform, days: rawDays } = useHealthView(30);
  const isNative = Capacitor.isNativePlatform();

  const days = rawDays as DaySeries[];
  const storeName = platform === "healthconnect" ? "Health Connect" : "Apple Health";

  const tiles = planTiles(days, MAX_TILES);
  const today = localToday();
  // The most recent day anything arrived for — what the header names.
  const freshest = tiles.map((t) => t.onDate).filter(Boolean).sort().pop() ?? null;

  /*
    ── The order of these branches is the fix ──────────────────────────────

    Every one of them used to begin `!connected &&`, where `connected` was read
    out of the summary payload — so on a cold launch, before that query had
    answered, a connected member fell through to the Connect prompt at the
    bottom. On Home. As the first thing they saw. Meanwhile Settings, reading
    the same undefined value a moment later, said Connected.

    Now the branches are a single resolved state, and `unknown` is a state the
    machine can actually be in rather than a value that had to pretend to be
    "no". Nothing here can offer to connect a phone that is already connected.
  */

  // Still deciding. Render nothing rather than flashing an explanation that
  // resolves a beat later into its own contradiction.
  if (view.kind === "unknown") return null;

  // A browser cannot read health data, so a prompt there would be an
  // instruction the member cannot follow.
  if (view.kind !== "ready" && !isNative) return null;

  // ── Unavailable, said out loud ──────────────────────────────────────────
  //
  // This branch used to be folded into `available !== true` and returned null,
  // which meant a phone where the probe answered "no" showed no health UI and
  // no explanation — indistinguishable from the feature not existing. It cost
  // an hour of looking for a bug that the app already knew about and was
  // declining to mention.
  //
  // `reason` has been carried up from the plugin since the beginning and was
  // never rendered anywhere. On Android it is the actionable case: Health
  // Connect is genuinely absent on some devices and is installable.
  if (view.kind === "unavailable") {
    return (
      <div
        className="rounded-xl border border-border/40 bg-raise p-4"
        data-testid="health-unavailable"
      >
        <p className="text-sm">{storeName} isn't available on this phone</p>
        {reason && <p className="text-xs text-muted-foreground mt-1">{reason}</p>}
      </div>
    );
  }

  if (view.kind === "disconnected") {
    return (
      <button
        onClick={() => connect.mutate()}
        disabled={connect.isPending}
        className="w-full rounded-xl border border-[hsl(var(--gold))]/20 bg-raise p-4 text-left tap-clean hover:border-[hsl(var(--gold))]/40 transition-colors"
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

  // Linked, and the read is still outstanding. The member is not asked to do
  // anything, because there is nothing for them to do.
  if (view.kind === "hydrating") {
    return (
      <div
        className="rounded-xl border border-border/40 bg-raise p-4"
        data-testid="health-hydrating"
      >
        <p className="text-xs text-muted-foreground">Loading your health data…</p>
      </div>
    );
  }

  if (view.kind === "error") {
    return (
      <div className="rounded-xl border border-border/40 bg-raise p-4">
        <p className="text-xs text-muted-foreground">
          We couldn't reach your health data just now. It's still on your phone.
        </p>
      </div>
    );
  }

  if (view.kind === "empty" || !tiles.length) {
    return (
      <div className="rounded-xl border border-border/40 bg-raise p-4">
        <p className="text-xs text-muted-foreground">
          {storeName} is connected. Nothing has come through yet — if you only just allowed it,
          give it a minute.
        </p>
      </div>
    );
  }

  return (
    <div data-testid="health-swatches">
      <button
        onClick={onOpenStats}
        disabled={!onOpenStats}
        className="w-full flex items-center justify-between gap-2 mb-2 tap-clean group"
        data-testid="health-swatches-open"
      >
        {/*
          What day this is, stated.

          "Your body, lately" told nobody when any of it was from, so a step
          count that hadn't moved since yesterday read as a broken app rather
          than as yesterday's number. Sync runs on the phone's schedule, and
          the honest thing is to say which day arrived rather than to imply
          it is this one.
        */}
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
          {freshest ? `Your body · ${dayLabel(freshest, today)}` : "Your body, lately"}
        </p>
        {onOpenStats && (
          <ChevronRight className="h-3.5 w-3.5 text-[hsl(var(--gold))] opacity-60 group-hover:opacity-100 transition-opacity" />
        )}
      </button>

      {/* Four columns so a tile can take a half or the whole row. Every tile
          opens the same place — the stats view — because a number on a home
          screen invites the question "and then what", and the answer should
          not be "nothing happens when you touch it". */}
      <div className="grid grid-cols-4 gap-2">
        {tiles.map((tile) => (
          <button
            key={tile.metric}
            onClick={() => setOpenMetric(tile.metric)}
            className={cn(
              "rounded-xl border border-[hsl(var(--gold))]/12 bg-raise p-3 text-left tap-clean",
              onOpenStats && "hover:border-[hsl(var(--gold))]/30 transition-colors",
              tile.span === 4 ? "col-span-4" : "col-span-2",
              tile.shape === "hero" ? "h-32" : "h-[86px]",
            )}
            data-testid={`health-tile-${tile.metric}`}
          >
            <TileBody tile={tile} />
            {/* Only when this tile disagrees with the header — otherwise every
                card repeats the same word and the row turns into noise. */}
            {tile.onDate && tile.onDate !== freshest && (
              <span className="block text-[9px] text-muted-foreground/70 mt-0.5">
                {dayLabel(tile.onDate, today)}
              </span>
            )}
          </button>
        ))}
      </div>

      <MetricDetail metric={openMetric} days={days} onClose={() => setOpenMetric(null)} />
    </div>
  );
}
