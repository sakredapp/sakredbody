import { Link } from "wouter";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { Section } from "@/components/Section";
import { PageHero, SectionHeader } from "@/components/PageHero";
import { ImageBand } from "@/components/ImageBand";
import { YinYang } from "@/components/YinYang";
import { Button } from "@/components/ui/button";
import { TERRITORIES, CAPACITY_MODEL, OPERATING_LOOP } from "@/data/territories";
import { usePageMeta } from "@/hooks/use-page-meta";

const fadeInUp = {
  hidden: { opacity: 0, y: 26 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.55, ease: "easeOut" } },
};
const stagger = { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: 0.09 } } };
const viewportOnce = { once: true, amount: 0.2 } as const;

const DEFINITION = [
  { quality: "Clear", body: "enough to perceive — not so loaded with burden that every signal is noise." },
  { quality: "Regulated", body: "enough to recover — a nervous system that can actually downshift." },
  { quality: "Nourished", body: "enough to rebuild — minerals, protein, water, light, sleep, in real amounts." },
  { quality: "Strong", body: "enough to endure — able to carry weight and produce force under load." },
  { quality: "Mobile", body: "enough to move — joints and tissue that let the strength be expressed." },
  { quality: "Disciplined", body: "enough to develop — practice that survives a bad week." },
  { quality: "Aware", body: "enough to adapt — reading the organism instead of outsourcing every decision." },
];

export default function Philosophy() {
  usePageMeta(
    "What Is a Sakred Body? — The Philosophy | Sakred Body",
    "Restore, Build, Embody, Gather. The philosophy behind Sakred Body: human capacity, the terrain, the capacity model, and the loop that runs underneath all of it.",
  );

  return (
    <div className="min-h-screen bg-background text-foreground font-sans">
      <SiteHeader overHero={false} />

      <PageHero
        eyebrow="The Philosophy"
        title={<>The Philosophy.</>}
        intro="Not a body that avoids illness. One capable of inhabiting its own life."
        testId="text-philosophy-headline"
      />

      {/* ── The definition ───────────────────────────────────── */}
      <Section tone="ink">
        <motion.div initial="hidden" whileInView="visible" viewport={viewportOnce} variants={stagger}>
          <motion.div variants={fadeInUp}>
            <SectionHeader
              eyebrow="The Definition"
              title={<>Seven Words, <span className="text-gold">In Order</span></>}
              intro="Each depends on the one before it. Awareness is useless in a body too loaded to send a clean signal, and strength is meaningless in a body that can't recover from it."
              testId="text-definition-headline"
            />
          </motion.div>

          <div className="max-w-2xl mx-auto">
            {DEFINITION.map((d, i) => (
              <motion.div
                variants={fadeInUp}
                key={d.quality}
                className="py-6 border-b border-border/50 last:border-0 text-center"
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

      {/* ── Four territories ─────────────────────────────────── */}
      <Section tone="light">
        <motion.div initial="hidden" whileInView="visible" viewport={viewportOnce} variants={stagger}>
          <motion.div variants={fadeInUp}>
            <SectionHeader
              eyebrow="The Architecture"
              title={<>Restore. Build. <span className="text-gold">Embody. Gather.</span></>}
              intro="Health work and human environments aren't two businesses that happen to share a website. They're four territories of the same problem, in the order they have to be solved."
              testId="text-territories-headline"
            />
          </motion.div>

          <div className="space-y-px bg-border border border-border rounded-lg overflow-hidden">
            {TERRITORIES.map((t, i) => (
              <motion.div variants={fadeInUp} key={t.key}>
                <Link href={t.href}>
                  <div
                    className="bg-card p-7 md:p-9 text-center hover-elevate transition-colors"
                    data-testid={`row-territory-${t.key}`}
                  >
                    <div className="flex items-center justify-center gap-3 mb-4">
                      <span
                        className="h-3 w-3 rounded-full"
                        style={{ backgroundColor: `hsl(${t.color})` }}
                      />
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        {t.force}
                      </span>
                    </div>
                    <h3 className="font-display text-3xl mb-3">{t.name}</h3>
                    <p className="text-gold/80 text-sm mb-4 max-w-xl mx-auto">{t.promise}</p>
                    <p className="text-sm text-muted-foreground leading-relaxed max-w-2xl mx-auto mb-5">
                      {t.body}
                    </p>
                    <span className="text-xs text-gold inline-flex items-center gap-1.5">
                      {t.verb} <ArrowRight className="h-3.5 w-3.5" />
                    </span>
                  </div>
                </Link>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </Section>

      <ImageBand
        image="/images/zen-sand-garden.jpg"
        alt="A single stone at the centre of a raked circular sand garden"
        eyebrow="Older Than the Research"
        title={<>None of this is new. <span className="text-gold">We just stopped doing it.</span></>}
        testId="text-older-headline"
      >
        <p>
          Every tradition that lasted arrived at the same handful of conclusions long before anyone could
          measure why they worked. We're not claiming to have discovered anything — only to have kept the
          parts that hold up.
        </p>
      </ImageBand>

      {/* ── The capacity model ───────────────────────────────── */}
      <Section tone="ink">
        <motion.div initial="hidden" whileInView="visible" viewport={viewportOnce} variants={stagger}>
          <motion.div variants={fadeInUp}>
            <SectionHeader
              eyebrow="The Capacity Model"
              title={<>Health Is the Floor, <span className="text-gold">Not the Ceiling</span></>}
              intro="Most health advice stops at the first stage and calls it the destination. Being not-sick is where this starts, not where it ends."
              testId="text-capacity-headline"
            />
          </motion.div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-x-12 gap-y-14 max-w-5xl mx-auto">
            {CAPACITY_MODEL.map((c, i) => (
              <motion.div variants={fadeInUp} key={c.stage}>
                <div
                  className="h-full pt-8 border-t border-border text-center"
                  data-testid={`card-capacity-${i}`}
                >
                  <h3 className="font-display text-xl mt-3 mb-3">{c.stage}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{c.body}</p>
                </div>
              </motion.div>
            ))}
          </div>

          <motion.p
            variants={fadeInUp}
            className="text-center font-display text-xl md:text-2xl mt-12 max-w-2xl mx-auto leading-relaxed"
          >
            The point was never the body.
            <br />
            <span className="text-gold">The point is what the body lets you do.</span>
          </motion.p>
        </motion.div>
      </Section>

      {/* ── The loop ─────────────────────────────────────────── */}
      <Section tone="light">
        <motion.div initial="hidden" whileInView="visible" viewport={viewportOnce} variants={stagger}>
          <motion.div variants={fadeInUp}>
            <SectionHeader
              eyebrow="The Operating Loop"
              title={<>Clear. Nourish. <span className="text-gold">Challenge. Recover.</span></>}
              intro="This is the whole method compressed into four beats. It applies to a 21-day protocol, a training block, a work quarter, and a retreat. Skip a beat and the loop stops turning."
              testId="text-loop-headline"
            />
          </motion.div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-x-12 gap-y-14 max-w-5xl mx-auto">
            {OPERATING_LOOP.map((l, i) => (
              <motion.div variants={fadeInUp} key={l.step}>
                <div
                  className="h-full border border-gold-subtle rounded-lg p-6 text-center bg-card"
                  data-testid={`card-loop-${i}`}
                >
                  <h3 className="font-display text-2xl mb-3 text-gold">{l.step}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{l.body}</p>
                </div>
              </motion.div>
            ))}
          </div>

          <motion.p variants={fadeInUp} className="text-center text-muted-foreground mt-10 max-w-xl mx-auto">
            Then repeat. Adaptation is a cycle, not a finish line.
          </motion.p>
        </motion.div>
      </Section>

      {/* ── Stress ───────────────────────────────────────────── */}
      <Section tone="ink">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
          variants={stagger}
          className="max-w-3xl mx-auto text-center"
        >
          <motion.div variants={fadeInUp} className="flex justify-center mb-8">
            <YinYang className="h-12 w-12 text-gold" voidColor="hsl(var(--ink))" />
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
              Fasting requires feeding. Cleansing requires rebuilding. Work requires sleep. Every adaptation
              worth having runs on the same two-stroke engine.
            </p>
            <p className="text-foreground">
              So the goal was never a life with less stress in it. The goal is becoming an organism that can
              meet stress, adapt to it, and return to equilibrium — faster each time.
            </p>
            <p>
              This is also why we won't sell you only the calm half. A practice built entirely on
              restoration produces someone very relaxed and very fragile. A practice built entirely on
              intensity produces someone impressive who breaks. Both halves, in the right order.
            </p>
          </motion.div>
        </motion.div>
      </Section>

      {/* ── CTA ──────────────────────────────────────────────── */}
      <Section tone="light" className="text-center py-20">
        <motion.div initial="hidden" whileInView="visible" viewport={viewportOnce} variants={stagger}>
          <motion.h2 variants={fadeInUp} className="text-3xl md:text-4xl font-display font-normal mb-6">
            Start with the <span className="text-gold">terrain.</span>
          </motion.h2>
          <motion.p variants={fadeInUp} className="text-muted-foreground max-w-xl mx-auto mb-9 leading-relaxed">
            Everything else is built on it. If you only read one more page, read this one.
          </motion.p>
          <motion.div variants={fadeInUp} className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/the-terrain">
              <Button size="lg" className="gold-metallic-btn px-8 w-full sm:w-auto" data-testid="button-terrain">
                Understand the Terrain <ArrowRight className="ml-2 h-5 w-5" />
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
