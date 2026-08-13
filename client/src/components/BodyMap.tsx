/**
 * The Body — the Sakred Body Map, in the app.
 *
 * ── What this screen is for ───────────────────────────────────────────────
 *
 * It answers: what are the major interconnected territories of my body, what
 * can I notice in each, and what does Sakred currently know about them?
 *
 * It deliberately does not ask "is your crown blocked, stirring or open?".
 * That is what this replaces. Nine centres with a three-state selector made
 * energetic anatomy the master ontology and asked people to diagnose an
 * energetic condition they do not experience themselves as having — while
 * quietly running a *second* subjective check-in beside the canonical one. A
 * member could report clarity 2/5 on Restore and "crown: open" here, five
 * minutes apart, about the same lived state, with nothing to reconcile them.
 *
 * The nine centres are not deleted from Sakred and should not be. They are one
 * way of reading the body — a real tributary — and belong later as an optional
 * traditional lens in the Library, not as the frame everything else hangs from.
 * The server tables and use-energy hooks are untouched for exactly that reason.
 *
 * ── One body, one subjective history ─────────────────────────────────────
 *
 * Nothing here is an input. The seven canonical signals are answered once a
 * day in the check-in and read back here, source-labelled, only where the
 * member actually answered. See client/src/lib/bodySignals.ts for which signal
 * a region may speak to, and why those mappings are editorial rather than
 * physiological.
 *
 * ── One map across surfaces ──────────────────────────────────────────────
 *
 * The seven regions and their content come from client/src/data/bodyMap.ts,
 * which the public Body Map also renders. The website teaches the philosophy;
 * the app makes it personal. Same intellectual system, two expressions — and
 * one file, so they cannot drift into two vocabularies for one body.
 */

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { MAP_REGIONS } from "@/data/bodyMap";
import {
  REGION_NOTICE,
  REGION_ORDER,
  signalsForRegion,
  type ReportedToday,
  type RegionKey,
} from "@/lib/bodySignals";
import { TERRAIN_SIGNALS } from "@shared/models/terrainSignals";
import { cn } from "@/lib/utils";
import { SectionHeading } from "@/components/portal/Panel";

const SIGNAL_LABEL = Object.fromEntries(TERRAIN_SIGNALS.map((s) => [s.id, s.label])) as Record<
  string,
  string
>;

/** Regions in reading order, head to ground, with the site's content attached. */
const REGIONS = REGION_ORDER.map((key) => ({
  key,
  region: MAP_REGIONS.find((r) => r.key === key)!,
})).filter((r) => r.region);

// ─── The axis ──────────────────────────────────────────────────────────────

function Axis({
  selectedKey,
  onSelect,
}: {
  selectedKey: RegionKey;
  onSelect: (key: RegionKey) => void;
}) {
  return (
    <div className="relative w-full" style={{ height: `${REGIONS.length * 62 + 40}px` }}>
      {/* The spine, engraved rather than drawn — the same register as the
          constellation figure behind it and TerrainWheel elsewhere. */}
      <svg className="absolute inset-0 w-full h-full" aria-hidden="true">
        <line x1="24" y1="10" x2="24" y2="100%" stroke="hsl(var(--gold) / 0.14)" strokeWidth="1" />
      </svg>

      {REGIONS.map(({ key, region }, i) => {
        const selected = selectedKey === key;
        return (
          <button
            key={key}
            onClick={() => onSelect(key)}
            className="absolute left-0 right-0 min-h-[44px] flex items-center gap-4 text-left group"
            style={{ top: `${20 + i * 62}px` }}
            aria-pressed={selected}
            data-testid={`region-node-${key}`}
          >
            <span className="relative flex items-center justify-center w-12 shrink-0">
              {selected && (
                <motion.span
                  layoutId="region-ring"
                  className="absolute h-7 w-7 rounded-full border"
                  style={{ borderColor: "hsl(var(--gold) / 0.45)" }}
                  transition={{ type: "spring", stiffness: 380, damping: 32 }}
                />
              )}
              <span
                className="rounded-full transition-all duration-300"
                style={{
                  height: selected ? 11 : 8,
                  width: selected ? 11 : 8,
                  background: selected ? "hsl(var(--gold))" : "hsl(var(--gold) / 0.3)",
                }}
              />
            </span>

            <span className="min-w-0">
              <span
                className={cn(
                  "block text-sm transition-colors",
                  selected ? "text-foreground" : "text-muted-foreground group-hover:text-foreground",
                )}
              >
                {region.name}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ─── Detail ────────────────────────────────────────────────────────────────

function Label({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground/70">{children}</p>
  );
}

function RegionDetail({ regionKey, reported }: { regionKey: RegionKey; reported: ReportedToday | null }) {
  const region = MAP_REGIONS.find((r) => r.key === regionKey)!;
  const signals = signalsForRegion(regionKey, reported);

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h2 className="font-serif text-3xl">{region.name}</h2>
        <Label>{region.covers}</Label>
        <p className="text-sm text-muted-foreground leading-relaxed pt-1">{region.governs}</p>
      </div>

      <div className="space-y-3">
        <Label>What you might notice</Label>
        <ul className="space-y-1.5">
          {REGION_NOTICE[regionKey].map((line) => (
            <li key={line} className="text-sm text-muted-foreground leading-relaxed">
              {line}
            </li>
          ))}
        </ul>
      </div>

      {/*
        Only what Sakred actually knows.

        Rendered from the member's own check-in and nothing else. No section at
        all when they have not answered — an empty reading invented to fill a
        slot is worse than a screen that admits it does not know, and this is
        the majority case rather than an edge one.
      */}
      {signals.length > 0 && (
        <div className="space-y-3">
          <Label>Today</Label>
          <div className="space-y-2">
            {signals.map((s) => (
              <div key={s.id} className="flex items-baseline gap-3" data-testid={`region-signal-${s.id}`}>
                <span className="text-sm w-32 shrink-0">{SIGNAL_LABEL[s.id] ?? s.id}</span>
                <span className="text-sm tabular-nums">{s.value}/5</span>
                <span className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground/60">
                  Member reported
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/*
        Tradition and measurement, kept as two separate sentences.

        The same rule the apothecary enforces in code: a tradition is what it
        observed and the language it used; a measurement is what an instrument
        can show. Merging them is what turns a long, useful tradition into a
        modern assertion it never made.
      */}
      <div className="space-y-3 pt-2 border-t border-border/40">
        <Label>Traditional lens</Label>
        <p className="text-xs text-muted-foreground/80">{region.traditions}</p>
        <p className="text-sm text-muted-foreground leading-relaxed">{region.lens}</p>
      </div>

      <div className="space-y-3">
        <Label>Modern lens</Label>
        <p className="text-sm text-muted-foreground leading-relaxed">{region.measured}</p>
      </div>

      <div className="space-y-3">
        <Label>Practices</Label>
        <div className="flex flex-wrap gap-2">
          {region.practice.map((p) => (
            <span
              key={p}
              className="rounded-full border border-border/60 px-3 py-1 text-xs text-muted-foreground"
            >
              {p}
            </span>
          ))}
        </div>
      </div>

      <p className="text-xs text-muted-foreground/60 leading-relaxed pt-2 border-t border-border/40">
        This is how we read the body. It explains what you're doing and why it's sequenced this way —
        it isn't a diagnosis and it doesn't replace care.
      </p>
    </div>
  );
}

// ─── The screen ────────────────────────────────────────────────────────────

export function BodyMap() {
  const [selectedKey, setSelectedKey] = useState<RegionKey>(REGION_ORDER[0]!);

  /**
   * Today's check-in, read and never written.
   *
   * The same query key the check-in itself uses, so answering on Restore moves
   * this screen too rather than leaving two versions of the same day on two
   * tabs. `empty: true` is the server's way of saying the day has no row.
   */
  const checkin = useQuery<ReportedToday & { empty?: boolean }>({
    queryKey: ["/api/terrain/checkin"],
    staleTime: 60_000,
  });
  const reported = checkin.data && !checkin.data.empty ? checkin.data : null;

  return (
    <div className="space-y-8">
      <SectionHeading
        title="The Body"
        subtitle="A living map of what you feel, what we can measure, and how the systems connect."
      />

      <div className="grid md:grid-cols-[220px_1fr] gap-12">
        <Axis selectedKey={selectedKey} onSelect={setSelectedKey} />

        <AnimatePresence mode="wait">
          <motion.div
            key={selectedKey}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
          >
            <RegionDetail regionKey={selectedKey} reported={reported} />
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
