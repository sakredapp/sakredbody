import { ReactNode } from "react";
import { motion } from "framer-motion";

const fadeInUp = {
  hidden: { opacity: 0, y: 26 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" } },
};

interface ImageBandProps {
  image: string;
  alt: string;
  eyebrow?: string;
  title: ReactNode;
  children?: ReactNode;
  /** Taller treatment for a section meant to land as a moment. */
  tall?: boolean;
  testId?: string;
}

/**
 * Full-bleed photographic band with a scrim heavy enough to keep centred copy
 * well past AA contrast. Always ink-toned, so it counts as a dark band in a
 * page's light/ink alternation.
 */
export function ImageBand({ image, alt, eyebrow, title, children, tall, testId }: ImageBandProps) {
  return (
    <section
      className={`tone-ink bg-background relative overflow-hidden ${tall ? "py-32 md:py-44" : "py-24 md:py-32"}`}
    >
      <div className="absolute inset-0 z-0">
        <img src={image} alt={alt} className="w-full h-full object-cover" />
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(to bottom, hsl(30 10% 10%) 0%, hsl(30 10% 10% / 0.66) 16%, hsl(30 10% 10% / 0.45) 50%, hsl(30 10% 10% / 0.72) 84%, hsl(30 10% 10%) 100%)",
          }}
        />
      </div>

      <div className="container max-w-6xl mx-auto px-4 relative z-10">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.3 }}
          variants={fadeInUp}
          className="max-w-2xl mx-auto text-center"
        >
          {eyebrow && (
            <p className="text-xs uppercase tracking-widest text-gold mb-4 rule-gold rule-gold-center">
              {eyebrow}
            </p>
          )}
          <h2 className="text-3xl md:text-5xl font-display font-normal leading-tight" data-testid={testId}>
            {title}
          </h2>
          {children && <div className="mt-6 text-muted-foreground leading-relaxed">{children}</div>}
        </motion.div>
      </div>
    </section>
  );
}
