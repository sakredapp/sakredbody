import { Link } from "wouter";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { GemStone, type Stone } from "@/components/GemStone";

/**
 * Three products, told apart.
 *
 * Retreats, the Mastermind and Sakred Executive overlapped enough on the site
 * that a reader landing on any one of them could not tell what the other two
 * were — the three pages each described small groups, coaching and a week
 * somewhere good.
 *
 * The distinction is what actually happens. A retreat is the work: protocols
 * run, bodies trained, sleep repaired, in a place with nothing in the way. A
 * mastermind is discussion and teaching — minds meeting, not treatment.
 * Executive is one person, privately. Stated plainly on all three pages, the
 * confusion goes away for the cost of one band.
 */

interface Way {
  key: string;
  name: string;
  shape: string;
  body: string;
  href: string;
  stone: Stone;
}

const WAYS: Way[] = [
  {
    key: "retreats",
    name: "Retreats",
    shape: "The work, in person",
    body: "Healing, done in person. Days of actual practice — drainage, training, sleep repair, breathwork — somewhere with nothing in the way. Individual retreats run Yin or Yang: one clears, the other loads. Six formats, three days to two weeks.",
    href: "/retreats",
    stone: { h: 148, s: 34, l: 44 },
  },
  {
    key: "mastermind",
    name: "The Mastermind",
    shape: "Minds, meeting",
    body: "Education, not treatment. Cohorts on a real schedule, the room they meet in, and the portal that runs your practice between them. Individual cohorts run Yin or Yang, the same as the retreats do.",
    href: "/mastermind",
    stone: { h: 38, s: 62, l: 52 },
  },
  {
    key: "executive",
    name: "Sakred Executive",
    shape: "One to one",
    body: "Private coaching, built around your body and your calendar. A small number of clients at a time, by application.",
    href: "/executive",
    stone: { h: 212, s: 34, l: 42 },
  },
];

const fadeInUp = {
  hidden: { opacity: 0, y: 22 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" } },
};
const stagger = { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: 0.08 } } };

export function WaysToWork({ current }: { current: "retreats" | "mastermind" | "executive" }) {
  return (
    <motion.div
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: 0.2 }}
      variants={stagger}
      className="grid sm:grid-cols-3 gap-6"
      data-testid="ways-to-work"
    >
      {WAYS.map((way) => {
        const here = way.key === current;
        const card = (
          <div
            className={`h-full rounded-2xl border p-6 text-center transition-colors ${
              here
                ? "border-gold/50 bg-[hsl(30_9%_14%)]"
                : "border-border hover:border-gold/35 bg-[hsl(30_9%_11%)]"
            }`}
            data-testid={`way-${way.key}`}
          >
            <GemStone stone={way.stone} spinRate={here ? 0.26 : 0.16} className="h-16 w-16 mx-auto mb-1" />
            <p className="text-[10px] uppercase tracking-[0.2em] text-gold mb-2">{way.shape}</p>
            <h3 className="font-display text-xl mb-2.5">{way.name}</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">{way.body}</p>
            {!here && (
              <span className="mt-4 text-xs text-gold inline-flex items-center gap-1.5">
                Look <ArrowRight className="h-3.5 w-3.5" />
              </span>
            )}
            {here && <p className="mt-4 text-xs text-muted-foreground">You're here</p>}
          </div>
        );

        return (
          <motion.div variants={fadeInUp} key={way.key}>
            {here ? card : <Link href={way.href}>{card}</Link>}
          </motion.div>
        );
      })}
    </motion.div>
  );
}
