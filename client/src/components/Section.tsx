import { cn } from "@/lib/utils";
import { ReactNode } from "react";

export type SectionTone = "light" | "ink" | "none";

interface SectionProps extends React.HTMLAttributes<HTMLElement> {
  children: ReactNode;
  /** Legacy flag from the mastermind page. */
  dark?: boolean;
  /**
   * `ink` renders full-bleed dark. `light` renders as a rounded panel floating
   * on the dark ground, with the ink gutter showing down both sides.
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
    // Ink gutter wrapper, light panel inside it.
    return (
      <div className="tone-ink bg-background px-4 sm:px-8 lg:px-14 py-4 sm:py-6">
        <section
          className={cn(
            "tone-light bg-background rounded-xl sm:rounded-2xl py-20 md:py-28 relative overflow-hidden",
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
      className={cn(
        "py-20 md:py-28 relative",
        resolvedTone === "ink" ? "tone-ink bg-background" : "",
        className,
      )}
      {...props}
    >
      {inner}
    </section>
  );
}
