/**
 * Admin — the rooms.
 *
 * A channel is a name plus a gate. The gate is either a minimum tier rank or an
 * offering id, never both in practice: a mastermind's or a retreat's room
 * belongs to the people who bought that offering, whatever tier they hold.
 *
 * Ranks are spaced by ten so a tier can be slotted between two existing ones
 * without renumbering every gate — see shared/models/community.ts, TIER_RANKS.
 */

import { useState } from "react";
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
import { Plus, Trash2, Lock, EyeOff, UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { TIER_RANKS } from "@shared/schema";
import type { Channel, Offering } from "@shared/schema";

const TIER_OPTIONS: { rank: number; label: string }[] = [
  { rank: TIER_RANKS.free, label: "Everyone" },
  { rank: TIER_RANKS.member, label: "Member and above" },
  { rank: TIER_RANKS.inner, label: "Inner circle and above" },
  { rank: TIER_RANKS.executive, label: "Executive only" },
];

function tierLabel(rank: number): string {
  // Exact match first; an unrecognised rank still reads sensibly rather than
  // falling back to "Everyone" and looking wide open when it isn't.
  const exact = TIER_OPTIONS.find((t) => t.rank === rank);
  if (exact) return exact.label;
  return `Rank ${rank} and above`;
}

interface Draft {
  slug: string;
  name: string;
  description: string;
  minTierRank: number;
  isPrivate: boolean;
  offeringId: string | null;
  isReadOnly: boolean;
  isActive: boolean;
  sortOrder: number;
}

const EMPTY: Draft = {
  slug: "",
  name: "",
  description: "",
  minTierRank: 0,
  isPrivate: false,
  offeringId: null,
  isReadOnly: false,
  isActive: true,
  sortOrder: 0,
};

/** Lowercase, hyphenated, no leading/trailing junk. */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function ChannelEditor({
  draft,
  setDraft,
  offerings,
  onSave,
  onCancel,
  saving,
  isNew,
}: {
  draft: Draft;
  setDraft: (d: Draft) => void;
  offerings: Offering[];
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  isNew: boolean;
}) {
  return (
    <div className="border border-border/60 rounded-md p-5 space-y-5">
      <div className="grid sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label className="text-xs">Name</Label>
          <Input
            value={draft.name}
            onChange={(e) => {
              const name = e.target.value;
              // The slug follows the name until someone edits it directly —
              // changing it later would break nothing in the API but would
              // break any link anyone has shared.
              setDraft({
                ...draft,
                name,
                ...(isNew ? { slug: slugify(name) } : {}),
              });
            }}
            placeholder="The General"
            data-testid="input-channel-name"
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Slug</Label>
          <Input
            value={draft.slug}
            onChange={(e) => setDraft({ ...draft, slug: slugify(e.target.value) })}
            placeholder="general"
            data-testid="input-channel-slug"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Description</Label>
        <Input
          value={draft.description}
          onChange={(e) => setDraft({ ...draft, description: e.target.value })}
          placeholder="What this room is for"
          data-testid="input-channel-description"
        />
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label className="text-xs">Who gets in</Label>
          <Select
            value={
              draft.isPrivate
                ? "invite"
                : draft.offeringId
                  ? "offering"
                  : String(draft.minTierRank)
            }
            onValueChange={(v) => {
              if (v === "invite") {
                // Invite-only overrides everything: rank and offering are both
                // meaningless once the member list is the only way in, so they
                // are cleared rather than left to look meaningful.
                setDraft({ ...draft, isPrivate: true, offeringId: null, minTierRank: 0 });
              } else if (v === "offering") {
                setDraft({ ...draft, isPrivate: false, offeringId: offerings[0]?.id ?? null });
              } else {
                setDraft({ ...draft, isPrivate: false, minTierRank: Number(v), offeringId: null });
              }
            }}
          >
            <SelectTrigger data-testid="select-channel-gate">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIER_OPTIONS.map((t) => (
                <SelectItem key={t.rank} value={String(t.rank)}>
                  {t.label}
                </SelectItem>
              ))}
              {offerings.length > 0 && (
                <SelectItem value="offering">A specific offering</SelectItem>
              )}
              <SelectItem value="invite">Invite only — people I pick</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {draft.isPrivate && (
          <div className="space-y-1.5">
            <Label className="text-xs flex items-center gap-1.5">
              Invite only
              <InfoTip label="About invite-only rooms" title="The list is the door">
                Tier rank is ignored completely — nobody gets in by being senior. Save
                the room, then add people to it below. Admins always see everything.
              </InfoTip>
            </Label>
            <p className="text-sm text-muted-foreground">
              Save it, then pick who's in.
            </p>
          </div>
        )}

        {draft.offeringId && !draft.isPrivate && (
          <div className="space-y-1.5">
            <Label className="text-xs">Which offering</Label>
            <Select
              value={draft.offeringId}
              onValueChange={(v) => setDraft({ ...draft, offeringId: v })}
            >
              <SelectTrigger data-testid="select-channel-offering">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {offerings.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      <div className="flex items-center gap-8 flex-wrap">
        <label className="flex items-center gap-2.5 cursor-pointer">
          <Switch
            checked={draft.isReadOnly}
            onCheckedChange={(v) => setDraft({ ...draft, isReadOnly: v })}
            data-testid="switch-channel-readonly"
          />
          <span className="text-sm">Announcements only</span>
        </label>

        <label className="flex items-center gap-2.5 cursor-pointer">
          <Switch
            checked={draft.isActive}
            onCheckedChange={(v) => setDraft({ ...draft, isActive: v })}
            data-testid="switch-channel-active"
          />
          <span className="text-sm">Open</span>
        </label>

        <div className="flex items-center gap-2">
          <Label className="text-xs">Order</Label>
          <Input
            type="number"
            value={draft.sortOrder}
            onChange={(e) => setDraft({ ...draft, sortOrder: Number(e.target.value) || 0 })}
            className="w-20"
          />
        </div>
      </div>

      <div className="flex gap-2">
        <Button
          onClick={onSave}
          disabled={!draft.name.trim() || !draft.slug.trim() || saving}
          className="bg-gold border-gold-border text-gold-foreground"
          data-testid="button-save-channel"
        >
          {isNew ? "Create room" : "Save"}
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

export function CommunityAdmin() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [creating, setCreating] = useState(false);

  const channels = useQuery<Channel[]>({ queryKey: ["/api/admin/community/channels"] });
  const offerings = useQuery<Offering[]>({ queryKey: ["/api/admin/offerings"] });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["/api/admin/community/channels"] });
    // A member's room list is derived from these, so it's now stale too.
    qc.invalidateQueries({ queryKey: ["/api/community/channels"] });
  };

  const save = useMutation({
    mutationFn: async (input: { id: string | null; draft: Draft }) => {
      const body = {
        ...input.draft,
        description: input.draft.description.trim() || null,
      };
      const res = input.id
        ? await apiRequest("PUT", `/api/admin/community/channels/${input.id}`, body)
        : await apiRequest("POST", "/api/admin/community/channels", body);
      return res.json();
    },
    onSuccess: () => {
      refresh();
      setEditingId(null);
      setCreating(false);
      setDraft(EMPTY);
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/admin/community/channels/${id}`),
    onSuccess: refresh,
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const startEdit = (c: Channel) => {
    setCreating(false);
    setEditingId(c.id);
    setDraft({
      slug: c.slug,
      name: c.name,
      description: c.description ?? "",
      minTierRank: c.minTierRank,
      offeringId: c.offeringId,
      isPrivate: c.isPrivate ?? false,
      isReadOnly: c.isReadOnly,
      isActive: c.isActive,
      sortOrder: c.sortOrder,
    });
  };

  const offeringName = (id: string | null) =>
    offerings.data?.find((c) => c.id === id)?.name ?? "an offering";

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-1">
          <h2 className="font-display text-2xl">Rooms</h2>
          <p className="text-sm text-muted-foreground">
            Who can see what, and where they can say it.
          </p>
        </div>
        {!creating && (
          <Button
            onClick={() => {
              setCreating(true);
              setEditingId(null);
              setDraft(EMPTY);
            }}
            variant="outline"
            data-testid="button-new-channel"
          >
            <Plus className="h-4 w-4 mr-1.5" /> New room
          </Button>
        )}
      </div>

      {creating && (
        <ChannelEditor
          draft={draft}
          setDraft={setDraft}
          offerings={offerings.data ?? []}
          onSave={() => save.mutate({ id: null, draft })}
          onCancel={() => {
            setCreating(false);
            setDraft(EMPTY);
          }}
          saving={save.isPending}
          isNew
        />
      )}

      {channels.isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : channels.data && channels.data.length > 0 ? (
        <div className="space-y-3">
          {channels.data.map((c) =>
            editingId === c.id ? (
              <ChannelEditor
                key={c.id}
                draft={draft}
                setDraft={setDraft}
                offerings={offerings.data ?? []}
                onSave={() => save.mutate({ id: c.id, draft })}
                onCancel={() => setEditingId(null)}
                saving={save.isPending}
                isNew={false}
              />
            ) : (
              <div
                key={c.id}
                className={cn(
                  "border border-border/60 rounded-md p-4 flex items-start justify-between gap-4 flex-wrap",
                  !c.isActive && "opacity-60",
                )}
                data-testid={`admin-channel-${c.slug}`}
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">{c.name}</span>
                    <span className="text-xs text-muted-foreground/60">/{c.slug}</span>
                    {c.isReadOnly && (
                      <Badge variant="outline" className="text-[10px] gap-1">
                        <Lock className="h-2.5 w-2.5" /> announcements
                      </Badge>
                    )}
                    {c.isPrivate && (
                      <Badge variant="outline" className="text-[10px] gap-1 border-[hsl(var(--gold))]/40 text-[hsl(var(--gold))]">
                        <UserPlus className="h-2.5 w-2.5" /> invite only
                      </Badge>
                    )}
                    {!c.isActive && (
                      <Badge variant="secondary" className="text-[10px] gap-1">
                        <EyeOff className="h-2.5 w-2.5" /> closed
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {c.isPrivate
                      ? "Only the people you add"
                      : c.offeringId
                        ? `Only ${offeringName(c.offeringId)}`
                        : tierLabel(c.minTierRank)}
                    {c.description ? ` · ${c.description}` : ""}
                  </p>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <Button size="sm" variant="ghost" onClick={() => startEdit(c)}>
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      // Channels cascade to their messages, so this is not a
                      // soft close — say so plainly before it happens.
                      if (
                        window.confirm(
                          `Delete "${c.name}"? Every message in it goes too. To hide it instead, edit it and turn off "Open".`,
                        )
                      ) {
                        remove.mutate(c.id);
                      }
                    }}
                    data-testid={`button-delete-channel-${c.slug}`}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-destructive/70" />
                  </Button>
                </div>

                {/* Only for a saved private room: there is nothing to add
                    somebody to until the room exists, and a tier-gated room
                    has no member list to manage. */}
                {c.isPrivate && (
                  <div className="w-full">
                    <ChannelMembers channelId={c.id} channelName={c.name} />
                  </div>
                )}
              </div>
            ),
          )}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground py-12 text-center">
          No rooms yet. The first one should probably be called The General.
        </p>
      )}
    </div>
  );
}

/**
 * Who is in an invite-only room.
 *
 * Only rendered for a saved private room, because there is nothing to add
 * somebody to until the room exists — offering the picker on an unsaved draft
 * would be a control that quietly does nothing.
 *
 * Members are loaded from the same endpoint the Members tab uses, so the list
 * is whoever actually exists rather than a second idea of who a member is.
 */
export function ChannelMembers({ channelId, channelName }: { channelId: string; channelName: string }) {
  const [picked, setPicked] = useState("");
  const { toast } = useToast();
  const qc = useQueryClient();
  const key = ["/api/admin/community/channels", channelId, "members"];

  const members = useQuery<Array<{ id: string; userId: string; firstName: string | null; lastName: string | null; email: string | null }>>({
    queryKey: key,
    queryFn: async () => {
      const r = await fetch(`/api/admin/community/channels/${channelId}/members`, { credentials: "include" });
      if (!r.ok) throw new Error("Couldn't load who's in this room");
      return r.json();
    },
  });

  const everyone = useQuery<Array<{ id: string; firstName: string | null; lastName: string | null; email: string | null }>>({
    queryKey: ["/api/admin/members", ""],
    queryFn: async () => {
      const r = await fetch("/api/admin/members", { credentials: "include" });
      if (!r.ok) throw new Error("Couldn't load members");
      return r.json();
    },
  });

  const add = useMutation({
    mutationFn: async () =>
      apiRequest("POST", `/api/admin/community/channels/${channelId}/members`, { userId: picked }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key });
      setPicked("");
      toast({ title: "Added" });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const remove = useMutation({
    mutationFn: async (userId: string) =>
      apiRequest("DELETE", `/api/admin/community/channels/${channelId}/members/${userId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key });
      toast({ title: "Removed" });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const inRoom = members.data ?? [];
  const held = new Set(inRoom.map((m) => m.userId));
  const available = (everyone.data ?? []).filter((u) => !held.has(u.id));
  const nameOf = (u: { firstName: string | null; lastName: string | null; email: string | null }) =>
    [u.firstName, u.lastName].filter(Boolean).join(" ").trim() || u.email || "—";

  return (
    <div className="space-y-3 pt-3 border-t border-border/60">
      <div className="flex items-center gap-2">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">
          Who's in {channelName}
        </p>
        <InfoTip label="About the list" title="The list is the door">
          Nobody gets into an invite-only room by tier — this list is the only way in.
          Admins are the exception and always see every room.
        </InfoTip>
      </div>

      {members.isLoading ? (
        <Skeleton className="h-10 w-full" />
      ) : inRoom.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nobody yet. Until you add someone, only admins can see this room.
        </p>
      ) : (
        <div className="space-y-1.5">
          {inRoom.map((m) => (
            <div key={m.id} className="flex items-center gap-2 border border-border/50 rounded-md px-3 py-2">
              <span className="text-sm flex-1 truncate">{nameOf(m)}</span>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0 text-destructive hover:text-destructive"
                onClick={() => remove.mutate(m.userId)}
                data-testid={`button-remove-member-${m.userId}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <Select value={picked} onValueChange={setPicked}>
          <SelectTrigger className="flex-1" data-testid="select-add-room-member">
            <SelectValue placeholder="Add someone" />
          </SelectTrigger>
          <SelectContent>
            {available.length === 0 ? (
              <div className="px-2 py-3 text-sm text-muted-foreground">Everyone's already in.</div>
            ) : (
              available.map((u) => (
                <SelectItem key={u.id} value={u.id}>{nameOf(u)}</SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
        <Button variant="outline" disabled={!picked || add.isPending} onClick={() => add.mutate()}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
