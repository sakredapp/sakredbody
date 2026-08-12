import { Link } from "wouter";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { Section } from "@/components/Section";
import { PageHero, SectionHeader } from "@/components/PageHero";
import { EmberField } from "@/components/EmberField";
import { ImageBand } from "@/components/ImageBand";
import { CapacityRadar } from "@/components/CapacityRadar";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { usePageMeta } from "@/hooks/use-page-meta";

const fadeInUp = {
  hidden: { opacity: 0, y: 26 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.55, ease: "easeOut" } },
};
const stagger = { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: 0.09 } } };
const viewportOnce = { once: true, amount: 0.2 } as const;

const PILLARS = [
  { name: "Strength", body: "Load something heavy. Add to it over time." },
  { name: "Conditioning", body: "Mostly easy. Occasionally very hard. Almost never moderate." },
  { name: "Mobility", body: "Own the positions. Control at end range, not stretching." },
  { name: "Work capacity", body: "Add volume before you add intensity." },
  { name: "Breath", body: "Nose-breathe everything easy. Brace before you lift heavy." },
  { name: "Hormesis", body: "Heat, cold, fasting. Earn these — they're a garnish." },
];

const MISTAKES = [
  {
    q: "Training hard on a terrain that can't recover",
    a: "The most common failure, and it looks like discipline. Hard training on poor sleep, low minerals and a compromised gut isn't a stimulus — it's another burden on a system already at capacity. You get the fatigue with none of the adaptation. If your performance is flat for a month, the answer is almost never more intensity.",
  },
  {
    q: "Confusing exhaustion with progress",
    a: "A workout that destroys you is easy to write and easy to feel good about. Adaptation comes from a stimulus you can recover from and then repeat. If you can't repeat it next week at the same quality, it wasn't training — it was an event.",
  },
  {
    q: "Skipping strength because it feels vain",
    a: "There's a strain of holistic health that treats muscle as ego. That's a mistake with a real cost: sarcopenia, fragility, poor glucose handling, and a body that can't do anything. Strength isn't vanity. It's the physical form of being useful.",
  },
  {
    q: "Never training hard at all",
    a: "The mirror error. Endless zone-two walks, gentle mobility and restorative everything produces a calm person with no capacity. The body adapts to demand. If you never make one, there is nothing to adapt to.",
  },
];

export default function Build() {
  usePageMeta(
    "Build — Health Should Become Capacity | Sakred Body",
    "Strength, conditioning, mobility, work capacity, breathing mechanics and hormetic stress — logged movement by movement, against a terrain that can actually adapt.",
  );

  return (
    <div className="min-h-screen bg-background text-foreground font-sans">
      <SiteHeader overHero={false} />

      {/* No intro paragraph — see the same note on Restore. The three marks
          were already the best thing in this hero; the Yang essay under them
          was the page's argument delivered before the page. */}
      <PageHero
        eyebrow="Yang · The Advancing Force"
        title={<>Build.</>}
        testId="text-build-headline"
        ambient={<EmberField className="absolute inset-0 w-full h-full opacity-80" />}
        marks={["Muscle is the organ of longevity", "Load, recover, repeat", "No supplement replaces it"]}
      />

      {/* ── The argument ─────────────────────────────────────
          Two paragraphs down to two sentences. The headline was always doing
          the work; what followed restated it twice, once in the negative and
          once in the positive, and then explained the relationship to Restore
          that the previous page already ends by explaining. */}
      <Section tone="raised" width="max-w-4xl">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
          variants={stagger}
          className="max-w-3xl mx-auto text-center"
        >
          <motion.p variants={fadeInUp} className="text-xs uppercase tracking-widest text-gold mb-4 rule-gold rule-gold-center">
            Why This Direction Exists
          </motion.p>
          <motion.h2
            variants={fadeInUp}
            className="text-3xl md:text-5xl font-display font-normal mb-8 leading-tight"
            data-testid="text-argument-headline"
          >
            Health should become
            <br />
            <span className="text-gold">something you can do.</span>
          </motion.h2>
          <motion.p variants={fadeInUp} className="text-muted-foreground leading-relaxed text-base md:text-lg">
            Most health philosophies define success as an absence — no disease, no inflammation, no symptoms.
            We think it should be something you can point at: carry your own weight, work a long day, sleep,
            and do it again.
          </motion.p>
        </motion.div>
      </Section>

      {/* ── Six pillars ──────────────────────────────────────── */}
      <Section tone="ink">
        <motion.div initial="hidden" whileInView="visible" viewport={viewportOnce} variants={stagger}>
          <motion.div variants={fadeInUp}>
            <SectionHeader
              eyebrow="The Qualities"
              title={<>What We Build</>}
              intro="Capacity is the area they enclose, not the length of any one spoke."
              testId="text-pillars-headline"
            />
          </motion.div>

          <motion.div variants={fadeInUp}>
            <CapacityRadar qualities={PILLARS.map((p) => ({ name: p.name, body: p.body }))} />
          </motion.div>
        </motion.div>
      </Section>

      {/* ── The turn ─────────────────────────────────────────
          A held moment between the radar and the accordion, and the one place
          on this page the training photography earns its keep. */}
      <ImageBand
        image="/images/training-focus.webp"
        alt="A lifter set up under a loaded barbell"
        title={<>The body adapts to demand. <span className="text-gold">Make one worth adapting to.</span></>}
        tall
        testId="text-build-turn"
      />

      {/* ── Mistakes ─────────────────────────────────────────── */}
      <Section tone="raised" width="max-w-4xl">
        <motion.div initial="hidden" whileInView="visible" viewport={viewportOnce} variants={stagger}>
          <motion.div variants={fadeInUp}>
            <SectionHeader
              eyebrow="Where It Goes Wrong"
              title={<>Four Ways to <span className="text-gold">Waste Years</span></>}
              testId="text-mistakes-headline"
            />
          </motion.div>

          <motion.div variants={fadeInUp} className="max-w-3xl mx-auto">
            <Accordion type="single" collapsible className="w-full">
              {MISTAKES.map((m, i) => (
                <AccordionItem key={i} value={`mistake-${i}`} data-testid={`mistake-item-${i}`}>
                  <AccordionTrigger className="text-center justify-center gap-3 font-display text-base font-normal">
                    {m.q}
                  </AccordionTrigger>
                  <AccordionContent className="text-muted-foreground leading-relaxed text-sm">
                    {m.a}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </motion.div>
        </motion.div>
      </Section>

      {/* ── What it actually is in the app ───────────────────
          The page described a training philosophy and never mentioned that
          Build is a logging instrument — roughly 470 movements across 54
          categories, sets and loads recorded, personal records surfaced, and
          every session weighed for how much it demanded against how much it
          gave back. Someone could read this page end to end and not know the
          product tracks anything. */}
      <Section tone="ink">
        <motion.div initial="hidden" whileInView="visible" viewport={viewportOnce} variants={stagger}>
          <motion.div variants={fadeInUp}>
            <SectionHeader
              eyebrow="In the App"
              title={<>Every session, <span className="text-gold">on the record.</span></>}
              intro="Around 470 movements across 54 categories — barbell, rings, calisthenics, carries, sprints, mobility. Log the sets, and the app keeps your records, weighs what each session demanded against what it gave back, and reads that against the sleep your phone already has."
              testId="text-inapp-headline"
            />
          </motion.div>

          <motion.div variants={fadeInUp} className="text-center">
            <Link href="/member">
              <Button className="gold-metallic-btn px-8" data-testid="button-build-portal">
                Enter the Portal <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </motion.div>
        </motion.div>
      </Section>

      {/* ── Next ─────────────────────────────────────────────── */}
      <Section tone="raised" width="max-w-3xl" className="text-center">
        <motion.div initial="hidden" whileInView="visible" viewport={viewportOnce} variants={stagger}>
          <motion.h2 variants={fadeInUp} className="text-3xl md:text-4xl font-display font-normal mb-6">
            Capacity you never use
            <br />
            <span className="text-gold">is just potential energy.</span>
          </motion.h2>
          <motion.p variants={fadeInUp} className="text-muted-foreground max-w-xl mx-auto mb-9 leading-relaxed">
            Knowing what to do has never been the hard part. Doing it on a bad week, in a bad mood, without
            supervision — that depends on what surrounds you more than on what you know.
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
