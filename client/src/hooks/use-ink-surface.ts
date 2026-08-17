/**
 * Hold the portal's surface and atmosphere for as long as a portal page is up.
 *
 * ── Why the html element and not a wrapper div ────────────────────────────
 *
 * Putting the theme on the page's own container is the obvious move and it is
 * subtly wrong. Radix renders dialogs, dropdowns, selects, popovers and
 * toasts into a portal attached to `document.body` — outside the page tree
 * entirely. Scoped to a wrapper, every one of those would resolve the other
 * palette and open as a pale card over a dark app. The attribute has to sit
 * above both trees, and `documentElement` is the only element that is.
 *
 * ── Why a hook and not an attribute in index.html ─────────────────────────
 *
 * `client/index.html` and `index.css` are shared with the marketing site,
 * which runs its own `.tone-ink` / `.tone-light` scheme to flip sections
 * between grounds. Making the document dark globally would fight that. This
 * applies on mount and removes on unmount, so the portal is themed and the
 * marketing pages are untouched.
 *
 * ── Two attributes, not one class ─────────────────────────────────────────
 *
 * This used to add `dark`, which conflated "this is the portal" with "this is
 * the dark palette". Now `data-surface` says where you are and `data-theme`
 * says what it looks like, and a member choosing Light changes only the
 * second. The subscription is what makes the setting take effect without a
 * reload — appearance is stored outside React, so nothing re-renders on its
 * own when it changes.
 */

import { useEffect } from "react";
import {
  appearance,
  applySurface,
  applyTheme,
  prefersDark,
  resolveAppearance,
  subscribeAppearance,
  watchSystemAppearance,
} from "@/lib/appearance";

export function useInkSurface() {
  useEffect(() => {
    const paint = () => {
      applySurface(true);
      applyTheme(resolveAppearance(appearance(), prefersDark()));
    };

    paint();
    const unsubscribe = subscribeAppearance(paint);
    // Registered here rather than at boot so it is torn down with the portal.
    // On `system` this is what follows a phone into night mode while the app
    // is open; on an explicit choice the handler reads the preference and
    // declines.
    const unwatch = watchSystemAppearance(() => true);

    /*
      Both attributes are always removed on unmount, never conditionally.

      The first version of this remembered whether the class was already
      present and left it alone if so, to protect a hypothetical nested portal
      screen. That was wrong once the boot code started setting it from the
      URL: landing directly on /member meant it was already there, so the guard
      declined to remove it, and navigating to a marketing page left the whole
      site dark. Nothing nests here — wouter's Switch renders exactly one page
      — so the guard protected nothing and broke something.
    */
    return () => {
      unsubscribe();
      unwatch();
      applySurface(false);
      applyTheme(null);
    };
  }, []);
}
