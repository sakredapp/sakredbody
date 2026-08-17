/**
 * The strip of screen the app doesn't own.
 *
 * ── What this is actually for ─────────────────────────────────────────────
 *
 * A member picks Light and the app relights — except for the clock, the
 * battery and the Android gesture pill, which are drawn by the operating
 * system in whatever contrast it was last told to use. Get this wrong and the
 * failure is total rather than cosmetic: white status icons on a limestone bar
 * are not "slightly off", they are invisible, and the member has lost the time
 * and their signal strength for as long as they stay in Light.
 *
 * So this is not polish. It is the part of the theme that lives outside the
 * WebView, and it has to be told separately every time the appearance changes.
 *
 * ── The one thing to know about Style ─────────────────────────────────────
 *
 * Capacitor's `Style.Dark` does not mean "dark icons". It means "dark
 * background", and therefore *light* icons. `Style.Light` is the inverse. The
 * names describe the surface, not the content, and reading them the other way
 * produces precisely the invisible-icons bug this file exists to prevent — so
 * the mapping goes through `statusBarStyleFor` below, which is named for what
 * it takes rather than what it returns and is unit-tested in both directions.
 *
 * ── Why the colour is read from CSS ───────────────────────────────────────
 *
 * The bar has to match `--ink`, which is the token the web layer paints its
 * own background from. Hardcoding the two hexes here would mean the day
 * somebody adjusts the daylight ground, the status bar keeps the old one and
 * shows a seam a few pixels tall that nobody thinks to look for. Reading the
 * computed value keeps one source of truth in the stylesheet.
 *
 * ── Android 15+ ───────────────────────────────────────────────────────────
 *
 * We target SDK 36, where edge-to-edge is enforced and the system bars are
 * transparent by platform decision. `setBackgroundColor` is ignored there, and
 * that is fine: the web layer is already drawing under the bar in the right
 * colour. The call is kept for older devices, where it is not ignored, and the
 * style call is what matters on both.
 */

import type { ResolvedAppearance } from "./appearance";

/**
 * Which icon contrast an appearance needs.
 *
 * Returned as the plugin's own string values rather than the enum so this
 * module can be imported and tested without the plugin present — it is
 * lazily imported below precisely so it stays out of the web bundle.
 */
export function statusBarStyleFor(resolved: ResolvedAppearance): "DARK" | "LIGHT" {
  // Dark appearance → dark background → the plugin calls that DARK, and it
  // draws light icons on it. See the note above; this line is the whole trap.
  return resolved === "dark" ? "DARK" : "LIGHT";
}

/**
 * `40 26% 92%` — the way a CSS custom property holds a colour — as `#f0ece5`.
 *
 * The triplet form is what the stylesheet stores, because every consumer wraps
 * it in `hsl()` with its own alpha. Nothing outside CSS can use it in that
 * shape: the native plugin wants hex, and so does `<meta name="theme-color">`
 * on the browsers that are fussiest about it.
 *
 * Returns null rather than a guess when the value isn't a triplet. A wrong
 * colour on the status bar is worse than the previous one left in place.
 */
export function hslTripletToHex(triplet: string): string | null {
  const parts = triplet.trim().replace(/%/g, "").split(/[\s,/]+/).filter(Boolean);
  if (parts.length < 3) return null;

  const h = Number(parts[0]);
  const s = Number(parts[1]) / 100;
  const l = Number(parts[2]) / 100;
  if (!Number.isFinite(h) || !Number.isFinite(s) || !Number.isFinite(l)) return null;

  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const m = l - c / 2;

  const [r, g, b] =
    hp < 1 ? [c, x, 0] :
    hp < 2 ? [x, c, 0] :
    hp < 3 ? [0, c, x] :
    hp < 4 ? [0, x, c] :
    hp < 5 ? [x, 0, c] :
             [c, 0, x];

  const byte = (v: number) =>
    Math.max(0, Math.min(255, Math.round((v + m) * 255)))
      .toString(16)
      .padStart(2, "0");

  return `#${byte(r)}${byte(g)}${byte(b)}`;
}

/** The ground the web layer is currently painting, as hex. */
export function currentInkHex(): string | null {
  if (typeof document === "undefined" || typeof getComputedStyle !== "function") return null;
  const triplet = getComputedStyle(document.documentElement).getPropertyValue("--ink");
  return triplet ? hslTripletToHex(triplet) : null;
}

/**
 * The browser's own version of the same problem.
 *
 * `theme-color` tints the Android Chrome toolbar and the iOS Safari surround
 * on the web, and it is a static `#1C1A17` in index.html — correct for every
 * page until a member chose daylight. Updated here so the two platforms are
 * told the same thing by the same code path.
 */
function applyThemeColor(hex: string): void {
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", hex);
}

/**
 * Tell everything outside the WebView which atmosphere it is in.
 *
 * Safe to call on the web and safe to call repeatedly — the native half is a
 * dynamic import that fails quietly when the plugin isn't there, which is the
 * normal case in a browser.
 */
export async function applyNativeChrome(resolved: ResolvedAppearance): Promise<void> {
  const hex = currentInkHex();
  if (hex) applyThemeColor(hex);

  try {
    const { StatusBar, Style } = await import("@capacitor/status-bar");
    await StatusBar.setStyle({
      style: statusBarStyleFor(resolved) === "DARK" ? Style.Dark : Style.Light,
    });
    if (hex) {
      // Ignored on Android 15+ where the bars are transparent by platform
      // decision, honoured below it, and not implemented on iOS. All three
      // outcomes are fine; none of them is an error worth surfacing.
      await StatusBar.setBackgroundColor({ color: hex }).catch(() => undefined);
    }
  } catch {
    // Web, or the plugin is absent. The meta tag above is the whole of the
    // browser's status-bar story and it has already been set.
  }
}
