import { Link } from "wouter";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { Section } from "@/components/Section";
import { PageHero, SectionHeader } from "@/components/PageHero";
import { EmberField } from "@/components/EmberField";
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
    a: "This is the single most common failure, and it looks like discipline. Hard training on poor sleep, low minerals, and a compromised gut isn't a stimulus — it's another burden on a system already at capacity. You get the fatigue of training with none of the adaptation. If your performance is flat for a month, the answer is almost never more intensity.",
  },
  {
    q: "Confusing exhaustion with progress",
    a: "A workout that destroys you is easy to write and easy to feel good about. Adaptation comes from a stimulus you can recover from and then repeat. If you can't repeat it next week at the same or better quality, it wasn't training — it was an event.",
  },
  {
    q: "Skipping strength because it feels vain",
    a: "There's a strain of holistic health that treats muscle as ego. That's a mistake with a real cost: sarcopenia, fragility, poor glucose handling, and a body that can't do anything. Strength isn't vanity. It's the physical form of being useful.",
  },
  {
    q: "Never training hard at all",
    a: "The mirror error. Endless zone-two walks, gentle mobility, and restorative everything produces a calm person with no capacity. The body adapts to demand. If you never make one, there is nothing to adapt to.",
  },
];

export default function Build() {
  usePageMeta(
    "Build — Health Should Become Capacity | Sakred Body",
    "Strength, conditioning, mobility, work capacity, breathing mechanics, and hormetic stress. Not a body that avoids illness — a body that can carry weight and do something.",
  );

  return (
    <div className="min-h-screen bg-background text-foreground font-sans">
      <SiteHeader overHero={false} />

      <PageHero
        eyebrow="Territory Two · Yang"
        title={<>Build.</>}
        testId="text-build-headline"
        ambient={<EmberField className="absolute inset-0 w-full h-full opacity-80" />}
        marks={["Muscle is the organ of longevity", "Load, recover, repeat", "No supplement replaces it"]}
      />

      {/* ── The argument ─────────────────────────────────────── */}
      <Section tone="raised">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
          variants={stagger}
          className="max-w-3xl mx-auto text-center"
        >
          <motion.p variants={fadeInUp} className="text-xs uppercase tracking-widest text-gold mb-4 rule-gold rule-gold-center">
            Why This Territory Exists
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
          <motion.div variants={fadeInUp} className="space-y-5 text-muted-foreground leading-relaxed text-base md:text-lg">
            <p>
              Ask most health philosophies what success looks like and you get a negative: no disease, no
              inflammation, no symptoms. All absence. Nothing you could point at and say <em>that</em> —
              that's what it was for.
            </p>
            <p className="text-foreground">
              We think it should be positive and physical. You can carry your own weight, work a long day,
              sleep, and do it again. That's competence, not aesthetics — and it's the honest end of the arc
              Restore begins. Clearing the terrain was never the point. It was clearing the terrain{" "}
              <em>so that something could be built on it.</em>
            </p>
          </motion.div>
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

      {/* ── Mistakes ─────────────────────────────────────────── */}
      <Section tone="raised">
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

      {/* ── Next ─────────────────────────────────────────────── */}
      <Section tone="ink" className="text-center py-20">
        <motion.div initial="hidden" whileInView="visible" viewport={viewportOnce} variants={stagger}>
          <motion.h2 variants={fadeInUp} className="text-3xl md:text-4xl font-display font-normal mb-6">
            Capacity you never use
            <br />
            <span className="text-gold">is just potential energy.</span>
          </motion.h2>
          <motion.p variants={fadeInUp} className="text-muted-foreground max-w-xl mx-auto mb-9 leading-relaxed">
            Knowing what to do has never been the hard part. Becoming the kind of person who does it — on a
            bad week, in a bad mood, without supervision — is the whole game.
          </motion.p>
          <motion.div variants={fadeInUp}>
            <Link href="/embody">
              <Button size="lg" className="gold-metallic-btn px-8" data-testid="button-next-embody">
                Next: Embody <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
          </motion.div>
        </motion.div>
      </Section>

      <SiteFooter />
    </div>
  );
}
