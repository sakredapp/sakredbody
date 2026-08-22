/**
 * How Sakred Works — the philosophy, as software.
 *
 * The Body Map says how Sakred understands the human system. This page says
 * how that understanding becomes a reading, a direction and a practice — and
 * it is the half of the old /philosophy page that was about the product rather
 * than about the argument. The argument moved to /manifesto.
 *
 * Everything claimed here is a thing the app actually does. The four source
 * columns in SignalChain are the real inputs: health rows synced from the
 * phone, the terrain check-in, the almanac, and tracked habits and sessions.
 * If a claim on this page stops being true of the product, it is a bug on this
 * page, not a stretch.
 */

import { Link } from "wouter";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { Section } from "@/components/Section";
import { SectionBridge } from "@/components/SectionBridge";
import { PageHero, SectionHeader } from "@/components/PageHero";
import { Constellation } from "@/components/Constellation";
import { MoonPhase, moonPhaseName } from "@/components/MoonPhase";
import { StarDust } from "@/components/StarDust";
import { SignalChain } from "@/components/SignalChain";
import { LoopCycle } from "@/components/LoopCycle";
import { ImageBand } from "@/components/ImageBand";
import { Button } from "@/components/ui/button";
import { OPERATING_LOOP } from "@/data/territories";
import { usePageMeta } from "@/hooks/use-page-meta";

const fadeInUp = {
  hidden: { opacity: 0, y: 26 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.55, ease: "easeOut" } },
};
const stagger = { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: 0.09 } } };
const viewportOnce = { once: true, amount: 0.2 } as const;

const AUTHORITY = [
  {
    title: "The body gets the final vote",
    body: "Tell Sakred you're wrecked on a morning your sleep looked fine, and the reading changes. A wearable measures one thing well and has no access to what you can feel.",
  },
  {
    title: "Guidance, not instruction",
    body: "Your coach sets a plan and can raise a target; the app carries it and records what you were asked for on the day you were asked. Neither of them decides for you.",
  },
  {
    title: "It shows its working",
    body: "Every reading names the facts behind it and which way each one pulled. A conclusion you can't audit is one you can only obey.",
  },
];

export default function HowSakredWorks() {
  usePageMeta(
    "How Sakred Works — The Philosophy Inside the App | Sakred Body",
    "How the Body Map becomes a daily reading: what's measured, what only you can report, how the two are weighed, and how it turns into Restore or Build.",
  );

  return (
    <div className="tone-ink min-h-screen bg-background text-foreground font-sans">
      <SiteHeader overHero={false} />

      <PageHero
        eyebrow="App Philosophy"
        title={<>How Sakred Works.</>}
        testId="text-hsw-headline"
        ambient={<Constellation className="absolute inset-0 w-full h-full opacity-80" />}
        marks={["Measured and reported", "Restore ↔ Build", "The body gets the final vote"]}
      />

      {/* ── The chain ────────────────────────────────────────
          The centrepiece, and the future home of the intelligence animation.
          See the header of SignalChain.tsx for why the sources stay visible. */}
      <Section tone="ink" className="overflow-hidden">
        <StarDust className="absolute inset-0 w-full h-full z-0" density={0.7} />
        <motion.div initial="hidden" whileInView="visible" viewport={viewportOnce} variants={stagger} className="relative z-10">
          <motion.div variants={fadeInUp}>
            <SectionHeader
              eyebrow="The Reading"
              title={<>Sakred doesn't reduce you <span className="text-gold">to a score.</span></>}
              intro="Two questions, in that order: what state is this body actually in, and what should today be. Every source stays on screen underneath the answer."
              testId="text-chain-headline"
            />
          </motion.div>
          <motion.div variants={fadeInUp}>
            <SignalChain testId="signal-chain" />
          </motion.div>
        </motion.div>
      </Section>

      <SectionBridge />

      {/* ── Two kinds of information ─────────────────────────── */}
      <Section tone="raised" containerClassName="max-w-4xl">
        <motion.div initial="hidden" whileInView="visible" viewport={viewportOnce} variants={stagger}>
          <motion.div variants={fadeInUp}>
            <SectionHeader
              eyebrow="Measured and Embodied"
              title={<>A number and a feeling <span className="text-gold">are both data.</span></>}
              testId="text-two-kinds-headline"
            />
          </motion.div>

          <div className="grid md:grid-cols-2 gap-8 max-w-3xl mx-auto">
            <motion.div variants={fadeInUp}>
              <p className="text-xs uppercase tracking-[0.18em] text-gold mb-3 rule-gold">Measured</p>
              <p className="text-muted-foreground leading-relaxed">
                Sleep, heart-rate variability, resting heart rate, steps, sessions. Precise, repeatable, and
                blind to everything it isn't pointed at. A watch cannot tell whether you're dreading the day.
              </p>
            </motion.div>
            <motion.div variants={fadeInUp}>
              <p className="text-xs uppercase tracking-[0.18em] text-gold mb-3 rule-gold">Embodied</p>
              <p className="text-foreground leading-relaxed">
                Energy, digestion, clarity, drive, how the nervous system feels. Imprecise, unrepeatable, and
                the only source with access to the inside. Learning to report it accurately is a skill — it's
                most of what the Body Map is teaching.
              </p>
            </motion.div>
          </div>
        </motion.div>
      </Section>

      {/* ── Rhythm ───────────────────────────────────────────
          Kept from the old philosophy page. The phase is computed from the
          date rather than chosen, which is the point: it is an input, not a
          decoration. */}
      <Section tone="ink" className="overflow-hidden">
        <StarDust className="absolute inset-0 w-full h-full z-0" density={1.2} />
        <div className="relative z-10 flex flex-col items-center text-center gap-4">
          <MoonPhase className="h-40 w-40" testId="moon-tonight" />
          <p className="text-[10px] uppercase tracking-[0.22em] text-gold">{moonPhaseName()}</p>
          <h2 className="font-display text-2xl md:text-3xl max-w-lg leading-snug">
            Not every day is asking <span className="text-gold">the same question.</span>
          </h2>
          <p className="text-muted-foreground max-w-md leading-relaxed text-sm">
            Timing and disposition, not fortune-telling. The season, the moon and the day you're on are read
            against your own numbers because they're inputs — and because they're checkable. That phase above
            is tonight's, computed from the date rather than chosen.
          </p>
        </div>
      </Section>

      <SectionBridge />

      {/* ── The loop ─────────────────────────────────────────── */}
      <Section tone="raised">
        <motion.div initial="hidden" whileInView="visible" viewport={viewportOnce} variants={stagger}>
          <motion.div variants={fadeInUp}>
            <SectionHeader
              eyebrow="The Operating Loop"
              title={<>Clear. Nourish. <span className="text-gold">Challenge. Recover.</span></>}
              intro="Habits and routines are the tools this runs on — not doctrine, and not a checklist you owe anyone."
              testId="text-loop-headline"
            />
          </motion.div>

          <motion.div variants={fadeInUp}>
            <LoopCycle beats={OPERATING_LOOP} />
          </motion.div>
        </motion.div>
      </Section>

      <ImageBand
        image="/images/coast-cliffs.webp"
        alt="A coastline seen from high ground at first light"
        title={<>The reading is allowed <span className="text-gold">to change its mind.</span></>}
        tall
        testId="text-hsw-turn"
      >
        <p>A day is not decided at seven in the morning. Log a hard session at noon and the answer moves.</p>
      </ImageBand>

      {/* ── Authority ────────────────────────────────────────── */}
      <Section tone="ink">
        <motion.div initial="hidden" whileInView="visible" viewport={viewportOnce} variants={stagger}>
          <motion.div variants={fadeInUp}>
            <SectionHeader
              eyebrow="Who Decides"
              title={<>Guidance, <span className="text-gold">not authority.</span></>}
              testId="text-authority-headline"
            />
          </motion.div>

          <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
            {AUTHORITY.map((a) => (
              <motion.div key={a.title} variants={fadeInUp} className="pt-6 border-t border-border">
                <h3 className="font-display text-xl mb-3">{a.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{a.body}</p>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </Section>

      {/* ── CTA ──────────────────────────────────────────────── */}
      <Section tone="raised" containerClassName="max-w-3xl" className="text-center">
        <motion.div initial="hidden" whileInView="visible" viewport={viewportOnce} variants={stagger}>
          <motion.h2 variants={fadeInUp} className="text-3xl md:text-4xl font-display font-normal mb-6">
            The goal is a body <span className="text-gold">you can adjust from.</span>
          </motion.h2>
          <motion.p variants={fadeInUp} className="text-muted-foreground max-w-xl mx-auto mb-9 leading-relaxed">
            Not a streak, not a score, and not a protocol you follow forever. Notice the response, change the
            input, read again.
          </motion.p>
          <motion.div variants={fadeInUp} className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/login">
              <Button size="lg" className="gold-metallic-btn px-8 w-full sm:w-auto" data-testid="button-app">
                Enter the Portal <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
            <Link href="/the-body-map">
              <Button
                size="lg"
                variant="outline"
                className="border-gold-subtle text-gold px-8 w-full sm:w-auto"
                data-testid="button-body-map"
              >
                The Body Map
              </Button>
            </Link>
          </motion.div>
        </motion.div>
      </Section>

      <SiteFooter />
    </div>
  );
}
