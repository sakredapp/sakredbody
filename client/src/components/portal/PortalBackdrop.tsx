/**
 * The star chart behind the portal.
 *
 * `CelestialField` already exists and was drawn for the marketing pages — a
 * slowly turning engraved star chart, gold on ink. It was never used anywhere
 * in the app, which is why the portal read as a different product from the
 * site it sits inside.
 *
 * This is a consumer of that component, not a copy of it. It belongs to the
 * other session; the only thing added here is placement.
 *
 * ── Held at a much lower opacity than the marketing use ───────────────────
 *
 * A hero can afford a visible field because there is one screenful of it and
 * nothing to read on top. The portal is dense text, checkboxes and numbers
 * that people look at every morning, and a star chart at hero strength behind
 * a habit list is legibility spent on decoration. At 30% it registers as
 * depth rather than as a picture.
 *
 * `fixed` rather than absolute so it doesn't scroll — a star field that slides
 * up behind a long list turns into wallpaper and draws the eye. Pinned, it
 * behaves like the room the content is in.
 */

import { CelestialField } from "@/components/CelestialField";

export function PortalBackdrop() {
  return (
    <div
      // `-z-10` with `isolate` on the portal root, which is the one
      // combination that works here. A fixed element is positioned, and
      // positioned elements paint *above* static content regardless of source
      // order — so `z-index: 0` would put the star chart on top of the habit
      // list. A bare negative index would instead drop it behind the page
      // background and render it invisible. `isolate` on the parent creates a
      // stacking context for the negative index to sit inside: behind every
      // child, still in front of the parent's own background.
      className="fixed inset-0 pointer-events-none opacity-30 -z-10"
      aria-hidden="true"
    >
      <CelestialField className="w-full h-full" />

      {/* The field is brightest at its centre, which is exactly where the
          content sits. This settles the middle without dimming the edges. */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[hsl(var(--ink))]/45 to-transparent" />
    </div>
  );
}
