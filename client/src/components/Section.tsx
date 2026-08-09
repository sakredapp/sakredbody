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
   * How wide the raised panel itself is drawn — a Tailwind `max-w-*`.
   *
   * A panel is a card, and a card should be the size of what's on it. This
   * used to stretch to the viewport with the content capped at max-w-6xl
   * inside it, which on a wide monitor meant a slab most of a screen across
   * with a narrow column of type down the middle and nothing either side of
   * it. Sections whose content is a centred column pass a narrower value.
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
    return (
      <div className="tone-ink bg-background px-4 sm:px-8 lg:px-14 py-3 sm:py-4">
        <section
          className={cn(
            "tone-raised mx-auto w-full rounded-2xl sm:rounded-[1.75rem] py-10 md:py-14 relative overflow-hidden",
            width,
            // Lit from above, like a slab under a low light. The gradient is
            // only four points of lightness end to end — enough to give the
            // panel a top and a bottom, not enough to read as a gradient.
            "bg-gradient-to-b from-[hsl(32_9%_17%)] via-[hsl(32_9%_15%)] to-[hsl(32_10%_12.5%)]",
            "border border-gold/[0.13]",
            "shadow-[0_2px_0_0_hsl(45_30%_80%_/_0.05)_inset,0_30px_70px_-40px_rgb(0_0_0_/_0.9)]",
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
      className={cn("py-12 md:py-20 relative", resolvedTone === "ink" ? "tone-ink bg-background" : "", className)}
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
