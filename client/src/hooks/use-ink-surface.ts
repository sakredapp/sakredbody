/**
 * Put the portal on dark ground.
 *
 * The `.dark` palette — warm blacks, gold, cream — has existed in index.css
 * since the beginning and nothing ever applied the class, so every portal
 * screen fell through to `:root`, which is the light one. The member app has
 * been rendering as a bright cream page sitting inside a site whose whole
 * identity is gold on ink. Nothing was miscoloured; the theme was simply never
 * switched on.
 *
 * ── Why the html element and not a wrapper div ────────────────────────────
 *
 * Putting `dark` on the page's own container is the obvious move and it is
 * subtly wrong. Radix renders dialogs, dropdowns, selects, popovers and
 * toasts into a portal attached to `document.body` — outside the page tree
 * entirely. Scoped to a wrapper, every one of those would resolve the light
 * tokens and open as a white card over a dark app. The class has to sit above
 * both trees, and `documentElement` is the only element that is.
 *
 * ── Why a hook and not a class in index.html ──────────────────────────────
 *
 * `client/index.html` and `index.css` are shared with the marketing site,
 * which runs its own `.tone-ink` / `.tone-light` scheme to flip sections
 * between grounds. Making the document dark globally would fight that. This
 * applies on mount and removes on unmount, so the portal is dark and the
 * marketing pages are untouched.
 */

import { useEffect } from "react";

export function useInkSurface() {
  useEffect(() => {
    const root = document.documentElement;

    // Remember whether it was already there. If two portal screens are ever
    // mounted at once — or a future page nests one inside another — the inner
    // one unmounting must not strip the class from the outer one still using
    // it.
    const wasSet = root.classList.contains("dark");
    root.classList.add("dark");

    return () => {
      if (!wasSet) root.classList.remove("dark");
    };
  }, []);
}
