import { Link } from "wouter";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { Section } from "@/components/Section";
import { PageHero, SectionHeader } from "@/components/PageHero";
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
  {
    name: "Strength",
    body: "The ability to produce force. It protects your joints, your spine, your bone density, and your independence at seventy. Muscle is the largest glucose sink you own and the closest thing to an organ of longevity.",
    practice: "Load something heavy, twice a week, and add to it over time.",
  },
  {
    name: "Conditioning",
    body: "Two systems, not one. A large aerobic base built from easy work, and a smaller amount of genuinely hard work at the top. Most people train permanently in the middle and develop neither.",
    practice: "Mostly easy, occasionally very hard. Almost never moderate.",
  },
  {
    name: "Mobility",
    body: "Strength you cannot express through a full range is strength you don't functionally have. Mobility isn't stretching — it's control at end range, which is a strength quality.",
    practice: "Load the positions you want to own, don't just hold them.",
  },
  {
    name: "Work capacity",
    body: "The total volume you can absorb and recover from in a week. It's the ceiling on everything else, and it's built slowly by doing slightly more than last month without breaking.",
    practice: "Add volume before you add intensity.",
  },
  {
    name: "Breathing mechanics",
    body: "How you breathe under load determines how much load you can take. Nasal breathing, CO2 tolerance, and brace mechanics change what your body will let you attempt.",
    practice: "Nose-breathe everything easy. Learn to brace before you learn to lift heavy.",
  },
  {
    name: "Hormetic stress",
    body: "Heat, cold, altitude, fasting. Small, deliberate doses of survivable stress that make the system more robust — and become just another burden when the terrain underneath can't clear them.",
    practice: "Earn these. They're a garnish, not a foundation.",
  },
];

const READINESS = [
  "You sleep through the night most nights",
  "You have a daily bowel movement without effort",
  "You can nose-breathe on an easy walk",
  "You are not relying on stimulants to start the day",
  "You feel recovered within two days of hard effort",
  "You are eating enough protein and drinking enough water to rebuild",
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
        title={<>Build. <span className="text-gold">Health Becomes Capacity.</span></>}
        intro="Once the terrain can receive demand, it needs demand worth adapting to. Not a body that merely avoids illness — a body that can carry weight, produce force, move through space, withstand adversity, and recover fast enough to do it again."
        note="This is the half the wellness world quietly dropped, and the reason so much of it produces calm, fragile people."
        testId="text-build-headline"
      />

      {/* ── The argument ─────────────────────────────────────── */}
      <Section tone="light">
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
            Strength is what a healthy organism
            <br />
            <span className="text-gold">is supposed to be able to express.</span>
          </motion.h2>
          <motion.div variants={fadeInUp} className="space-y-5 text-muted-foreground leading-relaxed text-base md:text-lg">
            <p>
              Ask most health philosophies what a successful outcome looks like and you get a negative: no
              disease, no inflammation, no symptoms, no toxins. All absence. Nothing you could point at and
              say <em>that</em> — that's what it was for.
            </p>
            <p className="text-foreground">
              We think the outcome should be positive and physical. You can carry your own weight. You can
              pick up something heavy without negotiating with your back. You can run for a train, work a
              long day, sleep, and do it again. You can take a hit and get up.
            </p>
            <p>
              That's not bodybuilding and it isn't aesthetics. It's competence — the physical form of being
              able to participate in your own life instead of managing it from a distance.
            </p>
            <p className="text-foreground">
              And it's the honest end of the arc that Restore begins. Clearing the terrain was never the
              point. It was clearing the terrain <em>so that something could be built on it.</em>
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
              title={<>Six Things Worth <span className="text-gold">Building</span></>}
              intro="Not a program. The qualities that actually matter, what each one is for, and the single principle that governs it."
              testId="text-pillars-headline"
            />
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-x-12 gap-y-14">
            {PILLARS.map((p, i) => (
              <motion.div variants={fadeInUp} key={p.name}>
                <div
                  className="h-full pt-8 border-t border-border text-center flex flex-col"
                  data-testid={`card-pillar-${i}`}
                >
                  <span className="font-mono text-[11px] text-muted-foreground mb-3">{String(i + 1).padStart(2, "0")}</span>
                  <h3 className="font-display text-2xl mb-4">{p.name}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed flex-1">{p.body}</p>
                  <p className="text-sm text-gold/85 mt-5 pt-4 border-t border-border italic">
                    {p.practice}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </Section>

      {/* ── Readiness gate ───────────────────────────────────── */}
      <Section tone="light">
        <motion.div initial="hidden" whileInView="visible" viewport={viewportOnce} variants={stagger}>
          <motion.div variants={fadeInUp}>
            <SectionHeader
              eyebrow="The Gate"
              title={<>Are You Ready to <span className="text-gold">Be Loaded?</span></>}
              intro="This is the question almost no training program asks. If most of these aren't true, more intensity will make things worse, not better — go back to Restore first. It isn't a delay. It's what makes the training work at all."
              testId="text-readiness-headline"
            />
          </motion.div>

          <div className="max-w-2xl mx-auto">
            {READINESS.map((r, i) => (
              <motion.div
                variants={fadeInUp}
                key={r}
                className="flex flex-col items-center gap-2.5 py-5 border-b border-border/50 last:border-0 text-center"
                data-testid={`row-readiness-${i}`}
              >
                <span className="h-4 w-4 rounded-full border border-gold/40" />
                <span className="text-muted-foreground">{r}</span>
              </motion.div>
            ))}
          </div>

          <motion.div variants={fadeInUp} className="text-center mt-10">
            <Link href="/restore">
              <Button variant="outline" className="border-gold-subtle text-gold px-8" data-testid="button-back-restore">
                Not yet? Start with Restore
              </Button>
            </Link>
          </motion.div>
        </motion.div>
      </Section>

      {/* ── Mistakes ─────────────────────────────────────────── */}
      <Section tone="ink">
        <motion.div initial="hidden" whileInView="visible" viewport={viewportOnce} variants={stagger}>
          <motion.div variants={fadeInUp}>
            <SectionHeader
              eyebrow="Where It Goes Wrong"
              title={<>Four Ways to <span className="text-gold">Waste Years</span></>}
              intro="Two of these are errors of too much. Two are errors of too little. People rarely make both kinds — they pick the one that flatters their temperament."
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
      <Section tone="light" className="text-center py-20">
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
