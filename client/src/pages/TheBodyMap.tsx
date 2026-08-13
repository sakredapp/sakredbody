/**
 * The Body Map — the terrain, how to read it, and who taught us to.
 *
 * ── Why this page replaced two ────────────────────────────────────────────
 *
 * /the-terrain and /body-literacy were the same argument told twice. Terrain
 * said the body is one connected chain and order decides whether an
 * intervention lands. Body Literacy said you have to be able to tell where you
 * are in that chain. Neither is a whole page on its own, and a visitor who read
 * one had no way of knowing the other existed — "The Intelligence" held four
 * items and read as a pile.
 *
 * Both now live here, with the thing that was missing from both: the figure,
 * and the traditions that taught us to read each part of it.
 *
 * ── The figure is the argument ────────────────────────────────────────────
 *
 * ConstellationBody already lights seven regions and already accepts a
 * pointer. It is not decoration reused as a diagram — it was drawn as the
 * brand's argument in one object, and this is the page where that argument is
 * actually made in words beside it. The panel reads from the same
 * BODY_REGIONS keys the canvas lights, so what glows and what is described
 * cannot drift.
 *
 * ── The claim discipline ──────────────────────────────────────────────────
 *
 * Every region states what a tradition observed and what can be measured as
 * two separate sentences. See the header of data/bodyMap.ts for why that
 * separation is structural rather than stylistic.
 */

import { useState } from "react";
import { Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { Section } from "@/components/Section";
import { PageHero, SectionHeader } from "@/components/PageHero";
import { ConstellationBody } from "@/components/ConstellationBody";
import { ImageBand } from "@/components/ImageBand";
import { TerrainWheel } from "@/components/TerrainWheel";
import { FlipCards } from "@/components/FlipCards";
import { Deck } from "@/components/Deck";
import { BreathPacer } from "@/components/BreathPacer";
import { StarDust } from "@/components/StarDust";
import { Button } from "@/components/ui/button";
import { MAP_REGIONS } from "@/data/bodyMap";
import { EMBODIED_PRACTICE } from "@/data/territories";
import { usePageMeta } from "@/hooks/use-page-meta";

const fadeInUp = {
  hidden: { opacity: 0, y: 26 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.55, ease: "easeOut" } },
};
const stagger = { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: 0.08 } } };
const viewportOnce = { once: true, amount: 0.15 } as const;

/** Carried from the retired Terrain page. */
const CHAIN = [
  { stage: "Digestion", body: "Where input becomes usable — or doesn't. Enzymes, acid, and a lining intact enough to let the right things through and keep the rest out." },
  { stage: "Liver + Bile", body: "Sorts what arrives, packages what has to leave, and releases bile to move fat and waste onward. Congested here and everything downstream backs up." },
  { stage: "Blood + Fluids", body: "The transport layer. Hydration and minerals aren't a wellness accessory — they're the medium every other process runs in." },
  { stage: "Lymph", body: "The drainage network, with no pump of its own. It moves when you move, and stalls completely when you don't." },
  { stage: "Kidneys", body: "The filter of last resort, and the reason hydration and mineral balance decide how much the system can clear." },
  { stage: "Cells", body: "Where energy is actually made. Everything above this line exists to deliver fuel here and carry waste away." },
  { stage: "Nervous system", body: "Sets the state everything else runs in. Repair, digestion, and sleep are all downstream of whether the body believes it's safe." },
  { stage: "Movement", body: "Drives lymph, circulation, bone density, glucose handling, and mood. The one input that touches every other stage at once." },
  { stage: "Elimination", body: "The exit. If this is slow, nothing upstream can be cleared, and every intervention becomes another thing to process." },
];

const IMPLICATIONS = [
  {
    title: "Symptoms rarely start where they show up",
    body: "Skin, energy, mood, and sleep are often the loudest signals of something several stages upstream. Treating the noise usually means treating the wrong stage.",
  },
  {
    title: "Order matters more than intensity",
    body: "A good intervention applied at the wrong stage of the chain produces a worse result than a mediocre one applied at the right stage.",
  },
  {
    title: "There is no isolated fix",
    body: "You cannot fix digestion without addressing nervous-system state. You cannot drain without moving. Every stage is upstream and downstream of another.",
  },
  {
    title: "The exits set the pace",
    body: "How fast you can improve is capped by how fast you can clear. Open the exits and everything else becomes possible faster.",
  },
];

/** Carried from the retired Body Literacy page. */
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

export default function TheBodyMap() {
  usePageMeta(
    "The Body Map — Many Traditions, One Living Terrain | Sakred Body",
    "The body as one connected chain, the traditions that studied each part of it, and how to tell where you currently are in it.",
  );

  const [activeKey, setActiveKey] = useState(MAP_REGIONS[0].key);
  const region = MAP_REGIONS.find((r) => r.key === activeKey) ?? MAP_REGIONS[0];

  return (
    <div className="tone-ink min-h-screen bg-background text-foreground font-sans">
      <SiteHeader overHero={false} />

      <PageHero
        eyebrow="The Intelligence"
        title={<>The Body Map.</>}
        testId="text-bodymap-headline"
        marks={["Many traditions", "One living terrain", "Nine stages, one loop"]}
      />

      {/* ── The figure ───────────────────────────────────────
          The centrepiece, and the one section that had no home before.

          Two columns on a desktop so the panel sits beside what is glowing;
          stacked on a phone, where the figure goes first because the canvas is
          what invites the touch. The panel is driven by onActive rather than
          by its own state, so the auto-cycle narrates the map on its own for
          anyone who never points at it. */}
      <Section tone="ink" className="overflow-hidden">
        <StarDust className="absolute inset-0 w-full h-full z-0" density={0.8} />
        <motion.div initial="hidden" whileInView="visible" viewport={viewportOnce} variants={stagger} className="relative z-10">
          <motion.div variants={fadeInUp}>
            <SectionHeader
              eyebrow="One Body, Many Lenses"
              title={<>Different cultures. Different lenses. <span className="text-gold">One human body.</span></>}
              intro="No single tradition owns the human body. Touch a region — or let it move on its own."
              testId="text-figure-headline"
            />
          </motion.div>

          <div className="grid lg:grid-cols-2 gap-10 lg:gap-16 items-center">
            <motion.div variants={fadeInUp} className="order-1">
              <ConstellationBody onActive={setActiveKey} />
            </motion.div>

            {/* min-h so the column doesn't resize as regions of different
                length swap through it, which on a desktop makes the figure
                beside it jump. */}
            <motion.div variants={fadeInUp} className="order-2 min-h-[22rem] flex flex-col justify-center">
              <AnimatePresence mode="wait">
                <motion.div
                  key={region.key}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.35, ease: "easeOut" }}
                  data-testid={`region-${region.key}`}
                >
                  <p className="text-[0.7rem] uppercase tracking-[0.22em] text-gold mb-3">
                    {region.traditions}
                  </p>
                  <h3 className="font-display text-4xl md:text-5xl mb-2 tracking-tight">{region.name}</h3>
                  {/* The anatomy, so a conceptual name still lands on a body
                      part rather than floating free of the figure beside it. */}
                  <p className="text-xs text-muted-foreground mb-5">{region.covers}</p>
                  <p className="text-foreground leading-relaxed mb-5">{region.governs}</p>

                  {/* The two sentences stay two sentences. See data/bodyMap.ts. */}
                  <p className="text-muted-foreground leading-relaxed mb-4">{region.lens}</p>
                  <p className="text-muted-foreground leading-relaxed">{region.measured}</p>

                  <ul className="flex flex-wrap gap-2 mt-7">
                    {region.practice.map((p) => (
                      <li
                        key={p}
                        className="rounded-full border border-gold/25 px-3 py-1 text-xs text-muted-foreground"
                      >
                        {p}
                      </li>
                    ))}
                  </ul>
                </motion.div>
              </AnimatePresence>
            </motion.div>
          </div>
        </motion.div>
      </Section>

      {/* ── The guardrail ────────────────────────────────────
          Said plainly and full-bleed, because without it a page that names
          Ayurveda, TCM and pranayama in the same breath reads as an eclectic
          Eastern-medicine collage — which is the one thing this product is
          not. docs/VISION.md draws the same line. */}
      <ImageBand
        /* Not zen-sand-garden: that is Philosophy's band, and the same
           photograph full-bleed on two pages in the same nav group reads as a
           stock library rather than a house. */
        image="/images/retreat-mountain.webp"
        alt="A mountain range under early light"
        eyebrow="Not Eastern. Not Western. Human."
        title={<>The synthesis is ours. <span className="text-gold">The traditions keep their names.</span></>}
        tall
        testId="text-guardrail"
      >
        <p>
          Sakred Body is not an Ayurveda school, a TCM clinic, a yoga system or a biohacking protocol. We
          draw on all of them, plus Indigenous plant knowledge, European herbalism, fascia and osteopathic
          thinking, physiology, strength science and contemplative practice — and we keep them
          distinguishable rather than blending them into one confident claim.
        </p>
      </ImageBand>

      {/* ── The chain ────────────────────────────────────────
          From the retired Terrain page. */}
      <Section tone="raised">
        <motion.div initial="hidden" whileInView="visible" viewport={viewportOnce} variants={stagger}>
          <motion.div variants={fadeInUp}>
            <SectionHeader
              eyebrow="How It Connects"
              title={<>The Cycle</>}
              intro="Nine stages, and every one of them sets the conditions for the next."
              testId="text-chain-headline"
            />
          </motion.div>

          <motion.div variants={fadeInUp}>
            <TerrainWheel stages={CHAIN} />
          </motion.div>
        </motion.div>
      </Section>

      {/* ── Consequences ─────────────────────────────────────── */}
      <Section tone="ink">
        <motion.div initial="hidden" whileInView="visible" viewport={viewportOnce} variants={stagger}>
          <motion.div variants={fadeInUp}>
            <SectionHeader
              eyebrow="What It Means"
              title={<>Four Consequences of <span className="text-gold">Thinking This Way</span></>}
              testId="text-implications-headline"
            />
          </motion.div>

          <motion.div variants={fadeInUp}>
            <FlipCards testId="flip-implications" columns={4} cards={IMPLICATIONS} />
          </motion.div>
        </motion.div>
      </Section>

      <ImageBand
        image="/images/rugged-cliffs.webp"
        alt="Weathered cliffs falling away to open water"
        title={<>Ask what condition is receiving the intervention <span className="text-gold">before asking whether the intervention is good.</span></>}
        tall
        testId="text-terrain-turn"
      />

      {/* ── Reading it ───────────────────────────────────────
          From the retired Body Literacy page. A map is only useful if you can
          read your position on it, which is what that page existed to say. */}
      <Section tone="raised">
        <motion.div initial="hidden" whileInView="visible" viewport={viewportOnce} variants={stagger}>
          <motion.div variants={fadeInUp}>
            <SectionHeader
              eyebrow="Reading Your Position"
              title={<>Six Pairs Worth <span className="text-gold">Telling Apart</span></>}
              intro="Most people run on three signals — tired, hungry, sore — for a system producing dozens. The fix isn't more data. It's more discrimination."
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

      {/* The medical line is kept whole. It is the one sentence on this page
          that has to survive any edit. */}
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

      {/* ── The practice ─────────────────────────────────────── */}
      <Section tone="ink" width="max-w-4xl">
        <motion.div initial="hidden" whileInView="visible" viewport={viewportOnce} variants={stagger}>
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
            The map becomes <span className="text-gold">practice.</span>
          </motion.h2>
          <motion.p variants={fadeInUp} className="text-muted-foreground max-w-xl mx-auto mb-9 leading-relaxed">
            The point was never to collect traditions. It's to answer what state you're in, what this body
            needs now, and whether today is for clearing or for building.
          </motion.p>
          <motion.div variants={fadeInUp} className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/restore">
              <Button size="lg" className="gold-metallic-btn px-8 w-full sm:w-auto" data-testid="button-restore">
                Restore <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
            <Link href="/build">
              <Button
                size="lg"
                variant="outline"
                className="border-gold-subtle text-gold px-8 w-full sm:w-auto"
                data-testid="button-build"
              >
                Build
              </Button>
            </Link>
          </motion.div>
        </motion.div>
      </Section>

      <SiteFooter />
    </div>
  );
}
