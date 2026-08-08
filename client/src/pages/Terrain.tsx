import { Link } from "wouter";
import { motion } from "framer-motion";
import { ArrowRight, ChevronDown } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { Section } from "@/components/Section";
import { PageHero, SectionHeader } from "@/components/PageHero";
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
        title={<>The <span className="text-gold">Terrain</span></>}
        intro="Your body is not a collection of isolated parts to be treated one at a time. It is an environment — a connected chain where every stage sets the conditions for the next."
        note="Once you can see the chain, most health advice sorts itself into 'right stage' and 'wrong stage' almost immediately."
        testId="text-terrain-headline"
      />

      {/* ── The chain ────────────────────────────────────────── */}
      <Section tone="light">
        <motion.div initial="hidden" whileInView="visible" viewport={viewportOnce} variants={stagger}>
          <motion.div variants={fadeInUp}>
            <SectionHeader
              eyebrow="The Chain"
              title={<>Nine Stages, <span className="text-gold">One System</span></>}
              intro="Read it top to bottom. Then notice that the last stage feeds back into the first — this is a loop, not a line."
              testId="text-chain-headline"
            />
          </motion.div>

          <div className="max-w-2xl mx-auto">
            {CHAIN.map((c, i) => (
              <motion.div variants={fadeInUp} key={c.stage}>
                <div
                  className="border border-gold-subtle rounded-lg bg-card p-6 text-center"
                  data-testid={`chain-stage-${i}`}
                >
                  <span className="font-mono text-xs text-gold/60">{String(i + 1).padStart(2, "0")}</span>
                  <h3 className="font-display text-2xl mt-2 mb-3">{c.stage}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{c.body}</p>
                </div>
                {i < CHAIN.length - 1 && (
                  <div className="flex justify-center py-2" aria-hidden="true">
                    <ChevronDown className="h-5 w-5 text-gold/40" />
                  </div>
                )}
              </motion.div>
            ))}

            <motion.div variants={fadeInUp} className="mt-8 text-center">
              <div className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full border border-gold/30 bg-gold/5 text-xs uppercase tracking-wider text-gold">
                Elimination feeds back into digestion
              </div>
            </motion.div>
          </div>
        </motion.div>
      </Section>

      {/* ── Implications ─────────────────────────────────────── */}
      <Section tone="ink">
        <motion.div initial="hidden" whileInView="visible" viewport={viewportOnce} variants={stagger}>
          <motion.div variants={fadeInUp}>
            <SectionHeader
              eyebrow="What It Means"
              title={<>Four Consequences of <span className="text-gold">Thinking This Way</span></>}
              intro="This isn't an abstraction. Holding the chain in mind changes what you do first, and first is usually the only decision that matters."
              testId="text-implications-headline"
            />
          </motion.div>

          <div className="grid md:grid-cols-2 gap-5 max-w-4xl mx-auto">
            {IMPLICATIONS.map((im, i) => (
              <motion.div variants={fadeInUp} key={im.title}>
                <div
                  className="h-full bg-card border border-border rounded-lg p-7 text-center"
                  data-testid={`card-implication-${i}`}
                >
                  <h3 className="font-display text-xl mb-3">{im.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{im.body}</p>
                </div>
              </motion.div>
            ))}
          </div>

          <motion.p
            variants={fadeInUp}
            className="text-center font-display text-xl md:text-2xl mt-14 max-w-2xl mx-auto leading-relaxed"
          >
            Ask what condition is receiving the intervention
            <br />
            <span className="text-gold">before asking whether the intervention is good.</span>
          </motion.p>
        </motion.div>
      </Section>

      {/* ── CTA ──────────────────────────────────────────────── */}
      <Section tone="light" className="text-center py-20">
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
