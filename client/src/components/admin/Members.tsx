/**
 * Admin — the members, and the tiers that decide what they can see.
 *
 * This is the screen that was missing. Every other admin surface manages
 * content; this one manages access, and without it the answer to "why can't
 * my client see the community" was a SQL console.
 *
 * ── Two halves, deliberately on one screen ────────────────────────────────
 *
 * People and tiers are edited together because they are the same question
 * asked twice. Changing somebody's tier is meaningless without knowing what
 * that tier opens, and changing a tier's rank silently changes what everybody
 * on it can see. Splitting them into separate tabs hides that from you at
 * exactly the moment it matters.
 *
 * Each tier shows its member count for the same reason: a rank edit with
 * "4 members" next to it reads as consequential, which it is.
 */

import { useState } from "react";
import { MemberHealth } from "@/components/admin/MemberHealth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { InfoTip } from "@/components/ui/info-tip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, Shield, Plus, Trash2, Users, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface Member {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  isAdmin: string | null;
  membershipTier: string | null;
  timezone: string | null;
  currentStreak: number | null;
  longestStreak: number | null;
  createdAt: string | null;
  tierName: string | null;
  tierRank: number | null;
  winCount: number;
  postCount: number;
  registrationCount: number;
}

interface Tier {
  id: string;
  name: string;
  rank: number;
  description: string | null;
  priceCents: number | null;
  priceNote: string | null;
  includes: string[] | null;
  isActive: boolean;
  sortOrder: number;
  memberCount: number;
}

function displayName(m: Member): string {
  const n = [m.firstName, m.lastName].filter(Boolean).join(" ").trim();
  return n || m.email || m.id.slice(0, 8);
}

function initials(m: Member): string {
  const n = displayName(m);
  return n.slice(0, 2).toUpperCase();
}

export function MembersAdmin() {
  const [q, setQ] = useState("");
  const [showTiers, setShowTiers] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const { toast } = useToast();
  const qc = useQueryClient();

  const members = useQuery<Member[]>({
    queryKey: ["/api/admin/members", q],
    queryFn: async () => {
      const url = q ? `/api/admin/members?q=${encodeURIComponent(q)}` : "/api/admin/members";
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Couldn't load members");
      return res.json();
    },
  });

  const tiers = useQuery<Tier[]>({
    queryKey: ["/api/admin/tiers"],
    queryFn: async () => {
      const res = await fetch("/api/admin/tiers", { credentials: "include" });
      if (!res.ok) throw new Error("Couldn't load tiers");
      return res.json();
    },
  });

  const patch = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: Record<string, unknown> }) => {
      return apiRequest("PATCH", `/api/admin/members/${id}`, body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/members"] });
      qc.invalidateQueries({ queryKey: ["/api/admin/tiers"] });
      toast({ title: "Saved" });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const saveTier = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      apiRequest("PUT", `/api/admin/tiers/${id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/tiers"] });
      qc.invalidateQueries({ queryKey: ["/api/admin/members"] });
      toast({ title: "Tier saved" });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const list = members.data ?? [];
  const tierList = tiers.data ?? [];

  // The thing worth surfacing before anything else: people who cannot see the
  // community because they are on rank 0. This was invisible for weeks.
  const stranded = list.filter((m) => (m.tierRank ?? 0) === 0 && m.isAdmin !== "true");

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h2 className="font-display text-2xl">Members</h2>
        <p className="text-sm text-muted-foreground">
          Who is in, and what their tier lets them see.
        </p>
      </div>

      {/* ── The thing you'd otherwise have to notice yourself ─────────────── */}
      {stranded.length > 0 && (
        <div className="border border-[hsl(var(--gold))]/30 bg-[hsl(var(--gold))]/5 rounded-lg p-4 space-y-1">
          <p className="text-sm font-medium">
            {stranded.length} {stranded.length === 1 ? "member is" : "members are"} on a
            rank-0 tier
          </p>
          <p className="text-sm text-muted-foreground">
            Every room requires a rank above 0, so they open the community and find
            nothing. Give them a tier below, or lower a room's gate in{" "}
            <span className="text-foreground">Rooms</span>.
          </p>
        </div>
      )}

      {/* ── Search ────────────────────────────────────────────────────────── */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by name or email"
          className="pl-9"
          data-testid="input-member-search"
        />
      </div>

      {/* ── People ────────────────────────────────────────────────────────── */}
      {members.isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
        </div>
      ) : list.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">
          {q ? "Nobody matches that." : "No members yet."}
        </p>
      ) : (
        <div className="space-y-2">
          {list.map((m) => {
            const open = expanded === m.id;
            const rank = m.tierRank ?? 0;
            return (
              <div key={m.id} className="border border-border/60 rounded-lg overflow-hidden">
                <button
                  onClick={() => setExpanded(open ? null : m.id)}
                  className="w-full flex items-center gap-3 p-3 text-left hover:bg-muted/40 transition-colors tap-clean"
                  data-testid={`member-row-${m.id}`}
                >
                  <div className="h-9 w-9 rounded-full bg-muted grid place-items-center text-xs shrink-0">
                    {initials(m)}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm truncate">{displayName(m)}</span>
                      {m.isAdmin === "true" && (
                        <Badge variant="secondary" className="text-[10px] gap-1">
                          <Shield className="h-3 w-3" /> Admin
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{m.email}</p>
                  </div>

                  <Badge
                    variant={rank === 0 ? "outline" : "secondary"}
                    className={cn("shrink-0 text-xs", rank === 0 && "text-muted-foreground")}
                  >
                    {m.tierName ?? m.membershipTier ?? "none"}
                  </Badge>

                  <ChevronDown
                    className={cn(
                      "h-4 w-4 text-muted-foreground shrink-0 transition-transform",
                      open && "rotate-180",
                    )}
                  />
                </button>

                {open && (
                  <div className="border-t border-border/60 p-4 space-y-4 bg-muted/20">
                    {/* Their phone's own record, above the counters we keep.
                        Streaks measure whether they logged; this measures what
                        actually happened. */}
                    <MemberHealth userId={m.id} />

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                      {[
                        ["Streak", m.currentStreak ?? 0],
                        ["Best", m.longestStreak ?? 0],
                        ["Wins", m.winCount],
                        ["Posts", m.postCount],
                      ].map(([label, value]) => (
                        <div key={String(label)}>
                          <p className="text-lg">{value}</p>
                          <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
                            {label}
                          </p>
                        </div>
                      ))}
                    </div>

                    <div className="grid sm:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label className="text-xs flex items-center gap-1.5">
                          Membership tier
                          <InfoTip label="About tiers" title="What a tier controls">
                            A tier is a rank. Rooms, offerings and protocols each name a
                            minimum rank, and anything at or below the member's rank opens.
                            Rank 0 sees nothing gated.
                          </InfoTip>
                        </Label>
                        <Select
                          value={m.membershipTier ?? undefined}
                          onValueChange={(v) => patch.mutate({ id: m.id, body: { membershipTier: v } })}
                        >
                          <SelectTrigger data-testid={`select-tier-${m.id}`}>
                            <SelectValue placeholder="Pick a tier" />
                          </SelectTrigger>
                          <SelectContent>
                            {tierList.map((t) => (
                              <SelectItem key={t.id} value={t.id}>
                                {t.name} · rank {t.rank}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-1.5">
                        <Label className="text-xs flex items-center gap-1.5">
                          Admin
                          <InfoTip label="About admin" title="Full access">
                            An admin sees every room and every back-office screen,
                            whatever tier they hold. You can't remove your own — it would
                            lock you out of this page.
                          </InfoTip>
                        </Label>
                        <div className="flex items-center gap-3 h-10">
                          <Switch
                            checked={m.isAdmin === "true"}
                            onCheckedChange={(v) => patch.mutate({ id: m.id, body: { isAdmin: v } })}
                            data-testid={`switch-admin-${m.id}`}
                          />
                          <span className="text-sm text-muted-foreground">
                            {m.isAdmin === "true" ? "Full back-office access" : "Member only"}
                          </span>
                        </div>
                      </div>
                    </div>

                    <p className="text-xs text-muted-foreground">
                      Joined {m.createdAt ? new Date(m.createdAt).toLocaleDateString() : "—"} ·
                      timezone {m.timezone ?? "UTC"} · {m.registrationCount} registrations
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Tiers ─────────────────────────────────────────────────────────── */}
      <div className="pt-4 border-t border-border/60">
        <button
          onClick={() => setShowTiers(!showTiers)}
          className="flex items-center gap-2 text-sm hover:text-foreground text-muted-foreground transition-colors tap-clean"
          data-testid="button-toggle-tiers"
        >
          <Users className="h-4 w-4" />
          Tiers
          <ChevronDown className={cn("h-4 w-4 transition-transform", showTiers && "rotate-180")} />
        </button>

        {showTiers && (
          <div className="mt-4 space-y-3">
            <p className="text-sm text-muted-foreground">
              Rank is the whole access model — higher includes everything lower. They're
              spaced by ten so a new tier can sit between two without renumbering.
            </p>

            {tiers.isLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : (
              tierList.map((t) => (
                <div key={t.id} className="border border-border/60 rounded-lg p-3 space-y-3">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div>
                      <p className="text-sm">{t.name}</p>
                      <p className="text-xs text-muted-foreground font-mono">{t.id}</p>
                    </div>
                    <Badge variant="secondary" className="text-xs">
                      {t.memberCount} {t.memberCount === 1 ? "member" : "members"}
                    </Badge>
                  </div>

                  <div className="grid sm:grid-cols-3 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Name</Label>
                      <Input
                        defaultValue={t.name}
                        onBlur={(e) =>
                          e.target.value !== t.name &&
                          saveTier.mutate({ id: t.id, body: { name: e.target.value } })
                        }
                        data-testid={`input-tier-name-${t.id}`}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Rank</Label>
                      <Input
                        type="number"
                        defaultValue={t.rank}
                        onBlur={(e) =>
                          Number(e.target.value) !== t.rank &&
                          saveTier.mutate({ id: t.id, body: { rank: Number(e.target.value) } })
                        }
                        data-testid={`input-tier-rank-${t.id}`}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Price note</Label>
                      <Input
                        defaultValue={t.priceNote ?? ""}
                        placeholder="per month"
                        onBlur={(e) =>
                          e.target.value !== (t.priceNote ?? "") &&
                          saveTier.mutate({ id: t.id, body: { priceNote: e.target.value || null } })
                        }
                        data-testid={`input-tier-pricenote-${t.id}`}
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs">Description</Label>
                    <Input
                      defaultValue={t.description ?? ""}
                      onBlur={(e) =>
                        e.target.value !== (t.description ?? "") &&
                        saveTier.mutate({ id: t.id, body: { description: e.target.value || null } })
                      }
                      data-testid={`input-tier-desc-${t.id}`}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
