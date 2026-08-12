import { Link } from "wouter";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { Section } from "@/components/Section";
import { FlipCards } from "@/components/FlipCards";
import { ImageBand } from "@/components/ImageBand";
import { PageHero, SectionHeader } from "@/components/PageHero";
import { ParticleSphere } from "@/components/ParticleSphere";
import { TerrainWheel } from "@/components/TerrainWheel";
import { Button } from "@/components/ui/button";
import { usePageMeta } from "@/hooks/use-page-meta";

const fadeInUp = {
  hidden: { opacity: 0, y: 26 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.55, ease: "easeOut" } },
};
const stagger = { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: 0.07 } } };
const viewportOnce = { once: true, amount: 0.15 } as const;

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

export default function Terrain() {
  usePageMeta(
    "The Terrain — Your Body Is an Environment | Sakred Body",
    "Your body is not a collection of isolated parts. Digestion, liver, fluids, lymph, kidneys, cells, nervous system, movement, elimination — one connected chain.",
  );

  return (
    <div className="min-h-screen bg-background text-foreground font-sans">
      <SiteHeader overHero={false} />

      <PageHero
        eyebrow="The Signature Concept"
        title={<>The Terrain.</>}
        testId="text-terrain-headline"
        ambient={<ParticleSphere className="absolute inset-0 w-full h-full opacity-60" />}
        marks={["Nine stages", "A closed loop", "Elimination feeds digestion"]}
      />

      {/* ── The chain ────────────────────────────────────────── */}
      <Section tone="ink">
        <motion.div initial="hidden" whileInView="visible" viewport={viewportOnce} variants={stagger}>
          <motion.div variants={fadeInUp}>
            <SectionHeader
              eyebrow="The Chain"
              title={<>The Cycle</>}
              intro="Every stage sets the conditions for the next."
              testId="text-chain-headline"
            />
          </motion.div>

          <motion.div variants={fadeInUp}>
            <TerrainWheel stages={CHAIN} />
          </motion.div>
        </motion.div>
      </Section>

      {/* ── The turn ─────────────────────────────────────────
          The wheel and the consequences were two ink sections butting
          together, and the line below was buried at the foot of the second
          one where a reader arrives already full. It is the page's thesis, so
          it gets the full bleed. Landscape rather than the vineyard — Retreats
          already opens on that photograph, and one image doing hero duty on
          one page and a band on another reads as a stock library. */}
      <ImageBand
        image="/images/rugged-cliffs.webp"
        alt="Weathered cliffs falling away to open water"
        title={<>Ask what condition is receiving the intervention <span className="text-gold">before asking whether the intervention is good.</span></>}
        tall
        testId="text-terrain-turn"
      />

      {/* ── Implications ─────────────────────────────────────── */}
      <Section tone="raised">
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

      {/* ── CTA ──────────────────────────────────────────────── */}
      <Section tone="raised" width="max-w-3xl" className="text-center">
        <motion.div initial="hidden" whileInView="visible" viewport={viewportOnce} variants={stagger}>
          <motion.h2 variants={fadeInUp} className="text-3xl md:text-4xl font-display font-normal mb-6">
            A map is only useful
            <br />
            <span className="text-gold">if you can read your position on it.</span>
          </motion.h2>
          <motion.p variants={fadeInUp} className="text-muted-foreground max-w-xl mx-auto mb-9 leading-relaxed">
            The chain tells you how the system is arranged. Body literacy tells you where you currently are
            in it.
          </motion.p>
          <motion.div variants={fadeInUp} className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/body-literacy">
              <Button size="lg" className="gold-metallic-btn px-8 w-full sm:w-auto" data-testid="button-literacy">
                Body Literacy <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
            <Link href="/restore">
              <Button
                size="lg"
                variant="outline"
                className="border-gold-subtle text-gold px-8 w-full sm:w-auto"
                data-testid="button-restore"
              >
                Start Restoring
              </Button>
            </Link>
          </motion.div>
        </motion.div>
      </Section>

      <SiteFooter />
    </div>
  );
}
