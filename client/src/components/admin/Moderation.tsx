/**
 * Admin — the moderation queue.
 *
 * What members have objected to, and the two things that can be done about it.
 *
 * ── The excerpt is a copy, and that is the point ──────────────────────────
 *
 * Reports carry their own copy of the text and the author, taken at the moment
 * the report was made. Deleting the message is frequently the resolution, and
 * a queue that then shows an empty row is a queue nobody can review — you
 * would be deciding blind about something already gone.
 *
 * ── Nothing is hidden automatically ───────────────────────────────────────
 *
 * No auto-removal on a threshold. In a community of a few dozen paying members
 * a handful of coordinated reports could silence anyone, and the moderator is
 * one person who can read the thing in about a minute. A report is a request
 * to look, not a verdict.
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { SectionHeading, Panel } from "@/components/portal/Panel";
import { InfoTip } from "@/components/ui/info-tip";
import { ShieldCheck, Flag, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { REPORT_REASON_LABELS, type ReportReason } from "@shared/models/moderation";

interface Report {
  id: string;
  messageId: string;
  reason: string;
  detail: string | null;
  excerpt: string | null;
  status: string;
  createdAt: string | null;
  reviewNote: string | null;
  reporterId: string;
  authorId: string | null;
  stillLive: boolean;
}

const FILTERS = [
  { id: "open", label: "Open" },
  { id: "actioned", label: "Actioned" },
  { id: "dismissed", label: "Dismissed" },
  { id: "all", label: "Everything" },
];

export function ModerationAdmin() {
  const [status, setStatus] = useState("open");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const { toast } = useToast();
  const qc = useQueryClient();

  const reports = useQuery<Report[]>({
    queryKey: ["/api/admin/reports", status],
    queryFn: async () => {
      const r = await fetch(`/api/admin/reports?status=${status}`, { credentials: "include" });
      if (!r.ok) throw new Error("Couldn't load the queue");
      return r.json();
    },
  });

  const review = useMutation({
    mutationFn: async ({
      id,
      body,
    }: {
      id: string;
      body: { status: string; reviewNote: string | null; deleteMessage: boolean };
    }) => apiRequest("PATCH", `/api/admin/reports/${id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/reports"] });
      toast({ title: "Resolved" });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const list = reports.data ?? [];
  const openCount = list.filter((r) => r.status === "open").length;

  return (
    <div className="space-y-6">
      <SectionHeading
        title="Reports"
        subtitle="What members have flagged, and what was done about it."
      />

      <div className="flex gap-1 flex-wrap">
        {FILTERS.map((f) => (
          <Button
            key={f.id}
            size="sm"
            variant={status === f.id ? "default" : "outline"}
            onClick={() => setStatus(f.id)}
            data-testid={`filter-reports-${f.id}`}
          >
            {f.label}
            {f.id === "open" && openCount > 0 && (
              <Badge variant="secondary" className="ml-2 text-[10px]">{openCount}</Badge>
            )}
          </Button>
        ))}
      </div>

      {reports.isLoading ? (
        <div className="space-y-2">{[1, 2].map((i) => <Skeleton key={i} className="h-28 w-full" />)}</div>
      ) : list.length === 0 ? (
        <Panel>
          <div className="py-10 text-center space-y-2">
            <ShieldCheck className="h-6 w-6 mx-auto text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">
              {status === "open" ? "Nothing waiting." : "Nothing here."}
            </p>
          </div>
        </Panel>
      ) : (
        <div className="space-y-3">
          {list.map((r) => (
            <Panel key={r.id} data-testid={`report-${r.id}`}>
              <div className="space-y-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <Flag className="h-3.5 w-3.5 text-gold" />
                  <span className="text-sm">
                    {REPORT_REASON_LABELS[r.reason as ReportReason] ?? r.reason}
                  </span>
                  <Badge
                    variant={r.status === "open" ? "default" : "outline"}
                    className="text-[10px]"
                  >
                    {r.status}
                  </Badge>
                  {!r.stillLive && (
                    <Badge variant="secondary" className="text-[10px]">
                      message already gone
                    </Badge>
                  )}
                  <span className="text-[11px] text-muted-foreground ml-auto">
                    {r.createdAt ? new Date(r.createdAt).toLocaleString() : ""}
                  </span>
                </div>

                {/* The reported text, as it was when reported. Plain text —
                    this is member input and never rendered as markup. */}
                <blockquote className="text-sm border-l-2 border-border/60 pl-3 py-1 text-muted-foreground whitespace-pre-wrap">
                  {r.excerpt || <span className="italic">No text captured.</span>}
                </blockquote>

                {r.detail && (
                  <p className="text-xs text-muted-foreground">
                    <span className="text-foreground">They added:</span> {r.detail}
                  </p>
                )}

                {r.status === "open" ? (
                  <div className="space-y-2">
                    <Input
                      value={notes[r.id] ?? ""}
                      onChange={(e) => setNotes({ ...notes, [r.id]: e.target.value })}
                      placeholder="Note for the record (optional)"
                      className="h-9 text-base md:text-sm"
                    />
                    <div className="flex gap-2 flex-wrap">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          review.mutate({
                            id: r.id,
                            body: { status: "dismissed", reviewNote: notes[r.id] || null, deleteMessage: false },
                          })
                        }
                        data-testid={`button-dismiss-${r.id}`}
                      >
                        Nothing wrong with it
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          review.mutate({
                            id: r.id,
                            body: { status: "actioned", reviewNote: notes[r.id] || null, deleteMessage: false },
                          })
                        }
                      >
                        Handled elsewhere
                      </Button>
                      <Button
                        size="sm"
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        disabled={!r.stillLive}
                        onClick={() =>
                          review.mutate({
                            id: r.id,
                            body: { status: "actioned", reviewNote: notes[r.id] || null, deleteMessage: true },
                          })
                        }
                        data-testid={`button-remove-${r.id}`}
                      >
                        <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                        Remove the message
                      </Button>
                      <InfoTip label="About removing" title="It's a soft delete">
                        The message becomes "This message was deleted" and its replies
                        keep their place in the thread. Every other open report about
                        the same message is resolved at the same time, so you don't
                        review one complaint five times.
                      </InfoTip>
                    </div>
                  </div>
                ) : (
                  r.reviewNote && (
                    <p className="text-xs text-muted-foreground border-t border-border/40 pt-2">
                      {r.reviewNote}
                    </p>
                  )
                )}
              </div>
            </Panel>
          ))}
        </div>
      )}
    </div>
  );
}
