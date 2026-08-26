/**
 * Is a walkthrough lesson on screen right now.
 *
 * Read from an attribute the overlay publishes on `documentElement`, so the
 * product can answer "am I being taught" without importing the tour, holding a
 * context, or knowing that the tour exists at all. The walkthrough is a layer
 * over the app; the moment the app has to be built around it, it has stopped
 * being one.
 *
 * The only current caller is the movement picker, deciding whether to summon
 * the keyboard. Anything that changes behaviour on this must be behaviour that
 * would be *wrong* during a lesson, not merely different.
 */
export function isTourActive(): boolean {
  if (typeof document === "undefined") return false;
  return document.documentElement.hasAttribute("data-tour-active");
}
