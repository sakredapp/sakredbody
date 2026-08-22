/**
 * The photographs a member keeps of their own body.
 *
 * ── Why this is a separate surface from the Room ──────────────────────────
 *
 * Because the two are opposite decisions that look identical in a file picker.
 * Posting to the Room is showing people; a progress photo is the thing you
 * take *instead*, over months, so that a change too slow to feel is visible.
 * The only other person who ever sees one is a coach the member has, and the
 * screen says so before they choose the file rather than after.
 *
 * ── The sentence under the button is the feature ──────────────────────────
 *
 * "Visible to you and your active coach" / "Visible only to you". It changes
 * with the truth of the member's arrangement, because a fixed line would be
 * wrong for half the people reading it — and being wrong about who can see a
 * photograph of somebody's body is not a copy defect.
 */

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { Panel } from "@/components/portal/Panel";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MediaImage } from "@/components/MediaImage";
import { PhotoAttach, type PhotoAttachment } from "@/components/PhotoAttach";
import { useToast } from "@/hooks/use-toast";
import { formatLocalDateString } from "@shared/utils/dates";

export type ProgressPhoto = {
  id: string;
  assetId: string;
  onDate: string;
  note: string | null;
  createdAt: string | null;
};

const KEY = ["/api/progress-photos"];

async function readJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error("Couldn't load your photos");
  return res.json();
}

export function useProgressPhotos() {
  return useQuery<ProgressPhoto[]>({ queryKey: KEY, queryFn: () => readJson(KEY[0]) });
}

/** A day's photograph, as one tile. Thumbnails, because a timeline is a list. */
function Tile({
  photo,
  onOpen,
  onDelete,
}: {
  photo: ProgressPhoto;
  onOpen: () => void;
  onDelete?: () => void;
}) {
  return (
    <figure className="space-y-1">
      <MediaImage
        assetId={photo.assetId}
        variant="thumb"
        alt={`Progress photo from ${photo.onDate}`}
        aspect="3 / 4"
        onClick={onOpen}
      />
      <figcaption className="flex items-baseline gap-1">
        <span className="text-[11px] tabular-nums text-muted-foreground/80">{photo.onDate}</span>
        {onDelete && (
          <button
            onClick={onDelete}
            aria-label="Delete this photo"
            className="ml-auto text-muted-foreground/50 hover:text-destructive"
            data-testid={`button-delete-photo-${photo.id}`}
          >
            <Trash2 className="h-3 w-3" />
          </button>
        )}
      </figcaption>
      {photo.note && (
        <p className="text-[11px] leading-snug text-muted-foreground/70">{photo.note}</p>
      )}
    </figure>
  );
}

/**
 * The member's own timeline, with the place to add to it.
 *
 * `hasCoach` is passed in rather than fetched here so the sentence about who
 * can see the photograph is answered by whatever screen already knows — this
 * component never guesses at it, and a missing answer says the safer of the
 * two things.
 */
export function ProgressPhotos({ hasCoach = false }: { hasCoach?: boolean }) {
  const photos = useProgressPhotos();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [adding, setAdding] = useState(false);
  const [photo, setPhoto] = useState<PhotoAttachment | null>(null);
  const [note, setNote] = useState("");
  const [open, setOpen] = useState<ProgressPhoto | null>(null);

  const save = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/progress-photos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ assetId: photo?.assetId, note: note.trim() || undefined }),
      });
      if (!res.ok) throw new Error("That photo couldn't be saved");
      return res.json();
    },
    onSuccess: () => {
      setAdding(false);
      setPhoto(null);
      setNote("");
      qc.invalidateQueries({ queryKey: KEY });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/progress-photos/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("That photo couldn't be deleted");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const visibility = hasCoach
    ? "Visible to you and your active coach."
    : "Visible only to you.";

  return (
    <Panel title="Progress photos">
      <p className="text-[11px] text-muted-foreground/70" data-testid="text-photo-visibility">
        {visibility}
      </p>

      {adding ? (
        <div className="mt-3 space-y-3">
          <PhotoAttach
            purpose="progress"
            attached={photo}
            onAttached={setPhoto}
            onCleared={() => setPhoto(null)}
            disabled={save.isPending}
            label="Choose or take a photo"
          />
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Anything worth remembering about today (optional)"
            rows={2}
            maxLength={1000}
            className="resize-none min-h-0"
            data-testid="input-progress-note"
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => save.mutate()}
              disabled={!photo || save.isPending}
              data-testid="button-save-progress-photo"
            >
              {save.isPending ? "Saving…" : "Keep it"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button
          size="sm"
          variant="outline"
          className="mt-3"
          onClick={() => setAdding(true)}
          data-testid="button-add-progress-photo"
        >
          Add a progress photo
        </Button>
      )}

      {photos.data && photos.data.length > 0 && (
        <div className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-4">
          {photos.data.map((p) => (
            <Tile
              key={p.id}
              photo={p}
              onOpen={() => setOpen(p)}
              onDelete={() => remove.mutate(p.id)}
            />
          ))}
        </div>
      )}

      {photos.data && photos.data.length === 0 && !adding && (
        <p className="mt-3 text-[11px] text-muted-foreground/60">
          Nothing here yet. A photograph every few weeks shows a change too slow to feel.
        </p>
      )}

      {/*
        Opened full size on tap. A plain overlay rather than a dialog component:
        the only interaction is closing it, and a photograph of somebody's body
        should not arrive wrapped in chrome.
      */}
      {open && (
        <div
          className="fixed inset-0 z-[10002] grid place-items-center bg-background/95 p-6"
          onClick={() => setOpen(null)}
          data-testid="overlay-progress-photo"
        >
          <div className="w-full max-w-md space-y-2">
            <MediaImage
              assetId={open.assetId}
              variant="display"
              alt={`Progress photo from ${open.onDate}`}
              aspect="3 / 4"
            />
            <p className="text-xs text-muted-foreground">
              {formatLocalDateString(new Date(`${open.onDate}T12:00:00`))}
              {open.note ? ` · ${open.note}` : ""}
            </p>
          </div>
        </div>
      )}
    </Panel>
  );
}
