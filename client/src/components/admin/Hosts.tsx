/**
 * Admin — who teaches here.
 *
 * Coaches, practitioners, and the people we bring in for one talk.
 *
 * Deliberately not tied to a member account. Most people who give a talk here
 * will never hold a login, and requiring one would mean inventing accounts for
 * guests — so a host is its own record, with an optional bridge for the ones
 * who are also members.
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { LabelWithInfo } from "@/components/ui/info-tip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Host } from "@shared/schema";

const KINDS = [
  { id: "internal", label: "Us", note: "Sakred's own" },
  { id: "coach", label: "Coach", note: "Contracted, runs their own" },
  { id: "partner", label: "Partner", note: "An outside practitioner we platform" },
];

function slugify(v: string) {
  return v.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function initials(name: string) {
  return name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}

interface Draft {
  slug: string;
  name: string;
  title: string;
  bio: string;
  avatarUrl: string;
  credentials: string;
  website: string;
  instagram: string;
  kind: string;
  isActive: boolean;
  sortOrder: number;
}

const EMPTY: Draft = {
  slug: "", name: "", title: "", bio: "", avatarUrl: "",
  credentials: "", website: "", instagram: "",
  kind: "partner", isActive: true, sortOrder: 0,
};

function fromHost(h: Host): Draft {
  return {
    slug: h.slug,
    name: h.name,
    title: h.title ?? "",
    bio: h.bio ?? "",
    avatarUrl: h.avatarUrl ?? "",
    // Stored as an array, edited as one line — a repeater for two credentials
    // is more interface than the data deserves.
    credentials: (h.credentials ?? []).join(", "),
    website: h.website ?? "",
    instagram: h.instagram ?? "",
    kind: h.kind,
    isActive: h.isActive,
    sortOrder: h.sortOrder,
  };
}

function Editor({
  host,
  draft,
  setDraft,
  onDone,
}: {
  host: Host | null;
  draft: Draft;
  setDraft: (d: Draft) => void;
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const isNew = !host;

  const save = useMutation({
    mutationFn: async () => {
      const body = {
        ...draft,
        title: draft.title.trim() || null,
        bio: draft.bio.trim() || null,
        avatarUrl: draft.avatarUrl.trim() || null,
        website: draft.website.trim() || null,
        instagram: draft.instagram.trim() || null,
        credentials: draft.credentials
          .split(",")
          .map((c) => c.trim())
          .filter(Boolean),
      };
      const res = isNew
        ? await apiRequest("POST", "/api/admin/hosts", body)
        : await apiRequest("PUT", `/api/admin/hosts/${host!.id}`, body);
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/hosts"] });
      qc.invalidateQueries({ queryKey: ["/api/hosts"] });
      onDone();
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  return (
    <div className="border border-border/60 rounded-md p-5 space-y-5">
      <div className="grid sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label className="text-xs">Name</Label>
          <Input
            value={draft.name}
            onChange={(e) =>
              setDraft({
                ...draft,
                name: e.target.value,
                ...(isNew ? { slug: slugify(e.target.value) } : {}),
              })
            }
            placeholder="Dr. Wen"
            data-testid="input-host-name"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Slug</Label>
          <Input value={draft.slug} onChange={(e) => setDraft({ ...draft, slug: slugify(e.target.value) })} />
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label className="text-xs">Title</Label>
          <Input
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            placeholder="Doctor of Chinese Medicine"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">
            <LabelWithInfo label="Credentials" title="Comma separated">
              Shown as small marks under the name — "L.Ac., DAOM". Kept short;
              this is a signal of standing, not a CV.
            </LabelWithInfo>
          </Label>
          <Input
            value={draft.credentials}
            onChange={(e) => setDraft({ ...draft, credentials: e.target.value })}
            placeholder="L.Ac., DAOM"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Bio</Label>
        <Textarea
          value={draft.bio}
          onChange={(e) => setDraft({ ...draft, bio: e.target.value })}
          rows={3}
          className="resize-none"
          placeholder="A paragraph. Shown on their page and nowhere else."
        />
      </div>

      <div className="grid sm:grid-cols-3 gap-4">
        <div className="space-y-1.5">
          <Label className="text-xs">Photograph URL</Label>
          <Input value={draft.avatarUrl} onChange={(e) => setDraft({ ...draft, avatarUrl: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Website</Label>
          <Input value={draft.website} onChange={(e) => setDraft({ ...draft, website: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Instagram</Label>
          <Input
            value={draft.instagram}
            onChange={(e) => setDraft({ ...draft, instagram: e.target.value })}
            placeholder="@handle"
          />
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-4 items-end">
        <div className="space-y-1.5">
          <Label className="text-xs">Relationship</Label>
          <Select value={draft.kind} onValueChange={(v) => setDraft({ ...draft, kind: v })}>
            <SelectTrigger data-testid="select-host-kind"><SelectValue /></SelectTrigger>
            <SelectContent>
              {KINDS.map((k) => (
                <SelectItem key={k.id} value={k.id}>
                  {k.label} — {k.note}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <label className="flex items-center gap-2.5 cursor-pointer pb-2">
          <Switch
            checked={draft.isActive}
            onCheckedChange={(v) => setDraft({ ...draft, isActive: v })}
          />
          <span className="text-sm">Listed</span>
        </label>
      </div>

      <div className="flex gap-2">
        <Button
          onClick={() => save.mutate()}
          disabled={!draft.name.trim() || !draft.slug.trim() || save.isPending}
          className="bg-gold border-gold-border text-gold-foreground"
          data-testid="button-save-host"
        >
          {isNew ? "Add" : "Save"}
        </Button>
        <Button variant="ghost" onClick={onDone}>Cancel</Button>
      </div>
    </div>
  );
}

export function HostsAdmin() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY);

  const hosts = useQuery<Host[]>({ queryKey: ["/api/admin/hosts"] });

  const remove = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/admin/hosts/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/hosts"] });
      qc.invalidateQueries({ queryKey: ["/api/hosts"] });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-1">
          <h2 className="font-display text-2xl">Who teaches here</h2>
          <p className="text-sm text-muted-foreground">
            Coaches, practitioners, and guests. A host doesn't need an account.
          </p>
        </div>
        {!creating && (
          <Button
            variant="outline"
            onClick={() => { setCreating(true); setEditingId(null); setDraft(EMPTY); }}
            data-testid="button-new-host"
          >
            <Plus className="h-4 w-4 mr-1.5" /> Add someone
          </Button>
        )}
      </div>

      {creating && (
        <Editor
          host={null}
          draft={draft}
          setDraft={setDraft}
          onDone={() => { setCreating(false); setDraft(EMPTY); }}
        />
      )}

      {hosts.isLoading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
        </div>
      ) : hosts.data && hosts.data.length > 0 ? (
        <div className="space-y-3">
          {hosts.data.map((h) =>
            editingId === h.id ? (
              <Editor
                key={h.id}
                host={h}
                draft={draft}
                setDraft={setDraft}
                onDone={() => setEditingId(null)}
              />
            ) : (
              <div
                key={h.id}
                className={cn(
                  "border border-border/60 rounded-md p-4 flex items-start justify-between gap-4",
                  !h.isActive && "opacity-60",
                )}
                data-testid={`admin-host-${h.slug}`}
              >
                <div className="flex items-start gap-3 min-w-0">
                  <Avatar className="h-10 w-10 shrink-0">
                    {h.avatarUrl && <AvatarImage src={h.avatarUrl} alt="" />}
                    <AvatarFallback className="text-xs">{initials(h.name)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{h.name}</span>
                      <Badge variant="secondary" className="text-[10px]">{h.kind}</Badge>
                      {!h.isActive && (
                        <Badge variant="outline" className="text-[10px] gap-1">
                          <EyeOff className="h-2.5 w-2.5" /> unlisted
                        </Badge>
                      )}
                    </div>
                    {h.title && <p className="text-xs text-muted-foreground">{h.title}</p>}
                    {h.credentials && h.credentials.length > 0 && (
                      <p className="text-[11px] text-muted-foreground/70">
                        {h.credentials.join(" · ")}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => { setEditingId(h.id); setCreating(false); setDraft(fromHost(h)); }}
                  >
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      // Hosts cascade off their offerings, so this removes them
                      // from every schedule they're on. Unlisting is the softer
                      // move and the form offers it.
                      if (
                        window.confirm(
                          `Remove ${h.name}? They'll come off every offering they're leading. To hide them instead, edit and turn off "Listed".`,
                        )
                      ) {
                        remove.mutate(h.id);
                      }
                    }}
                    data-testid={`button-delete-host-${h.slug}`}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-destructive/70" />
                  </Button>
                </div>
              </div>
            ),
          )}
        </div>
      ) : (
        !creating && (
          <p className="text-sm text-muted-foreground py-12 text-center">
            Nobody yet. Add whoever is giving the first talk.
          </p>
        )
      )}
    </div>
  );
}
