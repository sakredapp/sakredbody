/**
 * What a coach has suggested, waiting on an answer.
 *
 * A suggestion sits above the list rather than in it, because it is not
 * something the member is doing — it is something they have been asked about.
 * Rendering it as a habit with a different badge is how people end up with
 * streaks on things they never agreed to.
 *
 * Declining is a real, recorded answer. It is what stops the same suggestion
 * arriving again next Tuesday, so the button says No thanks and means it.
 */

import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useProposals, useProposalResponse } from "./useHabits";
import { trackingMeta } from "@shared/models/habitTracking";

export function ProposalInbox({ emphasis }: { emphasis: "yin" | "yang" }) {
  const proposals = useProposals();
  const { accept, decline } = useProposalResponse();

  // The list is short by construction — one open proposal per habit — so
  // filtering here costs nothing and saves a second endpoint.
  const mine = (proposals.data ?? []).filter((p) => p.emphasis === emphasis);
  if (mine.length === 0) return null;

  return (
    <div className="mb-3 space-y-2">
      {mine.map((p) => (
        <div
          key={p.id}
          className="rounded-lg border border-[hsl(var(--gold))]/30 bg-[hsl(var(--gold))]/[0.05] px-3 py-2.5"
          data-testid={`proposal-${p.id}`}
        >
          <p className="text-[10px] uppercase tracking-wider text-gold/80">
            Your coach suggests
          </p>
          <p className="mt-0.5 text-sm">{p.title}</p>
          <p className="text-[11px] text-muted-foreground">
            {describeAsk(p.target, p.trackingType)}
            {p.phaseType === "fixed" && p.durationDays ? ` · for ${p.durationDays} days` : ""}
          </p>
          {p.reason && <p className="mt-1 text-[11px] italic text-muted-foreground">{p.reason}</p>}
          <div className="mt-2 flex gap-2">
            <Button
              size="sm"
              className="h-7 bg-[hsl(var(--gold))] text-background hover:bg-[hsl(var(--gold))]/90"
              disabled={accept.isPending}
              onClick={() => accept.mutate(p.id)}
              data-testid={`proposal-accept-${p.id}`}
            >
              <Check className="mr-1 h-3 w-3" />
              Yes, add it
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-muted-foreground"
              disabled={decline.isPending}
              onClick={() => decline.mutate(p.id)}
              data-testid={`proposal-decline-${p.id}`}
            >
              <X className="mr-1 h-3 w-3" />
              No thanks
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}

function describeAsk(target: number | null, trackingType: string): string {
  if (trackingType === "boolean" || target == null) return "Done or not, each day";
  const meta = trackingMeta(trackingType);
  return meta.unit ? `${target} ${meta.unit}` : String(target);
}
