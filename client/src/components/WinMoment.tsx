/**
 * The moment.
 *
 * Someone ticks the last box of a 28-day cleanse. Without this, a checkbox
 * goes grey and that is the entire acknowledgement — the win is recorded, and
 * they find out about it later by visiting a tab.
 *
 * So this interrupts, once, at the moment it happens.
 *
 * ── Deliberately a modal ──────────────────────────────────────────────────
 *
 * A toast would be the polite choice and the wrong one. A toast is for "saved"
 * — something you acknowledge by ignoring. Finishing a protocol is the thing
 * the whole product is for, and it should stop the screen. It is also the only
 * moment where "share this" has any chance of being said yes to, and a toast
 * cannot carry that.
 *
 * It fires only on newly-earned wins returned by the toggle that just
 * happened, so it can't ambush someone with something from last week.
 */

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ImageDown, Share2, Loader2 } from "lucide-react";
import { track } from "@/lib/track";
import { renderWinCard, shareOrDownloadWinCard } from "@/lib/winCard";
import { WIN_IMAGES, type Win, type WinKind } from "@shared/models/wins";

export function WinMoment({ wins, onClose }: { wins: Win[]; onClose: () => void }) {
  // One at a time. Two wins landing together — day 30 of a protocol that also
  // completes it — is a real case, and stacking two modals would be worse than
  // showing them in turn.
  const [index, setIndex] = useState(0);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => setIndex(0), [wins]);

  const win = wins[index];
  if (!win) return null;

  const advance = () => {
    if (index + 1 < wins.length) setIndex(index + 1);
    else onClose();
  };

  const share = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/wins/${win.id}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error((await res.json()).message ?? "That didn't go through");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/wins"] });
      toast({ title: "Posted to the room." });
      advance();
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const saveImage = async () => {
    setSaving(true);
    try {
      const blob = await renderWinCard({
        kind: win.kind as WinKind,
        props: (win.props ?? {}) as Record<string, unknown>,
        earnedAt: win.earnedAt ? String(win.earnedAt) : null,
      });
      const slug = win.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      const how = await shareOrDownloadWinCard(blob, `sakred-${slug || "win"}.png`);

      void fetch(`/api/wins/${win.id}/exported`, { method: "POST", credentials: "include" });
      track("win.export_image", { surface: "win_moment", subjectId: win.id });

      if (how === "downloaded") {
        toast({ title: "Saved", description: "The image is in your downloads." });
      }
    } catch (err) {
      toast({
        title: "Couldn't make the image",
        description: err instanceof Error ? err.message : undefined,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const image = WIN_IMAGES[win.kind as WinKind] ?? WIN_IMAGES.streak;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm p-0 overflow-hidden border-border/60">
        <div className="relative h-56">
          <img src={image} alt="" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-[hsl(var(--ink))] via-[hsl(var(--ink))]/40 to-transparent" />

          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="absolute bottom-0 left-0 right-0 p-5"
          >
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: 40 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="h-px bg-[hsl(var(--gold))] mb-3"
            />
            <h2 className="font-display text-2xl leading-tight text-white">{win.title}</h2>
            {win.subtitle && <p className="text-sm text-white/70 mt-1">{win.subtitle}</p>}
          </motion.div>
        </div>

        <div className="p-5 space-y-3">
          <div className="flex gap-2">
            <Button
              onClick={() => share.mutate()}
              disabled={share.isPending || !!win.sharedAt}
              className="flex-1 bg-gold border-gold-border text-white"
              data-testid="button-moment-share"
            >
              <Share2 className="h-4 w-4 mr-1.5" />
              {win.sharedAt ? "Shared" : "Tell the room"}
            </Button>

            <Button variant="outline" onClick={saveImage} disabled={saving} data-testid="button-moment-image">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageDown className="h-4 w-4" />}
            </Button>
          </div>

          <button
            onClick={advance}
            className="w-full text-xs text-muted-foreground hover:text-foreground py-2 tap-clean"
            data-testid="button-moment-dismiss"
          >
            {index + 1 < wins.length ? `Next (${wins.length - index - 1} more)` : "Close"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
