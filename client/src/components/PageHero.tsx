import { ReactNode } from "react";
import { motion } from "framer-motion";

const fadeInUp = {
  hidden: { opacity: 0, y: 26 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.55, ease: "easeOut" } },
};

const stagger = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.09 } },
};

interface PageHeroProps {
  eyebrow: string;
  title: ReactNode;
  intro?: ReactNode;
  /** Smaller line under the intro. */
  note?: ReactNode;
  children?: ReactNode;
  testId?: string;
  /** Optional backdrop photo. A scrim keeps the copy well past AA contrast. */
  image?: string;
  imageAlt?: string;
  /**
   * A live backdrop — the flow field on Restore, embers on Build. Rendered
   * behind the photo scrim and above the photograph.
   */
  ambient?: ReactNode;
  /**
   * Short factual marks printed along the bottom of the hero: the length of a
   * protocol, the number of stages, what the territory governs. They exist so
   * the hero states something instead of only naming the page — the reason
   * the old one ran straight into the next header with nothing said.
   */
  marks?: string[];
}

/** Dark centered hero shared by every pillar page. */
export function PageHero({
  eyebrow,
  title,
  intro,
  note,
  children,
  testId,
  image,
  imageAlt,
  ambient,
  marks,
}: PageHeroProps) {
  return (
    <section className="tone-ink bg-background relative overflow-hidden min-h-[80vh] flex flex-col justify-center pt-32 pb-14">
      {image && (
        <div className="absolute inset-0 z-0">
          <img src={image} alt={imageAlt ?? ""} fetchPriority="high" decoding="async" className="w-full h-full object-cover" />
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(to bottom, hsl(30 10% 10% / 0.92) 0%, hsl(30 10% 10% / 0.6) 40%, hsl(30 10% 10% / 0.78) 78%, hsl(30 10% 10%) 100%)",
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-b from-[hsl(30_10%_8%/0.6)] via-transparent to-[hsl(30_10%_10%)]" />
        </div>
      )}
      {ambient && <div className="absolute inset-0 z-0">{ambient}</div>}

      <div className="container max-w-6xl mx-auto px-4 text-center relative z-10">
        <motion.div initial="hidden" animate="visible" variants={stagger}>
          <motion.p
            variants={fadeInUp}
            className="text-xs uppercase tracking-widest text-gold mb-4 rule-gold rule-gold-center"
          >
            {eyebrow}
          </motion.p>
          <motion.h1
            variants={fadeInUp}
            className="text-5xl md:text-7xl font-display font-normal mb-7 tracking-[-0.03em] leading-[1.02]"
            data-testid={testId}
          >
            {title}
          </motion.h1>
          {intro && (
            <motion.p
              variants={fadeInUp}
              className="text-muted-foreground leading-relaxed max-w-2xl mx-auto text-base md:text-lg"
            >
              {intro}
            </motion.p>
          )}
          {note && (
            <motion.p
              variants={fadeInUp}
              className="text-muted-foreground leading-relaxed max-w-2xl mx-auto mt-4 text-sm"
            >
              {note}
            </motion.p>
          )}
          {children && <motion.div variants={fadeInUp} className="mt-9">{children}</motion.div>}
        </motion.div>
      </div>

      {marks && marks.length > 0 && (
        <motion.ul
          initial="hidden"
          animate="visible"
          variants={stagger}
          className="container max-w-4xl mx-auto px-4 relative z-10 mt-14 flex flex-wrap justify-center gap-x-10 gap-y-4 list-none"
        >
          {marks.map((mark) => (
            <motion.li
              key={mark}
              variants={fadeInUp}
              className="text-[0.7rem] uppercase tracking-[0.18em] text-muted-foreground"
            >
              {mark}
            </motion.li>
          ))}
        </motion.ul>
      )}
    </section>
  );
}

interface SectionHeaderProps {
  eyebrow?: string;
  title: ReactNode;
  intro?: ReactNode;
  /** Use on ink-toned sections so the intro copy stays legible. */
  onInk?: boolean;
  className?: string;
  testId?: string;
}

/** Centered eyebrow + headline + intro used at the top of most sections. */
export function SectionHeader({ eyebrow, title, intro, onInk, className, testId }: SectionHeaderProps) {
  return (
    <div className={`text-center max-w-2xl mx-auto ${className ?? "mb-14"}`}>
      {eyebrow && (
        <p className="text-xs uppercase tracking-widest text-gold mb-4 rule-gold rule-gold-center">
          {eyebrow}
        </p>
      )}
      <h2 className="text-4xl md:text-5xl font-display font-normal mb-6 tracking-tight leading-[1.08]" data-testid={testId}>
        {title}
      </h2>
      {intro && (
        <p className={`leading-relaxed ${onInk ? "text-muted-foreground" : "text-muted-foreground"}`}>
          {intro}
        </p>
      )}
    </div>
  );
}
