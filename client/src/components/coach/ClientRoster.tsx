/**
 * My clients.
 *
 * ── What this is for, and what it deliberately is not ─────────────────────
 *
 * It answers one question: who might need me today. Not "how is everybody
 * doing right now", which is a monitoring station, and not a leaderboard.
 *
 * So each card carries the terrain headline, whether a plan is running, and
 * when they last spoke — and stops. Sleep and heart rate are one tap away on
 * the client's own page, where there is room to say which night the number came
 * from. On a card they would be four numbers with no dates attached, which is
 * how a coach ends up confidently wrong about somebody.
 */

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { useMyClients, type ClientCard } from "@/hooks/use-coach";
import { cn } from "@/lib/utils";

type Filter = "all" | "plan" | "no-plan";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "plan", label: "On a plan" },
  { id: "no-plan", label: "No plan" },
];

function initials(name: string): string {
  return name
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

/** "2d ago" reads better than a date for something this recent. */
function sinceLabel(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  const days = Math.floor((Date.now() - then) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

const LEAN_TONE: Record<string, string> = {
  restore: "text-[hsl(var(--element-water))]",
  build: "text-[hsl(var(--gold))]",
  either: "text-muted-foreground",
  unknown: "text-muted-foreground/60",
};

function ClientRow({ client, onOpen }: { client: ClientCard; onOpen: () => void }) {
  const last = sinceLabel(client.lastMessage?.at);

  return (
    <button
      onClick={onOpen}
      data-testid={`client-${client.id}`}
      className="w-full text-left rounded-xl border border-[hsl(var(--gold))]/12 bg-card/40 p-4 hover:border-[hsl(var(--gold))]/30 transition-colors tap-clean"
    >
      <div className="flex items-start gap-3">
        <Avatar className="h-10 w-10 shrink-0">
          {client.profileImageUrl && <AvatarImage src={client.profileImageUrl} alt="" />}
          <AvatarFallback className="text-xs">{initials(client.name)}</AvatarFallback>
        </Avatar>

        <div className="min-w-0 flex-1">
          <p className="text-sm truncate">{client.name}</p>

          {/*
            The reading, not a number. "Recovery reduced" is something a coach
            can open a conversation with; "HRV 41" is something they have to
            interpret before they can.
          */}
          {client.terrain ? (
            <p
              className={cn(
                "text-xs mt-0.5 truncate",
                LEAN_TONE[client.terrain.lean ?? "unknown"],
              )}
            >
              {client.terrain.headline}
            </p>
          ) : (
            <p className="text-xs mt-0.5 text-muted-foreground/60">No connected health data</p>
          )}

          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1.5">
            {client.plan?.name && (
              <span className="text-[11px] text-muted-foreground">
                {client.plan.name} · Day {client.plan.currentDay} of {client.plan.totalDays}
              </span>
            )}
            {last && (
              <span className="text-[11px] text-muted-foreground/70">
                {client.lastMessage?.from === "coach" ? "You wrote" : "They wrote"} {last}
              </span>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}

export function ClientRoster({
  onOpen,
}: {
  onOpen: (memberId: string, name: string) => void;
}) {
  const { data, isLoading, error } = useMyClients();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const clients = data?.clients ?? [];

  /**
   * Searching and filtering happen here because the list is already only this
   * coach's clients — the server scoped it by session, with no parameter to
   * pass. This narrows a list the coach is entitled to see in full; it is not
   * hiding anything, which is the version of this that would be a security bug.
   */
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return clients.filter((c) => {
      if (q && !c.name.toLowerCase().includes(q)) return false;
      if (filter === "plan" && !c.plan) return false;
      if (filter === "no-plan" && c.plan) return false;
      return true;
    });
  }, [clients, query, filter]);

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-24 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (error) {
    return <p className="text-sm text-muted-foreground">Could not load your clients.</p>;
  }

  if (clients.length === 0) {
    return (
      <div className="rounded-xl border border-[hsl(var(--gold))]/12 bg-card/40 p-6">
        <p className="text-sm">No clients assigned yet.</p>
        {/*
          Said rather than left blank, because the reason is not something the
          coach can fix and knowing that saves them looking for a button.
        */}
        <p className="text-xs text-muted-foreground mt-1.5">
          An admin assigns members to you. They'll appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search your clients"
            className="pl-9 h-9 text-sm"
            data-testid="client-search"
          />
        </div>
        <div className="flex items-center gap-1">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              data-testid={`client-filter-${f.id}`}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs transition-colors tap-clean",
                filter === f.id
                  ? "bg-[hsl(var(--gold))]/12 text-[hsl(var(--gold))]"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {shown.length === 0 ? (
        <p className="text-sm text-muted-foreground py-6 text-center">
          No clients match that.
        </p>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {shown.map((c) => (
            <ClientRow key={c.id} client={c} onOpen={() => onOpen(c.id, c.name)} />
          ))}
        </div>
      )}
    </div>
  );
}
