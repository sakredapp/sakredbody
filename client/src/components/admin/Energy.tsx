/**
 * Admin — The Body, and the frequencies.
 *
 * Both had complete APIs and no screen. The nine energy centres are the only
 * seeded content in the whole database, which is why The Body is currently
 * the one member screen that looks finished — and until now the only way to
 * change a word of it was SQL.
 *
 * ── Two things on one screen ──────────────────────────────────────────────
 *
 * Frequencies live here rather than under Daily Notes because a frequency's
 * most useful field is the centre it pairs with. Editing them next to the
 * centres means that pairing is a choice you can see, instead of a foreign
 * key you have to remember.
 *
 * ── The wording rule, enforced by the placeholders ────────────────────────
 *
 * `whenBlocked` and `whenFlowing` describe what a member *notices*, never
 * what is wrong with them. "Thinking feels loud" is the register; "your crown
 * chakra is imbalanced" is not, and would turn a reading tool into a
 * diagnosis. The placeholders below carry that rule so it survives whoever
 * writes the next one.
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
import { Plus, Trash2, ChevronDown, Music } from "lucide-react";
import { cn } from "@/lib/utils";

interface Centre {
  id: string;
  name: string;
  aspect: string | null;
  bodyRegion: string | null;
  element: string | null;
  colorHex: string | null;
  description: string | null;
  whenBlocked: string | null;
  whenFlowing: string | null;
  axisPosition: number;
  sortOrder: number;
  isActive?: boolean;
}

interface Frequency {
  id: string;
  name: string;
  hz: number | null;
  description: string | null;
  audioUrl: string;
  durationSeconds: number | null;
  moment: string;
  centreId: string | null;
  sortOrder: number;
  isActive?: boolean;
}

const ELEMENTS = ["earth", "water", "fire", "air", "ether"];
const MOMENTS = [
  { value: "waking", label: "On waking" },
  { value: "practice", label: "During practice" },
  { value: "evening", label: "Evening" },
  { value: "anytime", label: "Anytime" },
];

export function EnergyAdmin() {
  const [view, setView] = useState<"centres" | "frequencies">("centres");

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="font-display text-2xl">The Body</h2>
        <p className="text-sm text-muted-foreground">
          The centres members read themselves against, and the tones that pair with them.
        </p>
      </div>

      <div className="flex gap-2">
        <Button
          variant={view === "centres" ? "default" : "outline"}
          onClick={() => setView("centres")}
          data-testid="button-view-centres"
        >
          Centres
        </Button>
        <Button
          variant={view === "frequencies" ? "default" : "outline"}
          onClick={() => setView("frequencies")}
          data-testid="button-view-frequencies"
        >
          Frequencies
        </Button>
      </div>

      {view === "centres" ? <Centres /> : <Frequencies />}
    </div>
  );
}

function Centres() {
  const [open, setOpen] = useState<string | null>(null);
  const { toast } = useToast();
  const qc = useQueryClient();

  const centres = useQuery<Centre[]>({
    queryKey: ["/api/admin/energy/centres"],
    queryFn: async () => {
      const res = await fetch("/api/admin/energy/centres", { credentials: "include" });
      if (!res.ok) throw new Error("Couldn't load the centres");
      return res.json();
    },
  });

  const save = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      apiRequest("PUT", `/api/admin/energy/centres/${id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/energy/centres"] });
      toast({ title: "Saved" });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const list = centres.data ?? [];

  if (centres.isLoading) {
    return <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full" />)}</div>;
  }

  return (
    <div className="space-y-2">
      {list.map((c) => (
        <div key={c.id} className="border border-border/60 rounded-lg overflow-hidden">
          <button
            onClick={() => setOpen(open === c.id ? null : c.id)}
            className="w-full flex items-center gap-3 p-3 text-left hover:bg-muted/40 transition-colors tap-clean"
            data-testid={`centre-row-${c.id}`}
          >
            <span
              className="h-3 w-3 rounded-full shrink-0 border border-border"
              style={c.colorHex ? { background: c.colorHex } : undefined}
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm">{c.name}</p>
              <p className="text-xs text-muted-foreground truncate">
                {c.aspect} · {c.bodyRegion}
              </p>
            </div>
            {c.element && (
              <Badge variant="outline" className="text-[10px] shrink-0">{c.element}</Badge>
            )}
            <ChevronDown
              className={cn(
                "h-4 w-4 text-muted-foreground shrink-0 transition-transform",
                open === c.id && "rotate-180",
              )}
            />
          </button>

          {open === c.id && (
            <div className="border-t border-border/60 p-4 space-y-4 bg-muted/20">
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Name</Label>
                  <Input
                    defaultValue={c.name}
                    onBlur={(e) =>
                      e.target.value !== c.name && save.mutate({ id: c.id, body: { name: e.target.value } })
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs flex items-center gap-1.5">
                    Aspect
                    <InfoTip label="About aspect" title="One word">
                      "Clarity". "Ground". A single word, because the voice here bans
                      explanatory subtitles — a centre called Root followed by "your
                      foundation of safety" is exactly the thing to avoid.
                    </InfoTip>
                  </Label>
                  <Input
                    defaultValue={c.aspect ?? ""}
                    onBlur={(e) =>
                      e.target.value !== (c.aspect ?? "") &&
                      save.mutate({ id: c.id, body: { aspect: e.target.value || null } })
                    }
                  />
                </div>
              </div>

              <div className="grid sm:grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Body region</Label>
                  <Input
                    defaultValue={c.bodyRegion ?? ""}
                    placeholder="pelvic floor"
                    onBlur={(e) =>
                      e.target.value !== (c.bodyRegion ?? "") &&
                      save.mutate({ id: c.id, body: { bodyRegion: e.target.value || null } })
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Element</Label>
                  <Select
                    defaultValue={c.element ?? undefined}
                    onValueChange={(v) => save.mutate({ id: c.id, body: { element: v } })}
                  >
                    <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>
                      {ELEMENTS.map((e) => (
                        <SelectItem key={e} value={e}>{e}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs flex items-center gap-1.5">
                    Axis position
                    <InfoTip label="About axis position" title="Down the figure">
                      A percentage from the top: 0 is the crown, 100 the feet. It places
                      the centre on the body map, so the order on screen follows this
                      rather than the sort order.
                    </InfoTip>
                  </Label>
                  <Input
                    type="number"
                    defaultValue={c.axisPosition}
                    onBlur={(e) =>
                      Number(e.target.value) !== c.axisPosition &&
                      save.mutate({ id: c.id, body: { axisPosition: Number(e.target.value) } })
                    }
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Description</Label>
                <Textarea
                  defaultValue={c.description ?? ""}
                  rows={2}
                  placeholder="Where attention rests when nothing is pulling at it."
                  onBlur={(e) =>
                    e.target.value !== (c.description ?? "") &&
                    save.mutate({ id: c.id, body: { description: e.target.value || null } })
                  }
                />
              </div>

              <div className="grid sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs flex items-center gap-1.5">
                    When it's held
                    <InfoTip label="About this wording" title="What they notice">
                      Describe what a member notices, never what is wrong with them.
                      "Thinking feels loud" is the register. Anything that reads as a
                      diagnosis turns a reading tool into a medical claim.
                    </InfoTip>
                  </Label>
                  <Textarea
                    defaultValue={c.whenBlocked ?? ""}
                    rows={3}
                    placeholder="Thinking feels loud. Decisions take longer than they should."
                    onBlur={(e) =>
                      e.target.value !== (c.whenBlocked ?? "") &&
                      save.mutate({ id: c.id, body: { whenBlocked: e.target.value || null } })
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">When it moves</Label>
                  <Textarea
                    defaultValue={c.whenFlowing ?? ""}
                    rows={3}
                    placeholder="Quiet behind the eyes. Choices arrive already made."
                    onBlur={(e) =>
                      e.target.value !== (c.whenFlowing ?? "") &&
                      save.mutate({ id: c.id, body: { whenFlowing: e.target.value || null } })
                    }
                  />
                </div>
              </div>

              <div className="space-y-1.5 max-w-[200px]">
                <Label className="text-xs">Colour</Label>
                <div className="flex gap-2 items-center">
                  <Input
                    defaultValue={c.colorHex ?? ""}
                    placeholder="#b8925a"
                    onBlur={(e) =>
                      e.target.value !== (c.colorHex ?? "") &&
                      save.mutate({ id: c.id, body: { colorHex: e.target.value || null } })
                    }
                  />
                  <span
                    className="h-9 w-9 rounded-md border border-border shrink-0"
                    style={c.colorHex ? { background: c.colorHex } : undefined}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function Frequencies() {
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState({ name: "", hz: "", audioUrl: "", moment: "anytime" });
  const { toast } = useToast();
  const qc = useQueryClient();

  const freqs = useQuery<Frequency[]>({
    queryKey: ["/api/admin/frequencies"],
    queryFn: async () => {
      const res = await fetch("/api/admin/frequencies", { credentials: "include" });
      if (!res.ok) throw new Error("Couldn't load frequencies");
      return res.json();
    },
  });

  const centres = useQuery<Centre[]>({
    queryKey: ["/api/admin/energy/centres"],
    queryFn: async () => {
      const res = await fetch("/api/admin/energy/centres", { credentials: "include" });
      if (!res.ok) throw new Error("Couldn't load the centres");
      return res.json();
    },
  });

  const create = useMutation({
    mutationFn: async () =>
      apiRequest("POST", "/api/admin/frequencies", {
        name: draft.name,
        hz: draft.hz ? Number(draft.hz) : null,
        audioUrl: draft.audioUrl,
        moment: draft.moment,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/frequencies"] });
      setDraft({ name: "", hz: "", audioUrl: "", moment: "anytime" });
      setCreating(false);
      toast({ title: "Frequency added" });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const save = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      apiRequest("PUT", `/api/admin/frequencies/${id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/frequencies"] });
      toast({ title: "Saved" });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/admin/frequencies/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/frequencies"] });
      toast({ title: "Removed" });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const list = freqs.data ?? [];
  const centreList = centres.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setCreating(!creating)} data-testid="button-new-frequency">
          <Plus className="h-4 w-4 mr-1.5" />
          New frequency
        </Button>
      </div>

      {creating && (
        <div className="border border-border/60 rounded-lg p-4 space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Name</Label>
              <Input
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="Ground"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs flex items-center gap-1.5">
                Hz
                <InfoTip label="About Hz" title="Optional">
                  432, 528, 396. Leave it empty for anything not pitched to a single
                  tone — a soundscape doesn't have one.
                </InfoTip>
              </Label>
              <Input
                type="number"
                value={draft.hz}
                onChange={(e) => setDraft({ ...draft, hz: e.target.value })}
                placeholder="432"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Audio URL</Label>
            <Input
              value={draft.audioUrl}
              onChange={(e) => setDraft({ ...draft, audioUrl: e.target.value })}
              placeholder="https://…/tone.mp3"
            />
          </div>
          <div className="flex gap-2">
            <Button
              onClick={() => create.mutate()}
              disabled={!draft.name.trim() || !draft.audioUrl.trim() || create.isPending}
              className="bg-gold border-gold-border text-white"
            >
              Create
            </Button>
            <Button variant="outline" onClick={() => setCreating(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {freqs.isLoading ? (
        <Skeleton className="h-20 w-full" />
      ) : list.length === 0 ? (
        <div className="text-center py-10 space-y-2">
          <Music className="h-6 w-6 mx-auto text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No frequencies yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {list.map((f) => (
            <div key={f.id} className="border border-border/60 rounded-lg p-3 space-y-3">
              <div className="grid sm:grid-cols-4 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Name</Label>
                  <Input
                    defaultValue={f.name}
                    onBlur={(e) =>
                      e.target.value !== f.name && save.mutate({ id: f.id, body: { name: e.target.value } })
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Hz</Label>
                  <Input
                    type="number"
                    defaultValue={f.hz ?? ""}
                    onBlur={(e) =>
                      save.mutate({ id: f.id, body: { hz: e.target.value ? Number(e.target.value) : null } })
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Moment</Label>
                  <Select
                    defaultValue={f.moment}
                    onValueChange={(v) => save.mutate({ id: f.id, body: { moment: v } })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {MOMENTS.map((m) => (
                        <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Pairs with</Label>
                  <Select
                    defaultValue={f.centreId ?? undefined}
                    onValueChange={(v) => save.mutate({ id: f.id, body: { centreId: v } })}
                  >
                    <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>
                      {centreList.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Audio URL</Label>
                <Input
                  defaultValue={f.audioUrl}
                  onBlur={(e) =>
                    e.target.value !== f.audioUrl &&
                    save.mutate({ id: f.id, body: { audioUrl: e.target.value } })
                  }
                />
              </div>

              <div className="flex justify-end">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={() => confirm(`Remove "${f.name}"?`) && remove.mutate(f.id)}
                >
                  <Trash2 className="h-4 w-4 mr-1.5" />
                  Remove
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
