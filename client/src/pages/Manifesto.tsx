/**
 * The Manifesto — why this exists at all.
 *
 * The half of the old /philosophy page that was an argument rather than a
 * product description. How Sakred Works took the other half.
 *
 * The material here is almost entirely carried over rather than newly written:
 * the capacity model, the two-stroke engine, "none of this is new", and the
 * seven-word definition all pre-date the split and were the strongest things
 * on that page. What is new is the opening, because the page needed a reason
 * to start — and fragmentation is the argument every other page assumes.
 *
 * This is where the tension-and-release motion pass belongs: the fragments in
 * FRAGMENTATION accumulate, the page gets dense, and then it clears.
 */

import { Link } from "wouter";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { Section } from "@/components/Section";
import { PageHero, SectionHeader } from "@/components/PageHero";
import { StarDust } from "@/components/StarDust";
import { ImageBand } from "@/components/ImageBand";
import { AscentChart } from "@/components/AscentChart";
import { YinYang } from "@/components/YinYang";
import { Button } from "@/components/ui/button";
import { CAPACITY_MODEL } from "@/data/territories";
import { usePageMeta } from "@/hooks/use-page-meta";

const fadeInUp = {
  hidden: { opacity: 0, y: 26 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.55, ease: "easeOut" } },
};
const stagger = { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: 0.09 } } };
const viewportOnce = { once: true, amount: 0.2 } as const;

/**
 * The words modern health actually runs on.
 *
 * Held as data rather than written into the paragraph because the motion pass
 * needs them as individual objects: they accumulate around the figure until
 * the screen feels compressed, then fall away.
 */
const FRAGMENTATION = [
  "optimise", "track", "biohack", "suppress", "push through",
  "detox", "cleanse", "reset", "grind", "recover later",
  "supplement", "measure", "repeat",
];

const DEFINITION = [
  { quality: "Clear", body: "enough to perceive." },
  { quality: "Regulated", body: "enough to recover." },
  { quality: "Nourished", body: "enough to rebuild." },
  { quality: "Strong", body: "enough to endure." },
  { quality: "Mobile", body: "enough to move." },
  { quality: "Disciplined", body: "enough to develop." },
  { quality: "Aware", body: "enough to adapt." },
];

export default function Manifesto() {
  usePageMeta(
    "The Manifesto — Why Modern Health Feels Fragmented | Sakred Body",
    "Information is not embodiment. Endless optimisation is not sovereignty. Restoration without rebuilding fails, and building without restoration fails. Why Sakred Body exists.",
  );

  return (
    <div className="tone-ink min-h-screen bg-background text-foreground font-sans">
      <SiteHeader overHero={false} />

      <PageHero
        eyebrow="The Argument"
        title={<>The Manifesto.</>}
        testId="text-manifesto-headline"
        ambient={<StarDust className="absolute inset-0 w-full h-full" density={1.1} />}
        marks={["Information is not embodiment", "Neither half works alone", "Capacity, not absence"]}
      />

      {/* ── Fragmentation ────────────────────────────────────
          The motion target. These sit still for now. */}
      <Section tone="ink" width="max-w-4xl">
        <motion.div initial="hidden" whileInView="visible" viewport={viewportOnce} variants={stagger}>
          <motion.div variants={fadeInUp}>
            <SectionHeader
              eyebrow="Where We Are"
              title={<>You know what your watch says. <span className="text-gold">You don't know what you feel.</span></>}
              testId="text-fragmentation-headline"
            />
          </motion.div>

          <motion.ul
            variants={fadeInUp}
            className="flex flex-wrap justify-center gap-x-5 gap-y-2 max-w-2xl mx-auto mb-10"
            aria-label="The vocabulary of modern health"
          >
            {FRAGMENTATION.map((f) => (
              <li key={f} className="text-sm uppercase tracking-[0.16em] text-muted-foreground/60">
                {f}
              </li>
            ))}
          </motion.ul>

          <motion.div variants={fadeInUp} className="max-w-2xl mx-auto text-center space-y-5">
            <p className="text-muted-foreground leading-relaxed text-base md:text-lg">
              Modern health got specialised, and then it got fragmented. A specialist for each part, an app
              for each metric, a protocol for each complaint — and nobody holding the whole picture, least of
              all the person living inside it.
            </p>
            <p className="text-foreground leading-relaxed text-base md:text-lg">
              More information has not produced more capable people. It has produced people who can quote
              their resting heart rate and cannot tell hunger from thirst.
            </p>
          </motion.div>
        </motion.div>
      </Section>

      <ImageBand
        image="/images/zen-sand-garden.webp"
        alt="A single stone at the centre of a raked circular sand garden"
        eyebrow="Older Than the Research"
        title={<>None of this is new. <span className="text-gold">We just stopped doing it.</span></>}
        tall
        testId="text-older-headline"
      >
        <p>
          Every tradition that lasted arrived at the same handful of conclusions long before anyone could
          measure why they worked. We're not claiming to have discovered anything — only to have kept the
          parts that hold up.
        </p>
      </ImageBand>

      {/* ── Both halves ──────────────────────────────────────── */}
      <Section tone="raised" width="max-w-4xl">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
          variants={stagger}
          className="max-w-3xl mx-auto text-center"
        >
          <motion.div variants={fadeInUp} className="flex justify-center mb-8">
            <YinYang className="h-12 w-12 text-gold" />
          </motion.div>
          <motion.h2
            variants={fadeInUp}
            className="text-3xl md:text-5xl font-display font-normal mb-8 leading-tight"
            data-testid="text-stress-headline"
          >
            Stress is not the enemy.
            <br />
            <span className="text-gold">Unresolved stress is.</span>
          </motion.h2>
          <motion.div variants={fadeInUp} className="space-y-5 text-muted-foreground leading-relaxed text-base md:text-lg">
            <p>
              Muscle requires stress, then recovery. The nervous system requires challenge, then regulation.
              Fasting requires feeding. Cleansing requires rebuilding. Every adaptation worth having runs on
              the same two-stroke engine.
            </p>
            <p className="text-foreground">
              So the goal was never a life with less stress in it — it's becoming an organism that can meet
              stress, adapt, and return to equilibrium faster each time. Which is why we won't sell you only
              the calm half: restoration alone produces someone relaxed and fragile, intensity alone produces
              someone impressive who breaks.
            </p>
          </motion.div>
        </motion.div>
      </Section>

      {/* ── The capacity model ───────────────────────────────── */}
      <Section tone="ink">
        <motion.div initial="hidden" whileInView="visible" viewport={viewportOnce} variants={stagger}>
          <motion.div variants={fadeInUp}>
            <SectionHeader
              eyebrow="The Capacity Model"
              title={<>Health Is the Floor, <span className="text-gold">Not the Ceiling</span></>}
              intro="Ask most health philosophies what success looks like and you get an absence — no disease, no symptoms. Nothing you could point at."
              testId="text-capacity-headline"
            />
          </motion.div>

          <motion.div variants={fadeInUp}>
            <AscentChart stages={CAPACITY_MODEL} testId="chart-capacity" />
          </motion.div>

          <motion.p
            variants={fadeInUp}
            className="text-center font-display text-xl md:text-2xl mt-10 max-w-2xl mx-auto leading-relaxed"
          >
            The point was never the body.
            <br />
            <span className="text-gold">The point is what the body lets you do.</span>
          </motion.p>
        </motion.div>
      </Section>

      {/* ── The definition ───────────────────────────────────
          Last rather than first. It was the second section of the old page,
          which meant a visitor met a seven-line definition before they had
          been given a reason to want one. As the close it reads as the answer
          the argument arrives at. */}
      <Section tone="raised" width="max-w-3xl">
        <motion.div initial="hidden" whileInView="visible" viewport={viewportOnce} variants={stagger}>
          <motion.div variants={fadeInUp}>
            <SectionHeader
              eyebrow="The Definition"
              title={<>So: what is a <span className="text-gold">Sakred body?</span></>}
              intro="Each depends on the one before it."
              testId="text-definition-headline"
            />
          </motion.div>

          <div className="max-w-2xl mx-auto">
            {DEFINITION.map((d, i) => (
              <motion.div
                variants={fadeInUp}
                key={d.quality}
                className="py-4 border-b border-border/50 last:border-0 text-center"
                data-testid={`row-definition-${i}`}
              >
                <p className="leading-relaxed">
                  <span className="font-display text-xl text-foreground">{d.quality}</span>{" "}
                  <span className="text-muted-foreground">{d.body}</span>
                </p>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </Section>

      {/* ── CTA ──────────────────────────────────────────────── */}
      <Section tone="ink" width="max-w-3xl" className="text-center">
        <motion.div initial="hidden" whileInView="visible" viewport={viewportOnce} variants={stagger}>
          <motion.h2 variants={fadeInUp} className="text-3xl md:text-4xl font-display font-normal mb-6">
            The map was never the destination.
            <br />
            <span className="text-gold">Inhabiting the body is.</span>
          </motion.h2>
          <motion.div variants={fadeInUp} className="flex flex-col sm:flex-row gap-4 justify-center mt-9">
            <Link href="/the-body-map">
              <Button size="lg" className="gold-metallic-btn px-8 w-full sm:w-auto" data-testid="button-body-map">
                The Body Map <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
            <Link href="/restore">
              <Button
                size="lg"
                variant="outline"
                className="border-gold-subtle text-gold px-8 w-full sm:w-auto"
                data-testid="button-restore"
              >
                Begin with Restore
              </Button>
            </Link>
          </motion.div>
        </motion.div>
      </Section>

      <SiteFooter />
    </div>
  );
}
