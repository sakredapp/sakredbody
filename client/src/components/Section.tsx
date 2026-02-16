import { cn } from "@/lib/utils";
import { ReactNode } from "react";

interface SectionProps extends React.HTMLAttributes<HTMLElement> {
  children: ReactNode;
  dark?: boolean;
  containerClassName?: string;
}

export function Section({ children, className, dark = false, containerClassName, ...props }: SectionProps) {
  return (
    <section 
      className={cn(
        "py-16 md:py-24 relative", 
        dark ? "bg-background" : "bg-card/30",
        className
      )} 
      {...props}
    >
      <div className={cn("container max-w-6xl mx-auto px-4 sm:px-6 relative z-10", containerClassName)}>
        {children}
      </div>
    </section>
  );
}
