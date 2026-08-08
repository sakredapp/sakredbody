import { Link } from "wouter";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
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
        title={<>Restore. <span className="text-gold">Clear the Terrain.</span></>}
        intro="Healing is not endlessly adding things. Most people are carrying a load they've never put down — and no supplement, protocol, or training block works well on top of it. Restoration begins by removing what's in the way."
        note="This is the half of health that traditional medicine understood long before anyone had a word for inflammation."
        testId="text-restore-headline"
      />

      {/* ── The burden ───────────────────────────────────────── */}
      <Section tone="ink">
        <motion.div initial="hidden" whileInView="visible" viewport={viewportOnce} variants={stagger}>
          <motion.div variants={fadeInUp}>
            <SectionHeader
              eyebrow="The Burden"
              title={<>What's Actually <span className="text-gold">In the Way</span></>}
              intro="These four show up together far more often than they show up alone. They also explain why so many people do everything right and feel nothing change."
              testId="text-burden-headline"
            />
          </motion.div>

          <div className="grid md:grid-cols-2 gap-x-12 gap-y-14 max-w-4xl mx-auto">
            {BURDENS.map((b, i) => (
              <motion.div variants={fadeInUp} key={b.title}>
                <div
                  className="h-full pt-8 border-t border-border text-center"
                  data-testid={`card-burden-${i}`}
                >
                  <h3 className="font-display text-xl mb-3">{b.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{b.body}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </Section>

      {/* ── The order ────────────────────────────────────────── */}
      <Section tone="light">
        <motion.div initial="hidden" whileInView="visible" viewport={viewportOnce} variants={stagger}>
          <motion.div variants={fadeInUp}>
            <SectionHeader
              eyebrow="The Order"
              title={<>Sequence Is <span className="text-gold">the Method</span></>}
              intro="Almost every failed protocol is a right action taken at the wrong time. Run these in order and unremarkable interventions start working. Run them out of order and good ones make you feel worse."
              testId="text-order-headline"
            />
          </motion.div>

          <div className="max-w-3xl mx-auto space-y-px bg-border border border-border rounded-lg overflow-hidden">
            {ORDER.map((o, i) => (
              <motion.div variants={fadeInUp} key={o.step}>
                <div className="bg-card p-7 text-center" data-testid={`row-order-${i}`}>
                  <span className="font-mono text-[11px] text-muted-foreground">{String(i + 1).padStart(2, "0")}</span>
                  <h3 className="font-display text-2xl mt-2 mb-3">{o.step}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed max-w-xl mx-auto">{o.body}</p>
                </div>
              </motion.div>
            ))}
          </div>

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
              title={<>Five Protocols, <span className="text-gold">In Sequence</span></>}
              intro="Each runs a fixed number of days with daily steps. They're listed here in the order most people should run them, which is not the order they look most exciting in."
              testId="text-protocols-headline"
            />
          </motion.div>

          <div className="max-w-2xl mx-auto">
            {PROTOCOLS.map((p, i) => (
              <motion.div
                variants={fadeInUp}
                key={p.name}
                className="py-6 border-b border-border/50 last:border-0 text-center"
                data-testid={`row-protocol-${i}`}
              >
                <span className="font-mono text-[11px] text-muted-foreground block mb-2">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h3 className="font-display text-xl">{p.name}</h3>
                <p className="text-sm text-muted-foreground mt-1">{p.note}</p>
                <p className="text-xs text-muted-foreground/70 mt-1.5">{p.days}</p>
              </motion.div>
            ))}
          </div>

          <motion.div variants={fadeInUp} className="text-center mt-10 flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/app">
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
      <Section tone="light" className="text-center py-20">
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
