import { cn } from "@/lib/utils";
import { ReactNode } from "react";

type SectionTone = "light" | "muted" | "ink" | "ink-soft" | "none";

interface SectionProps extends React.HTMLAttributes<HTMLElement> {
  children: ReactNode;
  /** Legacy flag from the mastermind page: renders the plain cream background. */
  dark?: boolean;
  tone?: SectionTone;
  containerClassName?: string;
}

const toneClasses: Record<SectionTone, string> = {
  light: "bg-background",
  muted: "bg-card/30",
  ink: "bg-ink text-ink-foreground",
  "ink-soft": "bg-ink-soft text-ink-foreground",
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
  const resolvedTone: SectionTone = tone ?? (dark ? "light" : "muted");

  return (
    <section
      className={cn("py-16 md:py-24 relative", toneClasses[resolvedTone], className)}
      {...props}
    >
      <div className={cn("container max-w-6xl mx-auto px-4 sm:px-6 relative z-10", containerClassName)}>
        {children}
      </div>
    </section>
  );
}
