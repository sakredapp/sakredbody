/**
 * Which URLs are the portal, and putting the page on dark ground before the
 * first paint.
 *
 * ── Why this runs before React ────────────────────────────────────────────
 *
 * The portal pages are lazily loaded chunks, so something renders in their
 * place while the chunk downloads. Applying the theme when the page component
 * mounts is therefore always one render too late: the fallback paints
 * `bg-background`, which resolves to the light palette, and a cold load of
 * /member flashes a full-screen cream rectangle before turning dark.
 *
 * Deciding from the URL at boot costs one string comparison and removes the
 * flash entirely, including the very first paint before React has hydrated.
 *
 * The hook in hooks/use-ink-surface.ts still owns the class during the
 * session — this only gets the first frame right.
 */

/** Kept in sync with the portal routes in App.tsx. */
const PORTAL_PATHS = ["/member", "/coaching", "/admin", "/app"];

/**
 * `app.sakredbody.com` serves the portal at its root, because someone typing
 * that hostname did not arrive to read the philosophy. Same rule as App.tsx.
 */
function isAppHost(): boolean {
  return typeof window !== "undefined" && window.location.hostname.startsWith("app.");
}

export function isPortalPath(pathname: string): boolean {
  if (pathname === "/") return isAppHost();
  return PORTAL_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

/** Called once from main.tsx, before render. */
export function applyInkSurfaceAtBoot(): void {
  if (typeof document === "undefined") return;
  if (isPortalPath(window.location.pathname)) {
    document.documentElement.classList.add("dark");
  }
}
