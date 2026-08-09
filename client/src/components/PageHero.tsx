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
   * Short factual marks: the length of a protocol, the number of stages, what
   * the territory governs. They sit directly under the title, one to a line.
   *
   * They used to run along the bottom of the hero as a wrapping row, which on
   * a phone broke a three-word mark across two lines and left half a screen of
   * nothing between them and the title. Stacked under the name they do the job
   * the intro sentence was doing badly — the hero states three facts instead
   * of one flourish.
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
    <section className="tone-ink bg-background relative overflow-hidden min-h-[68vh] flex flex-col justify-center pt-32 pb-16">
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

      {/* Sections should hand off, not stop. Both edges resolve into the
          page ink so a backdrop never ends on a hard line. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-24 z-[1] bg-gradient-to-b from-background to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-32 z-[1] bg-gradient-to-t from-background to-transparent" />

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
            className="text-5xl md:text-7xl font-display font-normal mb-6 tracking-[-0.03em] leading-[1.02]"
            data-testid={testId}
          >
            {title}
          </motion.h1>
          {marks && marks.length > 0 && (
            <motion.ul
              variants={stagger}
              className="list-none flex flex-col items-center gap-2.5 mb-2"
            >
              {marks.map((mark) => (
                <motion.li
                  key={mark}
                  variants={fadeInUp}
                  className="text-[0.72rem] uppercase tracking-[0.2em] text-muted-foreground"
                >
                  {mark}
                </motion.li>
              ))}
            </motion.ul>
          )}
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
