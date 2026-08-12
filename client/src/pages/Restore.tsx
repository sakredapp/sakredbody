import { Link } from "wouter";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { Section } from "@/components/Section";
import { PageHero, SectionHeader } from "@/components/PageHero";
import { FlowField } from "@/components/FlowField";
import { ImageBand } from "@/components/ImageBand";
import { FlipCards } from "@/components/FlipCards";
import { AscentChart } from "@/components/AscentChart";
import { Button } from "@/components/ui/button";
import { usePageMeta } from "@/hooks/use-page-meta";

const fadeInUp = {
  hidden: { opacity: 0, y: 26 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.55, ease: "easeOut" } },
};
const stagger = { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: 0.09 } } };
const viewportOnce = { once: true, amount: 0.2 } as const;

/*
  Written in the second person, and plainly.

  These were titled "Drainage that doesn't drain", "A gut that can't extract",
  "A nervous system stuck on" and "Depletion mistaken for identity" — accurate,
  and abstract enough that a visitor has to translate each one before it means
  anything. Somebody arriving on this page already feels all four; the title
  should be the sentence they'd use themselves, not the clinical name for it.
*/
const BURDENS = [
  {
    title: "Your lymph only moves when you do",
    body: "The lymphatic system has no pump. Sit all day and it barely moves — so anything the liver hands off has nowhere to go. It's why aggressive cleanses make people feel worse: they mobilise a load the exits can't clear.",
  },
  {
    title: "You're not absorbing what you eat",
    body: "Low enzyme output, poor bile flow, a worn gut lining. The best diet in the world arrives and leaves without being used. Nutrition isn't what you eat. It's what you absorb.",
  },
  {
    title: "You never actually switch off",
    body: "Digestion, repair and sleep all run downstream of state. A body that never leaves fight-or-flight doesn't digest well, doesn't sleep deeply and doesn't rebuild — whatever you feed it.",
  },
  {
    title: "You've forgotten what good feels like",
    body: "Low minerals and chronic dehydration get normalised as personality — tired, wired, foggy, cold. Most people have never felt the baseline they're measuring themselves against.",
  },
];

const ORDER = [
  { stage: "Open the exits", body: "Bowels, lymph, sweat, breath. Before anything is mobilised, it needs somewhere to go." },
  { stage: "Calm the state", body: "Sleep, light, and nervous-system regulation. Nothing repairs in a body still braced." },
  { stage: "Restore digestion", body: "Enzymes, bile, meal spacing, and the gut lining — the gate everything else passes through." },
  { stage: "Then clear", body: "Only now does a cleanse do what it claims. Order is the difference between relief and a crash." },
  { stage: "Then rebuild", body: "Minerals, protein, reseeding, and structure. Restoration ends by putting something back." },
];

export default function Restore() {
  usePageMeta(
    "Restore — Clear the Terrain | Sakred Body",
    "Drainage, digestion, nervous-system regulation, sleep and minerals — read from your own numbers, in the order restoration actually has to happen in.",
  );

  return (
    <div className="min-h-screen bg-background text-foreground font-sans">
      <SiteHeader overHero={false} />

      {/* No intro paragraph.

          This opened on three sentences defining Yin — "the half of the system
          that clears, drains, softens and rebuilds…" — which is the page's own
          argument stated in full, above the page that makes it. Home proves the
          hero doesn't need one: a name, a few marks, and the way in. The marks
          now state things the app can actually back. */}
      <PageHero
        eyebrow="Yin · The Receding Force"
        title={<>Restore.</>}
        testId="text-restore-headline"
        ambient={<FlowField className="absolute inset-0 w-full h-full opacity-70" />}
        marks={["Drainage before detox", "Read from your own numbers", "The lymph has no pump"]}
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

      {/* ── The turn ─────────────────────────────────────────
          A held moment between two dense sections rather than a third grid.

          This page ran cards into cards into cards — four flip cards, then five
          more, then a five-card deck — which is what made it read as a stack of
          slabs however good any single card was. The line was already here,
          buried under the order section as a pull quote; full-bleed and on its
          own it does the work the deck was failing to do. */}
      <ImageBand
        image="/images/white-cliff-turquoise.webp"
        alt="Clear turquoise water running out from a white cliff"
        title={<>You cannot clean a room <span className="text-gold">while the door is still locked.</span></>}
        tall
        testId="text-restore-turn"
      >
        <p>Almost every failed protocol is a right action taken at the wrong time.</p>
      </ImageBand>

      {/* ── The order ────────────────────────────────────────
          Rising stages, not a row of cards. Each step stands on the one before
          it, which is the whole claim of the section — as five equal boxes the
          geometry said the opposite of the heading above it. */}
      <Section tone="raised">
        <motion.div initial="hidden" whileInView="visible" viewport={viewportOnce} variants={stagger}>
          <motion.div variants={fadeInUp}>
            <SectionHeader
              eyebrow="The Order"
              title={<>Order Is the Method</>}
              testId="text-order-headline"
            />
          </motion.div>

          <motion.div variants={fadeInUp}>
            <AscentChart stages={ORDER} testId="ascent-order" />
          </motion.div>
        </motion.div>
      </Section>

      {/* ── What it actually is in the app ───────────────────
          This section used to list five named protocols — "Digestive
          Stability", "Liver & Detox Support", "Lymphatic & Circulatory
          Cleanse", "Full Gut Reset & Drainage", "Sleep & Nervous System", each
          with a day count and a "start here". None of them exist. The strings
          appeared nowhere in this repository except on this page: not in the
          app, not in the server, not in shared. The site was selling a product
          by name that a member could never find after signing up.

          What Restore actually is: habits, a terrain check-in and reading,
          sleep, HRV and resting heart rate read off the phone, and restorative
          sessions logged on the same engine Build uses. That is a better story
          than the invented one, and it has the advantage of being true. */}
      <Section tone="ink">
        <motion.div initial="hidden" whileInView="visible" viewport={viewportOnce} variants={stagger}>
          <motion.div variants={fadeInUp}>
            <SectionHeader
              eyebrow="In the App"
              title={<>Restore is <span className="text-gold">read, not guessed.</span></>}
              intro="Sleep, heart-rate variability and resting heart rate come off your phone. Your habits, check-ins and sessions come off your week. The app reads them together and says which direction today is asking for — and restoring is something you log, not something you skip."
              testId="text-inapp-headline"
            />
          </motion.div>

          <motion.div variants={fadeInUp} className="text-center flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/login">
              <Button className="gold-metallic-btn px-8 w-full sm:w-auto" data-testid="button-see-protocols">
                Enter the Portal <ArrowRight className="ml-2 h-4 w-4" />
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
      <Section tone="raised" width="max-w-3xl" className="text-center">
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
