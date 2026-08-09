import { Link } from "wouter";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { Section } from "@/components/Section";
import { Deck } from "@/components/Deck";
import { PageHero, SectionHeader } from "@/components/PageHero";
import { ResonantRing } from "@/components/ResonantRing";
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
    <div className="min-h-screen bg-background text-foreground font-sans">
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
          <motion.div variants={fadeInUp} className="space-y-5 text-muted-foreground leading-relaxed text-base md:text-lg">
            <p>
              Tired. Hungry. Sore. That's the entire vocabulary many adults have for a system producing
              dozens of distinct signals every day. It's like navigating a city with a map that shows three
              streets.
            </p>
            <p className="text-foreground">
              Low resolution means you can only respond in blunt ways — more coffee, more food, more rest,
              more effort — and you'll frequently pick the wrong one, because two very different states felt
              identical on the way in.
            </p>
            <p>
              The fix isn't more data. It's more discrimination. Learning that what you called "tired" is
              actually four different states with four different answers is worth more than any device.
            </p>
          </motion.div>
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

      {/* ── Caution ──────────────────────────────────────────── */}
      <Section tone="ink">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
          variants={stagger}
          className="max-w-3xl mx-auto text-center"
        >
          <motion.h2
            variants={fadeInUp}
            className="text-3xl md:text-4xl font-display font-normal mb-8"
            data-testid="text-caution-headline"
          >
            Attention, <span className="text-gold">not vigilance.</span>
          </motion.h2>
          <motion.div variants={fadeInUp} className="space-y-5 text-muted-foreground leading-relaxed">
            <p>
              There's a version of this that goes wrong, and it's worth naming. Scanning yourself constantly
              for problems isn't literacy — it's anxiety with a health vocabulary, and it makes the nervous
              system worse, not better.
            </p>
            <p className="text-foreground">
              The goal is a light, regular read. Check in, note it, act if the pattern holds for a few days,
              and then get on with your life. Literacy should make you spend <em>less</em> time thinking about
              your body, not more — because you'll trust what you're hearing.
            </p>
            <p>
              And it doesn't replace a doctor. New, severe, or persistent symptoms are for a qualified
              provider, not a checklist.
            </p>
          </motion.div>
        </motion.div>
      </Section>

      {/* ── CTA ──────────────────────────────────────────────── */}
      <Section tone="raised" width="max-w-3xl" className="text-center py-12 md:py-16">
        <motion.div initial="hidden" whileInView="visible" viewport={viewportOnce} variants={stagger}>
          <motion.h2 variants={fadeInUp} className="text-3xl md:text-4xl font-display font-normal mb-6">
            Practice it <span className="text-gold">daily.</span>
          </motion.h2>
          <motion.p variants={fadeInUp} className="text-muted-foreground max-w-xl mx-auto mb-9 leading-relaxed">
            The app's daily check-ins are built for exactly this — a light, repeatable read that turns into a
            record you can look back on.
          </motion.p>
          <motion.div variants={fadeInUp}>
            <Link href="/member">
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
