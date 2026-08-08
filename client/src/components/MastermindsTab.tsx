/**
 * Masterminds
 *
 * A room, not a booking. The list shows what's open and where you stand; the
 * detail shows the schedule only once you're confirmed, because the schedule
 * belongs to the room.
 */

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, MapPin, Calendar, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Cohort, CohortSession, CohortMemberStatus } from "@shared/schema";

type CohortCard = Cohort & { myStatus: CohortMemberStatus | null; seatsRemaining: number };
type CohortDetail = CohortCard & { myNote: string | null; sessions: CohortSession[] };

const STANDING: Record<CohortMemberStatus, string> = {
  applied: "Applied",
  invited: "Invited",
  confirmed: "In the room",
  declined: "Not this one",
  withdrawn: "Withdrawn",
};

function dateRange(start: string | null, end: string | null) {
  if (!start) return null;
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  const s = new Date(start).toLocaleDateString("en-US", opts);
  if (!end) return s;
  const e = new Date(end).toLocaleDateString("en-US", { ...opts, year: "numeric" });
  return `${s} – ${e}`;
}

function money(cents: number | null, note: string | null) {
  if (cents == null) return null;
  const amount = (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
  return note ? `${amount} ${note}` : amount;
}

async function get<T>(url: string, label: string): Promise<T> {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error(`Failed to load ${label}`);
  return res.json();
}

// ─── List ──────────────────────────────────────────────────────────────────

function Rooms({ onOpen }: { onOpen: (id: string) => void }) {
  const rooms = useQuery<CohortCard[]>({
    queryKey: ["/api/cohorts"],
    queryFn: () => get("/api/cohorts", "the masterminds"),
  });

  if (rooms.isLoading) {
    return (
      <div className="space-y-4">
        {[0, 1].map((i) => (
          <Skeleton key={i} className="h-32 w-full" />
        ))}
      </div>
    );
  }

  if ((rooms.data?.length ?? 0) === 0) {
    return (
      <p className="py-20 text-center text-sm text-muted-foreground">
        Nothing open right now.
      </p>
    );
  }

  return (
    <div>
      {rooms.data!.map((c) => (
        <button
          key={c.id}
          onClick={() => onOpen(c.id)}
          className="w-full text-left py-6 border-t border-border/50 group"
          data-testid={`cohort-${c.id}`}
        >
          <div className="flex items-start justify-between gap-6">
            <div className="min-w-0">
              <div className="flex items-baseline gap-3 flex-wrap">
                <h3 className="font-display text-xl">{c.name}</h3>
                {c.myStatus && (
                  <Badge variant="secondary" className="text-[10px]">
                    {STANDING[c.myStatus]}
                  </Badge>
                )}
              </div>

              <div className="flex items-center gap-4 flex-wrap text-xs text-muted-foreground mt-2">
                {dateRange(c.startDate, c.endDate) && (
                  <span className="inline-flex items-center gap-1.5">
                    <Calendar className="h-3 w-3" />
                    {dateRange(c.startDate, c.endDate)}
                  </span>
                )}
                {c.location && (
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin className="h-3 w-3" />
                    {c.location}
                  </span>
                )}
                <span className="inline-flex items-center gap-1.5">
                  <Users className="h-3 w-3" />
                  {c.seatsRemaining} of {c.capacity} open
                </span>
              </div>

              {c.description && (
                <p className="text-sm text-muted-foreground mt-3 line-clamp-2 max-w-xl">
                  {c.description}
                </p>
              )}
            </div>

            {money(c.priceCents, c.priceNote) && (
              <span className="text-sm shrink-0 text-muted-foreground">
                {money(c.priceCents, c.priceNote)}
              </span>
            )}
          </div>
        </button>
      ))}
    </div>
  );
}

// ─── Detail ────────────────────────────────────────────────────────────────

function Room({ id, onBack }: { id: string; onBack: () => void }) {
  const { toast } = useToast();
  const [note, setNote] = useState("");

  const room = useQuery<CohortDetail>({
    queryKey: ["/api/cohorts", id],
    queryFn: () => get(`/api/cohorts/${id}`, "this room"),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/cohorts", id] });
    queryClient.invalidateQueries({ queryKey: ["/api/cohorts"], exact: true });
  };

  const apply = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/cohorts/${id}/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ note: note.trim() || undefined }),
      });
      if (!res.ok) throw new Error((await res.json()).message ?? "Failed to apply");
      return res.json();
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "Sent" });
    },
    onError: (e: Error) => toast({ title: "Couldn't apply", description: e.message, variant: "destructive" }),
  });

  const withdraw = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/cohorts/${id}/withdraw`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to withdraw");
      return res.json();
    },
    onSuccess: invalidate,
  });

  if (room.isLoading) return <Skeleton className="h-96 w-full" />;
  if (!room.data) return <p className="text-sm text-muted-foreground">Couldn't open this room.</p>;

  const c = room.data;
  const standing = c.myStatus;
  const canApply = c.status === "open" && (!standing || standing === "withdrawn") && c.seatsRemaining > 0;

  return (
    <div>
      <button
        onClick={onBack}
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6"
        data-testid="button-cohort-back"
      >
        <ArrowLeft className="h-4 w-4" />
        Masterminds
      </button>

      {c.coverUrl && (
        <img src={c.coverUrl} alt={c.name} className="w-full h-56 object-cover rounded-lg mb-8" />
      )}

      <h2 className="font-display text-3xl leading-tight" data-testid="text-cohort-name">{c.name}</h2>

      <div className="flex items-center gap-4 flex-wrap text-xs text-muted-foreground mt-3">
        {dateRange(c.startDate, c.endDate) && <span>{dateRange(c.startDate, c.endDate)}</span>}
        {c.location && <span>{c.location}</span>}
        <span>{c.seatsRemaining} of {c.capacity} open</span>
        {money(c.priceCents, c.priceNote) && <span>{money(c.priceCents, c.priceNote)}</span>}
      </div>

      {c.description && <p className="text-[15px] leading-relaxed mt-8">{c.description}</p>}

      {/* Standing */}
      <div className="border-t border-border/50 mt-10 pt-8">
        {standing && standing !== "withdrawn" ? (
          <div className="space-y-4">
            <p className="text-xs uppercase tracking-widest text-[hsl(var(--gold))]">
              {STANDING[standing]}
            </p>
            {standing === "applied" && (
              <p className="text-sm text-muted-foreground">
                We'll come back to you.
              </p>
            )}
            {standing === "invited" && (
              <p className="text-sm text-muted-foreground">
                Your seat is held. Your coach will confirm the details.
              </p>
            )}
            {(standing === "applied" || standing === "invited" || standing === "confirmed") && (
              <Button
                variant="ghost"
                onClick={() => withdraw.mutate()}
                disabled={withdraw.isPending}
                className="text-muted-foreground"
                data-testid="button-cohort-withdraw"
              >
                Withdraw
              </Button>
            )}
          </div>
        ) : canApply ? (
          <div className="space-y-4 max-w-xl">
            <p className="text-xs uppercase tracking-widest text-[hsl(var(--gold))]">
              Ask for a seat
            </p>
            <Textarea
              rows={4}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="What you're working on, and why this room."
              data-testid="input-cohort-note"
            />
            <Button
              onClick={() => apply.mutate()}
              disabled={apply.isPending}
              data-testid="button-cohort-apply"
            >
              Apply
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            {c.seatsRemaining === 0 ? "This room is full." : "This room isn't taking applications."}
          </p>
        )}
      </div>

      {/* The schedule belongs to the room. */}
      {c.sessions.length > 0 && (
        <div className="border-t border-border/50 mt-10 pt-8">
          <p className="text-xs uppercase tracking-widest text-[hsl(var(--gold))] mb-5">
            The schedule
          </p>
          {c.sessions.map((s) => (
            <div key={s.id} className="py-4 border-b border-border/40 last:border-0">
              <div className="flex items-baseline justify-between gap-4 flex-wrap">
                <span className="text-sm">{s.title}</span>
                {s.startsAt && (
                  <span className="text-xs text-muted-foreground">
                    {new Date(s.startsAt).toLocaleString("en-US", {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </span>
                )}
              </div>
              {s.agenda && <p className="text-xs text-muted-foreground mt-1.5">{s.agenda}</p>}
              {s.location && <p className="text-xs text-muted-foreground mt-1">{s.location}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Tab ───────────────────────────────────────────────────────────────────

export function MastermindsTab() {
  const [open, setOpen] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      {!open && (
        <h2 className="font-display text-2xl" data-testid="text-masterminds-heading">
          Masterminds
        </h2>
      )}
      <AnimatePresence mode="wait">
        <motion.div
          key={open ?? "list"}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.18 }}
        >
          {open ? <Room id={open} onBack={() => setOpen(null)} /> : <Rooms onOpen={setOpen} />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
