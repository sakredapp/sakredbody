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

import { registerPlugin } from "@capacitor/core";

import type { ResolvedAppearance } from "./appearance";
import { hslTripletToHex } from "./themeInk";

export { hslTripletToHex };

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
 * The ground the web layer is currently painting, as hex.
 *
 * The conversion itself lives in `themeInk.ts` alongside the canvas-side
 * accessor, because they are the same operation — reading a token out of CSS
 * into a form something that isn't CSS can use — and having two copies is how
 * they drift.
 */
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
 * The half of the surround `@capacitor/status-bar` does not reach.
 *
 * On Android that is the navigation bar — the gesture pill, drawn onto a
 * transparent bar from Android 15 in whatever contrast the system was last
 * told, which in Light is a light pill on limestone. On iOS it is
 * `overrideUserInterfaceStyle`, which is what the keyboard, the selection
 * callout, the scroll indicators and the overscroll ground all follow; with
 * no `UIUserInterfaceStyle` in Info.plist they follow the *system*, so a
 * member in Light on a night-mode phone types into a black keyboard.
 *
 * App-local on both platforms — `android/app/src/main/java/com/sakredbody/app`
 * and `ios/App/App` — because it is a handful of platform calls with nothing
 * another app would install. Registered by hand in MainActivity; discovered
 * through `CAPBridgedPlugin` on iOS.
 */
const SakredAppearance = registerPlugin<{
  apply(options: { theme: ResolvedAppearance; ink?: string }): Promise<{
    applied: boolean;
    dark: boolean;
  }>;
}>("SakredAppearance");

/**
 * Tell everything outside the WebView which atmosphere it is in.
 *
 * Safe to call on the web and safe to call repeatedly. The two native halves
 * are attempted separately: the status bar failing is not a reason to leave
 * the navigation bar and the keyboard on the previous appearance, which is
 * the more visible of the two failures.
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

  try {
    // `ink` is passed rather than read natively for the same reason the hex
    // above is read from CSS: the stylesheet is the one place the ground is
    // decided, and a second copy in Kotlin is a seam waiting to happen.
    await SakredAppearance.apply(hex ? { theme: resolved, ink: hex } : { theme: resolved });
  } catch {
    // Web, where `registerPlugin` returns a proxy that rejects. Nothing to do
    // — a browser has no navigation bar and no UIKit.
  }
}
