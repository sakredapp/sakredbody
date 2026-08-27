/**
 * Admin — what people actually do.
 *
 * Three questions, in the order they matter:
 *
 *   1. Is anyone clicking the buy links? That is the revenue.
 *   2. Is the daily loop being used? That is the retention.
 *   3. What broke, quietly? That is the thing nobody would otherwise learn.
 *
 * Deliberately not a charting library. Counts and a bar you can read at a
 * glance answer all three, and a dependency that draws axes would be more
 * code than the questions are worth at this size.
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { InfoTip } from "@/components/ui/info-tip";
import { ExternalLink, Activity, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

interface SummaryRow {
  name: string;
  n: number;
  members: number;
  last_at: string | null;
}

interface FunnelRow {
  surface: string | null;
  views: number;
  clicks: number;
  members: number;
}

const WINDOWS = [7, 30, 90];

/** Groups by the `domain` half of `domain.action`. */
function domainOf(name: string): string {
  return name.split(".")[0] ?? name;
}

const DOMAIN_LABELS: Record<string, string> = {
  habit: "The daily loop",
  intention: "The daily loop",
  daily_note: "The daily loop",
  routine: "Protocols",
  offering: "What's on",
  session: "What's on",
  product: "Commerce",
  shopping_list: "Commerce",
  ebook: "Library",
  community: "Community",
  win: "Wins",
  error: "Failures",
};

function Bar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.max(2, (value / max) * 100) : 0;
  return (
    <div className="h-1 w-full bg-muted rounded-full overflow-hidden">
      <div className="h-full bg-[hsl(var(--gold))] rounded-full" style={{ width: `${pct}%` }} />
    </div>
  );
}

export function TelemetryAdmin() {
  const [days, setDays] = useState(30);

  const summary = useQuery<SummaryRow[]>({
    queryKey: ["/api/admin/events/summary", days],
    queryFn: async () => {
      const res = await fetch(`/api/admin/events/summary?days=${days}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Couldn't load the summary");
      return res.json();
    },
  });

  const funnel = useQuery<FunnelRow[]>({
    queryKey: ["/api/admin/events/funnel", days],
    queryFn: async () => {
      const res = await fetch(`/api/admin/events/funnel?days=${days}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Couldn't load the funnel");
      return res.json();
    },
  });

  const rows = summary.data ?? [];
  const max = Math.max(1, ...rows.map((r) => r.n));

  // Group by domain, keeping each group's rows sorted by volume.
  const groups = new Map<string, SummaryRow[]>();
  for (const r of rows) {
    const key = DOMAIN_LABELS[domainOf(r.name)] ?? domainOf(r.name);
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }

  const clicks = (funnel.data ?? []).reduce((sum, f) => sum + f.clicks, 0);
  const errors = rows.filter((r) => r.name.startsWith("error.")).reduce((s, r) => s + r.n, 0);

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-1">
          <h2 className="font-display text-2xl">What people do</h2>
          <p className="text-sm text-muted-foreground">
            Recorded in this database. No third party sees any of it.
          </p>
        </div>

        <div className="flex gap-1">
          {WINDOWS.map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={cn(
                "px-3 py-1.5 text-sm rounded-md transition-colors",
                days === d
                  ? "bg-[hsl(var(--gold))]/15 text-gold font-medium"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
              )}
              data-testid={`telemetry-window-${d}`}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      {/* ── The money ─────────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <ExternalLink className="h-4 w-4 text-gold" />
          <h3 className="text-sm font-medium">Buy clicks</h3>
          <InfoTip label="About buy clicks" title="Split by surface">
            The same click from a product page and from a protocol's supply list
            are different facts about what's working, so they're counted apart
            rather than added up.
          </InfoTip>
        </div>

        {funnel.isLoading ? (
          <Skeleton className="h-20 w-full" />
        ) : clicks === 0 ? (
          <p className="text-sm text-muted-foreground">
            None yet. Nothing is wrong — there's nothing in the Apothecary to
            click, so there's nothing to measure.
          </p>
        ) : (
          <div className="space-y-2">
            {(funnel.data ?? []).map((f) => (
              <div
                key={f.surface ?? "unknown"}
                className="flex items-center justify-between gap-4 border border-border/50 rounded-md px-3 py-2"
              >
                <span className="text-sm">{f.surface ?? "unattributed"}</span>
                <span className="text-xs text-muted-foreground">
                  {f.clicks} {f.clicks === 1 ? "click" : "clicks"}
                  {f.views > 0 && ` · ${f.views} views`}
                  {f.views > 0 && ` · ${Math.round((f.clicks / f.views) * 100)}%`}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Failures ──────────────────────────────────────────────────────── */}
      {errors > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            <h3 className="text-sm font-medium">Failures</h3>
          </div>
          <p className="text-sm text-muted-foreground">
            {errors} recorded in this window. These would previously have been
            swallowed silently.
          </p>
        </section>
      )}

      {/* ── Everything ────────────────────────────────────────────────────── */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-medium">Everything else</h3>
        </div>

        {summary.isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing recorded in the last {days} days. If members are using the
            app, that's a bug — check that the events table is reachable.
          </p>
        ) : (
          <div className="space-y-6">
            {Array.from(groups.entries()).map(([domain, list]) => (
              <div key={domain} className="space-y-2">
                <p className="text-xs uppercase tracking-widest text-muted-foreground/70">
                  {domain}
                </p>
                {list.map((r) => (
                  <div key={r.name} className="space-y-1">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-mono text-xs">{r.name}</span>
                      <span className="text-xs text-muted-foreground shrink-0">
                        {r.n}
                        <span className="text-muted-foreground/60">
                          {" "}· {r.members} {r.members === 1 ? "member" : "members"}
                        </span>
                      </span>
                    </div>
                    <Bar value={r.n} max={max} />
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
