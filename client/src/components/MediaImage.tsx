/**
 * An image that had to be authorized before it could be drawn.
 *
 * ── Why not just `<img src="/api/media/...">` ─────────────────────────────
 *
 * Because that works in the browser and silently fails in the app. `<img>`
 * sends cookies, which is the whole mechanism on the web — but the native
 * shells authenticate with a bearer token in a header, and an image element
 * carries no headers. A progress photograph would render on a laptop and be a
 * grey box on the phone the member actually uses.
 *
 * The alternative the codebase already uses for avatars — an unguessable token
 * in the path — is fine for something shown to everybody and wrong for this.
 * So the bytes are fetched through the authenticated door and handed to the
 * element as a blob URL.
 *
 * ── The cost, and what pays it back ───────────────────────────────────────
 *
 * No HTTP cache across reloads. That is why the thumbnail exists: a coach's
 * client list fetches forty images of twenty kilobytes rather than forty of
 * three hundred. Within a session the blob URLs are cached here by asset and
 * variant, so scrolling a timeline re-renders without re-fetching, and
 * `loading="lazy"` means the ones below the fold are never fetched at all.
 */

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { MediaVariant } from "@shared/models/media";

/**
 * Blob URLs by `assetId/variant`, for the life of the tab.
 *
 * Module scope rather than component state: the point is that navigating away
 * from the Room and back does not re-download every photograph. They are never
 * revoked, which is deliberate — a revoked URL that something is still holding
 * renders as a broken image, and the cost of keeping them is bounded by the
 * number of distinct images somebody looked at in one sitting, at thumbnail
 * size.
 */
const cache = new Map<string, string>();
const inflight = new Map<string, Promise<string>>();

async function load(assetId: string, variant: MediaVariant): Promise<string> {
  const key = `${assetId}/${variant}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const existing = inflight.get(key);
  if (existing) return existing;

  const request = (async () => {
    const res = await fetch(`/api/media/${assetId}/${variant}`, { credentials: "include" });
    if (!res.ok) throw new Error(String(res.status));
    const url = URL.createObjectURL(await res.blob());
    cache.set(key, url);
    return url;
  })().finally(() => inflight.delete(key));

  inflight.set(key, request);
  return request;
}

export function MediaImage({
  assetId,
  variant = "display",
  alt,
  className,
  /** Reserve the space before the bytes land, so nothing jumps. */
  aspect = "4 / 5",
  onClick,
}: {
  assetId: string;
  variant?: MediaVariant;
  alt: string;
  className?: string;
  aspect?: string;
  onClick?: () => void;
}) {
  const [url, setUrl] = useState<string | null>(() => cache.get(`${assetId}/${variant}`) ?? null);
  const [failed, setFailed] = useState(false);
  const holder = useRef<HTMLDivElement | null>(null);
  const [near, setNear] = useState(() => cache.has(`${assetId}/${variant}`));

  /*
    Fetch when it comes near the viewport, not when it mounts.

    A `loading="lazy"` attribute would do this for a normal image, but the
    fetch here happens in JavaScript and the browser has no idea it is an
    image at all. Forty thumbnails in a coach's client detail would otherwise
    all request at once on mount.
  */
  useEffect(() => {
    if (near || !holder.current) return;
    const el = holder.current;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setNear(true);
          observer.disconnect();
        }
      },
      { rootMargin: "400px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [near]);

  useEffect(() => {
    if (!near) return;
    let alive = true;
    setFailed(false);
    load(assetId, variant)
      .then((next) => alive && setUrl(next))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [assetId, variant, near]);

  return (
    <div
      ref={holder}
      className={cn("relative overflow-hidden rounded-xl bg-white/5", className)}
      style={{ aspectRatio: aspect }}
      data-testid="media-image"
    >
      {url ? (
        <img
          src={url}
          alt={alt}
          onClick={onClick}
          className={cn("h-full w-full object-cover", onClick && "cursor-zoom-in")}
        />
      ) : failed ? (
        /*
          Said plainly rather than left blank. A missing photograph on a
          coach's screen is a thing they need to know is missing, not a gap
          they read as "this member didn't take one".
        */
        <div className="flex h-full w-full items-center justify-center px-3 text-center text-[11px] text-white/40">
          This photo couldn't be loaded
        </div>
      ) : (
        <div className="h-full w-full animate-pulse bg-white/5" />
      )}
    </div>
  );
}
