import { cn } from "@/lib/utils";
import { ReactNode } from "react";

export type SectionTone = "light" | "ink" | "none";

interface SectionProps extends React.HTMLAttributes<HTMLElement> {
  children: ReactNode;
  /** Legacy flag from the mastermind page. */
  dark?: boolean;
  /**
   * Full-bleed bands alternating light and ink down the page.
   *
   * These were briefly rounded panels floating on the ink ground. Measured,
   * sections run 600-1650px against a ~950px viewport, so most of the time no
   * corner was on screen — the metaphor broke and it read as a white wall with
   * dark strips. Full-bleed alternation is what carries rhythm at this length.
   */
  tone?: SectionTone;
  containerClassName?: string;
}

const toneClasses: Record<SectionTone, string> = {
  light: "tone-light bg-background",
  ink: "tone-ink bg-background",
  none: "",
};

export function Section({
  children,
  className,
  dark = false,
  tone,
  containerClassName,
  ...props
}: SectionProps) {
  const resolvedTone: SectionTone = tone ?? (dark ? "light" : "light");

  return (
    <section
      className={cn("py-20 md:py-28 relative", toneClasses[resolvedTone], className)}
      {...props}
    >
      <div className={cn("container max-w-6xl mx-auto px-4 sm:px-6 relative z-10", containerClassName)}>
        {children}
      </div>
    </section>
  );
}
