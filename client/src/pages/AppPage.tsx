import { motion } from "framer-motion";
import { Download, Smartphone } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { Section } from "@/components/Section";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { APP_STORE_URL, PLAY_STORE_URL } from "@/lib/links";
import { usePageMeta } from "@/hooks/use-page-meta";

const fadeInUp = {
  hidden: { opacity: 0, y: 26 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.55, ease: "easeOut" } },
};

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.09 } },
};

const viewportOnce = { once: true, amount: 0.2 } as const;

const PROTOCOLS = [
  {
    name: "Liver & Detox Support",
    days: "21 days",
    element: "Wood",
    color: "var(--element-wood)",
    summary: "Supports the liver's own two-phase detoxification pathways and bile flow.",
    practices: [
      "Morning lemon water and hydration anchoring",
      "Milk thistle and flaxseed fiber",
      "Cruciferous vegetables at volume",
      "Castor oil packs",
      "Removing alcohol, added sugars, and seed oils",
    ],
  },
  {
    name: "Digestive Stability",
    days: "21 days",
    element: "Earth",
    color: "var(--element-earth)",
    summary: "The clearing phase that precedes the gut reset.",
    practices: [
      "Botanical antimicrobial support",
      "Apple cider vinegar before meals",
      "Raw garlic",
      "Tongue scraping",
      "S. boulardii, with optional intensive tiers",
    ],
  },
  {
    name: "Full Gut Reset & Drainage",
    days: "28 days",
    element: "Earth",
    color: "var(--element-earth)",
    summary:
      "The rebuilding phase: restore enzyme output, repair the gut lining, calm the gut-brain axis, and reseed the microbiome.",
    practices: [
      "Digestive bitters and enzyme support",
      "L-glutamine and bone broth",
      "Elimination diet with structured reintroduction",
      "Breathing work before meals",
      "Probiotics and deliberate meal spacing",
    ],
  },
  {
    name: "Lymphatic & Circulatory Cleanse",
    days: "21 days",
    element: "Metal",
    color: "var(--element-metal)",
    summary: "Your lymphatic system has no pump — it moves when you move.",
    practices: [
      "Dry brushing",
      "Rebounding and daily movement",
      "Breathing work",
      "Contrast showers",
      "Infrared sauna, plus dietary support",
    ],
  },
  {
    name: "Sleep & Nervous System Regulation",
    days: "14 days",
    element: "Fire",
    color: "var(--element-fire)",
    summary: "Retrains the body's downshift signals for a range of sleep problems.",
    practices: [
      "A real wind-down ritual",
      "Breathing techniques for the downshift",
      "Morning sunlight anchoring",
      "Magnesium glycinate, L-theanine, apigenin",
      "Temperature contrast before bed",
    ],
  },
];

const FEATURES = [
  {
    title: "Habit tracking with streaks",
    body: "A full habit encyclopedia you can build from, with streak tracking so practice compounds instead of resetting every Monday.",
  },
  {
    title: "Wearable sync",
    body: "Connects to Garmin, Oura, WHOOP, and Fitbit, so sleep and recovery data lands next to what you're actually doing about it.",
  },
  {
    title: "eBook library",
    body: "A reading library with an integrated reader and audio, covering the traditions and the research behind each protocol.",
  },
  {
    title: "Message a coach",
    body: "Ask a real person the question you'd otherwise search badly at midnight. Coaching lives inside the app.",
  },
  {
    title: "Progress and stats",
    body: "Daily check-ins roll into a record you can look back on — so you can see what actually changed, not just how you felt today.",
  },
  {
    title: "Coverage, if you have it",
    body: "Sakred Health members get policy cards, document storage, plain-language policy search, and direct agent messaging in the same app.",
  },
];

const FAQS = [
  {
    q: "Do I have to buy supplements to use a protocol?",
    a: "No. Every protocol separates the practices that cost nothing — movement, breathing, sunlight, meal timing, contrast showers — from the optional supplement layer. The Lymphatic protocol in particular is built around eight practices that need no equipment at all.",
  },
  {
    q: "Which protocol should I start with?",
    a: "Most people should start with Digestive Stability or Liver & Detox Support. Digestion and drainage come before rebuilding — running the Gut Reset first is the most common mistake. If your sleep is the loudest problem, start with the 14-day Sleep protocol instead; it's the shortest and it makes everything else easier.",
  },
  {
    q: "Can I run two protocols at once?",
    a: "We don't recommend it. They're sequenced deliberately, and stacking them makes it impossible to tell what worked. Digestive Stability into Full Gut Reset is the one intended pairing, run in that order.",
  },
  {
    q: "Is the app free?",
    a: "The app is free to download on iOS and Android.",
  },
  {
    q: "What does membership add?",
    a: "The member portal opens the layer underneath the app: The Apothecary, which sources the supply each protocol requires; The Library, where guides and ebooks are paired to the protocol you're running; The Body Map, which reads the body as nine energy centres and keeps your readings in sequence; Masterminds, which are cohorts with a real schedule; and a daily note written from the season, the moon, the day you're on, and your own numbers. Coaching runs through all of it.",
  },
  {
    q: "Is this medical treatment?",
    a: "No. Sakred Body is education and coaching. We do not diagnose, treat, cure, or prescribe. If you're pregnant, taking medication, or managing a diagnosed condition, talk to your provider before starting any protocol.",
  },
];

function StoreButtons({ className }: { className?: string }) {
  return (
    <div className={`flex flex-col sm:flex-row gap-4 justify-center ${className ?? ""}`}>
      <a href={APP_STORE_URL} target="_blank" rel="noopener noreferrer">
        <Button size="lg" className="gold-metallic-btn w-full sm:w-auto px-8" data-testid="button-app-store">
          <Download className="mr-2 h-5 w-5" /> Download on iOS
        </Button>
      </a>
      <a href={PLAY_STORE_URL} target="_blank" rel="noopener noreferrer">
        <Button
          size="lg"
          variant="outline"
          className="w-full sm:w-auto px-8 border-gold-subtle text-gold"
          data-testid="button-play-store"
        >
          <Smartphone className="mr-2 h-5 w-5" /> Get it on Android
        </Button>
      </a>
    </div>
  );
}

export default function AppPage() {
  usePageMeta(
    "The Sakred App — The Protocols | Sakred Body",
    "Liver, gut, lymphatic, sleep, and digestive protocols with daily steps, habit tracking, wearable sync, and coaching. Free on iOS and Android.",
  );

  return (
    <div className="min-h-screen bg-background text-foreground font-sans">
      <SiteHeader overHero={false} />

      {/* ── Header ───────────────────────────────────────────── */}
      <section className="tone-ink bg-background pt-36 pb-24">
        <div className="container max-w-6xl mx-auto px-4 text-center">
          <motion.div initial="hidden" animate="visible" variants={staggerContainer}>
            <motion.p
              variants={fadeInUp}
              className="text-xs uppercase tracking-widest text-gold mb-4 rule-gold rule-gold-center"
            >
              The App
            </motion.p>
            <motion.h1
              variants={fadeInUp}
              className="text-4xl md:text-6xl font-display font-normal mb-6 tracking-tight"
              data-testid="text-app-headline"
            >
              Practice Needs a <span className="text-gold">Place to Live</span>
            </motion.h1>
            <motion.p variants={fadeInUp} className="text-muted-foreground leading-relaxed max-w-2xl mx-auto mb-9">
              Principles don't do anything until they become a Tuesday. The Sakred app turns the whole
              philosophy into five guided protocols, daily habits, and a record you can actually look back
              on. Free on iOS and Android.
            </motion.p>
            <motion.div variants={fadeInUp}>
              <StoreButtons />
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* ── Protocols ────────────────────────────────────────── */}
      <Section tone="ink">
        <motion.div initial="hidden" whileInView="visible" viewport={viewportOnce} variants={staggerContainer}>
          <motion.div variants={fadeInUp} className="text-center max-w-2xl mx-auto mb-14">
            <p className="text-xs uppercase tracking-widest text-gold mb-4 rule-gold rule-gold-center">
              The Protocols
            </p>
            <h2 className="text-4xl md:text-5xl font-display font-normal mb-6 tracking-tight leading-[1.08]" data-testid="text-protocols-headline">
              Clear First. <span className="text-gold">Then Rebuild.</span>
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              Each protocol runs a fixed number of days with daily steps — not a vague plan you're expected
              to interpret. They're ordered on purpose: drainage and digestion open the door before anything
              gets rebuilt behind it.
            </p>
          </motion.div>

          <div className="space-y-5 max-w-4xl mx-auto">
            {PROTOCOLS.map((p, i) => (
              <motion.div variants={fadeInUp} key={p.name}>
                <Card className="hover-elevate" data-testid={`card-protocol-${i}`}>
                  <CardContent className="p-7 md:p-8 text-center">
                    <div className="flex items-center justify-center gap-3 mb-4">
                      <span
                        className="h-3 w-3 rounded-full"
                        style={{ backgroundColor: `hsl(${p.color})` }}
                      />
                      <span className="text-xs uppercase tracking-wider text-muted-foreground">
                        {p.element} · {p.days}
                      </span>
                    </div>
                    <h3 className="font-display text-2xl md:text-3xl mb-3">{p.name}</h3>
                    <p className="text-muted-foreground leading-relaxed max-w-xl mx-auto mb-6">{p.summary}</p>
                    <ul className="max-w-xl mx-auto space-y-2.5">
                      {p.practices.map((practice) => (
                        <li key={practice} className="text-sm text-muted-foreground text-center">
                          {practice}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </Section>

      {/* ── Features ─────────────────────────────────────────── */}
      <Section tone="light">
        <motion.div initial="hidden" whileInView="visible" viewport={viewportOnce} variants={staggerContainer}>
          <motion.div variants={fadeInUp} className="text-center max-w-2xl mx-auto mb-12">
            <p className="text-xs uppercase tracking-widest text-gold mb-4 rule-gold rule-gold-center">
              What's Inside
            </p>
            <h2 className="text-3xl md:text-4xl font-display font-normal" data-testid="text-features-headline">
              Everything in <span className="text-gold">One Place</span>
            </h2>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-x-12 gap-y-14">
            {FEATURES.map((f, i) => (
              <motion.div variants={fadeInUp} key={f.title}>
                <div
                  className="h-full pt-8 border-t border-border text-center"
                  data-testid={`card-feature-${i}`}
                >
                  <h3 className="font-display text-lg mb-3 text-gold">{f.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{f.body}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </Section>

      {/* ── FAQ ──────────────────────────────────────────────── */}
      <Section tone="ink">
        <motion.div initial="hidden" whileInView="visible" viewport={viewportOnce} variants={staggerContainer}>
          <motion.h2
            variants={fadeInUp}
            className="text-3xl md:text-4xl font-display font-normal mb-10 text-center"
            data-testid="text-faq-headline"
          >
            Common Questions
          </motion.h2>
          <motion.div variants={fadeInUp} className="max-w-3xl mx-auto">
            <Accordion type="single" collapsible className="w-full">
              {FAQS.map((item, i) => (
                <AccordionItem key={i} value={`faq-${i}`} data-testid={`faq-item-${i}`}>
                  <AccordionTrigger className="text-center justify-center gap-3 font-display text-base font-normal">
                    {item.q}
                  </AccordionTrigger>
                  <AccordionContent className="text-muted-foreground leading-relaxed text-sm">
                    {item.a}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </motion.div>
        </motion.div>
      </Section>

      {/* ── CTA ──────────────────────────────────────────────── */}
      <Section tone="light" className="text-center py-12 md:py-16">
        <motion.div initial="hidden" whileInView="visible" viewport={viewportOnce} variants={staggerContainer}>
          <motion.h2 variants={fadeInUp} className="text-3xl md:text-4xl font-display font-normal mb-6">
            Pick one. <span className="text-gold">Run it to the end.</span>
          </motion.h2>
          <motion.p variants={fadeInUp} className="text-muted-foreground max-w-xl mx-auto mb-9 leading-relaxed">
            One protocol, start to finish, beats five started and abandoned. The app keeps you on it.
          </motion.p>
          <motion.div variants={fadeInUp}>
            <StoreButtons />
            <p className="text-xs text-muted-foreground mt-5">Free on iOS and Android.</p>
          </motion.div>
        </motion.div>
      </Section>

      <SiteFooter />
    </div>
  );
}
