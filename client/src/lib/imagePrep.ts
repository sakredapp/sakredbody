/**
 * Turning what a phone camera produced into what Sakred actually needs.
 *
 * ── The number this exists for ────────────────────────────────────────────
 *
 * A recent iPhone photograph is 4032 × 3024 and four to eight megabytes. The
 * widest place Sakred renders one is about 1280 device pixels. Uploading the
 * original therefore sends roughly ten times the data for an image nobody can
 * see the difference in — on a phone, on cellular, while somebody stands in a
 * gym waiting to find out whether the app is any good.
 *
 * Preparation happens locally and takes tens of milliseconds. The upload after
 * it is a tenth the size. That is the entire trade.
 *
 * ── Three things happen at once, and only one is about speed ──────────────
 *
 *   · **Orientation is normalized.** A phone held sideways writes upright
 *     pixels plus an EXIF tag saying "rotate this". `createImageBitmap` with
 *     `imageOrientation: "from-image"` applies the tag, so what we store is
 *     what they saw. Without it, half of all photographs arrive on their side.
 *
 *   · **Metadata is gone.** Not stripped — never carried. Drawing to a canvas
 *     and reading it back produces a new file containing pixels and nothing
 *     else, so the GPS coordinates that name the room somebody photographed
 *     themselves in are dropped by construction rather than by a filter that
 *     can miss a tag. This is the part that matters most and costs nothing.
 *
 *   · **Size comes down.** Two derivatives, sized for the two places an image
 *     is actually rendered.
 *
 * ── Why WebP with a JPEG fallback ─────────────────────────────────────────
 *
 * WebP is roughly 30% smaller at the same quality and every browser and both
 * shells decode it. `canvas.toBlob` silently falls back to PNG when asked for
 * a format it cannot encode — which would be *larger* than the original — so
 * the result is checked rather than assumed, and JPEG is used when it is not
 * what came back.
 *
 * ── HEIC ──────────────────────────────────────────────────────────────────
 *
 * Handled for free on the platforms that produce it: Safari and the iOS
 * WebView decode HEIC natively, so the bitmap step converts it to something
 * everything can display without a library. A HEIC file opened in desktop
 * Chrome will fail to decode — that is reported honestly rather than uploading
 * a file the rest of the product cannot show.
 */

import { VARIANT_MAX_EDGE, type MediaVariant } from "@shared/models/media";

export type PreparedImage = {
  variant: MediaVariant;
  blob: Blob;
  width: number;
  height: number;
};

export type Preparation = {
  /** Ready to upload, smallest first. */
  variants: PreparedImage[];
  /**
   * A local URL for the display image, valid immediately.
   *
   * The caller shows this the moment preparation finishes and revokes it when
   * the component unmounts. It is the same pixels the upload will carry, so
   * the preview never changes when the real image arrives.
   */
  previewUrl: string;
  /** Non-sensitive measurements, for telemetry. Dimensions and bytes only. */
  source: { width: number; height: number; bytes: number };
  prepareMs: number;
};

export class ImagePrepError extends Error {
  constructor(readonly code: "DECODE" | "ENCODE", message: string) {
    super(message);
  }
}

/**
 * Decode a file into pixels, upright.
 *
 * `createImageBitmap` where it exists — it decodes off the main thread, which
 * is the difference between a smooth sheet and a locked one on a mid-range
 * Android. The `<img>` path is the fallback for older WebViews; it does not
 * honour `imageOrientation`, so rotation is read from the file separately
 * there.
 */
async function decode(file: File): Promise<{ bitmap: ImageBitmap | HTMLImageElement; width: number; height: number }> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      return { bitmap, width: bitmap.width, height: bitmap.height };
    } catch {
      /* Fall through — some WebViews reject the options bag rather than ignore it. */
    }
    try {
      const bitmap = await createImageBitmap(file);
      return { bitmap, width: bitmap.width, height: bitmap.height };
    } catch {
      /* Fall through to the <img> path. */
    }
  }

  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new ImagePrepError("DECODE", "That image couldn't be read"));
      el.src = url;
    });
    return { bitmap: img, width: img.naturalWidth, height: img.naturalHeight };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Encode a canvas, preferring WebP and verifying we actually got it. */
async function encode(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  const webp = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/webp", quality));
  if (webp && webp.type === "image/webp") return webp;
  const jpeg = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", quality));
  if (jpeg && jpeg.type === "image/jpeg") return jpeg;
  throw new ImagePrepError("ENCODE", "That image couldn't be prepared");
}

/**
 * The size one variant should be: the longest edge capped, aspect kept, and
 * never enlarged. A 200px photograph stays 200px rather than being blown up
 * into a bigger file that shows less.
 */
function fit(width: number, height: number, maxEdge: number) {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/**
 * Quality per variant, chosen for what each one is for.
 *
 * A thumbnail is rendered at 96–160 CSS pixels and compresses hard without
 * anyone noticing; the display image is the one somebody looks at, and a
 * progress photograph three months apart is a comparison, so it gets room.
 */
const QUALITY: Record<MediaVariant, number> = { thumb: 0.72, display: 0.86 };

export async function prepareImage(file: File): Promise<Preparation> {
  const startedAt = performance.now();
  const { bitmap, width, height } = await decode(file);

  const variants: PreparedImage[] = [];
  let display: Blob | null = null;

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new ImagePrepError("ENCODE", "That image couldn't be prepared");

  for (const variant of ["thumb", "display"] as const) {
    const size = fit(width, height, VARIANT_MAX_EDGE[variant]);
    canvas.width = size.width;
    canvas.height = size.height;
    /*
      Cleared explicitly. The canvas is reused between variants and a smaller
      second pass would otherwise leave the first one's pixels around the edge
      of a transparent image.
    */
    ctx.clearRect(0, 0, size.width, size.height);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap as CanvasImageSource, 0, 0, size.width, size.height);

    const blob = await encode(canvas, QUALITY[variant]);
    variants.push({ variant, blob, width: size.width, height: size.height });
    if (variant === "display") display = blob;
  }

  if ("close" in bitmap && typeof bitmap.close === "function") bitmap.close();
  if (!display) throw new ImagePrepError("ENCODE", "That image couldn't be prepared");

  return {
    variants,
    previewUrl: URL.createObjectURL(display),
    source: { width, height, bytes: file.size },
    prepareMs: Math.round(performance.now() - startedAt),
  };
}

/**
 * Send a prepared image and get back the id everything else references.
 *
 * Both derivatives in one request: an asset with a display image and no
 * thumbnail is a broken tile in every list, and two requests can half-succeed.
 */
export async function uploadPrepared(
  prepared: Preparation,
  purpose: "room" | "progress",
): Promise<string> {
  const form = new FormData();
  form.append("purpose", purpose);
  form.append("sourceWidth", String(prepared.source.width));
  form.append("sourceHeight", String(prepared.source.height));
  form.append("sourceBytes", String(prepared.source.bytes));
  form.append("prepareMs", String(prepared.prepareMs));
  for (const v of prepared.variants) {
    const ext = v.blob.type === "image/webp" ? "webp" : "jpg";
    form.append(v.variant, v.blob, `${v.variant}.${ext}`);
  }

  const res = await fetch("/api/media", { method: "POST", body: form, credentials: "include" });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { message?: string } | null;
    throw new Error(body?.message ?? "That image couldn't be uploaded");
  }
  const { assetId } = (await res.json()) as { assetId: string };
  return assetId;
}
