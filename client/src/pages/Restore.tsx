import { Link } from "wouter";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { Section } from "@/components/Section";
import { PageHero, SectionHeader } from "@/components/PageHero";
import { FlowField } from "@/components/FlowField";
import { Deck } from "@/components/Deck";
import { FlipCards } from "@/components/FlipCards";
import { Button } from "@/components/ui/button";
import { usePageMeta } from "@/hooks/use-page-meta";

const fadeInUp = {
  hidden: { opacity: 0, y: 26 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.55, ease: "easeOut" } },
};
const stagger = { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: 0.09 } } };
const viewportOnce = { once: true, amount: 0.2 } as const;

const BURDENS = [
  {
    title: "Drainage that doesn't drain",
    body: "The lymphatic system has no pump. If you sit all day, it barely moves — and anything the liver hands off has nowhere to go. This is why people who start aggressive cleanses feel worse: they mobilized a load the exits couldn't clear.",
  },
  {
    title: "A gut that can't extract",
    body: "Low enzyme output, a compromised lining, and poor bile flow mean the best diet in the world arrives and leaves without being used. Nutrition is not what you eat. It's what you absorb.",
  },
  {
    title: "A nervous system stuck on",
    body: "Digestion, repair, and sleep are all downstream of state. A body that never leaves sympathetic drive doesn't digest well, doesn't sleep deeply, and doesn't rebuild — regardless of what you feed it.",
  },
  {
    title: "Depletion mistaken for identity",
    body: "Chronic low minerals and low hydration get normalized as personality — tired, wired, foggy, cold, anxious. Most people have never felt the baseline they're comparing themselves against.",
  },
];

const ORDER = [
  { step: "Open the exits", body: "Bowels, lymph, sweat, breath. Before anything is mobilized, it needs somewhere to go." },
  { step: "Calm the state", body: "Sleep, light, and nervous-system regulation. Nothing repairs in a body still braced." },
  { step: "Restore digestion", body: "Enzymes, bile, meal spacing, and the gut lining — the gate everything else passes through." },
  { step: "Then clear", body: "Only now does a cleanse do what it claims. Order is the entire difference between relief and a crash." },
  { step: "Then rebuild", body: "Minerals, protein, reseeding, and structure. Restoration ends by putting something back." },
];

const PROTOCOLS = [
  { name: "Digestive Stability", days: "21 days", note: "The clearing phase. Start here." },
  { name: "Liver & Detox Support", days: "21 days", note: "Two-phase detox pathways and bile flow." },
  { name: "Lymphatic & Circulatory Cleanse", days: "21 days", note: "Eight practices, no equipment required." },
  { name: "Full Gut Reset & Drainage", days: "28 days", note: "The rebuilding phase. Runs after stability." },
  { name: "Sleep & Nervous System", days: "14 days", note: "The shortest, and it makes the rest easier." },
];

export default function Restore() {
  usePageMeta(
    "Restore — Clear the Terrain | Sakred Body",
    "Healing is not endlessly adding things. Drainage, digestion, nervous-system regulation, minerals, and sleep — the order restoration actually has to happen in.",
  );

  return (
    <div className="min-h-screen bg-background text-foreground font-sans">
      <SiteHeader overHero={false} />

      <PageHero
        eyebrow="Territory One · Yin"
        title={<>Restore.</>}
        testId="text-restore-headline"
        ambient={<FlowField className="absolute inset-0 w-full h-full opacity-70" />}
        marks={["Drainage before detox", "Four protocols", "14 to 28 days", "The lymph has no pump"]}
      />

      {/* ── The burden ───────────────────────────────────────── */}
      <Section tone="ink">
        <motion.div initial="hidden" whileInView="visible" viewport={viewportOnce} variants={stagger}>
          <motion.div variants={fadeInUp}>
            <SectionHeader
              eyebrow="The Burden"
              title={<>What's In the Way</>}
              intro="These four travel together, and explain why doing everything right changes nothing."
              testId="text-burden-headline"
            />
          </motion.div>

          <motion.div variants={fadeInUp}>
            <FlipCards testId="flip-burdens" columns={4} cards={BURDENS} />
          </motion.div>
        </motion.div>
      </Section>

      {/* ── The order ────────────────────────────────────────── */}
      <Section tone="light">
        <motion.div initial="hidden" whileInView="visible" viewport={viewportOnce} variants={stagger}>
          <motion.div variants={fadeInUp}>
            <SectionHeader
              eyebrow="The Order"
              title={<>Order Is the Method</>}
              intro="Almost every failed protocol is a right action taken at the wrong time."
              testId="text-order-headline"
            />
          </motion.div>

          {/* Numbered, because here the number is the argument. This is the one
              place on the site where a step's position is the content. */}
          <motion.div variants={fadeInUp}>
            <FlipCards
              testId="flip-order"
              columns={4}
              cards={ORDER.map((o, i) => ({
                title: o.step,
                body: o.body,
                meta: `Step ${i + 1}`,
              }))}
            />
          </motion.div>

          <motion.p
            variants={fadeInUp}
            className="text-center font-display text-xl md:text-2xl mt-12 max-w-2xl mx-auto leading-relaxed"
          >
            You cannot clean a room
            <br />
            <span className="text-gold">while the door is still locked.</span>
          </motion.p>
        </motion.div>
      </Section>

      {/* ── Protocols ────────────────────────────────────────── */}
      <Section tone="ink">
        <motion.div initial="hidden" whileInView="visible" viewport={viewportOnce} variants={stagger}>
          <motion.div variants={fadeInUp}>
            <SectionHeader
              eyebrow="In Practice"
              title={<>Where to Start</>}
              intro="A few of them. More over time."
              testId="text-protocols-headline"
            />
          </motion.div>

          <motion.div variants={fadeInUp}>
            <Deck
              testId="deck-protocols"
              cards={PROTOCOLS.map((p) => ({ title: p.name, body: p.note, meta: p.days }))}
            />
          </motion.div>

          <motion.div variants={fadeInUp} className="text-center mt-10 flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/member">
              <Button className="gold-metallic-btn px-8 w-full sm:w-auto" data-testid="button-see-protocols">
                See the Protocols <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
            <Link href="/food-chart">
              <Button
                variant="outline"
                className="border-gold-subtle text-gold px-8 w-full sm:w-auto"
                data-testid="button-food-chart"
              >
                The Food Chart
              </Button>
            </Link>
          </motion.div>
        </motion.div>
      </Section>

      {/* ── Next ─────────────────────────────────────────────── */}
      <Section tone="light" className="text-center py-12 md:py-16">
        <motion.div initial="hidden" whileInView="visible" viewport={viewportOnce} variants={stagger}>
          <motion.h2 variants={fadeInUp} className="text-3xl md:text-4xl font-display font-normal mb-6">
            Restoration isn't <span className="text-gold">the destination.</span>
          </motion.h2>
          <motion.p variants={fadeInUp} className="text-muted-foreground max-w-xl mx-auto mb-9 leading-relaxed">
            A clear terrain that never gets asked for anything is just a tidy room nobody lives in. Once the
            body can receive demand, it needs demand worth adapting to.
          </motion.p>
          <motion.div variants={fadeInUp}>
            <Link href="/build">
              <Button size="lg" className="gold-metallic-btn px-8" data-testid="button-next-build">
                Next: Build <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
          </motion.div>
        </motion.div>
      </Section>

      <SiteFooter />
    </div>
  );
}
