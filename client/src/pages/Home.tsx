import { Link } from "wouter";
import { motion } from "framer-motion";
import { ArrowRight, Download, Smartphone } from "lucide-react";
import { SiteHeader, type NavItem } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { Section } from "@/components/Section";
import { YinYang } from "@/components/YinYang";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { APP_STORE_URL, PLAY_STORE_URL, FOOD_CHART_URL } from "@/lib/links";

const fadeInUp = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" } },
};

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.1 } },
};

const viewportOnce = { once: true, amount: 0.2 } as const;

const NAV_ITEMS: NavItem[] = [
  { label: "The Duality", href: "#duality" },
  { label: "Principles", href: "#principles" },
  { label: "Five Elements", href: "#elements" },
  { label: "The App", href: "#app" },
  { label: "Mastermind", href: "/mastermind" },
];

const YIN_PRACTICES = [
  "Sleep and circadian anchoring",
  "Fasting and digestive rest",
  "Cleansing and drainage",
  "Cooling, watery, in-season foods",
  "Breathwork and nasal breathing",
  "Stillness, sun, silence",
];

const YANG_PRACTICES = [
  "Resistance training and load",
  "Protein and mineral repletion",
  "Heat, sauna, cold exposure",
  "Sprinting and hard conditioning",
  "Discipline and structure",
  "Work that demands something",
];

const PRINCIPLES = [
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
    reads: "Detoxification pathways, bile flow, and the tension that settles into the sinews.",
    protocol: "Liver & Detox Support",
    days: "21 days",
  },
  {
    element: "Fire",
    organs: "Heart + Small Intestine",
    season: "Summer",
    color: "var(--element-fire)",
    reads: "Circulation, sleep, and whether the mind actually settles when the light goes.",
    protocol: "Sleep & Nervous System Regulation",
    days: "14 days",
  },
  {
    element: "Earth",
    organs: "Spleen + Stomach",
    season: "Late Summer",
    color: "var(--element-earth)",
    reads: "Digestion, enzyme output, the gut lining, and the worry that sits in the stomach.",
    protocol: "Digestive Stability, then Full Gut Reset",
    days: "21 + 28 days",
  },
  {
    element: "Metal",
    organs: "Lung + Large Intestine",
    season: "Autumn",
    color: "var(--element-metal)",
    reads: "Breath, skin, lymph, elimination — every channel the body uses to clear.",
    protocol: "Lymphatic & Circulatory Cleanse",
    days: "21 days",
  },
  {
    element: "Water",
    organs: "Kidney + Bladder",
    season: "Winter",
    color: "var(--element-water)",
    reads: "Deep reserves, bone, and the will you draw on under real load. This is the strength layer.",
    protocol: "Training, minerals, and capacity",
    days: "Ongoing",
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

const APP_FEATURES = [
  { title: "Guided protocols", body: "Five multi-day programs — liver, gut, lymph, sleep, digestion — with daily steps, not vague advice." },
  { title: "Habit tracking", body: "A full habit encyclopedia with streaks, so the practice compounds instead of resetting every Monday." },
  { title: "The food chart", body: "197 everyday foods rated from strongly anti-inflammatory to highly inflammatory. Awareness, not restriction." },
  { title: "Wearable sync", body: "Connects to Garmin, Oura, WHOOP, and Fitbit so your sleep and recovery data lands in one place." },
  { title: "eBook library", body: "A reading library with audio, covering the traditions and the research behind the protocols." },
  { title: "A real coach", body: "Message a coach directly from inside the app. Ask the question you'd otherwise search badly." },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-background text-foreground font-sans">
      <SiteHeader navItems={NAV_ITEMS} />

      {/* ── Hero ─────────────────────────────────────────────── */}
      <section className="relative min-h-[92vh] flex items-center pt-20 overflow-hidden bg-ink">
        <div className="absolute inset-0 z-0">
          <img
            src="/images/retreat-jungle.jpg"
            alt=""
            className="w-full h-full object-cover opacity-55"
          />
          {/* Heavy on the left so the copy stays legible, lighter on the right
              so the foliage still reads as texture. */}
          <div className="absolute inset-0 bg-gradient-to-r from-[hsl(30_10%_7%)] via-[hsl(30_10%_8%/0.88)] to-[hsl(30_10%_8%/0.45)]" />
          <div className="absolute inset-0 bg-gradient-to-t from-[hsl(30_10%_9%)] via-transparent to-[hsl(30_10%_8%/0.6)]" />
        </div>

        <div className="container max-w-6xl mx-auto px-4 relative z-20">
          <motion.div initial="hidden" animate="visible" variants={staggerContainer} className="max-w-3xl">
            <motion.div variants={fadeInUp} className="flex items-center gap-4 mb-8">
              <YinYang className="h-9 w-9 text-gold" voidColor="hsl(30 10% 9%)" />
              <Badge
                variant="outline"
                className="border-gold-subtle text-gold-light tracking-widest uppercase bg-gold-subtle px-4 py-1 font-normal"
                data-testid="badge-tagline"
              >
                Holistic Health · Traditional Medicine
              </Badge>
            </motion.div>

            <motion.h1
              variants={fadeInUp}
              className="text-5xl md:text-7xl font-display font-normal leading-[1.08] mb-7 tracking-tight text-white"
              data-testid="text-hero-headline"
            >
              Live in Harmony.
              <br />
              <span className="gold-gradient-text">Build Real Strength.</span>
            </motion.h1>

            <motion.p
              variants={fadeInUp}
              className="text-base md:text-lg text-white/60 mb-9 max-w-2xl leading-relaxed font-normal"
            >
              We follow the old principles — eat with the season, move with the sun, rest when the light
              goes. And then we train hard. Health isn't monk mode and it isn't a supplement stack. It
              lives in the tension between the two.
            </motion.p>

            <motion.div variants={fadeInUp} className="flex flex-col sm:flex-row gap-4">
              <Button
                size="lg"
                className="text-base px-8 gold-metallic-btn w-full sm:w-auto"
                onClick={() => document.getElementById("app")?.scrollIntoView({ behavior: "smooth" })}
                data-testid="button-get-app"
              >
                Get the App <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
              <Button
                variant="outline"
                size="lg"
                className="text-base px-8 border-white/20 text-white backdrop-blur-sm bg-white/5"
                onClick={() => document.getElementById("duality")?.scrollIntoView({ behavior: "smooth" })}
                data-testid="button-philosophy"
              >
                What We Believe
              </Button>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* ── Trust strip ──────────────────────────────────────── */}
      <Section tone="ink-soft" className="border-y border-ink-line py-10">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 max-w-xl sm:max-w-none mx-auto">
          {["Traditional Principles", "Five Guided Protocols", "Strength First", "iOS + Android"].map((label, i) => (
            <div
              key={i}
              className="px-5 py-2 rounded-full border border-gold/30 bg-gold/5 text-xs font-normal uppercase tracking-wider text-ink-foreground/60 text-center"
              style={{ boxShadow: "0 0 14px hsl(39 48% 56% / 0.15)" }}
              data-testid={`trust-marker-${i}`}
            >
              {label}
            </div>
          ))}
        </div>
      </Section>

      {/* ── The Duality ──────────────────────────────────────── */}
      <Section id="duality" tone="ink" className="overflow-hidden">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
          variants={staggerContainer}
        >
          <motion.div variants={fadeInUp} className="text-center max-w-2xl mx-auto mb-14">
            <p className="text-xs uppercase tracking-widest text-gold mb-4 rule-gold rule-gold-center">
              The Duality
            </p>
            <h2 className="text-3xl md:text-5xl font-display font-normal mb-6" data-testid="text-duality-headline">
              Two Forces. <span className="text-gold">One Body.</span>
            </h2>
            <p className="text-ink-foreground/60 leading-relaxed">
              Every tradition worth following lands in the same place: the body runs on opposites held in
              balance. Emptying and filling. Cooling and heating. Rest and exertion. Push one side too far
              and you break — just in a different way each time.
            </p>
          </motion.div>

          <motion.div variants={fadeInUp} className="relative grid md:grid-cols-2 gap-px bg-ink-line rounded-lg overflow-hidden border border-ink-line">
            {/* Yin */}
            <div className="bg-[hsl(30_10%_8%)] p-8 md:p-12">
              <p className="text-xs uppercase tracking-widest text-ink-foreground/40 mb-3">Yin — the receding force</p>
              <h3 className="text-2xl md:text-3xl font-display mb-5 text-ink-foreground">Restore</h3>
              <p className="text-sm text-ink-foreground/55 leading-relaxed mb-7">
                The work of clearing what's in the way. Cooling, quieting, draining, emptying. This is where
                most people are deficient, and it's the half that traditional medicine understood long before
                anyone had a word for inflammation.
              </p>
              <ul className="space-y-2.5">
                {YIN_PRACTICES.map((p) => (
                  <li key={p} className="text-sm text-ink-foreground/70 flex gap-3">
                    <span className="text-ink-foreground/25 mt-px">—</span>
                    {p}
                  </li>
                ))}
              </ul>
            </div>

            {/* Yang */}
            <div className="bg-[hsl(30_9%_13%)] p-8 md:p-12">
              <p className="text-xs uppercase tracking-widest text-gold/60 mb-3">Yang — the advancing force</p>
              <h3 className="text-2xl md:text-3xl font-display mb-5 text-gold">Build</h3>
              <p className="text-sm text-ink-foreground/55 leading-relaxed mb-7">
                The work of adding capacity the body can actually hold. Heat, load, effort, structure. This is
                the half the wellness world quietly dropped — and the reason so much of it produces calm,
                fragile people.
              </p>
              <ul className="space-y-2.5">
                {YANG_PRACTICES.map((p) => (
                  <li key={p} className="text-sm text-ink-foreground/70 flex gap-3">
                    <span className="text-gold/40 mt-px">—</span>
                    {p}
                  </li>
                ))}
              </ul>
            </div>

            {/* Mark at the seam */}
            <div className="hidden md:flex absolute inset-0 items-center justify-center pointer-events-none">
              <div className="h-16 w-16 rounded-full bg-ink border border-gold/30 flex items-center justify-center shadow-gold-subtle">
                <YinYang className="h-9 w-9 text-gold" voidColor="hsl(var(--ink))" />
              </div>
            </div>
          </motion.div>

          <motion.p
            variants={fadeInUp}
            className="text-center font-display text-xl md:text-2xl mt-12 max-w-2xl mx-auto leading-relaxed"
            data-testid="text-duality-thesis"
          >
            Yin without Yang is decay. Yang without Yin is burnout.
            <br />
            <span className="text-gold">We refuse to pick a side.</span>
          </motion.p>
        </motion.div>
      </Section>

      {/* ── Not monk mode ────────────────────────────────────── */}
      <Section tone="light">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
          variants={staggerContainer}
          className="max-w-3xl mx-auto"
        >
          <motion.p variants={fadeInUp} className="text-xs uppercase tracking-widest text-gold mb-4 rule-gold">
            Where We Part Ways
          </motion.p>
          <motion.h2
            variants={fadeInUp}
            className="text-3xl md:text-5xl font-display font-normal mb-8 leading-tight"
            data-testid="text-monk-headline"
          >
            This isn't monk mode.
          </motion.h2>
          <motion.div variants={fadeInUp} className="space-y-5 text-muted-foreground leading-relaxed text-base md:text-lg">
            <p>
              There's a version of holistic health that ends with a robe, a mountain, a bowl of rice, and a
              quiet withdrawal from the world. We understand the appeal. It isn't what we're building.
            </p>
            <p className="text-foreground">
              We think you should be able to carry your own weight — literally. Strong back. Real muscle. A
              body that can work, lift, fight, and take a hit without folding.
            </p>
            <p>
              We also think you should sleep through the night, digest your food, breathe through your nose,
              and get out of bed without a stimulant. Those aren't competing goals. Most people were simply
              never taught how to hold both at once, so they pick the one that matches their personality and
              call the other one soft.
            </p>
            <p className="text-foreground">
              Strength without recovery is just a slower injury. Recovery without strength is just decline
              with better branding.
            </p>
          </motion.div>
        </motion.div>
      </Section>

      {/* ── Principles ───────────────────────────────────────── */}
      <Section id="principles" tone="muted">
        <motion.div initial="hidden" whileInView="visible" viewport={viewportOnce} variants={staggerContainer}>
          <motion.p variants={fadeInUp} className="text-xs uppercase tracking-widest text-gold mb-4 rule-gold">
            The Principles
          </motion.p>
          <motion.h2
            variants={fadeInUp}
            className="text-3xl md:text-4xl font-display font-normal mb-4"
            data-testid="text-principles-headline"
          >
            Live With Your Environment, <span className="text-gold">Not Against It</span>
          </motion.h2>
          <motion.p variants={fadeInUp} className="text-muted-foreground mb-12 max-w-2xl leading-relaxed">
            None of this is new. It's what nearly every traditional system arrived at independently, long
            before it could be measured. We just stopped doing it.
          </motion.p>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {PRINCIPLES.map((p, i) => (
              <motion.div variants={fadeInUp} key={p.title}>
                <Card className="h-full hover-elevate" data-testid={`card-principle-${i}`}>
                  <CardContent className="p-6">
                    <div className="text-xs font-mono text-gold/70 mb-3">{String(i + 1).padStart(2, "0")}</div>
                    <h3 className="font-display text-xl mb-3">{p.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">{p.body}</p>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </Section>

      {/* ── Five Elements ────────────────────────────────────── */}
      <Section id="elements" tone="ink">
        <motion.div initial="hidden" whileInView="visible" viewport={viewportOnce} variants={staggerContainer}>
          <motion.div variants={fadeInUp} className="max-w-2xl mb-14">
            <p className="text-xs uppercase tracking-widest text-gold mb-4 rule-gold">Eastern Traditional Medicine</p>
            <h2 className="text-3xl md:text-4xl font-display font-normal mb-5" data-testid="text-elements-headline">
              The Body, <span className="text-gold">The Way Tradition Reads It</span>
            </h2>
            <p className="text-ink-foreground/60 leading-relaxed">
              Traditional Chinese Medicine organizes the body into five elements — each with its own organs,
              its own season, and its own way of going wrong. It's a map that's been refined for two thousand
              years, and it keeps lining up with what modern research rediscovers a piece at a time. We built
              our protocols on it.
            </p>
          </motion.div>

          <div className="space-y-px bg-ink-line border border-ink-line rounded-lg overflow-hidden">
            {ELEMENTS.map((el, i) => (
              <motion.div
                variants={fadeInUp}
                key={el.element}
                className="bg-ink-soft p-6 md:p-8 grid md:grid-cols-12 gap-5 md:gap-8 md:items-center"
                data-testid={`row-element-${i}`}
              >
                <div className="md:col-span-3 flex items-center gap-4">
                  <span
                    className="h-9 w-9 rounded-full shrink-0 border border-white/10"
                    style={{ backgroundColor: `hsl(${el.color})` }}
                  />
                  <div>
                    <h3 className="font-display text-2xl leading-none mb-1.5">{el.element}</h3>
                    <p className="text-xs uppercase tracking-wider text-ink-foreground/40">{el.season}</p>
                  </div>
                </div>

                <div className="md:col-span-5">
                  <p className="text-sm text-gold/80 mb-1.5 font-medium">{el.organs}</p>
                  <p className="text-sm text-ink-foreground/55 leading-relaxed">{el.reads}</p>
                </div>

                <div className="md:col-span-4 md:text-right">
                  <p className="text-sm text-ink-foreground/85">{el.protocol}</p>
                  <p className="text-xs text-ink-foreground/40 mt-1">{el.days}</p>
                </div>
              </motion.div>
            ))}
          </div>

          <motion.p variants={fadeInUp} className="text-xs text-ink-foreground/35 mt-6 max-w-2xl leading-relaxed">
            We present the five-element framework as philosophy and structure — a way of organizing practice.
            It is not a diagnostic system, and nothing here replaces care from a qualified provider.
          </motion.p>
        </motion.div>
      </Section>

      {/* ── The App ──────────────────────────────────────────── */}
      <Section id="app" tone="light">
        <motion.div initial="hidden" whileInView="visible" viewport={viewportOnce} variants={staggerContainer}>
          <motion.div variants={fadeInUp} className="max-w-2xl mb-12">
            <p className="text-xs uppercase tracking-widest text-gold mb-4 rule-gold">The App</p>
            <h2 className="text-3xl md:text-4xl font-display font-normal mb-5" data-testid="text-app-headline">
              Practice Needs a <span className="text-gold">Place to Live</span>
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              Principles don't do anything until they become a Tuesday. The Sakred app turns all of this into
              guided protocols, daily habits, and a record you can actually look back on. Free to download on
              iOS and Android.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
            {APP_FEATURES.map((f, i) => (
              <motion.div variants={fadeInUp} key={f.title}>
                <Card className="h-full hover-elevate border-gold-subtle" data-testid={`card-app-feature-${i}`}>
                  <CardContent className="p-6">
                    <h3 className="font-display text-lg mb-2.5 text-gold">{f.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">{f.body}</p>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>

          <motion.div variants={fadeInUp} className="flex flex-col sm:flex-row gap-4">
            <a href={APP_STORE_URL} target="_blank" rel="noopener noreferrer" className="sm:w-auto">
              <Button size="lg" className="gold-metallic-btn w-full sm:w-auto px-8" data-testid="button-app-store">
                <Download className="mr-2 h-5 w-5" /> Download on iOS
              </Button>
            </a>
            <a href={PLAY_STORE_URL} target="_blank" rel="noopener noreferrer" className="sm:w-auto">
              <Button size="lg" variant="outline" className="w-full sm:w-auto px-8 border-gold-subtle text-gold" data-testid="button-play-store">
                <Smartphone className="mr-2 h-5 w-5" /> Get it on Android
              </Button>
            </a>
          </motion.div>
        </motion.div>
      </Section>

      {/* ── Food ─────────────────────────────────────────────── */}
      <Section tone="muted">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
          variants={staggerContainer}
          className="grid md:grid-cols-2 gap-12 md:gap-20 items-center"
        >
          <motion.div variants={fadeInUp}>
            <p className="text-xs uppercase tracking-widest text-gold mb-4 rule-gold">Food</p>
            <h2 className="text-3xl md:text-4xl font-display font-normal mb-6" data-testid="text-food-headline">
              Eat Like It <span className="text-gold">Matters</span>
            </h2>
            <div className="space-y-4 text-muted-foreground leading-relaxed">
              <p>
                Chronic inflammation sits underneath most of what goes wrong, and food is the variable you
                touch three times a day. So we rated 197 of them — from strongly anti-inflammatory to highly
                inflammatory — across fruit, vegetables, grains, meat, oils, spices, drinks, and the habits
                around them.
              </p>
              <p className="text-foreground">
                It isn't a diet and there's no plan to buy. It's a map. Awareness beats restriction, because
                awareness is the thing that survives a holiday.
              </p>
            </div>
            <a href={FOOD_CHART_URL} className="inline-block mt-7">
              <Button variant="outline" className="border-gold-subtle text-gold" data-testid="button-food-chart">
                See the Food Chart <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </a>
          </motion.div>

          <motion.div variants={fadeInUp} className="relative">
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
                  <li key={f.name} className="flex items-center gap-3 text-sm">
                    <span
                      className="h-2.5 w-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: `hsl(${f.color})` }}
                    />
                    <span className="text-foreground flex-1">{f.name}</span>
                    <span className="text-xs text-muted-foreground text-right">{f.rating}</span>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-muted-foreground mt-7 pt-5 border-t border-border/50">
                197 foods across 8 categories — fruit, vegetables, grains, meat, oils, spices, drinks, and
                the habits around them.
              </p>
            </div>
          </motion.div>
        </motion.div>
      </Section>

      {/* ── Mastermind teaser ────────────────────────────────── */}
      <Section tone="ink" className="overflow-hidden">
        <div className="absolute inset-0 z-0">
          <img src="/images/tropical-beach.png" alt="" className="w-full h-full object-cover opacity-20" />
          <div className="absolute inset-0 bg-gradient-to-r from-[hsl(30_10%_10%)] via-[hsl(30_10%_10%/0.9)] to-transparent" />
        </div>

        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
          variants={staggerContainer}
          className="max-w-2xl relative z-10"
        >
          <motion.p variants={fadeInUp} className="text-xs uppercase tracking-widest text-gold mb-4 rule-gold">
            Go Deeper
          </motion.p>
          <motion.h2
            variants={fadeInUp}
            className="text-3xl md:text-4xl font-display font-normal mb-6"
            data-testid="text-mastermind-teaser-headline"
          >
            The Mastermind <span className="text-gold">+ Retreats</span>
          </motion.h2>
          <motion.p variants={fadeInUp} className="text-ink-foreground/60 leading-relaxed mb-4">
            Some of this only lands in person. Our concierge mastermind and retreat experience in Puerto Rico
            takes the same principles and puts them in a place with no distractions — small groups, custom
            dates, morning movement on the beach, breathwork, clean food, and real conversation.
          </motion.p>
          <motion.p variants={fadeInUp} className="text-ink-foreground/60 leading-relaxed mb-9">
            Application required. Design your own retreat: private or shared, three days to two weeks.
          </motion.p>
          <motion.div variants={fadeInUp}>
            <Link href="/mastermind">
              <Button size="lg" className="gold-metallic-btn px-8" data-testid="button-explore-mastermind">
                Explore the Mastermind <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
          </motion.div>
        </motion.div>
      </Section>

      {/* ── Final CTA ────────────────────────────────────────── */}
      <Section tone="light" className="text-center py-24">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
          variants={staggerContainer}
          className="max-w-2xl mx-auto"
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
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <a href={APP_STORE_URL} target="_blank" rel="noopener noreferrer">
                <Button size="lg" className="text-base px-8 gold-metallic-btn w-full sm:w-auto" data-testid="button-final-cta">
                  <Download className="mr-2 h-5 w-5" /> Download on iOS
                </Button>
              </a>
              <a href={PLAY_STORE_URL} target="_blank" rel="noopener noreferrer">
                <Button
                  size="lg"
                  variant="outline"
                  className="text-base px-8 border-gold-subtle text-gold w-full sm:w-auto"
                  data-testid="button-final-cta-android"
                >
                  <Smartphone className="mr-2 h-5 w-5" /> Get it on Android
                </Button>
              </a>
            </div>
            <p className="text-xs text-muted-foreground mt-5">Free on iOS and Android.</p>
          </motion.div>
        </motion.div>
      </Section>

      <SiteFooter />
    </div>
  );
}
