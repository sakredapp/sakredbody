/**
 * Report a message, or stop seeing the person who wrote it.
 *
 * Both stores require these before an app carrying member-to-member content
 * can be listed, and neither existed. But the reason to build them well is not
 * the store: somebody who is being made uncomfortable in a community they paid
 * to be part of needs the way out to be obvious and to take one tap.
 *
 * ── Both actions live in one sheet ────────────────────────────────────────
 *
 * Reporting and blocking answer the same question — "I don't want this" — and
 * a member in that moment should not have to work out which mechanism they
 * need. Reporting asks us to look; blocking is theirs alone and takes effect
 * immediately. They are offered together, described plainly, and either is
 * enough.
 *
 * ── What each one honestly does ───────────────────────────────────────────
 *
 * The copy says blocking is silent and says reporting does not remove
 * anything. Both are true, and a member who expects a post to vanish the
 * moment they report it — and then watches it stay — trusts the next thing
 * the app tells them rather less.
 */

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Flag, EyeOff, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { REPORT_REASONS, REPORT_REASON_LABELS, type ReportReason } from "@shared/models/moderation";

export function ReportDialog({
  messageId,
  authorId,
  authorName,
  open,
  onClose,
}: {
  messageId: string;
  authorId: string;
  authorName: string;
  open: boolean;
  onClose: () => void;
}) {
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [detail, setDetail] = useState("");
  const { toast } = useToast();
  const qc = useQueryClient();

  const report = useMutation({
    mutationFn: async () =>
      apiRequest("POST", `/api/community/messages/${messageId}/report`, { reason, detail: detail || null }),
    onSuccess: () => {
      toast({
        title: "Reported",
        description: "Someone will read it. Nothing has been removed yet.",
      });
      onClose();
      setReason(null);
      setDetail("");
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const block = useMutation({
    mutationFn: async () => apiRequest("POST", `/api/community/blocks/${authorId}`, {}),
    onSuccess: () => {
      // Every room, thread and search result is now filtered — refetching the
      // whole community is what makes them disappear without a reload.
      qc.invalidateQueries({ queryKey: ["/api/community"] });
      qc.invalidateQueries();
      toast({
        title: `You won't see ${authorName} any more`,
        description: "They haven't been told.",
      });
      onClose();
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-display text-xl font-normal">
            Report or block
          </DialogTitle>
          <DialogDescription className="text-sm">
            Either is enough. You don't have to explain yourself to anyone.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-widest text-muted-foreground">
              What's wrong with it
            </Label>
            <div className="grid grid-cols-2 gap-1.5">
              {REPORT_REASONS.map((r) => (
                <button
                  key={r}
                  onClick={() => setReason(r)}
                  className={cn(
                    "text-left text-xs rounded-md border px-2.5 py-2 transition-colors tap-clean",
                    reason === r
                      ? "border-[hsl(var(--gold))] bg-[hsl(var(--gold))]/10 text-foreground"
                      : "border-border/60 text-muted-foreground hover:text-foreground",
                  )}
                  data-testid={`report-reason-${r}`}
                >
                  {REPORT_REASON_LABELS[r]}
                </button>
              ))}
            </div>
          </div>

          {reason && (
            <div className="space-y-1.5">
              <Label className="text-xs">Anything else? (optional)</Label>
              <Textarea
                value={detail}
                onChange={(e) => setDetail(e.target.value)}
                rows={3}
                maxLength={1000}
                placeholder="Context helps whoever reads this."
              />
            </div>
          )}

          <Button
            onClick={() => report.mutate()}
            disabled={!reason || report.isPending}
            className="w-full bg-gold border-gold-border text-gold-foreground"
            data-testid="button-submit-report"
          >
            {report.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <Flag className="h-4 w-4 mr-1.5" />
                Report this
              </>
            )}
          </Button>

          <div className="pt-3 border-t border-border/60 space-y-2">
            <Button
              variant="outline"
              onClick={() => block.mutate()}
              disabled={block.isPending}
              className="w-full"
              data-testid="button-block-user"
            >
              <EyeOff className="h-4 w-4 mr-1.5" />
              Block {authorName}
            </Button>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              You'll stop seeing their posts and replies everywhere. They aren't
              told, and nothing changes for them. You can undo it in Settings.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
