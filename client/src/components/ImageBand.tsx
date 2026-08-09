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
      className={`tone-ink bg-background relative overflow-hidden ${tall ? "py-24 md:py-32" : "py-16 md:py-24"}`}
    >
      <div className="absolute inset-0 z-0">
        <img src={image} alt={alt} loading="lazy" decoding="async" className="w-full h-full object-cover" />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-background to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-background to-transparent" />
        {/* Two scrims, not one. The vertical gradient sets the band into the
            page; the centred radial darkens exactly where the copy sits, so a
            busy photograph — a candlelit table, a lit interior — can't eat the
            headline while the edges of the picture stay visible. */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(to bottom, hsl(30 10% 10%) 0%, hsl(30 10% 10% / 0.72) 16%, hsl(30 10% 10% / 0.55) 50%, hsl(30 10% 10% / 0.78) 84%, hsl(30 10% 10%) 100%)",
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(75% 62% at 50% 50%, hsl(30 10% 8% / 0.62), transparent 72%)",
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
