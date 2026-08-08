import { useRef, type ReactNode } from "react";
import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from "framer-motion";

/**
 * A plate that sits in space rather than on the page.
 *
 * The card takes a real perspective transform toward the cursor and lifts
 * slightly off the ground, and a gilt sheen tracks the pointer across its face
 * — the same read as light moving over a gold-leafed surface as you lean.
 *
 * Deliberately restrained: eight degrees is the ceiling. Past that it stops
 * being furniture and starts being a toy.
 */
export function Tilt3D({
  children,
  className,
  /** Maximum rotation in degrees on either axis. */
  max = 7,
  /** How far the card lifts toward the viewer, in px. */
  lift = 14,
  /** The moving gilt highlight. Off for photography, which has its own light. */
  sheen = true,
  testId,
}: {
  children: ReactNode;
  className?: string;
  max?: number;
  lift?: number;
  sheen?: boolean;
  testId?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();

  // -0.5 → 0.5 across the card on each axis.
  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const hover = useMotionValue(0);

  const spring = { stiffness: 220, damping: 26, mass: 0.6 };
  const rotateX = useSpring(useTransform(py, [-0.5, 0.5], [max, -max]), spring);
  const rotateY = useSpring(useTransform(px, [-0.5, 0.5], [-max, max]), spring);
  const z = useSpring(useTransform(hover, [0, 1], [0, lift]), spring);

  // The highlight sits where the pointer is, in percentage terms.
  const sheenOpacity = useSpring(hover, { stiffness: 180, damping: 30 });
  const sheenImage = useTransform(
    [px, py],
    ([x, y]: number[]) =>
      `radial-gradient(320px circle at ${50 + x * 100}% ${50 + y * 100}%, hsl(var(--gold) / 0.16), transparent 70%)`,
  );

  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el || reduced) return;
    const rect = el.getBoundingClientRect();
    px.set((e.clientX - rect.left) / rect.width - 0.5);
    py.set((e.clientY - rect.top) / rect.height - 0.5);
  };

  const reset = () => {
    px.set(0);
    py.set(0);
    hover.set(0);
  };

  if (reduced) {
    return (
      <div className={className} data-testid={testId}>
        {children}
      </div>
    );
  }

  return (
    <div ref={ref} className={className} style={{ perspective: 900 }} data-testid={testId}>
      <motion.div
        onPointerMove={onMove}
        onPointerEnter={() => hover.set(1)}
        onPointerLeave={reset}
        style={{ rotateX, rotateY, z, transformStyle: "preserve-3d" }}
        className="relative h-full rounded-[inherit] will-change-transform"
      >
        {children}
        {sheen && (
          <motion.span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 rounded-[inherit]"
            style={{ opacity: sheenOpacity, backgroundImage: sheenImage }}
          />
        )}
      </motion.div>
    </div>
  );
}
