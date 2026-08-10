/**
 * The star chart behind the portal.
 *
 * ── What was here before, and why it didn't work ─────────────────────────
 *
 * `CelestialField` at 30% opacity. It was the right instinct — reuse the
 * marketing canvas so the app stops reading as a different product from the
 * site it sits inside — and it produced a screen nobody could tell had a
 * background at all. Two reasons, and they compounded.
 *
 * That component draws four concentric orbit rings sized off their frame. In
 * a hero, framed and clipped, those rings are a star chart. Stretched across
 * a whole scrolling viewport they become four enormous arcs so flat that what
 * actually renders is a couple of near-horizontal lines, and at 30% opacity a
 * near-horizontal line at the edge of visibility is indistinguishable from a
 * gradient. The site session hit the same thing on the landing hero and
 * dropped the component there for exactly this reason — the note is still in
 * `Home.tsx`. The portal kept using it.
 *
 * So: the figures, at low density and low intensity, which is a different
 * knob from opacity. Opacity fades an image uniformly, including its darks,
 * which is how you get grey haze. Intensity here scales the light the stars
 * emit, so the field stays black where there is nothing and the stars stay
 * stars — dimmer, but still points rather than smudges.
 *
 * ── Held well under the login screen ─────────────────────────────────────
 *
 * A login screen is one screenful with a card on it and thirty seconds of
 * anyone's attention. The portal is dense text, checkboxes and numbers people
 * look at every morning, and a full-strength field behind a habit list is
 * legibility spent on decoration. Roughly half the density and half the light,
 * with the middle band kept clear of the near figures so nothing large ever
 * stands behind the reading column.
 *
 * `fixed` rather than absolute so it doesn't scroll. A star field sliding up
 * behind a long list turns into wallpaper and pulls the eye; pinned, it
 * behaves like the room the content is in.
 */

import { ConstellationSky } from "./ConstellationSky";

/**
 * `member` is the app somebody opens at six in the morning; `desk` is the back
 * office, which is tables of numbers somebody reads for an hour at a time.
 * The back office gets roughly half again less of everything — the point there
 * is only that it stops feeling like a different product, not that it performs.
 */
export type BackdropVariant = "member" | "desk";

const TUNING: Record<BackdropVariant, { density: number; intensity: number }> = {
  member: { density: 0.5, intensity: 0.55 },
  desk: { density: 0.34, intensity: 0.34 },
};

export function PortalBackdrop({ variant = "member" }: { variant?: BackdropVariant }) {
  const { density, intensity } = TUNING[variant];

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
      //
      // `pointer-events-none` is load-bearing and costs a feature: the sky
      // lights the figure nearest the pointer, and it cannot see a pointer it
      // never receives. That trade is not close — a full-viewport canvas that
      // takes pointer events sits on top of every tap and scroll in the app.
      // The figures pulse on their own cycles regardless, which is what
      // carries this; the hover is a login-screen luxury.
      className="fixed inset-0 pointer-events-none -z-10"
      aria-hidden="true"
    >
      {/* Held to the right of the reading edge.
          A figure was standing directly behind "Welcome back, <name>" — the
          first line of the screen, and the one place a constellation is
          competing with something someone is actually reading.
          `clearTop` cannot fix it: ConstellationSky caps that inset at 140px
          internally, which is nothing on a tall phone. Adding a `clearLeft`
          prop would mean editing a motion component the site session owns and
          the login screen also renders, so the sky is simply anchored to the
          right instead and given the right two-thirds. The left third — where
          every heading, label and number in the portal begins — stays empty.
          Nothing is clipped; the field is planned to whatever box it is given,
          so it composes for this one rather than being cropped to it. */}
      {/* `top-24`, not `inset-y-0`. ConstellationSky caps its own `clearTop`
          inset at 140px internally, which on a tall phone is not enough to
          clear a sticky 64px header plus the safe area — the top figure was
          rendering with its head cut off under the menu bar. Starting the box
          below the header is the only way to get the whole figure visible,
          since the component cannot be told to leave more room. */}
      <div className="absolute top-24 bottom-0 right-0 w-[52%]">
      <ConstellationSky
        className="w-full h-full"
        density={density}
        intensity={intensity}
        clearCentre={0.5}
        // The portal header is sticky and opaque, so anything under it is
        // simply gone. Less than the login screen needs, because that header
        // is a floating logo over open space rather than a solid bar.
        clearTop={0.1}
        // 30, not 60.
        //
        // This canvas is `fixed`, so it never leaves the viewport and the
        // offscreen pause in `mountStage` never fires: without a cap it
        // redraws sixty times a second, full-viewport, for as long as anyone
        // has the app open. The figures drift a few pixels per second and
        // breathe on a slow cycle — at 30 the motion is identical to look at
        // and the work is halved. On the back office, slower still: nothing
        // there is being watched.
        fps={variant === "desk" ? 20 : 30}
      />
      </div>

      {/* The reading column runs down the middle. This settles it without
          dimming the edges, where the field is doing its work. */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[hsl(var(--ink))]/45 to-transparent" />
    </div>
  );
}
