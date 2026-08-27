/**
 * Wins.
 *
 * What you finished, and the two things worth doing with it: telling the room,
 * and taking the picture.
 *
 * Deliberately restrained. A wall of badges turns an achievement into a
 * currency, and this brand sells the opposite of that — so a win is a
 * photograph and one sentence, and there are only five kinds of them.
 */

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Award, Share2, ImageDown, Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { track } from "@/lib/track";
import { renderWinCard, shareOrDownloadWinCard } from "@/lib/winCard";
import { WIN_IMAGES, type Win, type WinKind } from "@shared/models/wins";
import { SectionHeading, Panel, StatTile } from "@/components/portal/Panel";

async function get<T>(url: string, label: string): Promise<T> {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error(`Failed to load ${label}`);
  return res.json();
}

export function useWins() {
  return useQuery<Win[]>({
    queryKey: ["/api/wins"],
    queryFn: () => get("/api/wins", "your wins"),
  });
}

// ─── One win ───────────────────────────────────────────────────────────────

function WinCard({ win, onShare }: { win: Win; onShare: (w: Win) => void }) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);

  const image = WIN_IMAGES[win.kind as WinKind] ?? WIN_IMAGES.streak;
  const earned = win.earnedAt ? new Date(String(win.earnedAt)) : null;

  const save = async () => {
    setSaving(true);
    try {
      const blob = await renderWinCard({
        kind: win.kind as WinKind,
        props: (win.props ?? {}) as Record<string, unknown>,
        earnedAt: win.earnedAt ? String(win.earnedAt) : null,
      });

      const slug = win.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      const how = await shareOrDownloadWinCard(blob, `sakred-${slug || "win"}.png`);

      // Recorded so the funnel can tell earning from actually showing anyone.
      void fetch(`/api/wins/${win.id}/exported`, { method: "POST", credentials: "include" });
      track("win.export_image", { surface: "wins", subjectId: win.id });

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

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-lg overflow-hidden border border-border/60"
      data-testid={`win-${win.id}`}
    >
      <div className="relative h-40">
        <img src={image} alt="" className="w-full h-full object-cover" />
        {/* Same treatment as the exported card, so what's on screen is what
            gets shared rather than a surprise. */}
        <div className="absolute inset-0 bg-gradient-to-t from-[hsl(var(--ink))] via-[hsl(var(--ink))]/50 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 p-4">
          <div className="h-px w-10 bg-[hsl(var(--gold))] mb-2.5" />
          <h3 className="font-display text-xl leading-tight text-[hsl(var(--ink-foreground))]">{win.title}</h3>
          {win.subtitle && (
            <p className="text-xs text-[hsl(var(--ink-foreground)/0.7)] mt-1">{win.subtitle}</p>
          )}
        </div>
      </div>

      <div className="p-3 flex items-center justify-between gap-2 flex-wrap">
        <span className="text-[11px] text-muted-foreground">
          {earned && !Number.isNaN(earned.getTime())
            ? earned.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })
            : ""}
        </span>

        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" onClick={save} disabled={saving} data-testid="button-save-image">
            {saving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <ImageDown className="h-3.5 w-3.5" />
            )}
            <span className="ml-1.5 text-xs">Image</span>
          </Button>

          {win.sharedAt ? (
            <Badge variant="outline" className="text-[10px] gap-1">
              <Check className="h-2.5 w-2.5" /> Shared
            </Badge>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => onShare(win)} data-testid="button-share-win">
              <Share2 className="h-3.5 w-3.5" />
              <span className="ml-1.5 text-xs">Share</span>
            </Button>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ─── Sharing ───────────────────────────────────────────────────────────────

function ShareDialog({ win, onClose }: { win: Win | null; onClose: () => void }) {
  const { toast } = useToast();
  const [message, setMessage] = useState("");

  const share = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/wins/${win!.id}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ message: message.trim() || undefined }),
      });
      if (!res.ok) throw new Error((await res.json()).message ?? "That didn't go through");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/wins"] });
      queryClient.invalidateQueries({ queryKey: ["/api/community/channels"] });
      toast({ title: "Posted to the room." });
      setMessage("");
      onClose();
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open={!!win} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        {win && (
          <>
            <DialogHeader>
              <DialogTitle className="font-display text-xl font-normal">
                Tell the room
              </DialogTitle>
              <DialogDescription>
                This posts as you, in the community, where people can reply to it.
              </DialogDescription>
            </DialogHeader>

            <div className="rounded-md border border-border/60 p-3">
              <div className="h-px w-8 bg-[hsl(var(--gold))] mb-2" />
              <p className="font-display text-lg leading-tight">{win.title}</p>
              {win.subtitle && (
                <p className="text-xs text-muted-foreground mt-0.5">{win.subtitle}</p>
              )}
            </div>

            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Anything you want to say with it — optional."
              rows={3}
              className="resize-none"
              data-testid="input-share-message"
            />

            <div className="flex gap-2">
              <Button
                onClick={() => share.mutate()}
                disabled={share.isPending}
                className="bg-gold border-gold-border text-gold-foreground"
                data-testid="button-confirm-share"
              >
                Post it
              </Button>
              <Button variant="ghost" onClick={onClose}>
                Not now
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── The tab ───────────────────────────────────────────────────────────────

export function WinsTab() {
  const wins = useWins();
  const [sharing, setSharing] = useState<Win | null>(null);

  if (wins.isLoading) {
    return (
      <div className="grid sm:grid-cols-2 gap-4">
        {[1, 2].map((i) => (
          <Skeleton key={i} className="h-56 w-full" />
        ))}
      </div>
    );
  }

  // The heading stays on the empty state.
  //
  // Every screen in this app is empty until there is content, so the empty
  // state is the design most of the time — and a bare centred paragraph with
  // no title reads as a screen that failed to load rather than one waiting
  // for you. The heading is what says "you're in the right place, there is
  // nothing here yet".
  if (!wins.data || wins.data.length === 0) {
    return (
      <div className="space-y-6">
        <SectionHeading
          title="What you've finished"
          subtitle="Take the picture. Tell the room."
        />
        <Panel>
          <div className="py-12 text-center space-y-3">
            <Award className="h-10 w-10 mx-auto text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground max-w-xs mx-auto">
              Finish a day and the first one appears. They're for the things that
              actually took something.
            </p>
          </div>
        </Panel>
      </div>
    );
  }

  // Counted here rather than on the server: it is two numbers off a list
  // already in memory, and an endpoint for it would be a second place the
  // definition of "shared" could drift from.
  const shared = wins.data.filter((w) => w.sharedAt).length;

  return (
    <div className="space-y-6">
      <SectionHeading
        title="What you've finished"
        subtitle="Take the picture. Tell the room."
      />

      <Panel title="The count">
        <div className="grid grid-cols-2 gap-3">
          <StatTile label="Earned" value={wins.data.length} />
          <StatTile
            label="Shared"
            value={shared}
            sub={shared === 0 ? "None yet" : undefined}
          />
        </div>
      </Panel>

      <div className="grid sm:grid-cols-2 gap-4">
        {wins.data.map((w) => (
          <WinCard key={w.id} win={w} onShare={setSharing} />
        ))}
      </div>

      <ShareDialog win={sharing} onClose={() => setSharing(null)} />
    </div>
  );
}
