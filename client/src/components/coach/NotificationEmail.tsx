/**
 * Where a coach's client alerts arrive.
 *
 * ── The sentence this screen exists to be able to say ─────────────────────
 *
 *     Pending verification: coach@sakredbody.com
 *     Alerts are still going to: personal@gmail.com
 *
 * A form that accepted the new address and said nothing else would leave
 * somebody believing their alerts had moved when they had not — and the way
 * they would find out is by missing one.
 *
 * ── What this is not ──────────────────────────────────────────────────────
 *
 * A change of account. Their login and their password reset stay on the
 * address they registered with; this is a delivery preference, and a typo here
 * cannot lock anybody out of anything.
 */

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Panel } from "@/components/portal/Panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

type Destination = {
  accountEmail: string | null;
  override: string | null;
  verified: boolean;
  deliveringTo: string | null;
  pending: boolean;
};

const KEY = ["/api/coach/notification-email"];

export function NotificationEmail() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [draft, setDraft] = useState("");

  const destination = useQuery<Destination>({
    queryKey: KEY,
    queryFn: async () => {
      const res = await fetch(KEY[0], { credentials: "include" });
      if (!res.ok) throw new Error("Couldn't load your notification settings");
      return res.json();
    },
  });

  useEffect(() => {
    if (destination.data) setDraft(destination.data.override ?? "");
  }, [destination.data?.override]);

  const save = useMutation({
    mutationFn: (email: string | null) =>
      apiRequest("PUT", "/api/coach/notification-email", { email }),
    onSuccess: (_, email) => {
      qc.invalidateQueries({ queryKey: KEY });
      toast({
        title: email ? "Check that inbox to confirm it." : "Back to your account email.",
      });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const d = destination.data;
  if (!d) return null;

  /* Typed but not yet confirmed. The two-address sentence belongs here. */
  const awaiting = !!d.override && !d.verified;

  return (
    <Panel title="Coaching alerts">
      <p className="text-[11px] text-muted-foreground/70">
        Where client alerts are sent. Your sign-in address doesn't change.
      </p>

      <div className="mt-3 space-y-2">
        <Input
          type="email"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={d.accountEmail ?? "you@example.com"}
          data-testid="input-coach-notification-email"
        />
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            onClick={() => save.mutate(draft.trim())}
            disabled={!draft.trim() || save.isPending || draft.trim() === d.override}
            data-testid="button-save-notification-email"
          >
            {save.isPending ? "Sending…" : awaiting ? "Send it again" : "Use this address"}
          </Button>
          {d.override && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => save.mutate(null)}
              disabled={save.isPending}
              data-testid="button-clear-notification-email"
            >
              Use my account email
            </Button>
          )}
        </div>
      </div>

      <div className="mt-3 space-y-1" data-testid="text-notification-destination">
        {awaiting && (
          <p className="text-[11px] text-[hsl(var(--gold))]">
            Pending verification: {d.override}
          </p>
        )}
        <p className="text-[11px] text-muted-foreground/70">
          {awaiting ? "Alerts are still going to: " : "Alerts go to: "}
          <span className="text-foreground/80">{d.deliveringTo ?? "no address on file"}</span>
        </p>
      </div>
    </Panel>
  );
}
