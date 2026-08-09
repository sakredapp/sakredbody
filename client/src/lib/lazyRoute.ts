import { lazy, type ComponentType } from "react";

/**
 * A lazy route that survives a deploy.
 *
 * Vite fingerprints every chunk, so `Embody-Cwa3-nPX.js` exists only for the
 * build that produced it. Anyone with a tab open when we ship is holding an
 * index.html that names chunks the server no longer has — the moment they
 * navigate, the dynamic import 404s and the route dies with "Failed to fetch
 * dynamically imported module". Nothing is wrong with their session and
 * nothing is wrong with the build; they are simply two different builds.
 *
 * So: retry once, in case it was a dropped connection rather than a stale
 * document. If it fails again, the document really is out of date, and the
 * only fix is to fetch the new one — reload, exactly once per chunk, guarded
 * by sessionStorage so a genuinely missing asset can't loop.
 */
export function lazyRoute<T extends ComponentType<unknown>>(
  name: string,
  load: () => Promise<{ default: T }>,
) {
  return lazy(async () => {
    try {
      return await load();
    } catch (first) {
      try {
        return await load();
      } catch (second) {
        const key = `chunk-reload:${name}`;
        if (typeof sessionStorage !== "undefined" && !sessionStorage.getItem(key)) {
          sessionStorage.setItem(key, "1");
          window.location.reload();
          // Never resolves; the reload takes the page first.
          return new Promise<{ default: T }>(() => {});
        }
        throw second;
      }
    }
  });
}

/**
 * Called once the app has mounted successfully. Anything we reloaded for has
 * clearly worked, so the guards shouldn't outlive the problem and block a
 * legitimate reload the next time we ship.
 */
export function clearChunkReloadGuards() {
  if (typeof sessionStorage === "undefined") return;
  for (const key of Object.keys(sessionStorage)) {
    if (key.startsWith("chunk-reload:")) sessionStorage.removeItem(key);
  }
}
