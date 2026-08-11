/**
 * Choose which part of the photo is the photo.
 *
 * An avatar is a square and a phone camera is not, so somebody uploading a
 * portrait got a centre crop that cut their head off about half the time. The
 * fix is not clever cropping — it is showing them the square and letting them
 * move it, which takes four seconds and is never wrong.
 *
 * ── Why it also resizes ───────────────────────────────────────────────────
 *
 * The output is 512px of JPEG, around 60KB, down from the four to eight
 * megabytes a modern phone produces. That is the difference between an upload
 * that finishes before somebody looks up and one that doesn't finish at all on
 * a bad connection — on the single screen where they are deciding whether this
 * app is any good.
 *
 * It also fixes HEIC, quietly. Safari can decode HEIC into an <img>, so
 * drawing it to a canvas and reading it back as JPEG converts a format most
 * things can't display into one everything can, without a library.
 *
 * ── The maths ─────────────────────────────────────────────────────────────
 *
 * One transform, applied twice: once as CSS for the preview and once to the
 * canvas for the output. Deriving the export from the same numbers the member
 * was looking at is what guarantees they get the crop they saw — computing it
 * separately is how a preview and a result drift apart.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

/** The square the member manipulates, in CSS pixels. */
const VIEW = 260;
/** What we actually store. Renders at 32–96px; 512 is generous already. */
const OUTPUT = 512;

type Placement = { zoom: number; ox: number; oy: number };

export function PhotoCrop({
  file,
  saving,
  onCancel,
  onConfirm,
}: {
  file: File;
  saving: boolean;
  onCancel: () => void;
  /** A square JPEG, ready to upload. */
  onConfirm: (cropped: File) => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [place, setPlace] = useState<Placement>({ zoom: 1, ox: 0, oy: 0 });
  const imgRef = useRef<HTMLImageElement | null>(null);
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  // An object URL rather than a FileReader: no base64 round trip, and the
  // browser decodes straight from the file. Revoked on unmount or the tab
  // holds every photo they tried.
  useEffect(() => {
    const next = URL.createObjectURL(file);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);

  /** Smallest scale that still covers the square — the floor for zoom. */
  const base = natural ? Math.max(VIEW / natural.w, VIEW / natural.h) : 1;
  const k = base * place.zoom;
  const drawnW = natural ? natural.w * k : 0;
  const drawnH = natural ? natural.h * k : 0;

  /** Keep the square covered. Without this you can drag the face off the edge. */
  const clamp = useCallback(
    (p: Placement, w: number, h: number): Placement => ({
      zoom: p.zoom,
      ox: Math.min(0, Math.max(VIEW - w, p.ox)),
      oy: Math.min(0, Math.max(VIEW - h, p.oy)),
    }),
    [],
  );

  const onLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const el = e.currentTarget;
    const w = el.naturalWidth;
    const h = el.naturalHeight;
    setNatural({ w, h });
    const b = Math.max(VIEW / w, VIEW / h);
    // Open centred, which is right far more often than any other default.
    setPlace({ zoom: 1, ox: (VIEW - w * b) / 2, oy: (VIEW - h * b) / 2 });
  };

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, ox: place.ox, oy: place.oy };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || !natural) return;
    setPlace((p) =>
      clamp({ ...p, ox: d.ox + (e.clientX - d.x), oy: d.oy + (e.clientY - d.y) }, drawnW, drawnH),
    );
  };

  const endDrag = () => {
    drag.current = null;
  };

  /**
   * Zoom about the centre of the square rather than the top-left.
   *
   * Scaling from the origin walks whatever they framed off toward a corner,
   * which feels like the control is fighting them.
   */
  const setZoom = (zoom: number) => {
    if (!natural) return;
    setPlace((p) => {
      const oldK = base * p.zoom;
      const newK = base * zoom;
      const cx = (VIEW / 2 - p.ox) / oldK;
      const cy = (VIEW / 2 - p.oy) / oldK;
      return clamp(
        { zoom, ox: VIEW / 2 - cx * newK, oy: VIEW / 2 - cy * newK },
        natural.w * newK,
        natural.h * newK,
      );
    });
  };

  const confirm = () => {
    const img = imgRef.current;
    if (!img || !natural) return;

    const canvas = document.createElement("canvas");
    canvas.width = OUTPUT;
    canvas.height = OUTPUT;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // JPEG has no alpha, so anything transparent would come out black.
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, OUTPUT, OUTPUT);

    // The same placement the member was looking at, scaled from the preview
    // square to the output square. One source of truth for both.
    const f = OUTPUT / VIEW;
    ctx.drawImage(img, place.ox * f, place.oy * f, drawnW * f, drawnH * f);

    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        onConfirm(new File([blob], "avatar.jpg", { type: "image/jpeg" }));
      },
      "image/jpeg",
      0.85,
    );
  };

  return (
    <div className="space-y-4" data-testid="photo-crop">
      <div
        className="relative mx-auto overflow-hidden rounded-full border border-[hsl(var(--gold))]/25 bg-black touch-none select-none"
        style={{ width: VIEW, height: VIEW }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        {url && (
          <img
            ref={imgRef}
            src={url}
            alt=""
            onLoad={onLoad}
            draggable={false}
            className="absolute origin-top-left max-w-none"
            style={{
              width: drawnW || undefined,
              height: drawnH || undefined,
              transform: `translate(${place.ox}px, ${place.oy}px)`,
              // Hidden until measured, or it flashes at natural size first.
              visibility: natural ? "visible" : "hidden",
            }}
          />
        )}
      </div>

      <div className="space-y-1">
        <input
          type="range"
          min={1}
          max={3}
          step={0.01}
          value={place.zoom}
          onChange={(e) => setZoom(Number(e.target.value))}
          className="w-full accent-[hsl(var(--gold))]"
          aria-label="Zoom"
          data-testid="photo-zoom"
        />
        <p className="text-[11px] text-muted-foreground text-center">
          Drag to move, slide to zoom.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Button onClick={confirm} disabled={saving || !natural} data-testid="photo-confirm">
          {saving ? "Uploading…" : "Use this photo"}
        </Button>
        <Button variant="ghost" onClick={onCancel} className="text-muted-foreground">
          Choose another
        </Button>
      </div>
    </div>
  );
}
