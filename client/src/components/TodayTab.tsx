/**
 * Today.
 *
 * The first screen. What is true about this day, what the member said they
 * would do about it, and — only if it would actually improve tomorrow's note —
 * an invitation to tell us more about themselves.
 *
 * Deliberately quiet. This screen is read before anything is done, so it
 * carries almost no controls: the note, one line the member writes, and the
 * sky underneath it.
 */

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  useToday,
  useSetIntention,
  useMarkIntentionMet,
  useSaveChart,
  useChart,
} from "@/hooks/use-daily";
import { mountGem } from "@/lib/gem";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Check, Moon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AlmanacDay } from "@shared/utils/almanac";

// ─── The stone ─────────────────────────────────────────────────────────────

function Core() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    return mountGem(ref.current, { scale: 0.3, rpm: 0.9 });
  }, []);

  return (
    <canvas
      ref={ref}
      className="w-full h-full"
      aria-hidden="true"
      data-testid="today-core"
    />
  );
}

// ─── The sky, stated plainly ───────────────────────────────────────────────

function moonPhrase(a: AlmanacDay) {
  const pct = Math.round(a.moon.illumination * 100);
  if (a.moon.phase === "new") return "Dark moon";
  if (a.moon.phase === "full") return "Full moon";
  return `${a.moon.phase[0].toUpperCase()}${a.moon.phase.slice(1)}, ${pct}%`;
}

function Almanac({ almanac }: { almanac: AlmanacDay }) {
  // Facts only. The note upstairs does the interpreting; repeating it here
  // would be the explanatory-subtitle problem in another costume.
  const facts: [string, string][] = [
    ["Moon", moonPhrase(almanac)],
    ["Sun", almanac.sunSign],
    ["Season", `${almanac.elemental.season} · ${almanac.elemental.element}`],
    ["Ascendant", almanac.elemental.organ],
  ];

  if (almanac.personal?.personalDay != null) {
    facts.push(["Your day", String(almanac.personal.personalDay)]);
  } else {
    facts.push(["Day", String(almanac.universalDay)]);
  }

  return (
    <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-8 gap-y-5">
      {facts.map(([label, value]) => (
        <div key={label}>
          <dt className="text-[10px] uppercase tracking-widest text-muted-foreground/70">
            {label}
          </dt>
          <dd className="text-sm mt-1 capitalize">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

// ─── The member's own line ─────────────────────────────────────────────────

function Intention({
  current,
  onSave,
  onMet,
  saving,
}: {
  current: { intention: string; metAt: string | null } | null;
  onSave: (text: string) => void;
  onMet: () => void;
  saving: boolean;
}) {
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState(false);

  const met = !!current?.metAt;

  if (current && !editing) {
    return (
      <div className="flex items-start gap-4">
        <button
          onClick={onMet}
          disabled={met}
          aria-label={met ? "Met" : "Mark as met"}
          className={cn(
            "mt-0.5 h-5 w-5 shrink-0 rounded-full border flex items-center justify-center transition-colors",
            met
              ? "bg-[hsl(var(--gold))] border-[hsl(var(--gold))]"
              : "border-border hover:border-[hsl(var(--gold))]",
          )}
          data-testid="button-intention-met"
        >
          {met && <Check className="h-3 w-3 text-background" strokeWidth={3} />}
        </button>

        <button
          onClick={() => {
            setDraft(current.intention);
            setEditing(true);
          }}
          className="text-left flex-1"
          data-testid="button-intention-edit"
        >
          <span className={cn("text-[15px]", met && "line-through opacity-60")}>
            {current.intention}
          </span>
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const text = draft.trim();
        if (!text) return;
        onSave(text);
        setEditing(false);
      }}
      className="flex gap-2"
    >
      <Input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="One thing, today."
        maxLength={280}
        autoFocus={editing}
        data-testid="input-intention"
      />
      <Button type="submit" variant="outline" disabled={!draft.trim() || saving}>
        Set
      </Button>
    </form>
  );
}

// ─── Chart invitation ──────────────────────────────────────────────────────

/**
 * Only shown when it would actually change anything. A member who has given
 * everything is never asked again, and the ask names what it buys rather than
 * gesturing at "personalisation".
 */
function ChartInvite({ depth }: { depth: number }) {
  const chart = useChart();
  const save = useSaveChart();
  const [open, setOpen] = useState(false);
  const [birthDate, setBirthDate] = useState("");
  const [birthName, setBirthName] = useState("");

  useEffect(() => {
    if (chart.data) {
      setBirthDate(chart.data.birthDate ?? "");
      setBirthName(chart.data.birthName ?? "");
    }
  }, [chart.data]);

  if (depth >= 0.4 && !open) return null;

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-left w-full border-t border-border/50 pt-6"
        data-testid="button-chart-invite"
      >
        <p className="text-xs uppercase tracking-widest text-[hsl(var(--gold))] mb-2">
          Make this yours
        </p>
        <p className="text-sm text-muted-foreground">
          Your birth date and full name at birth. Two fields, and tomorrow's note is
          written for you rather than for the day.
        </p>
      </button>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate({
          birthDate: birthDate || null,
          birthName: birthName.trim() || null,
        });
        setOpen(false);
      }}
      className="border-t border-border/50 pt-6 space-y-4"
    >
      <p className="text-xs uppercase tracking-widest text-[hsl(var(--gold))]">
        Make this yours
      </p>

      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-muted-foreground">Birth date</label>
          <Input
            type="date"
            value={birthDate}
            onChange={(e) => setBirthDate(e.target.value)}
            data-testid="input-birth-date"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Full name at birth</label>
          <Input
            value={birthName}
            onChange={(e) => setBirthName(e.target.value)}
            placeholder="Including any middle name"
            data-testid="input-birth-name"
          />
        </div>
      </div>

      <p className="text-xs text-muted-foreground/70">
        Both optional, and neither unlocks anything. They only make the note more
        specific. Birth time and place can come later, in your profile.
      </p>

      <div className="flex gap-2">
        <Button type="submit" disabled={save.isPending}>Save</Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          Not now
        </Button>
      </div>
    </form>
  );
}

// ─── The screen ────────────────────────────────────────────────────────────

export function TodayTab() {
  const today = useToday();
  const setIntention = useSetIntention();
  const markMet = useMarkIntentionMet();

  if (today.isLoading) {
    return (
      <div className="space-y-10">
        <Skeleton className="h-56 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (!today.data) {
    return (
      <p className="py-20 text-center text-sm text-muted-foreground">
        Couldn't reach today.
      </p>
    );
  }

  const { note, almanac, intention, chartDepth, pending } = today.data;

  return (
    <div className="space-y-14">
      {/* The stone, and the note beside it. */}
      <div className="grid md:grid-cols-[minmax(0,220px)_1fr] gap-10 items-center">
        <div className="h-52 md:h-60 -my-4">
          <Core />
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={note?.headline ?? "none"}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.45 }}
            className="space-y-5"
          >
            {note ? (
              <>
                <h2
                  className="font-display text-3xl md:text-4xl leading-[1.1]"
                  data-testid="text-daily-headline"
                >
                  {note.headline}
                </h2>
                <p className="text-[15px] leading-[1.8] max-w-xl" data-testid="text-daily-body">
                  {note.body}
                </p>
                {note.invitation && (
                  <p className="text-sm text-[hsl(var(--gold-light))] leading-relaxed">
                    {note.invitation}
                  </p>
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Nothing written for today.</p>
            )}

            {/* Silent while it settles — a spinner would make a 25-second
                generation feel like a broken page rather than a quiet one. */}
            {pending && (
              <p className="text-xs text-muted-foreground/50 inline-flex items-center gap-2">
                <Moon className="h-3 w-3" />
                Still being written.
              </p>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* What the member says back. */}
      <div className="border-t border-border/50 pt-8 space-y-4">
        <p className="text-xs uppercase tracking-widest text-[hsl(var(--gold))]">
          Your intention
        </p>
        <Intention
          current={
            intention
              ? {
                  intention: intention.intention,
                  metAt: intention.metAt ? String(intention.metAt) : null,
                }
              : null
          }
          onSave={(text) => setIntention.mutate(text)}
          onMet={() => markMet.mutate()}
          saving={setIntention.isPending}
        />
      </div>

      {/* The facts the note was written from. */}
      <div className="border-t border-border/50 pt-8">
        <Almanac almanac={almanac} />
      </div>

      <ChartInvite depth={chartDepth} />
    </div>
  );
}
