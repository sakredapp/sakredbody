/**
 * The Body Map
 *
 * A vertical axis of centres, crown to root, drawn as an engraving rather than
 * a diagram — the same register as CelestialField and TerrainWheel. Selecting a
 * centre opens what it is, how it reads today, and which practices move it.
 *
 * The reading is the live part. It's append-only, so the member is recording a
 * moment rather than editing a status, and the strip of past readings under the
 * selector is the thing a coach actually looks at.
 */

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  useBodyMap,
  useCentre,
  useCentreHistory,
  useRecordReading,
  type MappedCentre,
} from "@/hooks/use-energy";
import type { CentreState } from "@shared/schema";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { SectionHeading } from "@/components/portal/Panel";

const STATES: { id: CentreState; label: string }[] = [
  { id: "blocked", label: "Blocked" },
  { id: "stirring", label: "Stirring" },
  { id: "open", label: "Open" },
];

/** Gold at full strength reads as open; dimmer as it closes. */
const STATE_ALPHA: Record<CentreState, number> = {
  blocked: 0.22,
  stirring: 0.55,
  open: 1,
};

function nodeColor(centre: MappedCentre, selected: boolean) {
  if (selected) return "hsl(var(--gold))";
  const state = centre.reading?.state;
  if (!state) return "hsl(var(--gold) / 0.3)";
  return `hsl(var(--gold) / ${STATE_ALPHA[state]})`;
}

// ─── The axis ──────────────────────────────────────────────────────────────

function Axis({
  centres,
  selectedId,
  onSelect,
}: {
  centres: MappedCentre[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="relative w-full" style={{ height: `${centres.length * 62 + 40}px` }}>
      {/* The spine. Two lines: a faint full-length one and a gilt overlay, so
          it reads as engraved rather than drawn. */}
      <svg className="absolute inset-0 w-full h-full" aria-hidden="true">
        <line
          x1="24" y1="10" x2="24" y2="100%"
          stroke="hsl(var(--gold) / 0.14)"
          strokeWidth="1"
        />
      </svg>

      {centres.map((c, i) => {
        const selected = selectedId === c.id;
        const top = 20 + i * 62;
        return (
          <button
            key={c.id}
            onClick={() => onSelect(c.id)}
            className="absolute left-0 right-0 flex items-center gap-4 text-left group"
            style={{ top: `${top}px` }}
            aria-pressed={selected}
            data-testid={`centre-node-${c.id}`}
          >
            <span className="relative flex items-center justify-center w-12 shrink-0">
              {/* A ring around the selected node — the orrery motif, small. */}
              {selected && (
                <motion.span
                  layoutId="centre-ring"
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
                  background: nodeColor(c, selected),
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
                {c.name}
              </span>
              {c.aspect && (
                <span className="block text-xs text-muted-foreground/70">{c.aspect}</span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ─── Detail ────────────────────────────────────────────────────────────────

function CentreDetail({ centreId, current }: { centreId: string; current: MappedCentre }) {
  const detail = useCentre(centreId);
  const history = useCentreHistory(centreId);
  const record = useRecordReading();

  const state = current.reading?.state ?? null;

  return (
    <div className="space-y-8">
      <div>
        <h3 className="font-display text-3xl leading-tight" data-testid="text-centre-name">
          {current.name}
        </h3>
        <p className="text-xs uppercase tracking-widest text-muted-foreground mt-2">
          {[current.bodyRegion, current.element].filter(Boolean).join(" · ")}
        </p>
      </div>

      {current.description && (
        <p className="text-[15px] leading-relaxed">{current.description}</p>
      )}

      {/* How it reads today. */}
      <div>
        <p className="text-xs uppercase tracking-widest text-[hsl(var(--gold))] mb-3">Today</p>
        <div className="flex gap-2">
          {STATES.map((s) => (
            <button
              key={s.id}
              onClick={() => record.mutate({ centreId, state: s.id })}
              disabled={record.isPending}
              className={cn(
                "px-4 py-2 rounded-full text-sm border transition-colors",
                state === s.id
                  ? "border-[hsl(var(--gold))]/55 bg-[hsl(var(--gold))]/15 text-[hsl(var(--gold))]"
                  : "border-border/60 text-muted-foreground hover:text-foreground",
              )}
              data-testid={`centre-state-${s.id}`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* The strip a coach reads: movement, not a snapshot. */}
        {(history.data?.length ?? 0) > 1 && (
          <div className="flex items-center gap-1 mt-5">
            {history.data!.slice(-24).map((r) => (
              <span
                key={r.id}
                title={new Date(r.recordedAt!).toLocaleDateString()}
                className="h-6 flex-1 max-w-[10px] rounded-sm"
                style={{
                  background: `hsl(var(--gold) / ${STATE_ALPHA[r.state as CentreState]})`,
                }}
              />
            ))}
          </div>
        )}
      </div>

      {(current.whenBlocked || current.whenFlowing) && (
        <div className="grid sm:grid-cols-2 gap-6 border-t border-border/50 pt-6">
          {current.whenBlocked && (
            <div>
              <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2">
                When it's held
              </p>
              <p className="text-sm leading-relaxed text-muted-foreground">{current.whenBlocked}</p>
            </div>
          )}
          {current.whenFlowing && (
            <div>
              <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2">
                When it moves
              </p>
              <p className="text-sm leading-relaxed text-muted-foreground">{current.whenFlowing}</p>
            </div>
          )}
        </div>
      )}

      {(detail.data?.practices.length ?? 0) > 0 && (
        <div className="border-t border-border/50 pt-6">
          <p className="text-xs uppercase tracking-widest text-[hsl(var(--gold))] mb-4">
            What moves it
          </p>
          {detail.data!.practices.map((p) => (
            <div key={p.id} className="py-2.5 border-b border-border/40 last:border-0">
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="text-sm">{p.title}</span>
                <span className="text-xs text-muted-foreground">{p.action}</span>
              </div>
              {p.shortDescription && (
                <p className="text-xs text-muted-foreground mt-0.5">{p.shortDescription}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {(detail.data?.protocols.length ?? 0) > 0 && (
        <div className="border-t border-border/50 pt-6">
          <p className="text-xs uppercase tracking-widest text-[hsl(var(--gold))] mb-4">
            Protocols
          </p>
          {detail.data!.protocols.map((p) => (
            <div key={p.id} className="flex items-center gap-3 py-2.5 border-b border-border/40 last:border-0">
              <span className="text-sm flex-1">{p.name}</span>
              {p.isPrimary && <Badge variant="secondary" className="text-[10px]">Primary</Badge>}
              <span className="text-xs text-muted-foreground">{p.durationDays} days</span>
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-muted-foreground/70 leading-relaxed border-t border-border/50 pt-6">
        This is how we read the body. It explains what you're doing and why it's
        sequenced this way — it isn't a diagnosis and it doesn't replace care.
      </p>
    </div>
  );
}

// ─── Tab ───────────────────────────────────────────────────────────────────

export function BodyMap() {
  const map = useBodyMap();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const centres = map.data ?? [];
  const selected = centres.find((c) => c.id === selectedId) ?? centres[0] ?? null;

  if (map.isLoading) {
    return (
      <div className="grid md:grid-cols-[220px_1fr] gap-12">
        <Skeleton className="h-[600px] w-full" />
        <Skeleton className="h-[400px] w-full" />
      </div>
    );
  }

  // Heading kept on the empty state — see WinsTab for why: while the app has
  // no content, the empty state is the screen most of the time, and a bare
  // sentence with no title reads as a failure rather than as waiting.
  if (centres.length === 0) {
    return (
      <div className="space-y-6">
        <SectionHeading
          title="The Body"
          subtitle="Where things sit, and what you notice when they move."
        />
        <p className="py-12 text-center text-sm text-muted-foreground">
          The map hasn't been drawn yet.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <SectionHeading
        title="The Body"
        subtitle="Where things sit, and what you notice when they move."
      />

      <div className="grid md:grid-cols-[220px_1fr] gap-12">
        <Axis
          centres={centres}
          selectedId={selected?.id ?? null}
          onSelect={setSelectedId}
        />

        <AnimatePresence mode="wait">
          {selected && (
            <motion.div
              key={selected.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
            >
              <CentreDetail centreId={selected.id} current={selected} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
