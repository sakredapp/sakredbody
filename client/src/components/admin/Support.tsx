import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Mail, Loader2, LifeBuoy } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { SUPPORT_CATEGORIES } from "@shared/models/support";

/**
 * The support inbox.
 *
 * `GET /api/admin/support` and its PATCH have existed since the support form
 * shipped — both stores require a support URL a reviewer can open without an
 * account, so the form went up early. Nothing ever called the admin end of
 * it. Every request sat unread in a table.
 *
 * The status filter defaults to open, because an inbox that opens on
 * everything ever received is a list, not an inbox.
 */

interface SupportRequest {
  id: string;
  userId: string | null;
  name: string;
  email: string;
  category: string;
  subject: string;
  message: string;
  status: string;
  createdAt: string | null;
  updatedAt: string | null;
}

const STATUSES = ["open", "answered", "closed"] as const;

const STATUS_STYLES: Record<string, string> = {
  open: "border-gold/50 text-gold",
  answered: "border-blue-600/40 text-blue-700 dark:text-blue-400",
  closed: "border-border text-muted-foreground",
};

function waitingDays(iso: string | null): number | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  return Math.floor((Date.now() - then) / 86_400_000);
}

export function SupportAdmin({ enabled }: { enabled: boolean }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("open");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  const query = useQuery<SupportRequest[]>({
    queryKey: ["/api/admin/support"],
    enabled,
  });

  const updateMut = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const res = await apiRequest("PATCH", `/api/admin/support/${id}`, { status });
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/support"] });
      toast({ title: "Saved" });
    },
    onError: () => toast({ title: "Couldn't save", variant: "destructive" }),
  });

  const requests = query.data ?? [];

  const filtered = useMemo(
    () =>
      requests.filter(
        (r) =>
          (statusFilter === "all" || r.status === statusFilter) &&
          (categoryFilter === "all" || r.category === categoryFilter),
      ),
    [requests, statusFilter, categoryFilter],
  );

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of requests) c[r.status] = (c[r.status] ?? 0) + 1;
    return c;
  }, [requests]);

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
        <p className="text-muted-foreground mb-2">Couldn't load support requests.</p>
        <p className="text-xs text-muted-foreground">
          If this is the first time, the <code>support_requests</code> table may not exist yet.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="admin-support">
      <div className="grid grid-cols-3 gap-3">
        {STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(statusFilter === s ? "all" : s)}
            className={cn(
              "rounded-lg border p-4 text-left hover-elevate transition-colors",
              statusFilter === s ? "border-gold bg-gold/5" : "border-border",
            )}
            data-testid={`filter-support-${s}`}
          >
            <div className="text-2xl font-display">{counts[s] ?? 0}</div>
            <div className="text-xs text-muted-foreground mt-1 capitalize">{s}</div>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-full sm:w-48" data-testid="select-category-filter">
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {SUPPORT_CATEGORIES.map((c) => (
              <SelectItem key={c} value={c} className="capitalize">
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground">
          {filtered.length} of {requests.length}
        </span>
        {(statusFilter !== "open" || categoryFilter !== "all") && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setStatusFilter("open");
              setCategoryFilter("all");
            }}
          >
            Reset
          </Button>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16">
          <LifeBuoy className="h-8 w-8 mx-auto text-muted-foreground/50 mb-3" />
          <p className="text-muted-foreground">
            {requests.length === 0 ? "Nothing has come in yet." : "Nothing matches that filter."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((r) => {
            const open = expanded === r.id;
            const days = waitingDays(r.createdAt);
            return (
              <div
                key={r.id}
                className="border border-border rounded-lg overflow-hidden"
                data-testid={`support-${r.id}`}
              >
                <button
                  onClick={() => setExpanded(open ? null : r.id)}
                  className="w-full flex items-center gap-3 sm:gap-4 p-4 text-left hover-elevate"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium truncate">{r.subject}</span>
                      <Badge variant="outline" className="text-[10px] capitalize">
                        {r.category}
                      </Badge>
                      <Badge
                        variant="outline"
                        className={cn("text-[10px] capitalize", STATUS_STYLES[r.status])}
                      >
                        {r.status}
                      </Badge>
                      {r.status === "open" && days !== null && days >= 2 && (
                        <Badge variant="outline" className="text-[10px] border-destructive/40 text-destructive">
                          waiting {days}d
                        </Badge>
                      )}
                      {/* Signed-out submissions are the ones that can't be
                          answered in-app, so they're worth flagging. */}
                      {!r.userId && (
                        <Badge variant="outline" className="text-[10px] text-muted-foreground">
                          signed out
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground truncate">
                      {r.name} · {r.email}
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0 hidden sm:block">
                    {r.createdAt ? new Date(r.createdAt).toLocaleDateString() : ""}
                  </span>
                  <ChevronDown
                    className={cn("h-4 w-4 text-muted-foreground transition-transform shrink-0", open && "rotate-180")}
                  />
                </button>

                {open && (
                  <div className="border-t border-border p-5 space-y-5 bg-card/40">
                    <p className="text-sm whitespace-pre-wrap leading-relaxed">{r.message}</p>

                    <div className="flex flex-col sm:flex-row gap-3 pt-2 border-t border-border">
                      <Button asChild variant="outline" className="sm:w-auto">
                        <a href={`mailto:${r.email}?subject=Re: ${encodeURIComponent(r.subject)}`}>
                          <Mail className="h-3.5 w-3.5 mr-2" /> Reply by email
                        </a>
                      </Button>
                      <Select
                        value={r.status}
                        onValueChange={(status) => updateMut.mutate({ id: r.id, status })}
                      >
                        <SelectTrigger className="w-full sm:w-48" data-testid={`select-support-status-${r.id}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {STATUSES.map((s) => (
                            <SelectItem key={s} value={s} className="capitalize">
                              {s}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
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
