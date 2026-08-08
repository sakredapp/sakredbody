import { type ElementType, type ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";

/**
 * A headline that wipes in from behind a gilt edge.
 *
 * The text rises inside a clipped band while a thin gold line sweeps across
 * the top of it — the line is what sells it, because it reads as the edge the
 * text is coming out from rather than a fade someone applied afterwards.
 *
 * The heading element is yours; only an inner span moves, so heading levels
 * and existing classes stay exactly as they were.
 */
export function RevealText({
  children,
  as: Tag = "h2",
  className,
  delay = 0,
  testId,
}: {
  children: ReactNode;
  as?: ElementType;
  className?: string;
  delay?: number;
  testId?: string;
}) {
  const reduced = useReducedMotion();

  if (reduced) {
    return (
      <Tag className={className} data-testid={testId}>
        {children}
      </Tag>
    );
  }

  return (
    <Tag className={className} data-testid={testId}>
      <span className="relative block overflow-hidden pb-[0.12em]">
        <motion.span
          className="block"
          initial={{ y: "44%", opacity: 0 }}
          whileInView={{ y: "0%", opacity: 1 }}
          viewport={{ once: true, amount: 0.5 }}
          transition={{ duration: 0.85, ease: [0.16, 1, 0.3, 1], delay }}
        >
          {children}
        </motion.span>

        {/* The gilt edge the text appears to emerge from. */}
        <motion.span
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-px origin-center"
          style={{
            background: "linear-gradient(90deg, transparent, hsl(var(--gold) / 0.85), transparent)",
          }}
          initial={{ scaleX: 0, opacity: 0 }}
          whileInView={{ scaleX: 1, opacity: [0, 1, 0] }}
          viewport={{ once: true, amount: 0.5 }}
          transition={{ duration: 1.15, ease: "easeOut", delay }}
        />
      </span>
    </Tag>
  );
}
