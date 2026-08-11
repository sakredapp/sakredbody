/**
 * Settings.
 *
 * Built because the app already promised it. The report-or-block dialog tells
 * a member "you can undo it in Settings", and there was no Settings — a
 * promise the interface didn't keep, which is worse than not offering the
 * reassurance at all.
 *
 * ── What belongs here ─────────────────────────────────────────────────────
 *
 * The things a member changes about *themselves*, not the things they do. Who
 * they've blocked, what units they read weights in, and how to leave. It is
 * deliberately short: a settings screen that accumulates every toggle nobody
 * asked for is how people stop being able to find the two that matter.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SectionHeading, Panel } from "@/components/portal/Panel";
import { HealthSettings } from "@/components/portal/HealthSettings";
import { ReplaySetup } from "@/components/portal/ReplaySetup";
import { AboutYouSettings } from "@/components/portal/AboutYouSettings";
import { MovementSettings } from "@/components/portal/MovementSettings";
import { InfoTip } from "@/components/ui/info-tip";
import { EyeOff, Scale, LogOut, ShieldOff } from "lucide-react";
import { cn } from "@/lib/utils";

interface Blocked {
  id: string;
  blockedId: string;
  firstName: string | null;
  lastName: string | null;
}

export function SettingsTab({
  weightUnit,
  onLogout,
}: {
  weightUnit?: string | null;
  onLogout: () => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const blocks = useQuery<Blocked[]>({
    queryKey: ["/api/community/blocks"],
    queryFn: async () => {
      const r = await fetch("/api/community/blocks", { credentials: "include" });
      if (!r.ok) throw new Error("Couldn't load your blocked list");
      return r.json();
    },
  });

  const unblock = useMutation({
    mutationFn: async (userId: string) =>
      apiRequest("DELETE", `/api/community/blocks/${userId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/community/blocks"] });
      // Their posts come back everywhere, so the rooms and search have to be
      // refetched too — not just this list.
      qc.invalidateQueries();
      toast({ title: "Unblocked", description: "You'll see their posts again." });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const setUnit = useMutation({
    mutationFn: async (unit: "kg" | "lb") =>
      apiRequest("PATCH", "/api/training/preferences", { weightUnit: unit }),
    onSuccess: () => {
      qc.invalidateQueries();
      toast({ title: "Saved" });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const list = blocks.data ?? [];
  const unit = weightUnit === "kg" ? "kg" : "lb";
  const nameOf = (b: Blocked) =>
    [b.firstName, b.lastName].filter(Boolean).join(" ").trim() || "That member";

  return (
    <div className="space-y-6">
      <SectionHeading title="Settings" subtitle="You, rather than what you're doing." />

      {/* ── About you ──────────────────────────────────────────────────────
          First, because it is the one panel that changes what the app says
          rather than how it behaves — and because most people do not know
          their time of birth when onboarding asks. They find out that evening,
          and this is where the answer goes. Without it the rising sign is lost
          for good. */}
      <Panel title="About you">
        <AboutYouSettings />
      </Panel>

      {/* ── What Build opens on ────────────────────────────────────────────
          The Build screen asks this once and then never again, which is the
          right amount of asking and the wrong amount if there is nowhere to
          change the answer. People take up Pilates; people stop playing
          basketball. */}
      <Panel title="Movement you do">
        <MovementSettings />
      </Panel>

      {/* ── Health, reminders and the widget ───────────────────────────────
          First, and above the older panels, because it is the only group here
          that onboarding asks about and then never mentions again. A member
          who tapped "no notifications" half-awake on their first morning had
          no way back — a choice you can make once and never unmake is a trap,
          and this panel is the way out of it. */}
      <Panel title="Health &amp; reminders">
        <HealthSettings />
        {/* ── Run it again ──
            Onboarding remembers per device that it has asked, which is right
            for notification and widget choices and leaves no way to simply
            see the flow again. The alternative a member reaches for is
            deleting their account to look at a screen, which is a
            spectacularly bad trade. */}
        <ReplaySetup />
      </Panel>

      {/* ── Blocked ────────────────────────────────────────────────────────── */}
      <Panel title="People you've blocked">
        {blocks.isLoading ? (
          <Skeleton className="h-12 w-full" />
        ) : list.length === 0 ? (
          <div className="flex items-start gap-3">
            <ShieldOff className="h-4 w-4 text-muted-foreground/40 mt-0.5 shrink-0" />
            <p className="text-sm text-muted-foreground">
              Nobody. If someone's making the room worse, block them from their
              message — they're never told.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {list.map((b) => (
              <div
                key={b.id}
                className="flex items-center gap-3 border border-border/50 rounded-lg px-3 py-2.5"
              >
                <EyeOff className="h-4 w-4 text-muted-foreground/50 shrink-0" />
                <span className="text-sm flex-1 truncate">{nameOf(b)}</span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => unblock.mutate(b.blockedId)}
                  disabled={unblock.isPending}
                  data-testid={`button-unblock-${b.blockedId}`}
                >
                  Unblock
                </Button>
              </div>
            ))}
          </div>
        )}
      </Panel>

      {/* ── Units ──────────────────────────────────────────────────────────── */}
      <Panel title="Weights">
        <div className="flex items-center gap-3 flex-wrap">
          <Scale className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="text-sm flex-1 min-w-0">
            Shown in
            <InfoTip label="About units" title="Nothing is converted">
              Everything is stored the same way underneath, so switching changes only
              what you read. No lift is rewritten and nothing is lost either way.
            </InfoTip>
          </span>
          <div className="flex rounded-full border border-border/60 p-0.5">
            {(["lb", "kg"] as const).map((u) => (
              <button
                key={u}
                onClick={() => u !== unit && setUnit.mutate(u)}
                className={cn(
                  "px-4 py-1.5 rounded-full text-sm transition-colors tap-clean",
                  unit === u
                    ? "bg-[hsl(var(--gold))]/15 text-[hsl(var(--gold))]"
                    : "text-muted-foreground hover:text-foreground",
                )}
                data-testid={`button-unit-${u}`}
              >
                {u === "lb" ? "Pounds" : "Kilos"}
              </button>
            ))}
          </div>
        </div>
      </Panel>

      {/* ── Account ────────────────────────────────────────────────────────── */}
      <Panel title="Account">
        <div className="space-y-3">
          <Button variant="outline" onClick={onLogout} className="w-full" data-testid="button-settings-logout">
            <LogOut className="h-4 w-4 mr-1.5" />
            Sign out
          </Button>

          {/* A full navigation, not a router link: the page is public on
              purpose — both stores require account deletion to be reachable
              without signing in — and it lives outside the portal. */}
          <a
            href="/delete-account"
            className="block text-center text-xs text-muted-foreground hover:text-destructive transition-colors py-1"
            data-testid="link-delete-account"
          >
            Delete my account
          </a>
        </div>
      </Panel>
    </div>
  );
}
