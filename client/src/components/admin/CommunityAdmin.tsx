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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, Lock, EyeOff } from "lucide-react";
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
            value={draft.offeringId ? "offering" : String(draft.minTierRank)}
            onValueChange={(v) => {
              if (v === "offering") {
                setDraft({ ...draft, offeringId: offerings[0]?.id ?? null });
              } else {
                setDraft({ ...draft, minTierRank: Number(v), offeringId: null });
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
            </SelectContent>
          </Select>
        </div>

        {draft.offeringId && (
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
          className="bg-gold border-gold-border text-white"
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
                    {!c.isActive && (
                      <Badge variant="secondary" className="text-[10px] gap-1">
                        <EyeOff className="h-2.5 w-2.5" /> closed
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {c.offeringId ? `Only ${offeringName(c.offeringId)}` : tierLabel(c.minTierRank)}
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
