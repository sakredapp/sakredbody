/**
 * A face, instead of two letters.
 *
 * The avatar in the header was initials on a grey circle for everyone, which
 * is what an app looks like before anyone has bothered with it. This is a
 * small thing that makes the product feel occupied.
 *
 * Skippable without ceremony: initials are a perfectly good fallback and
 * nothing downstream depends on a photo existing. The one thing worth getting
 * right is that the member sees the crop before it is uploaded, because an
 * avatar is square and phone photos are not.
 */

import { useRef, useState } from "react";
import { Camera, X } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { PhotoCrop } from "./PhotoCrop";

export function PhotoStep({
  initials,
  currentUrl,
  saving,
  error,
  onUpload,
  onSkip,
}: {
  initials: string;
  currentUrl?: string | null;
  saving: boolean;
  error?: string | null;
  onUpload: (file: File) => void;
  onSkip: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  // A local object URL so the member sees their own face immediately rather
  // than after a round trip. Revoked when replaced, or the browser holds every
  // image they tried.
  const [preview, setPreview] = useState<string | null>(null);
  /**
   * Held rather than uploaded on selection.
   *
   * The note at the top of this file always claimed the member sees the crop
   * before it is uploaded, and for a long while that was aspirational — the
   * file went straight up and got a centre crop, which cuts the top off a
   * portrait about half the time.
   */
  const [cropping, setCropping] = useState<File | null>(null);

  const choose = (file: File | undefined) => {
    if (!file) return;
    setCropping(file);
  };

  const shown = preview ?? currentUrl ?? null;

  if (cropping) {
    return (
      <PhotoCrop
        file={cropping}
        saving={saving}
        onCancel={() => {
          setCropping(null);
          if (input.current) input.current.value = "";
        }}
        onConfirm={(cropped) => {
          setPreview((old) => {
            if (old) URL.revokeObjectURL(old);
            return URL.createObjectURL(cropped);
          });
          setCropping(null);
          // Cleared so picking the same file again still fires `change`.
          if (input.current) input.current.value = "";
          onUpload(cropped);
        }}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col items-center gap-3">
        <button
          type="button"
          onClick={() => input.current?.click()}
          className="relative rounded-full tap-clean group"
          data-testid="photo-pick"
        >
          <Avatar className="w-24 h-24 border border-[hsl(var(--gold))]/25">
            {shown && <AvatarImage src={shown} alt="" className="object-cover" />}
            <AvatarFallback className="text-xl">{initials}</AvatarFallback>
          </Avatar>
          <span className="absolute bottom-0 right-0 h-7 w-7 rounded-full bg-[hsl(var(--gold))] grid place-items-center">
            <Camera className="h-3.5 w-3.5 text-[hsl(var(--ink))]" />
          </span>
        </button>

        {shown && (
          <button
            type="button"
            onClick={() => {
              setPreview((old) => {
                if (old) URL.revokeObjectURL(old);
                return null;
              });
              if (input.current) input.current.value = "";
            }}
            className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
          >
            <X className="h-3 w-3" /> Choose another
          </button>
        )}

        {/* `capture` is deliberately absent: it forces the camera on some
            Android builds, and most people want the photo they already like
            rather than one taken at this moment. */}
        <input
          ref={input}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
          className="hidden"
          onChange={(e) => choose(e.target.files?.[0])}
          data-testid="photo-input"
        />
      </div>

      {error && <p className="text-[11px] text-destructive text-center">{error}</p>}

      <div className="flex flex-col gap-2">
        <Button onClick={() => input.current?.click()} disabled={saving} data-testid="photo-upload">
          {saving ? "Uploading…" : shown ? "Choose a different photo" : "Choose a photo"}
        </Button>
        <Button variant="ghost" onClick={onSkip} className="text-muted-foreground">
          {shown && !saving ? "Continue" : "Skip for now"}
        </Button>
      </div>
    </div>
  );
}
