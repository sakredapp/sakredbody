/**
 * Attaching a photograph: pick it, see it immediately, upload it quietly.
 *
 * ── The order matters ─────────────────────────────────────────────────────
 *
 * The preview appears the moment preparation finishes — tens of milliseconds,
 * not the length of an upload. Everything after that happens behind the
 * thumbnail they are already looking at, so the wait for the network is spent
 * writing a caption rather than staring at a spinner.
 *
 * The preview is the *prepared* image, not the original. Showing the original
 * and uploading a resized one means the picture can visibly change after they
 * committed to it, which reads as the app doing something to their photo.
 *
 * ── Why this is controlled, and why that was a bug ────────────────────────
 *
 * This used to keep its own `preview` state alongside the `attached` prop and
 * render `attached?.previewUrl ?? preview`. Two sources for one fact, and the
 * fallback outlived the prop: The Room cleared `attached` after a successful
 * post, `preview` was untouched, and the photograph stayed in the composer
 * looking like it was about to be posted a second time. Reported from a phone,
 * and the same shape of stale state was reachable from every other consumer.
 *
 * So the attachment lives entirely in the parent. There is nothing here to go
 * out of date: when the parent lets go of it, it is gone.
 *
 * `assetId: null` means prepared and still uploading. The preview is real, the
 * upload is not finished, and a composer must not publish yet — which is a
 * state the old shape could not express, so a fast tap could post a message
 * referring to an asset that did not exist.
 *
 * ── Failure has to be recoverable ─────────────────────────────────────────
 *
 * If the upload fails the attachment is dropped and said so, rather than
 * leaving a thumbnail attached to nothing — a member who sends anyway would
 * post a message whose picture never existed.
 */

import { useEffect, useRef, useState } from "react";
import { ImagePlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { prepareImage, uploadPrepared, type Preparation } from "@/lib/imagePrep";
import { cn } from "@/lib/utils";

export type PhotoAttachment = {
  /** Null while the prepared image is still uploading. */
  assetId: string | null;
  previewUrl: string;
};

/** Ready to be published — prepared, uploaded, and with an id to refer to. */
export function photoReady(photo: PhotoAttachment | null): boolean {
  return !!photo?.assetId;
}

/** Attached but not yet uploaded. A composer should wait rather than refuse. */
export function photoPending(photo: PhotoAttachment | null): boolean {
  return !!photo && !photo.assetId;
}

/**
 * The picture inside the draft that will publish it.
 *
 * Rendered by the caller rather than by the button, because where it belongs
 * is a question about their layout: in The Room it sits inside the composer,
 * so the attachment visibly belongs to the message being written instead of
 * floating between the buttons and the feed.
 *
 * `object-contain` under a max height, not a square crop. The old preview was
 * `h-24 w-24 object-cover`, which cut a portrait photograph down to its middle
 * — the member's own picture, altered by the app, before they had agreed to
 * anything. Portrait stays portrait.
 */
export function PhotoDraft({
  photo,
  onRemove,
  className,
}: {
  photo: PhotoAttachment;
  onRemove: () => void;
  className?: string;
}) {
  return (
    <div className={cn("relative inline-block", className)} data-testid="photo-draft">
      <img
        src={photo.previewUrl}
        alt="The photo you're about to share"
        className="max-h-40 w-auto max-w-full rounded-lg object-contain"
        data-testid="img-photo-preview"
      />
      {!photo.assetId && (
        <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-background/70 text-[10px] text-foreground/80">
          Sending…
        </div>
      )}
      <button
        type="button"
        onClick={onRemove}
        aria-label="Remove this photo"
        className="absolute -right-2 -top-2 rounded-full bg-background/80 p-1 text-foreground/70 hover:text-foreground"
        data-testid="button-photo-remove"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

export function PhotoAttach({
  purpose,
  attached,
  onAttached,
  onCleared,
  disabled = false,
  label = "Add a photo",
  className,
  /**
   * Where the preview goes.
   *
   * "inline" keeps it beside the button, which is right for a screen whose
   * whole subject is the photograph. "none" means the caller is rendering
   * `PhotoDraft` somewhere that says more — inside the composer, for a
   * message the picture is part of.
   */
  preview = "inline",
}: {
  purpose: "room" | "progress";
  attached: PhotoAttachment | null;
  onAttached: (photo: PhotoAttachment) => void;
  onCleared: () => void;
  disabled?: boolean;
  label?: string;
  className?: string;
  preview?: "inline" | "none";
}) {
  const input = useRef<HTMLInputElement>(null);
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /*
    The blob URL outlives the render that made it, so it is revoked by hand —
    and the parent owns it now, so this only sweeps up what is still attached
    when the whole control goes away. `clear` and a failed `choose` revoke
    their own.
  */
  const live = useRef<string | null>(null);
  live.current = attached?.previewUrl ?? null;
  useEffect(() => {
    return () => {
      if (live.current) URL.revokeObjectURL(live.current);
    };
  }, []);

  const choose = async (file: File) => {
    setError(null);
    setPreparing(true);
    let prepared: Preparation | null = null;
    try {
      prepared = await prepareImage(file);
      /* Shown before the upload starts — this is the whole point. */
      onAttached({ assetId: null, previewUrl: prepared.previewUrl });
      const assetId = await uploadPrepared(prepared, purpose);
      onAttached({ assetId, previewUrl: prepared.previewUrl });
    } catch (err) {
      if (prepared) URL.revokeObjectURL(prepared.previewUrl);
      onCleared();
      setError(err instanceof Error ? err.message : "That photo couldn't be added");
    } finally {
      setPreparing(false);
      /*
        Cleared so choosing the same file twice fires a change event. Without
        this, removing a photo and picking the identical one does nothing at
        all — the input's value never changed, so `onchange` never runs.
      */
      if (input.current) input.current.value = "";
    }
  };

  const clear = () => {
    if (attached) URL.revokeObjectURL(attached.previewUrl);
    setError(null);
    if (input.current) input.current.value = "";
    onCleared();
  };

  return (
    <div className={cn(preview === "inline" ? "space-y-2" : "", className)}>
      <input
        ref={input}
        type="file"
        /*
          `image/*` rather than a list, so the phone offers Camera as well as
          the library — a narrower accept collapses iOS to the photo picker
          alone, which is the wrong default for a workout somebody just
          finished.
        */
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void choose(file);
        }}
        data-testid={`input-photo-${purpose}`}
      />

      {preview === "inline" && attached ? (
        <PhotoDraft photo={attached} onRemove={clear} />
      ) : attached && preview === "none" ? null : (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={disabled || preparing}
          onClick={() => input.current?.click()}
          data-testid={`button-photo-${purpose}`}
        >
          <ImagePlus className="mr-1.5 h-4 w-4" />
          {preparing ? "Preparing…" : label}
        </Button>
      )}

      {error && <p className="text-[11px] text-destructive">{error}</p>}
    </div>
  );
}
