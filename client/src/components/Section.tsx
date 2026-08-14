import { cn } from "@/lib/utils";
import { ReactNode } from "react";

export type SectionTone = "raised" | "ink" | "none";

interface SectionProps extends React.HTMLAttributes<HTMLElement> {
  children: ReactNode;
  /** Legacy flag from the mastermind page. */
  dark?: boolean;
  /**
   * `ink` is full-bleed and recessed into the page. `raised` is a warm slab
   * lifted off it — same world, different depth.
   */
  tone?: SectionTone;
  containerClassName?: string;
  /**
   * Narrows the raised panel itself. Rarely what you want — see below.
   *
   * ── One outer geometry, varying inner content ───────────────────────────
   *
   * Every page was passing this to size its panel to its content, so a wide
   * section sat above a narrow one and the stack read as components that had
   * each picked their own width rather than as a designed page. The shells
   * now share a geometry and the *content* varies: pass `containerClassName`
   * with a `max-w-*` instead, which narrows the column inside a panel that
   * still lines up with the ones above and below it.
   *
   * It also only ever applied to `raised`. An ink section passing `width` was
   * silently doing nothing, which is how several of them ended up full width
   * while claiming otherwise.
   */
  width?: string;
}

export function Section({
  children,
  className,
  dark = false,
  tone,
  containerClassName,
  width = "max-w-6xl",
  ...props
}: SectionProps) {
  const resolvedTone: SectionTone = tone ?? (dark ? "raised" : "raised");
  const inner = (
    <div className={cn("container max-w-6xl mx-auto px-4 sm:px-6 relative z-10", containerClassName)}>
      {children}
    </div>
  );

  if (resolvedTone === "raised") {
    // The gap between two adjacent slabs is this wrapper's py, doubled. At
    // py-3/py-4 that was 24–32px of ink between two lit panels, which read as
    // one blocky stack rather than as separate sections.
    return (
      <div className="tone-ink bg-background px-4 sm:px-8 lg:px-14 py-5 sm:py-8">
        <section
          className={cn(
            "tone-raised mx-auto w-full rounded-2xl sm:rounded-[1.75rem] py-14 md:py-20 relative overflow-hidden",
            width,
            // Lit from above, like a slab under a low light. The gradient is
            // only four points of lightness end to end — enough to give the
            // panel a top and a bottom, not enough to read as a gradient.
            "bg-gradient-to-b from-[hsl(32_9%_17%)] via-[hsl(32_9%_15%)] to-[hsl(32_10%_12.5%)]",
            "border border-gold/[0.13]",
            "shadow-lift",
            className,
          )}
          {...props}
        >
          {/* The gilt edge. A single hairline across the top catches the light
              the gradient implies, and is the one place the gold appears as a
              material rather than as ink. */}
          <div className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-gold/35 to-transparent" />
          {inner}
        </section>
      </div>
    );
  }

  return (
    <section
      className={cn("py-16 md:py-28 relative", resolvedTone === "ink" ? "tone-ink bg-background" : "", className)}
      {...props}
    >
      {/* Ink sections often carry a canvas. Fading both edges into the page
          ink means one section hands off to the next instead of butting
          against it on a hard line. */}
      {resolvedTone === "ink" && (
        <>
          <div className="pointer-events-none absolute inset-x-0 top-0 h-24 z-[1] bg-gradient-to-b from-background to-transparent" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 z-[1] bg-gradient-to-t from-background to-transparent" />
        </>
      )}
      {inner}
    </section>
  );
}
