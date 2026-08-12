import { Link } from "wouter";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { Section } from "@/components/Section";
import { YinYang } from "@/components/YinYang";
import { Constellation } from "@/components/Constellation";
import { ConstellationBody } from "@/components/ConstellationBody";
import { StarDust } from "@/components/StarDust";
import { ElementOrbit } from "@/components/ElementOrbit";
import { GemStone, TERRITORY_STONES } from "@/components/GemStone";
import { Tilt3D } from "@/components/Tilt3D";
import { Deck } from "@/components/Deck";
import { Magnetic } from "@/components/Magnetic";
import { ParticleSphere } from "@/components/ParticleSphere";
import { DiagonalStack } from "@/components/DiagonalStack";
import { ImageBand } from "@/components/ImageBand";
import { LessonSlideshow, type Lesson } from "@/components/LessonSlideshow";
import { SectionHeader } from "@/components/PageHero";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { TOTAL_FOODS } from "@/data/foodCount";
import { TERRITORIES } from "@/data/territories";
import { responsive, SIZES_FULL_BLEED } from "@/lib/img";
import { usePageMeta } from "@/hooks/use-page-meta";

const fadeInUp = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" } },
};

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.1 } },
};

const viewportOnce = { once: true, amount: 0.2 } as const;

const LESSONS: Lesson[] = [
  {
    title: "Eat with the season",
    body: "Cooling foods in the heat, warming foods in the cold. Local, in season, and close to the ground. Your body is reading the environment whether you cooperate with it or not.",
  },
  {
    title: "Move with the sun",
    body: "Morning light sets the clock for everything downstream — sleep, hormones, digestion, mood. Get outside before you get online.",
  },
  {
    title: "Rest with the dark",
    body: "The body has a downshift sequence, and it runs on darkness, a drop in temperature, and the absence of noise. Modern life removes all three and then sells you a pill.",
  },
  {
    title: "Train against resistance",
    body: "Muscle is the organ of longevity. Load the body, recover, repeat. There is no supplement, protocol, or practice that replaces it.",
  },
  {
    title: "Breathe through your nose",
    body: "Nose breathing changes CO2 tolerance, nitric oxide, and nervous system state. It is the cheapest intervention available and most people never make it.",
  },
  {
    title: "Sweat, and clear what's cleared",
    body: "The lymphatic system has no pump — it moves when you move. Sweat, walk, and let the body take out its own trash.",
  },
];

const ELEMENTS = [
  {
    element: "Wood",
    organs: "Liver + Gallbladder",
    season: "Spring",
    color: "var(--element-wood)",
    reads: "Flow and direction. Free, you're decisive. Stagnant, the temper goes short.",
  },
  {
    element: "Fire",
    organs: "Heart + Small Intestine",
    season: "Summer",
    color: "var(--element-fire)",
    reads: "Circulation, and whether the day's charge settles at night or keeps burning.",
  },
  {
    element: "Earth",
    organs: "Spleen + Stomach",
    season: "Late Summer",
    color: "var(--element-earth)",
    reads: "Turning what you take in into what you're made of. Worry sits here too.",
  },
  {
    element: "Metal",
    organs: "Lung + Large Intestine",
    season: "Autumn",
    color: "var(--element-metal)",
    reads: "Exchange and release. Breath in, waste out, grief moved through.",
  },
  {
    element: "Water",
    organs: "Kidney + Bladder",
    season: "Winter",
    color: "var(--element-water)",
    reads: "The deep reserve. Bone, will, and what you draw down under real load.",
  },
];

const PORTAL_LAYERS = [
  {
    title: "The Apothecary",
    body: "Every protocol arrives with the supply it actually requires — staged prepare, clear, rebuild, sourced with buy links, and checked off as it lands.",
  },
  {
    title: "The Library",
    body: "Guides and ebooks paired to the protocol you're running, in a reader that hands you back to the practice at the last chapter.",
  },
  {
    title: "The Body Map",
    body: "Nine energy centres — the body read as regions and flows rather than organs and labs. Readings are kept in sequence, so your coach sees movement instead of a snapshot.",
  },
  {
    title: "Masterminds",
    body: "Cohorts with a real schedule: sessions, attendance, and a room kept small enough that the standard holds.",
  },
  {
    title: "The Daily Note",
    body: "One note each morning, written from the season, the moon, the day you're on, and your own numbers. If it can't cite something true about today, it doesn't get sent.",
  },
  {
    title: "Your Coach",
    body: "The thread is the product, not a support inbox. You are never more than one screen from the person who set the protocol.",
  },
];

const FOOD_SAMPLES = [
  { name: "Leafy greens, cruciferous veg", rating: "Strongly anti-inflammatory", color: "var(--element-wood)" },
  { name: "Berries, citrus", rating: "Strongly anti-inflammatory", color: "var(--element-wood)" },
  { name: "Turmeric, ginger, garlic", rating: "Strongly anti-inflammatory", color: "var(--element-wood)" },
  { name: "Extra virgin olive oil", rating: "Anti-inflammatory", color: "138 22% 52%" },
  { name: "White bread, refined grains", rating: "Inflammatory", color: "25 55% 55%" },
  { name: "Seed oils, added sugar", rating: "Highly inflammatory", color: "var(--element-fire)" },
];

export default function Home() {
  usePageMeta(
    "Sakred Body — Restore the Body. Build the Body. Live the Life.",
    "Human capacity, not wellness. Yin clears and restores, Yang loads and builds — and the skill is knowing which one you need. Gather with people who hold the same standard.",
  );

  return (
    <div className="tone-ink min-h-screen bg-background text-foreground font-sans">
      <SiteHeader />

      {/*
        The landing. Three things: the name, the figure, the way in.

        It used to open on a stock photograph of a jungle carrying a badge, a
        headline, a paragraph and two buttons. Every one of those lines was
        the constellation's own argument restated in words, printed under the
        constellation — the same eye reads a body and a sky, and neither is a
        collection of parts. The figure says that on its own. Nothing else
        belongs on this screen.
      */}
      {/* The header is a floating pill roughly 72px tall. pt-28 put the
          crown of the figure directly under it. */}
      <section className="tone-ink bg-background relative overflow-hidden pt-40 pb-20 md:pt-44 md:pb-28">
        {/* StarDust only.

            CelestialField draws four orbit rings sized off the frame, and in a
            section this wide they came out wider than the section that clips
            them — so what actually rendered was the top arc of an ellipse
            running edge to edge, flat enough to read as a ruled line straight
            across the page above the figure's head. Shrinking them made the
            line shorter, not absent. Dust has no geometry to clip. */}
        <div className="absolute inset-0 z-0">
          <StarDust className="absolute inset-0 w-full h-full" density={1.4} />
        </div>

        {/* The hero resolves into the ink below it instead of stopping. */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 z-10 bg-gradient-to-t from-background to-transparent" />

        <div className="container max-w-4xl mx-auto px-4 relative z-20">
          <motion.div initial="hidden" animate="visible" variants={staggerContainer} className="text-center">
            {/* The name is in the header, the tab title and the logo already.
                Printing it a fourth time above the figure was the site
                introducing itself to someone who just typed its address.
                Kept as the document's h1 for screen readers and search, and
                taken off the screen. */}
            <h1 className="sr-only" data-testid="text-hero-headline">
              Sakred Body
            </h1>

            <motion.div variants={fadeInUp}>
              <ConstellationBody />
            </motion.div>

            {/* Three things and nothing else: the name, the figure, the way
                in. Every line that used to sit here was the figure's argument
                restated in words, underneath the figure. */}
            <motion.div variants={fadeInUp} className="flex flex-col sm:flex-row gap-4 justify-center mt-16 sm:mt-20">
              <Magnetic>
                <Button
                  size="lg"
                  className="text-base px-8 gold-metallic-btn w-full sm:w-auto"
                  onClick={() => document.getElementById("portal")?.scrollIntoView({ behavior: "smooth" })}
                  data-testid="button-get-app"
                >
                  Enter the Portal <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </Magnetic>
              <Magnetic>
                <Button
                  variant="outline"
                  size="lg"
                  className="text-base px-8 border-white/20 text-white backdrop-blur-sm bg-white/5"
                  onClick={() => document.getElementById("territories")?.scrollIntoView({ behavior: "smooth" })}
                  data-testid="button-philosophy"
                >
                  What We Believe
                </Button>
              </Magnetic>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* ── The two directions ───────────────────────────────
          This counted territories — "Four Territories", then briefly three.
          Counting was never the message: a number tells a visitor how much
          there is to learn, not what any of it is. The body has two
          directions and the skill is knowing which one you're in. Gather is
          the third card because it is where both get practised, not because
          it is a third direction. */}
      <Section id="territories" tone="ink" className="overflow-hidden pt-16 md:pt-24">
        <Constellation className="absolute inset-0 w-full h-full z-0 opacity-90" />
        <motion.div initial="hidden" whileInView="visible" viewport={viewportOnce} variants={staggerContainer}>
          <motion.div variants={fadeInUp}>
            <SectionHeader
              eyebrow="The Architecture"
              title={<>The body has <span className="text-gold">two directions.</span></>}
              intro="Yin clears and restores. Yang loads and builds. Health is not one or the other — it's the judgement to know which one you need right now, and a terrain able to do both."
              onInk
              testId="text-territories-headline"
            />
          </motion.div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-10 gap-y-10">
            {TERRITORIES.map((t, i) => (
              <motion.div variants={fadeInUp} key={t.key}>
                <Link href={t.href}>
                  <Tilt3D className="h-full rounded-xl" max={6} lift={12} sheen={false}>
                  {/* No hover-elevate. It paints a ::after at inset 0 with
                      border-radius: inherit, and this card has no radius — so
                      hovering drew a hard-cornered rectangle over the whole
                      thing. The rule above the card lighting to gold is the
                      hover state; that's enough. */}
                  <div
                    className="group h-full pt-8 border-t border-border hover:border-gold/45 text-center flex flex-col transition-colors duration-300"
                    data-testid={`card-territory-${t.key}`}
                  >
                    <GemStone
                      stone={TERRITORY_STONES[t.key] ?? TERRITORY_STONES.restore}
                      spinRate={0.2}
                      className="h-20 w-20 mx-auto mb-2"
                    />
                    <h3 className="font-display text-2xl mb-2">{t.name}</h3>
                    <p className="text-xs text-muted-foreground mb-1 flex-1">{t.force}</p>
                    <span className="mt-5 text-xs text-gold inline-flex items-center justify-center gap-1.5">
                      Explore <ArrowRight className="h-3.5 w-3.5" />
                    </span>
                  </div>
                  </Tilt3D>
                </Link>
              </motion.div>
            ))}
          </div>

          <motion.p
            variants={fadeInUp}
            className="text-center font-display text-3xl md:text-5xl mt-20 max-w-3xl mx-auto leading-[1.15] tracking-tight"
            data-testid="text-duality-thesis"
          >
            <span className="text-gold">We refuse to pick a side.</span>
          </motion.p>

          <motion.div variants={fadeInUp} className="text-center mt-9">
            <Link href="/philosophy">
              <Button variant="outline" className="border-gold-subtle text-gold" data-testid="button-philosophy-page">
                Read the Full Philosophy <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </motion.div>
        </motion.div>
      </Section>

      {/* ── Core lessons ─────────────────────────────────────── */}
      <Section id="lessons" tone="raised" width="max-w-3xl" className="py-10 md:py-12">
        <motion.div initial="hidden" whileInView="visible" viewport={viewportOnce} variants={staggerContainer}>
          <motion.p
            variants={fadeInUp}
            className="text-xs uppercase tracking-widest text-gold mb-7 rule-gold rule-gold-center text-center"
          >
            The Core Lessons
          </motion.p>

          <motion.div variants={fadeInUp} className="max-w-3xl mx-auto">
            <LessonSlideshow lessons={LESSONS} />
          </motion.div>
        </motion.div>
      </Section>

      {/* ── The Member Portal ────────────────────────────────── */}
      <Section id="portal" tone="ink" className="overflow-hidden">
        <ParticleSphere className="absolute inset-0 w-full h-full z-0 opacity-70" />
        <motion.div initial="hidden" whileInView="visible" viewport={viewportOnce} variants={staggerContainer}>
          <motion.div variants={fadeInUp}>
            <SectionHeader
              eyebrow="The Member Portal"
              title={<>Where the Work <span className="text-gold">Actually Lives</span></>}
              intro="Membership opens the layer underneath the app — supply, study, the body read as energy, and the room you sit in with other members."
              testId="text-portal-headline"
            />
          </motion.div>

          {/* The last six-across grid on the site. */}
          <motion.div variants={fadeInUp}>
            <Deck testId="deck-portal" autoAdvanceMs={6500} cards={PORTAL_LAYERS} />
          </motion.div>

          <motion.div variants={fadeInUp} className="text-center mt-10">
            <Link href="/login">
              <Button variant="outline" className="border-gold-subtle text-gold" data-testid="button-portal">
                Enter the Portal <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </motion.div>
        </motion.div>
      </Section>

      <ImageBand
        image="/images/cliffs-sea.webp"
        alt="Cliffs falling into a calm blue sea"
        title={<>Somewhere the noise <span className="text-gold">cannot reach you.</span></>}
        tall
        testId="text-coast-headline"
      />

      {/* ── Food ─────────────────────────────────────────────── */}
      <Section tone="raised" width="max-w-3xl">
        <motion.div initial="hidden" whileInView="visible" viewport={viewportOnce} variants={staggerContainer}>
          <motion.div variants={fadeInUp} className="text-center max-w-2xl mx-auto mb-10">
            <p className="text-xs uppercase tracking-widest text-gold mb-4 rule-gold rule-gold-center">Food</p>
            <h2 className="text-4xl md:text-5xl font-display font-normal mb-6 tracking-tight leading-[1.08]" data-testid="text-food-headline">
              Eat Like It <span className="text-gold">Matters</span>
            </h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              Chronic inflammation sits underneath most of what goes wrong, and food is the variable you touch
              three times a day. So we rated 197 of them — across fruit, vegetables, grains, meat, oils,
              spices, drinks, and the habits around them.
            </p>
            <p className="text-foreground leading-relaxed">
              It isn't a diet and there's no plan to buy. It's a map. Awareness beats restriction, because
              awareness is the thing that survives a holiday.
            </p>
          </motion.div>

          <motion.div variants={fadeInUp} className="relative max-w-xl mx-auto">
            <div className="absolute -inset-4 bg-gold/10 blur-3xl rounded-full opacity-30" />
            <div className="relative rounded-lg border border-gold-subtle bg-card p-7 md:p-8 shadow-gold-subtle">
              <div className="flex justify-between text-[10px] uppercase tracking-wider text-muted-foreground mb-3">
                <span>Anti-inflammatory</span>
                <span>Inflammatory</span>
              </div>
              <div
                className="h-2 rounded-full mb-8"
                style={{
                  background:
                    "linear-gradient(90deg, hsl(var(--element-wood)), hsl(var(--element-earth)), hsl(var(--element-fire)))",
                }}
              />
              <ul className="space-y-3.5">
                {FOOD_SAMPLES.map((f) => (
                  <li key={f.name} className="flex flex-col items-center gap-1.5 text-sm">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: `hsl(${f.color})` }} />
                    <span className="text-foreground">{f.name}</span>
                    <span className="text-xs text-muted-foreground">{f.rating}</span>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-muted-foreground mt-7 pt-5 border-t border-border/50 text-center">
                197 foods across 8 categories.
              </p>
            </div>
          </motion.div>

          <motion.div variants={fadeInUp} className="text-center mt-9">
            <Link href="/food-chart">
              <Button variant="outline" className="border-gold-subtle text-gold" data-testid="button-food-chart">
                See All {TOTAL_FOODS} Foods <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </motion.div>
        </motion.div>
      </Section>


      {/* ── Five Elements ─────────────────────────────────────
          Deliberately this far down.

          It used to sit third, directly under the two directions — which
          meant the second idea a visitor met was Wood / Fire / Earth / Metal
          / Water and five organ pairs. That reads as a syllabus: something
          you have to learn before you are allowed to understand the rest,
          and it is the single heaviest thing on the page.

          Yin and Yang are the simplification of exactly this material, and
          they now carry the top of the page on their own. By the time anyone
          reaches here they already have the model, so the elements land as
          what they are — the older, more precise version underneath, and the
          evidence that the simple version came from somewhere. */}
      <Section id="elements" tone="ink" className="py-12 md:py-16 overflow-hidden">
        <StarDust className="absolute inset-0 w-full h-full z-0" density={0.7} />
        <motion.div initial="hidden" whileInView="visible" viewport={viewportOnce} variants={staggerContainer}>
          <motion.div variants={fadeInUp} className="text-center max-w-2xl mx-auto mb-8">
            <p className="text-xs uppercase tracking-widest text-gold mb-4 rule-gold rule-gold-center">
              Eastern Traditional Medicine
            </p>
            <h2 className="text-4xl md:text-5xl font-display font-normal mb-6 tracking-tight leading-[1.08]" data-testid="text-elements-headline">
              The Body, <span className="text-gold">The Way Tradition Reads It</span>
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              Traditional Chinese Medicine organizes the body into five elements — each with its own organs,
              its own season, and its own way of going wrong. It's a map refined over two thousand years, and
              it keeps lining up with what modern research rediscovers a piece at a time. We built our
              protocols on it.
            </p>
          </motion.div>

          <motion.div variants={fadeInUp}>
            <ElementOrbit elements={ELEMENTS} />
          </motion.div>

       </motion.div>
      </Section>

      {/* ── Mastermind teaser ────────────────────────────────── */}
      <Section tone="ink" className="overflow-hidden">
        <div className="absolute inset-0 z-0">
          <img
            {...responsive("/images/gathering-string-lights.webp", SIZES_FULL_BLEED)}
            alt=""
            loading="lazy"
            decoding="async"
            className="w-full h-full object-cover opacity-30"
          />
          <div
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(ellipse 70% 70% at 50% 50%, hsl(30 10% 10% / 0.86), hsl(30 10% 10% / 0.97))",
            }}
          />
        </div>

        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
          variants={staggerContainer}
          className="relative z-10 grid lg:grid-cols-2 gap-14 lg:gap-20 items-center"
        >
          <div className="text-center">
            <motion.p
              variants={fadeInUp}
              className="text-xs uppercase tracking-widest text-gold mb-4 rule-gold rule-gold-center"
            >
              Go Deeper
            </motion.p>
            <motion.h2
              variants={fadeInUp}
              className="text-3xl md:text-4xl font-display font-normal mb-6"
              data-testid="text-mastermind-teaser-headline"
            >
              The Mastermind <span className="text-gold">+ Retreats</span>
            </motion.h2>
            <motion.p variants={fadeInUp} className="text-muted-foreground leading-relaxed mb-4">
              Some of this only lands in person. The mastermind and the retreats take the same principles
              and put them somewhere with no distractions — small groups, custom dates, morning movement,
              breathwork, clean food, and real conversation.
            </motion.p>
            <motion.p variants={fadeInUp} className="text-muted-foreground leading-relaxed mb-9">
              Application required. Design your own retreat: private or shared, three days to two weeks.
            </motion.p>
            <motion.div variants={fadeInUp}>
              <Magnetic>
                <Link href="/mastermind">
                  <Button size="lg" className="gold-metallic-btn px-8" data-testid="button-explore-mastermind">
                    Explore the Mastermind <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                </Link>
              </Magnetic>
            </motion.div>
          </div>

          <motion.div variants={fadeInUp}>
            <DiagonalStack
              testId="stack-mastermind"
              className="mx-auto max-w-md lg:max-w-none"
              images={[
                { src: "/images/terrace-ocean.webp", alt: "A terrace opening onto the ocean at dusk" },
                { src: "/images/long-dining-table.webp", alt: "A long table laid for a shared dinner" },
                { src: "/images/tropical-villa.webp", alt: "A villa set back in tropical planting" },
              ]}
            />
          </motion.div>
        </motion.div>
      </Section>

      {/* ── Final CTA ────────────────────────────────────────── */}
      {/* No orb behind this one. The aurora is built for an ink ground — its
          blooms are additive, and clipped to a sphere they read as a grey
          disc sitting behind the headline on a cream panel. */}
      <Section tone="raised" width="max-w-3xl" className="text-center overflow-hidden">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
          variants={staggerContainer}
          className="max-w-2xl mx-auto relative z-10"
        >
          <motion.div variants={fadeInUp} className="flex justify-center mb-8">
            <YinYang className="h-12 w-12 text-gold" />
          </motion.div>
          <motion.h2
            variants={fadeInUp}
            className="text-3xl md:text-4xl font-display font-normal mb-6"
            data-testid="text-final-cta-headline"
          >
            Start where you are.
            <br />
            <span className="text-gold">Build from there.</span>
          </motion.h2>
          <motion.p variants={fadeInUp} className="text-muted-foreground text-lg mb-10 leading-relaxed">
            You don't need to overhaul your life this week. Pick one protocol, run it to the end, and let the
            body show you what changes. Everything else follows from that.
          </motion.p>
          <motion.div variants={fadeInUp}>
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
              <Magnetic>
                <Link href="/login">
                  <Button size="lg" className="text-base px-8 gold-metallic-btn" data-testid="button-final-cta">
                    Enter the Portal <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                </Link>
              </Magnetic>
              <Magnetic>
                <Link href="/mastermind">
                  <Button
                    size="lg"
                    variant="outline"
                    className="text-base px-8 border-gold-subtle text-gold gold-outline-lift"
                    data-testid="button-final-cta-mastermind"
                  >
                    Apply to the Mastermind
                  </Button>
                </Link>
              </Magnetic>
            </div>
          </motion.div>
        </motion.div>
      </Section>

      <SiteFooter />
    </div>
  );
}
