/**
 * Which atmosphere the temple is in — night or daylight.
 *
 * ── The fault line this exists to fix ─────────────────────────────────────
 *
 * `.dark` was doing two unrelated jobs. It meant "this is the portal" — added
 * from the URL at boot, removed when a marketing page mounted — and it also
 * meant "this is the dark palette", because those happened to be the same set
 * of screens. They are not the same concept, and the moment a member can
 * choose Light they stop coinciding: /member is still the portal and is no
 * longer dark.
 *
 * So they separate into two independent variables on the document element:
 *
 *   data-surface="portal"   ← decided by the route
 *   data-theme="dark|light" ← decided by the member
 *
 * Marketing pages carry neither and keep resolving `:root`, which is exactly
 * what they render today. This module owns the second one only; the first
 * stays with the route code in `inkSurface.ts` where the path list lives.
 *
 * ── Why the preference is read synchronously ──────────────────────────────
 *
 * The theme has to be on the element before the first paint. The portal pages
 * are lazily loaded chunks, so something renders while the chunk downloads,
 * and a theme applied at mount is always one frame too late — that is the
 * cream flash `applyInkSurfaceAtBoot` was written to remove, and it would come
 * straight back in the other direction.
 *
 * `localStorage` is the only storage this can use, because it is the only one
 * that answers without a promise. Capacitor Preferences is async: awaiting it
 * before the first paint is not an option, and reading it after the paint is
 * the flash. It is kept as a durable mirror instead — see `hydrateFromNative`.
 *
 * ── Default ───────────────────────────────────────────────────────────────
 *
 * Dark. Not because dark is safer, but because it is what every existing
 * member already has, and an appearance system that silently relights the app
 * for people who never asked has changed the product rather than added a
 * setting.
 */

export type Appearance = "system" | "light" | "dark";
export type ResolvedAppearance = "light" | "dark";

export const APPEARANCE_KEY = "sakred.appearance";

/** What a member who has never opened the setting sees. */
export const DEFAULT_APPEARANCE: Appearance = "dark";

export function isAppearance(value: unknown): value is Appearance {
  return value === "system" || value === "light" || value === "dark";
}

/**
 * The one rule: an explicit choice outranks the operating system.
 *
 * A member who picked Light on a phone that is in Dark picked Light. Treating
 * the OS as a tiebreaker there would make the setting look broken in the exact
 * case someone bothered to change it.
 */
export function resolveAppearance(
  preference: Appearance,
  prefersDark: boolean,
): ResolvedAppearance {
  if (preference === "light") return "light";
  if (preference === "dark") return "dark";
  return prefersDark ? "dark" : "light";
}

// ── Storage ───────────────────────────────────────────────────────────────

/**
 * Every access is guarded.
 *
 * Safari in private mode throws on `localStorage` rather than returning null,
 * and a WKWebView with storage disabled does the same. An appearance
 * preference is not worth a white screen, so any failure falls back to the
 * default and the app renders.
 */
export function readAppearance(): Appearance {
  try {
    const raw = window.localStorage.getItem(APPEARANCE_KEY);
    return isAppearance(raw) ? raw : DEFAULT_APPEARANCE;
  } catch {
    return DEFAULT_APPEARANCE;
  }
}

/** Whether anything has been stored at all — distinct from "stored the default". */
export function hasStoredAppearance(): boolean {
  try {
    return isAppearance(window.localStorage.getItem(APPEARANCE_KEY));
  } catch {
    return false;
  }
}

function writeAppearance(preference: Appearance): void {
  try {
    window.localStorage.setItem(APPEARANCE_KEY, preference);
  } catch {
    // Preference is lost at the next launch; the app still works this session.
  }
}

// ── The document ──────────────────────────────────────────────────────────

export function prefersDark(): boolean {
  try {
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  } catch {
    return false;
  }
}

/**
 * Put the resolved theme on the element, or take it off.
 *
 * `null` removes the attribute rather than setting a value, because a
 * marketing page is not "light" — it is outside the appearance system
 * entirely and resolves `:root`, which is what it has always done.
 *
 * `color-scheme` is set alongside, not left to CSS. It governs form controls,
 * scrollbars and the overscroll band, and those are the surfaces that give a
 * half-themed app away.
 */
export function applyTheme(resolved: ResolvedAppearance | null): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (resolved === null) {
    root.removeAttribute("data-theme");
    root.style.removeProperty("color-scheme");
    return;
  }
  root.setAttribute("data-theme", resolved);
  root.style.setProperty("color-scheme", resolved);
}

export function applySurface(isPortal: boolean): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (isPortal) root.setAttribute("data-surface", "portal");
  else root.removeAttribute("data-surface");
}

// ── Session state ─────────────────────────────────────────────────────────

const listeners = new Set<(p: Appearance) => void>();
let current: Appearance | null = null;
let mediaQuery: MediaQueryList | null = null;

/** The preference in force, read once and then held. */
export function appearance(): Appearance {
  if (current === null) current = readAppearance();
  return current;
}

export function resolvedAppearance(): ResolvedAppearance {
  return resolveAppearance(appearance(), prefersDark());
}

/**
 * Change it. Written first, applied second, mirrored last.
 *
 * The order matters on a slow device: applying before writing means a member
 * who force-quits in that window sees the change revert, which reads as the
 * setting not having saved.
 */
export function setAppearance(preference: Appearance, isPortal: boolean): void {
  current = preference;
  writeAppearance(preference);
  applyTheme(isPortal ? resolveAppearance(preference, prefersDark()) : null);
  for (const listener of Array.from(listeners)) listener(preference);
  void mirrorToNative(preference);
}

export function subscribeAppearance(listener: (p: Appearance) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Follow the OS, but only while the member is asking us to.
 *
 * Registered once and left registered: the handler re-reads the preference
 * each time, so a member on Light is unaffected by their phone switching at
 * sunset and does not need the listener torn down and rebuilt.
 */
export function watchSystemAppearance(isPortal: () => boolean): () => void {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
  const onChange = () => {
    if (appearance() !== "system") return;
    applyTheme(isPortal() ? resolveAppearance("system", prefersDark()) : null);
    for (const listener of Array.from(listeners)) listener("system");
  };
  mediaQuery.addEventListener("change", onChange);
  return () => mediaQuery?.removeEventListener("change", onChange);
}

// ── The native mirror ─────────────────────────────────────────────────────

/**
 * Capacitor Preferences as the durable copy, never as the boot source.
 *
 * `localStorage` in a WebView is not permanent — iOS can evict it under
 * storage pressure and "Clear website data" takes it outright. Preferences
 * survives both, so it is written on every change.
 *
 * It is only ever *read* when nothing is stored locally, which is the one case
 * where adopting a late answer cannot be a visible change: there was no
 * preference to contradict, so the worst outcome is the app correcting itself
 * from the default to what the member actually chose, once, after a data
 * clear. Reading it unconditionally would mean every cold launch resolves the
 * theme twice and the second answer arrives after the first paint.
 */
async function mirrorToNative(preference: Appearance): Promise<void> {
  try {
    const { Preferences } = await import("@capacitor/preferences");
    await Preferences.set({ key: APPEARANCE_KEY, value: preference });
  } catch {
    // Web, or the plugin is absent. localStorage is already authoritative.
  }
}

export async function hydrateFromNative(isPortal: () => boolean): Promise<void> {
  if (hasStoredAppearance()) return;
  try {
    const { Preferences } = await import("@capacitor/preferences");
    const { value } = await Preferences.get({ key: APPEARANCE_KEY });
    if (!isAppearance(value) || value === appearance()) return;
    current = value;
    writeAppearance(value);
    applyTheme(isPortal() ? resolveAppearance(value, prefersDark()) : null);
    for (const listener of Array.from(listeners)) listener(value);
  } catch {
    // Nothing to recover.
  }
}

/** Test seam. Forgets the held preference so the next read hits storage. */
export function resetAppearance(): void {
  current = null;
  listeners.clear();
}
