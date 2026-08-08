import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { Section } from "@/components/Section";
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
    <div className="min-h-screen bg-background text-foreground font-sans">
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
        intro="Private health, performance, and capacity development for founders, executives, and people whose decisions affect a lot of others. Your responsibilities grew. The question is whether the body underneath them grew with you."
        note="Application only. Small number of clients at a time."
        testId="text-executive-headline"
      >
        <Button size="lg" className="gold-metallic-btn px-8" onClick={scrollToApply} data-testid="button-apply-hero">
          Apply <ArrowRight className="ml-2 h-5 w-5" />
        </Button>
      </PageHero>

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
            <p>
              Someone can build a company worth tens of millions while sleeping five hours, living on
              caffeine, eating whatever fits between meetings, travelling constantly, and carrying tension
              they haven't put down in a decade.
            </p>
            <p className="text-foreground">
              And because the results keep arriving, nobody treats it as a problem. Including them.
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
      <Section tone="light">
        <motion.div initial="hidden" whileInView="visible" viewport={viewportOnce} variants={stagger}>
          <motion.div variants={fadeInUp}>
            <SectionHeader
              eyebrow="The Core Idea"
              title={<>Physical <span className="text-gold">Capacity Debt</span></>}
              intro="You already understand leverage. Output can be sustained well past what the underlying system is producing — by borrowing. It works for a long time, and the balance is still real."
              testId="text-debt-headline"
            />
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5 max-w-5xl mx-auto">
            {DEBT.map((d, i) => (
              <motion.div variants={fadeInUp} key={d.line}>
                <div
                  className="h-full bg-card border border-card-border rounded-lg p-7 text-center"
                  data-testid={`card-debt-${i}`}
                >
                  <h3 className="font-display text-xl mb-3">{d.line}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{d.body}</p>
                </div>
              </motion.div>
            ))}
          </div>

          <motion.p
            variants={fadeInUp}
            className="text-center font-display text-xl md:text-2xl mt-14 max-w-2xl mx-auto leading-relaxed"
          >
            Every demanding life has a physiological cost.
            <br />
            <span className="text-gold">
              The question is whether you're earning capacity faster than you're spending it.
            </span>
          </motion.p>
        </motion.div>
      </Section>

      {/* ── The five pillars ─────────────────────────────────── */}
      <Section tone="ink">
        <motion.div initial="hidden" whileInView="visible" viewport={viewportOnce} variants={stagger}>
          <motion.div variants={fadeInUp}>
            <SectionHeader
              eyebrow="What We Actually Work On"
              title={<>Five Layers, <span className="text-gold">One System</span></>}
              intro="This isn't executive performance coaching with mindset and productivity at the centre. We start underneath that, at the physical infrastructure the rest of it runs on."
              testId="text-pillars-headline"
            />
          </motion.div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-5">
            {PILLARS.map((p, i) => (
              <motion.div variants={fadeInUp} key={p.name}>
                <div
                  className="h-full bg-card border border-border rounded-lg p-6 text-center"
                  data-testid={`card-pillar-${i}`}
                >
                  <span className="font-mono text-xs text-gold/60">{String(i + 1).padStart(2, "0")}</span>
                  <h3 className="font-display text-xl mt-3 mb-3">{p.name}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{p.body}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </Section>

      {/* ── Who ──────────────────────────────────────────────── */}
      <Section tone="light">
        <motion.div initial="hidden" whileInView="visible" viewport={viewportOnce} variants={stagger}>
          <motion.div variants={fadeInUp}>
            <SectionHeader
              eyebrow="Who This Is For"
              title={<>Four Ways People <span className="text-gold">Arrive Here</span></>}
              intro="The starting point differs. The intake decides where you begin rather than pushing everyone through one identical programme."
              testId="text-who-headline"
            />
          </motion.div>

          <div className="grid md:grid-cols-2 gap-5 max-w-4xl mx-auto">
            {WHO.map((w, i) => (
              <motion.div variants={fadeInUp} key={w.title}>
                <div
                  className="h-full bg-card border border-card-border rounded-lg p-7 text-center"
                  data-testid={`card-who-${i}`}
                >
                  <h3 className="font-display text-xl mb-3">{w.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{w.body}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </Section>

      {/* ── The application ──────────────────────────────────── */}
      <Section tone="ink" id="apply" className="scroll-mt-20">
        <motion.div initial="hidden" whileInView="visible" viewport={viewportOnce} variants={stagger}>
          <motion.div variants={fadeInUp}>
            <SectionHeader
              eyebrow="Apply"
              title={<>Start With the <span className="text-gold">Application</span></>}
              intro="Around seven minutes. It's how we work out whether there's a real fit, where you'd start, and whether private coaching is even the right thing to point you at — sometimes it isn't, and we'll say so."
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

      <SiteFooter />
    </div>
  );
}
