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
        "py-16 md:py-24 relative overflow-hidden", 
        dark ? "bg-background" : "bg-card/30",
        className
      )} 
      {...props}
    >
      <div className={cn("container max-w-6xl mx-auto px-4 sm:px-6 relative z-10", containerClassName)}>
        {children}
      </div>
      
      {/* Subtle Grid Background for that "Technical" feel */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.03]" 
           style={{ 
             backgroundImage: `linear-gradient(hsl(var(--foreground)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--foreground)) 1px, transparent 1px)`, 
             backgroundSize: '40px 40px' 
           }} 
      />
    </section>
  );
}
