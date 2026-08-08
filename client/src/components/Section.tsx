import { cn } from "@/lib/utils";
import { ReactNode } from "react";

export type SectionTone = "light" | "ink" | "none";

interface SectionProps extends React.HTMLAttributes<HTMLElement> {
  children: ReactNode;
  /** Legacy flag from the mastermind page. */
  dark?: boolean;
  /**
   * `ink` is full-bleed dark. `light` is a rounded panel floating on the ink
   * ground, with the dark showing down both gutters.
   */
  tone?: SectionTone;
  containerClassName?: string;
}

export function Section({
  children,
  className,
  dark = false,
  tone,
  containerClassName,
  ...props
}: SectionProps) {
  const resolvedTone: SectionTone = tone ?? (dark ? "light" : "light");
  const inner = (
    <div className={cn("container max-w-6xl mx-auto px-4 sm:px-6 relative z-10", containerClassName)}>
      {children}
    </div>
  );

  if (resolvedTone === "light") {
    return (
      <div className="tone-ink bg-background px-4 sm:px-8 lg:px-14 py-4 sm:py-6">
        <section
          className={cn(
            "tone-light bg-background rounded-2xl sm:rounded-[1.75rem] py-12 md:py-16 relative overflow-hidden",
            className,
          )}
          {...props}
        >
          {inner}
        </section>
      </div>
    );
  }

  return (
    <section
      className={cn("py-20 md:py-28 relative", resolvedTone === "ink" ? "tone-ink bg-background" : "", className)}
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
