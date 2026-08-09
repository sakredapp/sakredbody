import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Mail, Loader2, Inbox } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { APPLICATION_STATUSES } from "@shared/schema";

/**
 * The intake inbox.
 *
 * The form behind this is ApplicationModal on the Mastermind page. It has
 * been writing rows since the site launched and nothing has ever read one —
 * no route, no screen. Everything here is new: the rows were always there.
 *
 * Shaped like ExecutiveApplications on purpose. They are the same job done
 * from two different forms, and someone triaging both in one sitting should
 * not have to learn two layouts.
 */

interface Application {
  id: number;
  name: string;
  email: string;
  goals: string;
  stressLevel: string;
  willingness: string;
  constraints: string;
  whyNow: string;
  status: string;
  notes: string | null;
  reviewedAt: string | null;
  createdAt: string | null;
}

/** The five answers, in the order the form asks for them. */
const ANSWERS: { key: keyof Application; label: string }[] = [
  { key: "goals", label: "What they want" },
  { key: "whyNow", label: "Why now" },
  { key: "stressLevel", label: "Stress" },
  { key: "willingness", label: "Willingness" },
  { key: "constraints", label: "Constraints" },
];

const STATUS_STYLES: Record<string, string> = {
  new: "border-gold/50 text-gold",
  contacted: "border-blue-600/40 text-blue-700 dark:text-blue-400",
  "call booked": "border-green-600/40 text-green-700 dark:text-green-400",
  accepted: "border-green-600/40 text-green-700 dark:text-green-400",
  declined: "border-destructive/40 text-destructive",
  archived: "border-border text-muted-foreground",
};

/** How long they've been waiting — the number that should make you act. */
function waitingDays(iso: string | null): number | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  return Math.floor((Date.now() - then) / 86_400_000);
}

export function ApplicationsAdmin({ enabled }: { enabled: boolean }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [noteDrafts, setNoteDrafts] = useState<Record<number, string>>({});

  const query = useQuery<Application[]>({
    queryKey: ["/api/admin/applications"],
    enabled,
  });

  const updateMut = useMutation({
    mutationFn: async ({ id, ...data }: { id: number; status?: string; notes?: string }) => {
      const res = await apiRequest("PATCH", `/api/admin/applications/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/applications"] });
      toast({ title: "Saved" });
    },
    onError: () => toast({ title: "Couldn't save", variant: "destructive" }),
  });

  const apps = query.data ?? [];

  const filtered = useMemo(
    () => apps.filter((a) => statusFilter === "all" || a.status === statusFilter),
    [apps, statusFilter],
  );

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const a of apps) c[a.status] = (c[a.status] ?? 0) + 1;
    return c;
  }, [apps]);

  if (query.isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="text-center py-16">
        <p className="text-muted-foreground mb-2">Couldn't load applications.</p>
        <p className="text-xs text-muted-foreground">
          The triage columns may not be there yet — run <code>supabase/applications-triage.sql</code>.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="admin-applications">
      {/* Counts double as filters. Two columns on a phone, six on a desk. */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {APPLICATION_STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(statusFilter === s ? "all" : s)}
            className={cn(
              "rounded-lg border p-4 text-left hover-elevate transition-colors",
              statusFilter === s ? "border-gold bg-gold/5" : "border-border",
            )}
            data-testid={`filter-status-${s.replace(/\s/g, "-")}`}
          >
            <div className="text-2xl font-display">{counts[s] ?? 0}</div>
            <div className="text-xs text-muted-foreground mt-1 capitalize">{s}</div>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm text-muted-foreground">
          {filtered.length} of {apps.length}
        </span>
        {statusFilter !== "all" && (
          <Button variant="outline" size="sm" onClick={() => setStatusFilter("all")}>
            Clear
          </Button>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16">
          <Inbox className="h-8 w-8 mx-auto text-muted-foreground/50 mb-3" />
          <p className="text-muted-foreground">
            {apps.length === 0 ? "No applications yet." : "None match that filter."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((a) => {
            const open = expanded === a.id;
            const days = waitingDays(a.createdAt);
            return (
              <div
                key={a.id}
                className="border border-border rounded-lg overflow-hidden"
                data-testid={`application-${a.id}`}
              >
                <button
                  onClick={() => setExpanded(open ? null : a.id)}
                  className="w-full flex items-center gap-3 sm:gap-4 p-4 text-left hover-elevate"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{a.name}</span>
                      <Badge
                        variant="outline"
                        className={cn("text-[10px] capitalize", STATUS_STYLES[a.status])}
                      >
                        {a.status}
                      </Badge>
                      {a.status === "new" && days !== null && days >= 3 && (
                        <Badge variant="outline" className="text-[10px] border-destructive/40 text-destructive">
                          waiting {days}d
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground truncate">{a.goals || a.email}</p>
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0 hidden sm:block">
                    {a.createdAt ? new Date(a.createdAt).toLocaleDateString() : ""}
                  </span>
                  <ChevronDown
                    className={cn("h-4 w-4 text-muted-foreground transition-transform shrink-0", open && "rotate-180")}
                  />
                </button>

                {open && (
                  <div className="border-t border-border p-5 space-y-6 bg-card/40">
                    <a
                      href={`mailto:${a.email}`}
                      className="inline-flex items-center gap-2 text-sm text-gold hover:underline"
                    >
                      <Mail className="h-3.5 w-3.5" /> {a.email}
                    </a>

                    <div className="space-y-4">
                      {ANSWERS.map(({ key, label }) => {
                        const v = a[key];
                        if (!v) return null;
                        return (
                          <div key={key}>
                            <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">
                              {label}
                            </p>
                            <p className="text-sm whitespace-pre-wrap">{String(v)}</p>
                          </div>
                        );
                      })}
                    </div>

                    <div className="flex flex-col sm:flex-row gap-3 pt-2 border-t border-border">
                      <Select
                        value={a.status}
                        onValueChange={(status) => updateMut.mutate({ id: a.id, status })}
                      >
                        <SelectTrigger className="w-full sm:w-48" data-testid={`select-status-${a.id}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {APPLICATION_STATUSES.map((s) => (
                            <SelectItem key={s} value={s} className="capitalize">
                              {s}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <div className="flex-1 flex gap-2">
                        <Textarea
                          value={noteDrafts[a.id] ?? a.notes ?? ""}
                          onChange={(e) => setNoteDrafts((d) => ({ ...d, [a.id]: e.target.value }))}
                          placeholder="Internal notes…"
                          rows={2}
                          className="flex-1"
                          data-testid={`notes-${a.id}`}
                        />
                        <Button
                          variant="outline"
                          onClick={() => updateMut.mutate({ id: a.id, notes: noteDrafts[a.id] ?? "" })}
                          disabled={updateMut.isPending || noteDrafts[a.id] === undefined}
                        >
                          Save
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
