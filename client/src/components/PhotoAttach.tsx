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

export type PhotoAttachment = { assetId: string; previewUrl: string };

export function PhotoAttach({
  purpose,
  attached,
  onAttached,
  onCleared,
  disabled = false,
  label = "Add a photo",
  className,
}: {
  purpose: "room" | "progress";
  attached: PhotoAttachment | null;
  onAttached: (photo: PhotoAttachment) => void;
  onCleared: () => void;
  disabled?: boolean;
  label?: string;
  className?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [preparing, setPreparing] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /* The blob URL outlives the render that made it, so it is revoked by hand. */
  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  const choose = async (file: File) => {
    setError(null);
    setPreparing(true);
    let prepared: Preparation | null = null;
    try {
      prepared = await prepareImage(file);
      /* Shown before the upload starts — this is the whole point. */
      setPreview(prepared.previewUrl);
      const assetId = await uploadPrepared(prepared, purpose);
      onAttached({ assetId, previewUrl: prepared.previewUrl });
    } catch (err) {
      if (prepared) URL.revokeObjectURL(prepared.previewUrl);
      setPreview(null);
      setError(err instanceof Error ? err.message : "That photo couldn't be added");
    } finally {
      setPreparing(false);
      /* Cleared so choosing the same file twice fires a change event. */
      if (input.current) input.current.value = "";
    }
  };

  const clear = () => {
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    setError(null);
    onCleared();
  };

  const shown = attached?.previewUrl ?? preview;

  return (
    <div className={cn("space-y-2", className)}>
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

      {shown ? (
        <div className="relative inline-block">
          <img
            src={shown}
            alt="The photo you're about to share"
            className="h-24 w-24 rounded-lg object-cover"
            data-testid="img-photo-preview"
          />
          {preparing && (
            <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-background/70 text-[10px] text-foreground/80">
              Sending…
            </div>
          )}
          <button
            type="button"
            onClick={clear}
            aria-label="Remove this photo"
            className="absolute -right-2 -top-2 rounded-full bg-background/80 p-1 text-foreground/70 hover:text-foreground"
            data-testid="button-photo-remove"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ) : (
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
