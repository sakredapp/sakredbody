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
}

/** Dark centered hero shared by every pillar page. */
export function PageHero({ eyebrow, title, intro, note, children, testId }: PageHeroProps) {
  return (
    <section className="tone-ink bg-background pt-36 pb-24">
      <div className="container max-w-6xl mx-auto px-4 text-center">
        <motion.div initial="hidden" animate="visible" variants={stagger}>
          <motion.p
            variants={fadeInUp}
            className="text-xs uppercase tracking-widest text-gold mb-4 rule-gold rule-gold-center"
          >
            {eyebrow}
          </motion.p>
          <motion.h1
            variants={fadeInUp}
            className="text-4xl md:text-6xl font-display font-normal mb-6 tracking-tight leading-[1.1]"
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
      <h2 className="text-3xl md:text-4xl font-display font-normal mb-5" data-testid={testId}>
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
