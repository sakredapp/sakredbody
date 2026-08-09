import { Link } from "wouter";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { Section } from "@/components/Section";
import { PageHero, SectionHeader } from "@/components/PageHero";
import { Deck } from "@/components/Deck";
import { BreathPacer } from "@/components/BreathPacer";
import { Button } from "@/components/ui/button";
import { usePageMeta } from "@/hooks/use-page-meta";

const fadeInUp = {
  hidden: { opacity: 0, y: 26 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.55, ease: "easeOut" } },
};
const stagger = { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: 0.09 } } };
const viewportOnce = { once: true, amount: 0.2 } as const;

const PRACTICES = [
  {
    title: "Design the environment",
    body: "Discipline is mostly a design problem wearing a moral costume. What's in the fridge, how far the gym is, whether the phone charges in the bedroom. Decide once, in advance, and stop spending willpower on it daily.",
  },
  {
    title: "Anchor the day at both ends",
    body: "A morning that starts with light and movement and an evening that ends with darkness and a downshift. Everything unpredictable in between matters less than most people think.",
  },
  {
    title: "Protect your attention",
    body: "The nervous system does not distinguish between a real threat and a feed engineered to feel like one. Constant low-grade stimulation is a physiological input, not a lifestyle preference.",
  },
  {
    title: "Hold a standard, not a streak",
    body: "Streaks break and take the whole practice with them. A standard survives a missed day, because the standard was never perfection — it was returning.",
  },
  {
    title: "Know when to yield",
    body: "The hardest skill here. Pushing when the body says push and backing off when it says back off requires that you can hear it at all — and that you trust it more than your plan.",
  },
  {
    title: "Move with the season",
    body: "More building in the light half of the year, more restoration in the dark half. Traditional systems assumed this. Modern life pretends every month is the same and then wonders why February is hard.",
  },
];

export default function Embody() {
  usePageMeta(
    "Embody — Practice, Discipline, and Body Awareness | Sakred Body",
    "Information is not enough. Habits, standards, attention, environment design, and the judgment to know when to push and when to yield.",
  );

  return (
    <div className="min-h-screen bg-background text-foreground font-sans">
      <SiteHeader overHero={false} />

      <PageHero
        eyebrow="Territory Three · Where They Meet"
        title={<>Embody.</>}
        testId="text-embody-headline"
        ambient={<BreathPacer className="absolute inset-0 w-full h-full opacity-40" />}
        marks={["Four counts in, six out", "Daily, not occasionally", "The practice compounds"]}
      />

      {/* ── The argument ─────────────────────────────────────── */}
      <Section tone="ink">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
          variants={stagger}
          className="max-w-3xl mx-auto text-center"
        >
          <motion.p variants={fadeInUp} className="text-xs uppercase tracking-widest text-gold mb-4 rule-gold rule-gold-center">
            The Gap
          </motion.p>
          <motion.h2
            variants={fadeInUp}
            className="text-3xl md:text-5xl font-display font-normal mb-8 leading-tight"
            data-testid="text-gap-headline"
          >
            Nobody fails from a
            <br />
            <span className="text-gold">shortage of information.</span>
          </motion.h2>
          <motion.div variants={fadeInUp} className="space-y-5 text-muted-foreground leading-relaxed text-base md:text-lg">
            <p>
              Everything on this site could be known perfectly and change nothing. The protocols are not
              secret. The training principles have been stable for fifty years. Almost nobody is failing
              because they lack the correct information.
            </p>
            <p className="text-foreground">
              They're failing because knowledge lives in one place and behavior lives in another, and there's
              no bridge between them except practice — repeated long enough that it stops being a decision.
            </p>
            <p>
              This territory is that bridge. It's the least glamorous part of the whole system and the only
              one that determines whether any of the rest of it ever happens.
            </p>
          </motion.div>
        </motion.div>
      </Section>

      {/* ── Practices ────────────────────────────────────────── */}
      <Section tone="raised">
        <motion.div initial="hidden" whileInView="visible" viewport={viewportOnce} variants={stagger}>
          <motion.div variants={fadeInUp}>
            <SectionHeader
              eyebrow="The Practice"
              title={<>Six Things That <span className="text-gold">Actually Hold</span></>}
              intro="Not motivation. Structure."
              testId="text-practices-headline"
            />
          </motion.div>

          <motion.div variants={fadeInUp}>
            <Deck
              testId="deck-practices"
              autoAdvanceMs={8000}
              cards={PRACTICES.map((p) => ({ title: p.title, body: p.body }))}
            />
          </motion.div>
        </motion.div>
      </Section>

      {/* ── Metrics ──────────────────────────────────────────── */}
      <Section tone="ink">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
          variants={stagger}
          className="max-w-3xl mx-auto text-center"
        >
          <motion.p variants={fadeInUp} className="text-xs uppercase tracking-widest text-gold mb-4 rule-gold rule-gold-center">
            On Tracking
          </motion.p>
          <motion.h2
            variants={fadeInUp}
            className="text-3xl md:text-4xl font-display font-normal mb-8"
            data-testid="text-metrics-headline"
          >
            Metrics are mirrors, <span className="text-gold">not masters.</span>
          </motion.h2>
          <motion.div variants={fadeInUp} className="space-y-5 text-muted-foreground leading-relaxed">
            <p>
              We build tracking into the app on purpose, and we'll say the obvious risk out loud: a number
              can quietly replace the thing it was measuring. People stop sleeping and start optimizing a
              sleep score. They stop noticing how they feel and start checking whether they're allowed to
              feel it.
            </p>
            <p className="text-foreground">
              Use the data to check your read, not to replace it. If your recovery score says you're fine and
              you know you're not, you're not. The instrument is a second opinion on a body you should be
              learning to read directly.
            </p>
          </motion.div>
          <motion.div variants={fadeInUp} className="mt-9">
            <Link href="/body-literacy">
              <Button variant="outline" className="border-gold-subtle text-gold px-8" data-testid="button-body-literacy">
                Learn to Read the Signals <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </motion.div>
        </motion.div>
      </Section>

      {/* ── Next ─────────────────────────────────────────────── */}
      <Section tone="raised" className="text-center py-12 md:py-16">
        <motion.div initial="hidden" whileInView="visible" viewport={viewportOnce} variants={stagger}>
          <motion.h2 variants={fadeInUp} className="text-3xl md:text-4xl font-display font-normal mb-6">
            No one does this <span className="text-gold">alone.</span>
          </motion.h2>
          <motion.p variants={fadeInUp} className="text-muted-foreground max-w-xl mx-auto mb-9 leading-relaxed">
            Practice holds far better inside an environment that expects it. The last territory is the one
            most health systems ignore completely — the people around you.
          </motion.p>
          <motion.div variants={fadeInUp}>
            <Link href="/retreats">
              <Button size="lg" className="gold-metallic-btn px-8" data-testid="button-next-gather">
                Next: Gather <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
          </motion.div>
        </motion.div>
      </Section>

      <SiteFooter />
    </div>
  );
}
