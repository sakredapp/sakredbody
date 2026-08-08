import { useRef } from "react";
import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion";

export interface StackImage {
  src: string;
  alt: string;
  /** Optional gilt caption printed under the plate, like a gallery label. */
  caption?: string;
}

/**
 * Three photographs, hung on a diagonal.
 *
 * The plates are offset along a falling line and rotated a degree or two —
 * near enough to a hand-laid contact sheet — and each drifts at its own rate as
 * the page scrolls, which is what makes the group read as depth rather than
 * decoration. Gilt hairline, generous shadow, no captions unless asked for.
 */
export function DiagonalStack({
  images,
  className,
  testId,
}: {
  images: [StackImage, StackImage, StackImage];
  className?: string;
  testId?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });

  // Different rates per plate: the group separates in depth as it passes.
  const drift = [
    useTransform(scrollYProgress, [0, 1], [-34, 26]),
    useTransform(scrollYProgress, [0, 1], [30, -30]),
    useTransform(scrollYProgress, [0, 1], [-14, 40]),
  ];

  // A falling diagonal: top-left, middle-right, bottom-centre. Each plate
  // stacks above the one before it, so the last is never buried under the
  // first — which is exactly what a tall opening plate used to do.
  const PLATES = [
    { pos: "left-0 top-0 w-[50%]", ratio: "4 / 5", rotate: -3.2, z: "z-10" },
    { pos: "right-0 top-[13%] w-[45%]", ratio: "4 / 3", rotate: 2.4, z: "z-20" },
    { pos: "left-[19%] bottom-0 w-[43%]", ratio: "1 / 1", rotate: -1.4, z: "z-30" },
  ];

  return (
    <div
      ref={ref}
      className={`relative aspect-[4/5] sm:aspect-[5/4] ${className ?? ""}`}
      data-testid={testId}
    >
      {images.map((image, i) => {
        const plate = PLATES[i];
        return (
          <motion.figure
            key={image.src}
            className={`absolute ${plate.pos} ${plate.z} m-0`}
            style={{
              y: reduced ? 0 : drift[i],
              rotate: plate.rotate,
            }}
          >
            <div
              className="overflow-hidden rounded-xl sm:rounded-2xl border border-gold-subtle shadow-[0_28px_60px_-24px_rgba(0,0,0,0.85)]"
              style={{ aspectRatio: plate.ratio }}
            >
              <img
                src={image.src}
                alt={image.alt}
                loading="lazy"
                className="h-full w-full object-cover"
              />
            </div>
            {image.caption && (
              <figcaption className="mt-3 text-[0.65rem] uppercase tracking-widest text-gold opacity-70 text-center">
                {image.caption}
              </figcaption>
            )}
          </motion.figure>
        );
      })}
    </div>
  );
}
