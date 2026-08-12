import { Link } from "wouter";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { Section } from "@/components/Section";
import { Deck } from "@/components/Deck";
import { ImageBand } from "@/components/ImageBand";
import { PageHero, SectionHeader } from "@/components/PageHero";
import { ResonantRing } from "@/components/ResonantRing";
import { BreathPacer } from "@/components/BreathPacer";
import { EMBODIED_PRACTICE } from "@/data/territories";
import { Button } from "@/components/ui/button";
import { usePageMeta } from "@/hooks/use-page-meta";

const fadeInUp = {
  hidden: { opacity: 0, y: 26 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.55, ease: "easeOut" } },
};
const stagger = { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: 0.07 } } };
const viewportOnce = { once: true, amount: 0.15 } as const;

const CONFUSIONS = [
  {
    pair: "Hunger vs. thirst",
    body: "They share signalling machinery and get confused constantly, especially in the afternoon. Mild dehydration reads as a craving far more often than people expect.",
  },
  {
    pair: "Muscular fatigue vs. nervous-system fatigue",
    body: "Sore legs are one thing. Flat, irritable, unmotivated, and strong-but-unwilling is another entirely — and it's the one that means back off, not push through.",
  },
  {
    pair: "Tired vs. under-recovered",
    body: "Tired resolves with a night of sleep. Under-recovered doesn't, and stacks quietly across weeks until something gives.",
  },
  {
    pair: "Hungry vs. under-fuelled",
    body: "Chronic under-eating often blunts appetite rather than raising it. Absence of hunger is not evidence that you've eaten enough.",
  },
  {
    pair: "Anxious vs. dysregulated",
    body: "A body running on caffeine, poor sleep, and low minerals produces something almost indistinguishable from anxiety — and answers to entirely different interventions.",
  },
  {
    pair: "Stagnant vs. lazy",
    body: "Poor drainage, low thyroid output, and sluggish circulation feel like a character flaw from the inside. It usually isn't one.",
  },
];

export default function BodyLiteracy() {
  usePageMeta(
    "Body Literacy — Learn to Read the Organism You Live In | Sakred Body",
    "Not self-diagnosis. Learning to distinguish hunger from thirst, muscular fatigue from nervous-system fatigue, and tired from under-recovered.",
  );

  return (
    <div className="tone-ink min-h-screen bg-background text-foreground font-sans">
      <SiteHeader overHero={false} />

      <PageHero
        eyebrow="The Skill"
        title={<>Body Literacy.</>}
        testId="text-literacy-headline"
        ambient={<ResonantRing className="absolute inset-0 w-full h-full opacity-50" rings={5} />}
        marks={["Signals, not symptoms", "Read it daily", "Awareness beats restriction"]}
      />

      {/* ── Why ──────────────────────────────────────────────── */}
      <Section tone="raised" width="max-w-4xl">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
          variants={stagger}
          className="max-w-3xl mx-auto text-center"
        >
          <motion.p variants={fadeInUp} className="text-xs uppercase tracking-widest text-gold mb-4 rule-gold rule-gold-center">
            Why It Matters
          </motion.p>
          <motion.h2
            variants={fadeInUp}
            className="text-3xl md:text-5xl font-display font-normal mb-8 leading-tight"
            data-testid="text-why-headline"
          >
            Most people are working
            <br />
            <span className="text-gold">from two or three signals.</span>
          </motion.h2>
          {/* Three paragraphs down to one. The middle one restated the first
              with a different metaphor, and the third restated the headline. */}
          <motion.p variants={fadeInUp} className="text-muted-foreground leading-relaxed text-base md:text-lg">
            Tired. Hungry. Sore. That's the whole vocabulary many adults have for a system producing dozens
            of distinct signals a day — and low resolution means blunt answers: more coffee, more food, more
            rest. The fix isn't more data. It's learning that what you called tired is four different states
            with four different answers.
          </motion.p>
        </motion.div>
      </Section>

      {/* ── Confusions ───────────────────────────────────────── */}
      <Section tone="ink">
        <motion.div initial="hidden" whileInView="visible" viewport={viewportOnce} variants={stagger}>
          <motion.div variants={fadeInUp}>
            <SectionHeader
              eyebrow="The Distinctions"
              title={<>Six Pairs Worth <span className="text-gold">Telling Apart</span></>}
              testId="text-confusions-headline"
            />
          </motion.div>

          <motion.div variants={fadeInUp}>
            <Deck
              testId="deck-confusions"
              autoAdvanceMs={9000}
              cards={CONFUSIONS.map((c) => ({ title: c.pair, body: c.body }))}
            />
          </motion.div>
        </motion.div>
      </Section>

      {/* ── Caution ──────────────────────────────────────────
          Three ink sections used to run together here — the deck, this, and
          the practice — which is what made the middle of this page read as one
          long slab. As a band it separates them and the caution lands as a
          held moment instead of a third block of body copy.

          The medical line is not trimmed away with the rest. It is the one
          sentence on this page that has to survive. */}
      <ImageBand
        image="/images/wooden-pavilion.webp"
        alt="An open wooden pavilion looking out over still water"
        title={<>Attention, <span className="text-gold">not vigilance.</span></>}
        tall
        testId="text-caution-headline"
      >
        <p>
          Scanning yourself for problems isn't literacy — it's anxiety with a health vocabulary. The goal is
          a light, regular read, and then getting on with your life. New, severe or persistent symptoms are
          for a qualified provider, not a checklist.
        </p>
      </ImageBand>

      {/* ── The practice ─────────────────────────────────────
          Rehoused from the retired Embody page. Reading your state and doing
          something about it are the same skill at two ranges, and splitting
          them across two destinations was the thing that made "Embody" look
          like a fourth pillar rather than the result of the other three. */}
      <Section tone="ink" width="max-w-4xl">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
          variants={stagger}
        >
          <motion.div variants={fadeInUp}>
            <SectionHeader
              eyebrow="The Practice"
              title={<>Reading it is half. <span className="text-gold">Living it is the rest.</span></>}
              intro={EMBODIED_PRACTICE.promise}
              onInk
            />
          </motion.div>

          <div className="grid md:grid-cols-2 gap-10 items-center">
            <motion.div variants={fadeInUp}>
              <p className="text-muted-foreground leading-relaxed mb-6">{EMBODIED_PRACTICE.body}</p>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
                {EMBODIED_PRACTICE.domains.map((d) => (
                  <li key={d} className="text-sm text-muted-foreground flex gap-2.5">
                    <span className="text-gold shrink-0" aria-hidden="true">·</span>
                    {d}
                  </li>
                ))}
              </ul>
            </motion.div>

            <motion.div variants={fadeInUp}>
              <BreathPacer className="w-full" />
            </motion.div>
          </div>
        </motion.div>
      </Section>

      {/* ── CTA ──────────────────────────────────────────────── */}
      <Section tone="raised" width="max-w-3xl" className="text-center">
        <motion.div initial="hidden" whileInView="visible" viewport={viewportOnce} variants={stagger}>
          <motion.h2 variants={fadeInUp} className="text-3xl md:text-4xl font-display font-normal mb-6">
            Practice it <span className="text-gold">daily.</span>
          </motion.h2>
          <motion.p variants={fadeInUp} className="text-muted-foreground max-w-xl mx-auto mb-9 leading-relaxed">
            The app's daily check-ins are built for exactly this — a light, repeatable read that turns into a
            record you can look back on.
          </motion.p>
          <motion.div variants={fadeInUp}>
            <Link href="/login">
              <Button size="lg" className="gold-metallic-btn px-8" data-testid="button-app">
                See the App <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
          </motion.div>
        </motion.div>
      </Section>

      <SiteFooter />
    </div>
  );
}
