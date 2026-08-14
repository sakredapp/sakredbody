import { cn } from "@/lib/utils";

/**
 * The mark between one chapter and the next.
 *
 * Sections used to abut on whatever margin each of them happened to carry, so
 * a page read as a stack of components rather than as something with chapters.
 * Where two sections meet without an ImageBand between them — a band is
 * already punctuation, and a loud kind — this is what says *one thing ended,
 * another is starting*.
 *
 * Deliberately almost nothing: two hairlines fading out of the ink and a
 * single node between them, on the constellation's vocabulary rather than a
 * new one. The restraint is the point. A divider with any more presence than
 * this becomes a decoration that has to be justified on every page it appears,
 * and the site already has enough things asking to be looked at.
 *
 * The spacing is the site's one major-transition token: `clamp(3.5rem, 7vw,
 * 6rem)`, so the breath before and after a chapter break is the same on every
 * page and at every width, rather than whatever margin the section above
 * happened to end with.
 */
export function SectionBridge({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "tone-ink bg-background flex items-center justify-center gap-4",
        "py-[clamp(3.5rem,7vw,6rem)]",
        className,
      )}
      aria-hidden="true"
      data-testid="section-bridge"
    >
      <span className="h-px w-12 sm:w-16 bg-gradient-to-r from-transparent to-gold/25" />
      <span className="h-1.5 w-1.5 rotate-45 border border-gold/45" />
      <span className="h-px w-12 sm:w-16 bg-gradient-to-l from-transparent to-gold/25" />
    </div>
  );
}
