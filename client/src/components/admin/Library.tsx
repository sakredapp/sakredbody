/**
 * Admin — the Library.
 *
 * The routes for this existed and nothing rendered them, so guides could be
 * read by members and created by nobody. This is the missing half.
 *
 * ── A guide is a shell and an order of sections ───────────────────────────
 *
 * The book row carries the cover and the access rule; the sections carry the
 * words. They are edited on one screen because the order of sections *is* the
 * book, and a separate screen for them would mean holding that order in your
 * head while you navigate.
 *
 * ── Section content is HTML, and that is a real decision ──────────────────
 *
 * It is rendered directly by the reader. That is safe here and only here,
 * because the only people who can write it are admins — the same trust level
 * as someone with database access. Nothing a member writes ever reaches this
 * field. The community's search snippets went the opposite way for exactly
 * this reason: that text is member input, so it produces no HTML at all.
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
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { InfoTip } from "@/components/ui/info-tip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, ChevronDown, BookOpen, GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";

interface Ebook {
  id: string;
  title: string;
  subtitle: string | null;
  author: string | null;
  description: string | null;
  coverUrl: string | null;
  routineId: string | null;
  priceCents: number | null;
  accessMode: string;
  readingMinutes: number | null;
  isFeatured: boolean;
  isPublished: boolean;
  sortOrder: number;
}

interface Section {
  id: string;
  ebookId: string;
  title: string;
  content: string | null;
  audioUrl: string | null;
  orderIndex: number;
  isFree: boolean;
}

const ACCESS_MODES = [
  { value: "membership", label: "Included with membership" },
  { value: "purchase", label: "Bought separately" },
  { value: "coaching", label: "Granted by a coach" },
];

const EMPTY = {
  title: "",
  subtitle: "",
  author: "",
  description: "",
  accessMode: "membership",
  isPublished: false,
};

export function LibraryAdmin() {
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState({ ...EMPTY });
  const [openBook, setOpenBook] = useState<string | null>(null);
  const { toast } = useToast();
  const qc = useQueryClient();

  const books = useQuery<Ebook[]>({
    queryKey: ["/api/admin/library/ebooks"],
    queryFn: async () => {
      const res = await fetch("/api/admin/library/ebooks", { credentials: "include" });
      if (!res.ok) throw new Error("Couldn't load the library");
      return res.json();
    },
  });

  const create = useMutation({
    mutationFn: async () => apiRequest("POST", "/api/admin/library/ebooks", draft),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/library/ebooks"] });
      setDraft({ ...EMPTY });
      setCreating(false);
      toast({ title: "Guide created" });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const save = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      apiRequest("PUT", `/api/admin/library/ebooks/${id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/library/ebooks"] });
      toast({ title: "Saved" });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/admin/library/ebooks/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/library/ebooks"] });
      setOpenBook(null);
      toast({ title: "Deleted" });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const list = books.data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-1">
          <h2 className="font-display text-2xl">The Library</h2>
          <p className="text-sm text-muted-foreground">
            Guides, and the sections inside them.
          </p>
        </div>
        <Button onClick={() => setCreating(!creating)} data-testid="button-new-ebook">
          <Plus className="h-4 w-4 mr-1.5" />
          New guide
        </Button>
      </div>

      {/* ── New ───────────────────────────────────────────────────────────── */}
      {creating && (
        <div className="border border-border/60 rounded-lg p-4 space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Title</Label>
              <Input
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                placeholder="The 28-Day Reset"
                data-testid="input-ebook-title"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Subtitle</Label>
              <Input
                value={draft.subtitle}
                onChange={(e) => setDraft({ ...draft, subtitle: e.target.value })}
                placeholder="Why it works, and what to expect"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Description</Label>
            <Textarea
              value={draft.description}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              rows={3}
            />
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Author</Label>
              <Input
                value={draft.author}
                onChange={(e) => setDraft({ ...draft, author: e.target.value })}
                placeholder="Sakred Body"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs flex items-center gap-1.5">
                Access
                <InfoTip label="About access" title="Who can read it">
                  Included means any member holding the tier can read it. Bought
                  separately means they need an entitlement. Granted by a coach is
                  never purchasable — it only appears when someone gives it.
                </InfoTip>
              </Label>
              <Select
                value={draft.accessMode}
                onValueChange={(v) => setDraft({ ...draft, accessMode: v })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ACCESS_MODES.map((m) => (
                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              onClick={() => create.mutate()}
              disabled={!draft.title.trim() || create.isPending}
              className="bg-gold border-gold-border text-white"
            >
              Create
            </Button>
            <Button variant="outline" onClick={() => setCreating(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {/* ── The shelf ─────────────────────────────────────────────────────── */}
      {books.isLoading ? (
        <div className="space-y-2">
          {[1, 2].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
        </div>
      ) : list.length === 0 ? (
        <div className="text-center py-12 space-y-2">
          <BookOpen className="h-6 w-6 mx-auto text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            No guides yet. The Library tab is empty for members until there is one.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {list.map((b) => (
            <div key={b.id} className="border border-border/60 rounded-lg overflow-hidden">
              <button
                onClick={() => setOpenBook(openBook === b.id ? null : b.id)}
                className="w-full flex items-center gap-3 p-3 text-left hover:bg-muted/40 transition-colors tap-clean"
                data-testid={`ebook-row-${b.id}`}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm truncate">{b.title}</p>
                  {b.subtitle && (
                    <p className="text-xs text-muted-foreground truncate">{b.subtitle}</p>
                  )}
                </div>
                {b.isFeatured && <Badge variant="secondary" className="text-[10px]">Featured</Badge>}
                <Badge variant={b.isPublished ? "secondary" : "outline"} className="text-xs shrink-0">
                  {b.isPublished ? "Published" : "Draft"}
                </Badge>
                <ChevronDown
                  className={cn(
                    "h-4 w-4 text-muted-foreground shrink-0 transition-transform",
                    openBook === b.id && "rotate-180",
                  )}
                />
              </button>

              {openBook === b.id && (
                <div className="border-t border-border/60 p-4 space-y-5 bg-muted/20">
                  <div className="grid sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Title</Label>
                      <Input
                        defaultValue={b.title}
                        onBlur={(e) =>
                          e.target.value !== b.title &&
                          save.mutate({ id: b.id, body: { title: e.target.value } })
                        }
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Subtitle</Label>
                      <Input
                        defaultValue={b.subtitle ?? ""}
                        onBlur={(e) =>
                          e.target.value !== (b.subtitle ?? "") &&
                          save.mutate({ id: b.id, body: { subtitle: e.target.value || null } })
                        }
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs">Description</Label>
                    <Textarea
                      defaultValue={b.description ?? ""}
                      rows={3}
                      onBlur={(e) =>
                        e.target.value !== (b.description ?? "") &&
                        save.mutate({ id: b.id, body: { description: e.target.value || null } })
                      }
                    />
                  </div>

                  <div className="grid sm:grid-cols-3 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Cover image URL</Label>
                      <Input
                        defaultValue={b.coverUrl ?? ""}
                        placeholder="/images/…"
                        onBlur={(e) =>
                          e.target.value !== (b.coverUrl ?? "") &&
                          save.mutate({ id: b.id, body: { coverUrl: e.target.value || null } })
                        }
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Reading minutes</Label>
                      <Input
                        type="number"
                        defaultValue={b.readingMinutes ?? ""}
                        onBlur={(e) =>
                          save.mutate({
                            id: b.id,
                            body: { readingMinutes: e.target.value ? Number(e.target.value) : null },
                          })
                        }
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Access</Label>
                      <Select
                        defaultValue={b.accessMode}
                        onValueChange={(v) => save.mutate({ id: b.id, body: { accessMode: v } })}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {ACCESS_MODES.map((m) => (
                            <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-6">
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={b.isPublished}
                        onCheckedChange={(v) => save.mutate({ id: b.id, body: { isPublished: v } })}
                        data-testid={`switch-published-${b.id}`}
                      />
                      <Label className="text-xs">Published</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={b.isFeatured}
                        onCheckedChange={(v) => save.mutate({ id: b.id, body: { isFeatured: v } })}
                      />
                      <Label className="text-xs">Featured</Label>
                    </div>
                  </div>

                  <Sections ebookId={b.id} />

                  <Grants ebookId={b.id} accessMode={b.accessMode} />

                  <div className="pt-3 border-t border-border/60">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => {
                        if (confirm(`Delete "${b.title}" and all its sections? This can't be undone.`))
                          remove.mutate(b.id);
                      }}
                      data-testid={`button-delete-ebook-${b.id}`}
                    >
                      <Trash2 className="h-4 w-4 mr-1.5" />
                      Delete guide
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * The sections of one guide.
 *
 * Its own component so each open book fetches its own sections rather than
 * the shelf loading every section of every guide to render a list of titles.
 */
function Sections({ ebookId }: { ebookId: string }) {
  const [title, setTitle] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const { toast } = useToast();
  const qc = useQueryClient();
  const key = ["/api/admin/library/ebooks", ebookId, "sections"];

  const sections = useQuery<Section[]>({
    queryKey: key,
    queryFn: async () => {
      const res = await fetch(`/api/admin/library/ebooks/${ebookId}/sections`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Couldn't load sections");
      return res.json();
    },
  });

  const list = sections.data ?? [];

  const add = useMutation({
    mutationFn: async () =>
      apiRequest("POST", `/api/admin/library/ebooks/${ebookId}/sections`, {
        title,
        // Appended, not inserted — a new section belongs at the end until
        // somebody moves it, and guessing otherwise reorders the book.
        orderIndex: list.length,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key });
      setTitle("");
      toast({ title: "Section added" });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const save = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      apiRequest("PUT", `/api/admin/library/sections/${id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key });
      toast({ title: "Section saved" });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/admin/library/sections/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key });
      toast({ title: "Section removed" });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-3 pt-3 border-t border-border/60">
      <div className="flex items-center gap-2">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">Sections</p>
        <InfoTip label="About sections" title="Order is the book">
          Sections read in the order below. Mark one free to use it as a sample
          chapter — it stays readable without an entitlement, which is how somebody
          decides whether to buy the rest.
        </InfoTip>
      </div>

      {sections.isLoading ? (
        <Skeleton className="h-10 w-full" />
      ) : list.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No sections yet. A guide with none has nothing to read.
        </p>
      ) : (
        <div className="space-y-2">
          {list.map((s, i) => (
            <div key={s.id} className="border border-border/50 rounded-md">
              <div className="flex items-center gap-2 p-2">
                <GripVertical className="h-4 w-4 text-muted-foreground/40 shrink-0" />
                <span className="text-xs text-muted-foreground w-5 shrink-0">{i + 1}</span>
                <Input
                  defaultValue={s.title}
                  onBlur={(e) =>
                    e.target.value !== s.title &&
                    save.mutate({ id: s.id, body: { title: e.target.value } })
                  }
                  className="h-8 text-sm"
                />
                {s.isFree && <Badge variant="secondary" className="text-[10px] shrink-0">Free</Badge>}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditing(editing === s.id ? null : s.id)}
                  className="shrink-0 text-xs"
                >
                  {editing === s.id ? "Close" : "Text"}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 text-destructive hover:text-destructive"
                  onClick={() => confirm(`Remove "${s.title}"?`) && remove.mutate(s.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>

              {editing === s.id && (
                <div className="p-3 pt-0 space-y-3">
                  <Textarea
                    defaultValue={s.content ?? ""}
                    rows={12}
                    className="font-mono text-xs"
                    placeholder="<p>The section text. HTML is allowed here — this is admin content, rendered directly by the reader.</p>"
                    onBlur={(e) =>
                      e.target.value !== (s.content ?? "") &&
                      save.mutate({ id: s.id, body: { content: e.target.value } })
                    }
                    data-testid={`textarea-section-${s.id}`}
                  />
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={s.isFree}
                      onCheckedChange={(v) => save.mutate({ id: s.id, body: { isFree: v } })}
                    />
                    <Label className="text-xs">Readable without buying — the sample chapter</Label>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="New section title"
          className="h-9"
          onKeyDown={(e) => {
            if (e.key === "Enter" && title.trim()) add.mutate();
          }}
          data-testid="input-new-section"
        />
        <Button
          size="sm"
          variant="outline"
          disabled={!title.trim() || add.isPending}
          onClick={() => add.mutate()}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

/**
 * Who has been given this guide.
 *
 * An entitlement is a row saying a specific member may read a specific guide.
 * It exists separately from their tier on purpose — the schema comment puts it
 * best: revoking a membership shouldn't take back a coach's gift.
 *
 * ── The list stores ids, so the names are joined here ─────────────────────
 *
 * `GET /api/admin/library/grants/:ebookId` returns entitlement rows, which
 * carry a `userId` and nothing else. Rendering that directly would be a list
 * of UUIDs, which is not a list of people. The members endpoint is already
 * loaded elsewhere in this portal and cached by React Query under the same
 * key, so resolving names costs nothing and the join happens once, here,
 * rather than becoming a second shape the API has to maintain.
 */
function Grants({ ebookId, accessMode }: { ebookId: string; accessMode: string }) {
  const [picked, setPicked] = useState("");
  const [source, setSource] = useState("coaching");
  const { toast } = useToast();
  const qc = useQueryClient();
  const key = ["/api/admin/library/grants", ebookId];

  const grants = useQuery<Array<{ id: string; userId: string; source: string; grantedAt: string | null }>>({
    queryKey: key,
    queryFn: async () => {
      const res = await fetch(`/api/admin/library/grants/${ebookId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Couldn't load who has this");
      return res.json();
    },
  });

  const members = useQuery<Array<{ id: string; email: string | null; firstName: string | null; lastName: string | null }>>({
    queryKey: ["/api/admin/members", ""],
    queryFn: async () => {
      const res = await fetch("/api/admin/members", { credentials: "include" });
      if (!res.ok) throw new Error("Couldn't load members");
      return res.json();
    },
  });

  const nameOf = (userId: string) => {
    const m = members.data?.find((x) => x.id === userId);
    if (!m) return userId.slice(0, 8);
    return [m.firstName, m.lastName].filter(Boolean).join(" ").trim() || m.email || userId.slice(0, 8);
  };

  const grant = useMutation({
    mutationFn: async () =>
      apiRequest("POST", "/api/admin/library/grants", { userId: picked, ebookId, source }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key });
      setPicked("");
      toast({ title: "Granted" });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const revoke = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/admin/library/grants/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key });
      toast({ title: "Revoked" });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const list = grants.data ?? [];
  // Somebody who already holds it shouldn't be offerable again — the endpoint
  // treats a repeat grant as success rather than an error, so the only way to
  // avoid a confusing no-op is to not offer it.
  const held = new Set(list.map((g) => g.userId));
  const available = (members.data ?? []).filter((m) => !held.has(m.id));

  return (
    <div className="space-y-3 pt-3 border-t border-border/60">
      <div className="flex items-center gap-2">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">Who has it</p>
        <InfoTip label="About grants" title="Separate from their tier">
          A grant is one member, one guide. It survives a tier change on purpose —
          revoking a membership shouldn't take back something a coach gave. For a
          guide included with membership this is only needed as an exception.
        </InfoTip>
      </div>

      {accessMode === "membership" && (
        <p className="text-xs text-muted-foreground">
          This guide is included with membership, so most people can already read it
          without appearing here.
        </p>
      )}

      {grants.isLoading ? (
        <Skeleton className="h-10 w-full" />
      ) : list.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nobody has been granted this yet.</p>
      ) : (
        <div className="space-y-1.5">
          {list.map((g) => (
            <div
              key={g.id}
              className="flex items-center gap-2 border border-border/50 rounded-md px-3 py-2"
            >
              <span className="text-sm flex-1 truncate">{nameOf(g.userId)}</span>
              <Badge variant="outline" className="text-[10px] shrink-0">{g.source}</Badge>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0 text-destructive hover:text-destructive"
                onClick={() => revoke.mutate(g.id)}
                data-testid={`button-revoke-${g.id}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Select value={picked} onValueChange={setPicked}>
          <SelectTrigger className="flex-1 min-w-[180px]" data-testid="select-grant-member">
            <SelectValue placeholder="Give it to someone" />
          </SelectTrigger>
          <SelectContent>
            {available.length === 0 ? (
              <div className="px-2 py-3 text-sm text-muted-foreground">
                Everyone already has it.
              </div>
            ) : (
              available.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {[m.firstName, m.lastName].filter(Boolean).join(" ") || m.email}
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>

        <Select value={source} onValueChange={setSource}>
          <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {["coaching", "gift", "purchase", "membership"].map((s) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          variant="outline"
          disabled={!picked || grant.isPending}
          onClick={() => grant.mutate()}
          data-testid="button-grant"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
