/**
 * The shareable card.
 *
 * Draws a win onto a canvas at story size and hands back a PNG. Photograph,
 * darkened toward the bottom, the thing you finished set in the display face,
 * and the handle.
 *
 * ── Why canvas and not html2canvas ────────────────────────────────────────
 *
 * A screenshot library renders the DOM, which means the card would inherit the
 * app's layout, the viewport width, and whatever the device's pixel ratio
 * happens to be. This is going on someone's story at 1080×1920 regardless of
 * the phone it was made on, so it is drawn at that size directly. It also
 * means no dependency and no cross-origin taint.
 *
 * ── The one thing that can go wrong ───────────────────────────────────────
 *
 * Fonts. Canvas silently falls back to a system face if the family isn't
 * loaded yet, and the card would ship in Helvetica without erroring. So this
 * waits on `document.fonts` and verifies before drawing.
 */

import { WIN_IMAGES, winHeadline, winCaption, type WinKind } from "@shared/models/wins";

const W = 1080;
const H = 1920;

const GOLD = "#C9A45C";
const INK = "#1A1917";

export interface WinCardInput {
  kind: WinKind;
  props: Record<string, unknown>;
  /** Falls back to the kind's default photograph. */
  imageUrl?: string | null;
  earnedAt?: string | null;
  /** Shown small at the bottom. */
  handle?: string;
}

/**
 * Wait for the brand faces, and say whether they actually arrived.
 *
 * `document.fonts.load` resolves whether or not the face exists, so `check`
 * is what actually answers the question.
 */
async function ensureFonts(): Promise<boolean> {
  if (!("fonts" in document)) return false;
  try {
    await Promise.all([
      document.fonts.load('700 96px "Playfair Display"'),
      document.fonts.load('400 32px "DM Sans"'),
    ]);
    await document.fonts.ready;
    return (
      document.fonts.check('700 96px "Playfair Display"') &&
      document.fonts.check('400 32px "DM Sans"')
    );
  } catch {
    return false;
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    // Same-origin in practice (/images/...), but a routine's cover could be
    // remote — asking for CORS keeps the canvas untainted so toBlob still works.
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Couldn't load ${src}`));
    img.src = src;
  });
}

/** Cover-fit: fill the frame, crop the overflow, never distort. */
function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement) {
  const scale = Math.max(W / img.width, H / img.height);
  const w = img.width * scale;
  const h = img.height * scale;
  // Biased slightly above centre — faces and horizons sit high in these frames,
  // and the bottom third is about to be covered by type anyway.
  ctx.drawImage(img, (W - w) / 2, (H - h) * 0.35, w, h);
}

/** Wrap to a width, and never exceed `maxLines` — the headline must not run. */
function wrap(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";

  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth || !line) {
      line = candidate;
    } else {
      lines.push(line);
      line = word;
      if (lines.length === maxLines) break;
    }
  }
  if (lines.length < maxLines && line) lines.push(line);

  // Ellipsis rather than silent truncation, so a too-long name reads as
  // shortened rather than as a mistake.
  if (lines.length === maxLines) {
    const last = lines[maxLines - 1];
    if (words.join(" ").length > lines.join(" ").length) {
      lines[maxLines - 1] = `${last.replace(/[,\s]+$/, "")}…`;
    }
  }
  return lines;
}

function letterspaced(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  spacing: number,
) {
  let cursor = x;
  for (const ch of text) {
    ctx.fillText(ch, cursor, y);
    cursor += ctx.measureText(ch).width + spacing;
  }
}

function measureLetterspaced(
  ctx: CanvasRenderingContext2D,
  text: string,
  spacing: number,
): number {
  let total = 0;
  for (const ch of text) total += ctx.measureText(ch).width + spacing;
  return total - spacing;
}

/**
 * Draw the card.
 *
 * Returns a PNG blob. Throws only if the photograph can't be loaded — a
 * missing font degrades to a system face rather than failing, because a card
 * in the wrong typeface still beats no card.
 */
export async function renderWinCard(input: WinCardInput): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is unavailable on this device");

  const [hasFonts, img] = await Promise.all([
    ensureFonts(),
    loadImage(input.imageUrl || WIN_IMAGES[input.kind]),
  ]);

  const display = hasFonts ? '"Playfair Display", Georgia, serif' : "Georgia, serif";
  const body = hasFonts ? '"DM Sans", system-ui, sans-serif' : "system-ui, sans-serif";

  // ── Photograph ───────────────────────────────────────────────────────────
  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, W, H);
  drawCover(ctx, img);

  // ── The dark it sits on ──────────────────────────────────────────────────
  //
  // Two gradients rather than one flat scrim: the bottom carries the type and
  // needs to be near-solid, while the top only needs enough to hold the kicker.
  const bottom = ctx.createLinearGradient(0, H * 0.35, 0, H);
  bottom.addColorStop(0, "rgba(26,25,23,0)");
  bottom.addColorStop(0.55, "rgba(26,25,23,0.82)");
  bottom.addColorStop(1, "rgba(26,25,23,0.97)");
  ctx.fillStyle = bottom;
  ctx.fillRect(0, H * 0.35, W, H * 0.65);

  const top = ctx.createLinearGradient(0, 0, 0, H * 0.28);
  top.addColorStop(0, "rgba(26,25,23,0.72)");
  top.addColorStop(1, "rgba(26,25,23,0)");
  ctx.fillStyle = top;
  ctx.fillRect(0, 0, W, H * 0.28);

  const M = 96; // margin

  // ── Kicker ───────────────────────────────────────────────────────────────
  ctx.font = `500 26px ${body}`;
  ctx.fillStyle = "rgba(255,255,255,0.72)";
  ctx.textBaseline = "alphabetic";
  letterspaced(ctx, "SAKRED BODY", M, 150, 7);

  // ── The win ──────────────────────────────────────────────────────────────
  const headline = winHeadline(input.kind, input.props);
  const caption = input.props.caption
    ? String(input.props.caption)
    : winCaption(input.kind, input.props);

  // Step the size down for a long name rather than wrapping to four lines.
  const size = headline.length > 34 ? 84 : headline.length > 20 ? 104 : 124;
  ctx.font = `700 ${size}px ${display}`;
  const lines = wrap(ctx, headline, W - M * 2, 3);

  const lineHeight = size * 1.08;
  let y = H - 300 - (lines.length - 1) * lineHeight;

  // A thin gold rule opens it, the same way the site's sections do.
  ctx.fillStyle = GOLD;
  ctx.fillRect(M, y - size - 46, 72, 3);

  ctx.fillStyle = "#FFFFFF";
  for (const line of lines) {
    ctx.fillText(line, M, y);
    y += lineHeight;
  }

  // ── Caption ──────────────────────────────────────────────────────────────
  ctx.font = `400 34px ${body}`;
  ctx.fillStyle = "rgba(255,255,255,0.78)";
  ctx.fillText(caption, M, y + 18);

  // ── Date and handle ──────────────────────────────────────────────────────
  const when = input.earnedAt ? new Date(input.earnedAt) : new Date();
  const dateText = Number.isNaN(when.getTime())
    ? ""
    : when.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });

  ctx.font = `400 28px ${body}`;
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.fillText(dateText, M, H - 120);

  const handle = input.handle ?? "@sakredbody";
  ctx.font = `500 28px ${body}`;
  ctx.fillStyle = GOLD;
  const handleWidth = measureLetterspaced(ctx, handle, 3);
  letterspaced(ctx, handle, W - M - handleWidth, H - 120, 3);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Couldn't make the image"))),
      "image/png",
    );
  });
}

/**
 * Put the card in front of the member.
 *
 * Prefers the native share sheet, which on a phone is what someone actually
 * wants — it goes straight into Instagram or Messages rather than into a
 * downloads folder they then have to find. Falls back to a download on
 * desktop, where there is no share sheet.
 */
export async function shareOrDownloadWinCard(
  blob: Blob,
  filename: string,
): Promise<"shared" | "downloaded"> {
  const file = new File([blob], filename, { type: "image/png" });

  // `canShare` with the file is the only reliable test — `share` exists on
  // desktop Safari too, but rejects files.
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return "shared";
    } catch (err) {
      // A cancelled share sheet is not a failure, and must not fall through to
      // a surprise download.
      if (err instanceof Error && err.name === "AbortError") return "shared";
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  // Revoked on the next tick — immediately would race the download starting.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return "downloaded";
}
