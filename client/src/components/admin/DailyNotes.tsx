/**
 * Admin — the daily note review queue.
 *
 * A model writes something to a paying member every morning. This is where you
 * read what it actually said.
 *
 * The whole reason notes are stored rather than streamed: generated copy that
 * nobody can read after the fact is copy nobody can be accountable for. This
 * screen exists so that before there are $10k clients reading these, there is
 * someone who has read them first.
 *
 * Defaults to unreviewed, because a queue that opens on everything is a queue
 * nobody works through.
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Flag, Check, RefreshCw, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DailyNote } from "@shared/schema";

/** The API returns the note plus who it went to, joined. */
interface NoteRow {
  note: DailyNote;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
}

type Filter = "unreviewed" | "flagged" | "fallback" | "all";

const FILTERS: { key: Filter; label: string; hint: string }[] = [
  { key: "unreviewed", label: "Unreviewed", hint: "Nobody has read these yet" },
  { key: "flagged", label: "Flagged", hint: "Marked as wrong" },
  { key: "fallback", label: "Fallback", hint: "The model failed and computed text went out" },
  { key: "all", label: "All", hint: "Everything, newest first" },
];

function recipient(row: NoteRow): string {
  const name = [row.firstName, row.lastName].filter(Boolean).join(" ").trim();
  return name || row.email || "a member";
}

function NoteCard({ row }: { row: NoteRow }) {
  const note = row.note;
  const qc = useQueryClient();
  const { toast } = useToast();
  const [flagNote, setFlagNote] = useState(note.flagNote ?? "");
  const [showFlag, setShowFlag] = useState(false);

  const refresh = () => qc.invalidateQueries({ queryKey: ["/api/admin/daily/notes"] });

  const patch = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiRequest("PATCH", `/api/admin/daily/notes/${note.id}`, body).then((r) => r.json()),
    onSuccess: refresh,
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const regenerate = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/admin/daily/notes/${note.id}/regenerate`).then((r) => r.json()),
    onSuccess: () => {
      toast({ title: "Rewritten", description: "The member sees the new one on next load." });
      refresh();
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  return (
    <div
      className={cn(
        "border rounded-md p-5 space-y-4",
        note.flagged ? "border-destructive/50 bg-destructive/5" : "border-border/60",
      )}
      data-testid={`admin-note-${note.id}`}
    >
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-1 min-w-0">
          <p className="text-xs text-muted-foreground">
            {note.onDate} · {recipient(row)}
          </p>
          <h4 className="font-display text-lg leading-tight">{note.headline}</h4>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap shrink-0">
          {/* Source is the single most useful signal here — a run of "fallback"
              means the model or Bedrock is down, not that the copy is bad. */}
          <Badge variant={note.source === "model" ? "outline" : "secondary"} className="text-[10px]">
            {note.source}
          </Badge>
          {note.flagged && (
            <Badge variant="destructive" className="text-[10px]">flagged</Badge>
          )}
          {note.reviewedAt && (
            <Badge variant="outline" className="text-[10px] gap-1">
              <Check className="h-2.5 w-2.5" /> read
            </Badge>
          )}
        </div>
      </div>

      <p className="text-[15px] leading-relaxed whitespace-pre-wrap">{note.body}</p>

      {note.invitation && (
        <p className="text-sm text-[hsl(var(--gold))] leading-relaxed">{note.invitation}</p>
      )}

      {note.flagNote && !showFlag && (
        <p className="text-xs text-destructive/80 border-l-2 border-destructive/40 pl-3">
          {note.flagNote}
        </p>
      )}

      {showFlag && (
        <div className="flex gap-2">
          <Input
            value={flagNote}
            onChange={(e) => setFlagNote(e.target.value)}
            placeholder="What's wrong with it?"
            autoFocus
            data-testid="input-flag-note"
          />
          <Button
            size="sm"
            variant="destructive"
            onClick={() => {
              patch.mutate({ flagged: true, flagNote: flagNote.trim() || null });
              setShowFlag(false);
            }}
          >
            Flag
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setShowFlag(false)}>
            Cancel
          </Button>
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap pt-1">
        {!note.reviewedAt && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => patch.mutate({ reviewed: true })}
            disabled={patch.isPending}
            data-testid="button-mark-read"
          >
            <Check className="h-3.5 w-3.5 mr-1.5" /> Read it
          </Button>
        )}

        {note.flagged ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => patch.mutate({ flagged: false, flagNote: null })}
            disabled={patch.isPending}
          >
            Unflag
          </Button>
        ) : (
          !showFlag && (
            <Button size="sm" variant="ghost" onClick={() => setShowFlag(true)} data-testid="button-flag">
              <Flag className="h-3.5 w-3.5 mr-1.5" /> Flag
            </Button>
          )
        )}

        {/* Regeneration is synchronous and can take up to ~25 seconds, so the
            button says so rather than looking hung. */}
        <Button
          size="sm"
          variant="ghost"
          onClick={() => regenerate.mutate()}
          disabled={regenerate.isPending}
          data-testid="button-regenerate"
        >
          {regenerate.isPending ? (
            <>
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Rewriting…
            </>
          ) : (
            <>
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Rewrite
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

export function DailyNotesAdmin() {
  const [filter, setFilter] = useState<Filter>("unreviewed");

  // `unreviewed` isn't a server filter — the endpoint takes flagged/source/
  // since — so it's applied here over the same 200-row window.
  const query = useQuery<NoteRow[]>({
    queryKey: ["/api/admin/daily/notes", filter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filter === "flagged") params.set("flagged", "true");
      if (filter === "fallback") params.set("source", "fallback");
      const qs = params.toString();
      const res = await fetch(`/api/admin/daily/notes${qs ? `?${qs}` : ""}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load the notes");
      return res.json();
    },
  });

  const rows = (query.data ?? []).filter((r) =>
    filter === "unreviewed" ? !r.note.reviewedAt : true,
  );

  const active = FILTERS.find((f) => f.key === filter)!;

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="font-display text-2xl">Daily notes</h2>
        <p className="text-sm text-muted-foreground">
          What members were actually told, in their own timezone's morning.
        </p>
      </div>

      <div className="space-y-2">
        <div className="flex gap-1 overflow-x-auto scrollbar-thin">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={cn(
                "px-3 py-1.5 text-sm rounded-md whitespace-nowrap transition-colors",
                filter === f.key
                  ? "bg-[hsl(var(--gold))]/15 text-[hsl(var(--gold))] font-medium"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
              )}
              data-testid={`filter-notes-${f.key}`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground/70">{active.hint}</p>
      </div>

      {query.isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-40 w-full" />
          ))}
        </div>
      ) : query.isError ? (
        <p className="text-sm text-destructive py-12 text-center">
          Couldn't load the notes.
        </p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground py-16 text-center">
          {filter === "unreviewed"
            ? "Nothing waiting to be read."
            : filter === "flagged"
              ? "Nothing flagged."
              : filter === "fallback"
                ? "Every note this window came from the model."
                : "No notes have been written yet."}
        </p>
      ) : (
        <div className="space-y-4">
          {rows.map((row) => (
            <NoteCard key={row.note.id} row={row} />
          ))}
        </div>
      )}
    </div>
  );
}
