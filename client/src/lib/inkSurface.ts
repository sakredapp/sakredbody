/**
 * Which URLs are the portal, and getting the first frame into the right
 * atmosphere before React exists.
 *
 * ── Why this runs before React ────────────────────────────────────────────
 *
 * The portal pages are lazily loaded chunks, so something renders in their
 * place while the chunk downloads. Applying the theme when the page component
 * mounts is therefore always one render too late: the fallback paints
 * `bg-background` and a cold load of /member flashes a full-screen rectangle
 * of the wrong palette before settling.
 *
 * ── What changed when appearance became a choice ──────────────────────────
 *
 * This used to add `dark` from the URL, which quietly made two claims at once:
 * that the route is the portal, and that the portal is dark. The second stops
 * being true the moment a member picks Light, so the two are now set
 * separately — `data-surface` from the path here, `data-theme` from the stored
 * preference in `appearance.ts`. The boot cost is unchanged: one string
 * comparison and one synchronous storage read.
 *
 * The hook in hooks/use-ink-surface.ts owns both attributes during the
 * session — this only gets the first frame right.
 */

import {
  appearance,
  applySurface,
  applyTheme,
  prefersDark,
  resolveAppearance,
} from "./appearance";

/** Kept in sync with the portal routes in App.tsx. */
const PORTAL_PATHS = ["/member", "/coaching", "/admin", "/app"];

/**
 * `app.sakredbody.com` serves the portal at its root, because someone typing
 * that hostname did not arrive to read the philosophy. Same rule as App.tsx —
 * including the native shells, which serve the bundled build from
 * `capacitor://localhost` and `https://localhost` and so match no hostname
 * rule at all. Left out, the apps boot onto the light palette for one frame
 * on their way to a dark portal.
 *
 * Read off `window` rather than imported from @capacitor/core: this module is
 * called from main.tsx before render, and it must not pull a dependency into
 * the entry chunk purely to answer one boolean.
 */
function isAppHost(): boolean {
  if (typeof window === "undefined") return false;
  const cap = (window as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  if (cap?.isNativePlatform?.()) return true;
  return window.location.hostname.startsWith("app.");
}

export function isPortalPath(pathname: string): boolean {
  if (pathname === "/") return isAppHost();
  return PORTAL_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

/** Called once from main.tsx, before render. */
export function applyInkSurfaceAtBoot(): void {
  if (typeof document === "undefined") return;
  const portal = isPortalPath(window.location.pathname);
  applySurface(portal);
  // Marketing gets no theme attribute at all rather than an explicit "light".
  // Those pages run their own `.tone-ink` / `.tone-light` banding against
  // `:root` and are outside the appearance system; naming a theme for them
  // would put them inside it and change pages nobody asked to change.
  applyTheme(portal ? resolveAppearance(appearance(), prefersDark()) : null);
}
