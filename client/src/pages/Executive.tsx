import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { Section } from "@/components/Section";
import { ImageBand } from "@/components/ImageBand";
import { Deck } from "@/components/Deck";
import { WaysToWork } from "@/components/WaysToWork";
import { PageHero, SectionHeader } from "@/components/PageHero";
import { ExecutiveApplication } from "@/components/ExecutiveApplication";
import { Button } from "@/components/ui/button";
import { usePageMeta } from "@/hooks/use-page-meta";

const fadeInUp = {
  hidden: { opacity: 0, y: 26 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.55, ease: "easeOut" } },
};
const stagger = { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: 0.08 } } };
const viewportOnce = { once: true, amount: 0.15 } as const;

const DEBT = [
  { line: "Sleep", body: "Five or six hours, most nights, for years. Borrowed against recovery, memory, and glucose control." },
  { line: "Movement", body: "Seated for ten hours, then thirty hard minutes to compensate. Lymph doesn't move, and the compensation isn't equal to the debt." },
  { line: "Food", body: "Whatever fits between meetings, at whatever hour the day allows. Digestion is a rhythm, and the rhythm is gone." },
  { line: "Stimulants", body: "More input required each quarter to produce the same output. That's not preference. That's a loan repayment schedule." },
  { line: "Nervous system", body: "No genuine downshift in months. Decisions get made from a braced body, and they're worse for it." },
  { line: "Strength", body: "Quietly declining since your thirties while your responsibilities climbed. The gap widens from both ends." },
];

const PILLARS = [
  { name: "Terrain", body: "Digestion, hydration, minerals, elimination, sleep, nervous-system load. The conditions everything else runs on." },
  { name: "Body", body: "Strength, muscle, mobility, conditioning, posture, breathing, physical competence under real load." },
  { name: "Rhythm", body: "Morning and evening architecture, travel protocols, food timing, training, recovery, and the shape of a working week." },
  { name: "Performance", body: "Energy stability, focus, cognitive endurance, stress capacity, and the quality of decisions late in a hard day." },
  { name: "Life", body: "Family, environment, discipline, relationships, and what all of this capacity is ultimately for." },
];

const WHO = [
  {
    title: "Your career advanced faster than your health",
    body: "You built something real. The body carrying it was never given a comparable investment, and the gap has started to show.",
  },
  {
    title: "You know what to do and don't do it",
    body: "You're not short of information. You're short of a system that survives a travel week, a bad quarter, and a fully booked calendar.",
  },
  {
    title: "You've optimized pieces, not a system",
    body: "A trainer here, a supplement stack there, a sleep tracker. Individually reasonable, collectively incoherent, and nobody is holding the whole picture.",
  },
  {
    title: "You're healthy and want more capacity",
    body: "Nothing is wrong. You simply suspect there's another level available and you'd rather build it deliberately than hope for it.",
  },
];

export default function Executive() {
  usePageMeta(
    "Sakred Executive — Build a Body Capable of Carrying the Life You've Built",
    "Private health, performance, and capacity development for founders, executives, and high-responsibility professionals. Application only.",
  );

  const scrollToApply = () =>
    document.getElementById("apply")?.scrollIntoView({ behavior: "smooth" });

  return (
    <div className="tone-ink min-h-screen bg-background text-foreground font-sans">
      <SiteHeader overHero={false} />

      <PageHero
        eyebrow="Sakred Executive"
        title={
          <>
            Build a Body Capable of
            <br />
            <span className="text-gold">Carrying the Life You've Built.</span>
          </>
        }
        intro="For founders and executives whose responsibilities outgrew the body carrying them."
        note="Application only. Small number of clients at a time."
        testId="text-executive-headline"
        image="/images/stone-villa.webp"
        imageAlt="A stone villa in late afternoon light, its arched door open"
      >
        <Button size="lg" className="gold-metallic-btn px-8" onClick={scrollToApply} data-testid="button-apply-hero">
          Apply <ArrowRight className="ml-2 h-5 w-5" />
        </Button>
      </PageHero>

      {/* ── The application ──────────────────────────────────── */}
      {/* The form is max-w-2xl. Left in the standard max-w-6xl panel it
          sat in a field of white with a quarter of the panel empty on
          either side. The panel fits the form instead. */}
      <Section
        tone="raised"
        width="max-w-3xl"
        id="apply"
        className="scroll-mt-28 py-12 md:py-14"
        containerClassName="max-w-3xl"
      >
        <motion.div initial="hidden" whileInView="visible" viewport={viewportOnce} variants={stagger}>
          <motion.div variants={fadeInUp}>
            <SectionHeader
              eyebrow="Apply"
              title={<>Start With the <span className="text-gold">Application</span></>}
              intro="Seven minutes. Sometimes we'll tell you it isn't the right fit."
              className="mb-12"
              testId="text-apply-headline"
            />
          </motion.div>

          <motion.div variants={fadeInUp}>
            <ExecutiveApplication />
          </motion.div>

          <motion.p variants={fadeInUp} className="text-xs text-muted-foreground text-center mt-14 max-w-2xl mx-auto leading-relaxed">
            Sakred Body is an education and coaching company. We do not diagnose, treat, cure, or prescribe,
            and nothing here is medical advice. This application deliberately does not ask for your medical
            history — please don't include it. Where clinical input is appropriate we work alongside
            licensed professionals rather than in place of them.
          </motion.p>
        </motion.div>
      </Section>

      {/* ── The premise ──────────────────────────────────────── */}
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
            className="text-3xl md:text-5xl font-display font-normal mb-8 leading-tight"
            data-testid="text-premise-headline"
          >
            You don't have to be sick
            <br />
            <span className="text-gold">to be operating below capacity.</span>
          </motion.h2>
          <motion.div variants={fadeInUp} className="space-y-5 text-muted-foreground leading-relaxed text-base md:text-lg">
            {/* Five paragraphs down to three. The fourth was a Yin/Yang
                primer that Restore and Build each carry in full, delivered to
                the one audience least likely to sit through it. */}
            <p>
              Someone can build a company worth tens of millions while sleeping five hours, living on
              caffeine, and carrying tension they haven't put down in a decade. Because the results keep
              arriving, nobody treats it as a problem. Including them.
            </p>
            <p className="text-foreground">
              High output works — right up until the terrain underneath it can no longer fund it. Nothing
              about the output changes on the day that happens. What changes is that it starts being paid
              for out of capital instead of income.
            </p>
            <p>
              We're not going to tell you you're burned out. You'd reject that, and you'd probably be right.
              The more useful question is narrower and harder to dismiss:
            </p>
            <p className="font-display text-2xl md:text-3xl text-gold pt-2">
              What is it costing your body to keep doing this?
            </p>
          </motion.div>
        </motion.div>
      </Section>

      {/* ── Capacity debt ────────────────────────────────────── */}
      <Section tone="raised">
        <motion.div initial="hidden" whileInView="visible" viewport={viewportOnce} variants={stagger}>
          <motion.div variants={fadeInUp}>
            <SectionHeader
              eyebrow="The Core Idea"
              title={<>Physical <span className="text-gold">Capacity Debt</span></>}
              testId="text-debt-headline"
            />
          </motion.div>

          <motion.div variants={fadeInUp}>
            <Deck
              testId="deck-debt"
              cards={DEBT.map((d) => ({ title: d.line, body: d.body, meta: "Borrowed against" }))}
            />
          </motion.div>

          <motion.p
            variants={fadeInUp}
            className="text-center font-display text-xl md:text-2xl mt-14 max-w-2xl mx-auto leading-relaxed"
          >
            Every demanding life has a <span className="text-gold">physiological cost.</span>
          </motion.p>
        </motion.div>
      </Section>

      {/* ── Told apart from the other two ──────────────────── */}
      <Section tone="ink">
        <SectionHeader
          eyebrow="Work With Us"
          title={<>Different Ways In. <span className="text-gold">The Same Standard.</span></>}
          className="mb-10"
        />
        <WaysToWork current="executive" />
      </Section>

      {/* ── The five pillars ─────────────────────────────────── */}
      <Section tone="ink">
        <motion.div initial="hidden" whileInView="visible" viewport={viewportOnce} variants={stagger}>
          <motion.div variants={fadeInUp}>
            <SectionHeader
              eyebrow="What We Actually Work On"
              title={<>Nothing Here Works <span className="text-gold">On Its Own</span></>}
              testId="text-pillars-headline"
            />
          </motion.div>

          <motion.div variants={fadeInUp}>
            <Deck
              testId="deck-pillars"
              cards={PILLARS.map((p) => ({ title: p.name, body: p.body }))}
            />
          </motion.div>
        </motion.div>
      </Section>

      {/* Two decks ran back to back here — the five layers, then the four
          arrivals — which is the same card stack twice in a row. The band
          separates them and says the thing this page is for. */}
      <ImageBand
        image="/images/elegant-interior.webp"
        alt="A quiet, well-appointed room in late afternoon light"
        title={<>Your body is the one asset <span className="text-gold">you cannot delegate.</span></>}
        tall
        testId="text-executive-turn"
      />

      {/* ── Who ──────────────────────────────────────────────── */}
      <Section tone="raised">
        <motion.div initial="hidden" whileInView="visible" viewport={viewportOnce} variants={stagger}>
          <motion.div variants={fadeInUp}>
            <SectionHeader
              eyebrow="Who This Is For"
              title={<>How People <span className="text-gold">Arrive Here</span></>}
              testId="text-who-headline"
            />
          </motion.div>

          <motion.div variants={fadeInUp}>
            <Deck testId="deck-who" cards={WHO.map((w) => ({ title: w.title, body: w.body }))} />
          </motion.div>
        </motion.div>
      </Section>

      <SiteFooter />
    </div>
  );
}
