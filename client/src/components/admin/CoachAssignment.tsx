/**
 * Who coaches this member.
 *
 * The workflow that started the whole coaching pass: Admin → a member → pick a
 * coach → saved. Until now there was no way to express it at all, so coaching
 * relationships were inferred from whether a plan or a message happened to
 * exist.
 *
 * ── On the list of coaches ────────────────────────────────────────────────
 *
 * The server returns everybody at coach rank or above, tagged with their actual
 * role, and puts real coaches first. It does not silently include or exclude
 * staff: an admin who also coaches is a real case, and hiding them would mean
 * inventing a second flag to say what `role` already says. What it avoids is
 * the opposite mistake — presenting every moderator and admin as a Sakred Coach
 * merely because the role ladder is hierarchical.
 */

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Coach = {
  id: string;
  name: string;
  role: string;
  isCoachByRole: boolean;
  activeClients: number;
};

type CurrentCoach = {
  coach: { id: string; name: string } | null;
  since?: string;
  history?: { coachUserId: string; name: string; startedAt: string; endedAt: string | null }[];
};

function shortDate(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function CoachAssignment({ memberId }: { memberId: string }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [picked, setPicked] = useState<string>("");

  const current = useQuery<CurrentCoach>({
    queryKey: [`/api/admin/members/${memberId}/coach`],
    queryFn: async () => {
      const res = await fetch(`/api/admin/members/${memberId}/coach`, { credentials: "include" });
      if (!res.ok) return { coach: null };
      return res.json();
    },
  });

  const coaches = useQuery<{ coaches: Coach[] }>({
    queryKey: ["/api/admin/coaches"],
    queryFn: async () => {
      const res = await fetch("/api/admin/coaches", { credentials: "include" });
      if (!res.ok) return { coaches: [] };
      return res.json();
    },
  });

  /**
   * Both sides of the assignment have to be re-read.
   *
   * The member's coach changes here, and so does the roster of the coach who
   * gained or lost them — and so does the member's own navigation, which is a
   * different session entirely and will pick it up on its next fetch.
   */
  const refresh = () => {
    qc.invalidateQueries({ queryKey: [`/api/admin/members/${memberId}/coach`] });
    qc.invalidateQueries({ queryKey: ["/api/admin/coaches"] });
    qc.invalidateQueries({ queryKey: ["/api/coach/clients"] });
    qc.invalidateQueries({ queryKey: ["/api/coaching/my-coach"] });
  };

  const assign = useMutation({
    mutationFn: async (coachUserId: string) =>
      apiRequest("PUT", `/api/admin/members/${memberId}/coach`, { coachUserId }),
    onSuccess: () => {
      refresh();
      setPicked("");
      toast({ title: "Coach assigned" });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const end = useMutation({
    mutationFn: async () => apiRequest("DELETE", `/api/admin/members/${memberId}/coach`),
    onSuccess: () => {
      refresh();
      toast({ title: "Coaching ended" });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const assigned = current.data?.coach ?? null;
  const options = (coaches.data?.coaches ?? []).filter((c) => c.id !== memberId);
  const busy = assign.isPending || end.isPending;

  return (
    <div className="space-y-1.5">
      <Label className="text-xs">Coach</Label>

      {assigned ? (
        <div className="space-y-2">
          <div className="flex items-center gap-3 min-h-10">
            <span className="text-sm">{assigned.name}</span>
            {current.data?.since && (
              <span className="text-xs text-muted-foreground">
                since {shortDate(current.data.since)}
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={picked} onValueChange={(v) => { setPicked(v); assign.mutate(v); }}>
              <SelectTrigger className="w-52" data-testid={`select-coach-${memberId}`}>
                <SelectValue placeholder="Change coach" />
              </SelectTrigger>
              <SelectContent>
                {options
                  .filter((c) => c.id !== assigned.id)
                  .map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                      {c.isCoachByRole ? "" : ` · ${c.role}`}
                      {c.activeClients > 0 ? ` · ${c.activeClients}` : ""}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => end.mutate()}
              data-testid={`end-coaching-${memberId}`}
              className="text-muted-foreground hover:text-destructive"
            >
              End coaching
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3 min-h-10">
          <Select value={picked} onValueChange={(v) => { setPicked(v); assign.mutate(v); }}>
            <SelectTrigger className="w-52" data-testid={`select-coach-${memberId}`}>
              <SelectValue placeholder="No coach" />
            </SelectTrigger>
            <SelectContent>
              {options.length === 0 ? (
                // Said rather than shown as an empty menu, because the reason is
                // actionable: nobody has been given the coach role yet.
                <div className="px-2 py-1.5 text-xs text-muted-foreground">
                  Nobody has the coach role yet.
                </div>
              ) : (
                options.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                    {c.isCoachByRole ? "" : ` · ${c.role}`}
                    {c.activeClients > 0 ? ` · ${c.activeClients}` : ""}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        </div>
      )}

      {/*
        Who had them before. Reassignment closes a relationship rather than
        deleting it, so this is the record of that — and it is why the messages
        and plan phases a previous coach wrote stay attributed to them.
      */}
      {(current.data?.history ?? []).length > 0 && (
        <p className="text-[11px] text-muted-foreground">
          Previously:{" "}
          {(current.data?.history ?? [])
            .map((h) => `${h.name} (${shortDate(h.startedAt)}–${shortDate(h.endedAt)})`)
            .join(", ")}
        </p>
      )}
    </div>
  );
}
