import { useRef, type ReactNode } from "react";
import { motion, useMotionValue, useReducedMotion, useSpring } from "framer-motion";

/**
 * Anything wrapped in this leans toward the cursor.
 *
 * The element is pulled a fraction of the distance from its centre to the
 * pointer and springs back when the pointer leaves. It is small on purpose:
 * enough that a button feels like it noticed you, not enough to make it a
 * moving target you have to chase.
 *
 * Wrap the button rather than replacing it, so every existing variant, size
 * and link behaviour survives untouched.
 */
export function Magnetic({
  children,
  className,
  /** Fraction of the pointer offset the element follows. */
  strength = 0.32,
  /** Beyond this many px from the centre, the pull is capped. */
  radius = 42,
}: {
  children: ReactNode;
  className?: string;
  strength?: number;
  radius?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();

  const spring = { stiffness: 260, damping: 18, mass: 0.5 };
  const x = useSpring(useMotionValue(0), spring);
  const y = useSpring(useMotionValue(0), spring);

  if (reduced) return <div className={className}>{children}</div>;

  return (
    <motion.div
      ref={ref}
      className={`inline-block ${className ?? ""}`}
      style={{ x, y }}
      onPointerMove={(e) => {
        const el = ref.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const dx = e.clientX - (rect.left + rect.width / 2);
        const dy = e.clientY - (rect.top + rect.height / 2);
        x.set(Math.max(-radius, Math.min(radius, dx * strength)));
        y.set(Math.max(-radius, Math.min(radius, dy * strength)));
      }}
      onPointerLeave={() => {
        x.set(0);
        y.set(0);
      }}
    >
      {children}
    </motion.div>
  );
}
