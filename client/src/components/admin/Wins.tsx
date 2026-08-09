/**
 * Admin — what members are finishing.
 *
 * Read-only, and that is the design rather than an omission. You do not
 * administer somebody's achievements: a win is a record of something they
 * actually did, so there is no edit and no delete here. The only honest
 * operations on it are looking and counting.
 *
 * ── Why it is worth having at all ─────────────────────────────────────────
 *
 * A member earning nothing for three weeks is the earliest visible sign that a
 * protocol isn't landing, and it shows up here well before it shows up as a
 * cancelled membership. That is the question this screen answers — not "who is
 * winning" but "who has gone quiet".
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { SectionHeading, Panel, StatTile } from "@/components/portal/Panel";
import { Award, Share2 } from "lucide-react";

interface AdminWin {
  id: string;
  kind: string;
  title: string;
  subtitle: string | null;
  earnedAt: string | null;
  sharedAt: string | null;
  userId: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
}

const KINDS = [
  { id: "all", label: "Everything" },
  { id: "streak", label: "Streaks" },
  { id: "routine_complete", label: "Protocols" },
  { id: "first_step", label: "First steps" },
];

export function WinsAdmin() {
  const [kind, setKind] = useState("all");

  const wins = useQuery<AdminWin[]>({
    queryKey: ["/api/admin/wins", kind],
    queryFn: async () => {
      const r = await fetch(`/api/admin/wins?kind=${kind}`, { credentials: "include" });
      if (!r.ok) throw new Error("Couldn't load wins");
      return r.json();
    },
  });

  const list = wins.data ?? [];
  const shared = list.filter((w) => w.sharedAt).length;
  // Distinct members, not rows: ten wins from one person is not ten people.
  const people = new Set(list.map((w) => w.userId)).size;

  const nameOf = (w: AdminWin) =>
    [w.firstName, w.lastName].filter(Boolean).join(" ").trim() || w.email || "—";

  return (
    <div className="space-y-6">
      <SectionHeading
        title="Wins"
        subtitle="What members are finishing, and who has gone quiet."
      />

      <div className="flex gap-1 flex-wrap">
        {KINDS.map((k) => (
          <Button
            key={k.id}
            size="sm"
            variant={kind === k.id ? "default" : "outline"}
            onClick={() => setKind(k.id)}
            data-testid={`filter-wins-${k.id}`}
          >
            {k.label}
          </Button>
        ))}
      </div>

      <Panel title="In the last 200">
        <div className="grid grid-cols-3 gap-3">
          <StatTile label="Earned" value={list.length} />
          <StatTile label="Members" value={people} />
          <StatTile
            label="Shared"
            value={shared}
            sub={list.length > 0 ? `${Math.round((shared / list.length) * 100)}%` : undefined}
          />
        </div>
      </Panel>

      {wins.isLoading ? (
        <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
      ) : list.length === 0 ? (
        <Panel>
          <div className="py-10 text-center space-y-2">
            <Award className="h-6 w-6 mx-auto text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground max-w-sm mx-auto">
              Nothing earned yet. Wins fire off the daily loop — they'll start
              appearing once a protocol is running and somebody is ticking it off.
            </p>
          </div>
        </Panel>
      ) : (
        <div className="space-y-2">
          {list.map((w) => (
            <div
              key={w.id}
              className="flex items-center gap-3 border border-border/60 rounded-lg px-3 py-2.5"
              data-testid={`admin-win-${w.id}`}
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm truncate">{w.title}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {nameOf(w)}
                  {w.subtitle ? ` · ${w.subtitle}` : ""}
                </p>
              </div>
              {w.sharedAt && (
                <Badge variant="secondary" className="text-[10px] gap-1 shrink-0">
                  <Share2 className="h-2.5 w-2.5" /> shared
                </Badge>
              )}
              <span className="text-[11px] text-muted-foreground shrink-0">
                {w.earnedAt ? new Date(w.earnedAt).toLocaleDateString() : ""}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
