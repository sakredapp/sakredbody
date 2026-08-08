import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Mail, Phone, MapPin, Loader2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { EXEC_QUESTIONS, ROUTE_LABELS, type ExecRoute } from "@shared/models/executiveQuestions";

interface ExecApplication {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  location: string | null;
  occupation: string | null;
  role: string | null;
  answers: Record<string, string | string[] | number>;
  fitScore: number;
  route: string;
  status: string;
  notes: string | null;
  createdAt: string | null;
}

const STATUSES = ["new", "contacted", "call booked", "client", "archived"] as const;

const ROUTE_STYLES: Record<string, string> = {
  book: "border-green-600/40 text-green-700 dark:text-green-400",
  teams: "border-blue-600/40 text-blue-700 dark:text-blue-400",
  retreat: "border-amber-600/40 text-amber-700 dark:text-amber-500",
  nurture: "border-border text-muted-foreground",
  declined: "border-destructive/40 text-destructive",
};

function scoreColor(score: number) {
  if (score >= 75) return "hsl(138 30% 40%)";
  if (score >= 50) return "hsl(39 48% 46%)";
  return "hsl(20 58% 52%)";
}

export function ExecutiveApplications({ enabled }: { enabled: boolean }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState<number | null>(null);
  const [routeFilter, setRouteFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [noteDrafts, setNoteDrafts] = useState<Record<number, string>>({});

  const query = useQuery<ExecApplication[]>({
    queryKey: ["/api/executive-applications"],
    enabled,
  });

  const updateMut = useMutation({
    mutationFn: async ({ id, ...data }: { id: number; status?: string; notes?: string }) => {
      const res = await apiRequest("PATCH", `/api/executive-applications/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/executive-applications"] });
      toast({ title: "Saved" });
    },
    onError: () => toast({ title: "Couldn't save", variant: "destructive" }),
  });

  const apps = query.data ?? [];

  const filtered = useMemo(
    () =>
      apps.filter(
        (a) =>
          (routeFilter === "all" || a.route === routeFilter) &&
          (statusFilter === "all" || a.status === statusFilter),
      ),
    [apps, routeFilter, statusFilter],
  );

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const a of apps) c[a.route] = (c[a.route] ?? 0) + 1;
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
          If this is the first time, the <code>executive_applications</code> table may not exist yet — run
          supabase/executive-applications.sql.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="admin-executive">
      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {(Object.keys(ROUTE_LABELS) as ExecRoute[]).map((r) => (
          <button
            key={r}
            onClick={() => setRouteFilter(routeFilter === r ? "all" : r)}
            className={cn(
              "rounded-lg border p-4 text-left hover-elevate transition-colors",
              routeFilter === r ? "border-gold bg-gold/5" : "border-border",
            )}
            data-testid={`filter-route-${r}`}
          >
            <div className="text-2xl font-display">{counts[r] ?? 0}</div>
            <div className="text-xs text-muted-foreground mt-1">{ROUTE_LABELS[r]}</div>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-44" data-testid="select-status-filter">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground">
          {filtered.length} of {apps.length}
        </span>
        {(routeFilter !== "all" || statusFilter !== "all") && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setRouteFilter("all");
              setStatusFilter("all");
            }}
          >
            Clear
          </Button>
        )}
      </div>

      {filtered.length === 0 ? (
        <p className="text-center text-muted-foreground py-16">No applications match.</p>
      ) : (
        <div className="space-y-3">
          {filtered.map((a) => {
            const open = expanded === a.id;
            return (
              <div key={a.id} className="border border-border rounded-lg overflow-hidden" data-testid={`app-${a.id}`}>
                <button
                  onClick={() => setExpanded(open ? null : a.id)}
                  className="w-full flex items-center gap-4 p-4 text-left hover-elevate"
                >
                  <div
                    className="h-11 w-11 rounded-full flex items-center justify-center text-sm font-medium text-white shrink-0"
                    style={{ backgroundColor: scoreColor(a.fitScore) }}
                    title={`Fit score ${a.fitScore}`}
                  >
                    {a.fitScore}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">
                        {a.firstName} {a.lastName}
                      </span>
                      <Badge variant="outline" className={cn("text-[10px]", ROUTE_STYLES[a.route])}>
                        {ROUTE_LABELS[a.route as ExecRoute] ?? a.route}
                      </Badge>
                      {a.status !== "new" && (
                        <Badge variant="outline" className="text-[10px] text-muted-foreground">
                          {a.status}
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground truncate">
                      {[a.role, a.occupation].filter(Boolean).join(" · ") || a.email}
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0 hidden sm:block">
                    {a.createdAt ? new Date(a.createdAt).toLocaleDateString() : ""}
                  </span>
                  <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", open && "rotate-180")} />
                </button>

                {open && (
                  <div className="border-t border-border p-5 space-y-6 bg-card/40">
                    {/* Contact */}
                    <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
                      <a href={`mailto:${a.email}`} className="flex items-center gap-2 text-gold hover:underline">
                        <Mail className="h-3.5 w-3.5" /> {a.email}
                      </a>
                      <a href={`tel:${a.phone}`} className="flex items-center gap-2 text-gold hover:underline">
                        <Phone className="h-3.5 w-3.5" /> {a.phone}
                      </a>
                      {a.location && (
                        <span className="flex items-center gap-2 text-muted-foreground">
                          <MapPin className="h-3.5 w-3.5" /> {a.location}
                        </span>
                      )}
                    </div>

                    {/* Answers, in the order they were asked */}
                    <div className="space-y-4">
                      {EXEC_QUESTIONS.filter(
                        (q) => !["firstName", "lastName", "email", "phone", "location"].includes(q.id),
                      ).map((q) => {
                        const v = a.answers?.[q.id];
                        if (v === undefined || v === "" || (Array.isArray(v) && !v.length)) return null;
                        return (
                          <div key={q.id}>
                            <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">{q.label}</p>
                            <p className="text-sm whitespace-pre-wrap">
                              {Array.isArray(v) ? v.join(", ") : String(v)}
                            </p>
                          </div>
                        );
                      })}
                    </div>

                    {/* Status + notes */}
                    <div className="flex flex-col sm:flex-row gap-3 pt-2 border-t border-border">
                      <Select
                        value={a.status}
                        onValueChange={(status) => updateMut.mutate({ id: a.id, status })}
                      >
                        <SelectTrigger className="w-full sm:w-48" data-testid={`select-status-${a.id}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {STATUSES.map((s) => (
                            <SelectItem key={s} value={s}>
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
                          data-testid={`save-notes-${a.id}`}
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
