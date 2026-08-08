import { cn } from "@/lib/utils";
import { ReactNode } from "react";

export type SectionTone = "light" | "ink" | "none";

interface SectionProps extends React.HTMLAttributes<HTMLElement> {
  children: ReactNode;
  /** Legacy flag from the mastermind page. */
  dark?: boolean;
  /**
   * Sections alternate light / ink down every page. `ink` scopes the theme
   * tokens (see .tone-ink in index.css) so ordinary utility classes work on
   * dark ground — never hardcode dark-only colours inside a section.
   */
  tone?: SectionTone;
  containerClassName?: string;
}

const toneClasses: Record<SectionTone, string> = {
  light: "bg-background",
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
