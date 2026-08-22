import { Link } from "wouter";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { Section } from "@/components/Section";
import { PageHero, SectionHeader } from "@/components/PageHero";
import { ImageBand } from "@/components/ImageBand";
import { DiagonalStack } from "@/components/DiagonalStack";
import { Deck } from "@/components/Deck";
import { WaysToWork } from "@/components/WaysToWork";
import { Button } from "@/components/ui/button";
import { usePageMeta } from "@/hooks/use-page-meta";

const fadeInUp = {
  hidden: { opacity: 0, y: 26 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.55, ease: "easeOut" } },
};
const stagger = { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: 0.08 } } };
const viewportOnce = { once: true, amount: 0.15 } as const;

const SOCIAL_INPUTS = [
  { title: "The room", body: "Who you're around, and what they quietly expect of you. It sets a floor you will not drop below and a ceiling you will not rise past." },
  { title: "Real difficulty", body: "Whether your life contains any genuine challenge. A body with nothing asked of it stops being able to answer." },
  { title: "Stimulation", body: "Constant low-grade input is a physiological load, not a lifestyle preference. The nervous system does not know the difference." },
  { title: "Time outdoors", body: "Whether you ever spend uninterrupted days in weather, light and ground. Not a walk — days." },
  { title: "The standard", body: "What the people near you actually hold themselves to. Standards are contagious in both directions." },
  { title: "Building", body: "Whether anyone around you is making something. Proximity to work changes what feels normal to attempt." },
];

/** The retreat photography, put to work behind the argument. */
const SOCIAL_IMAGES = [
  "/images/long-dining-table.webp",
  "/images/rugged-cliffs.webp",
  "/images/wooden-pavilion.webp",
  "/images/tropical-beach.webp",
  "/images/gathering-string-lights.webp",
  "/images/stone-villa.webp",
];

/** One photograph per format, so the deck reads as six places, not six boxes. */
const FORMAT_IMAGES: Record<string, string> = {
  "Sakred Reset": "/images/tropical-beach.webp",
  "Sakred Performance": "/images/training-focus.webp",
  "Founder's Reset": "/images/stone-villa.webp",
  "Executive Reset": "/images/terrace-ocean.webp",
  "Private Team Retreat": "/images/gathering-string-lights.webp",
  "Sakred Immersion": "/images/retreat-jungle.webp",
};

const FORMATS = [
  {
    name: "Sakred Reset",
    length: "3–7 days",
    focus: "Restore",
    flagship: true,
    body: "The restoration retreat. Clean food, sleep, drainage work, breathwork, ocean, and enough silence that the nervous system finally believes it. Built for people arriving depleted.",
  },
  {
    name: "Sakred Performance",
    length: "5–7 days",
    focus: "Build",
    flagship: true,
    body: "The training retreat. Strength work, conditioning, mobility, and recovery run properly for a week — with the nutrition and sleep actually handled so the training does something.",
  },
  {
    name: "Founder's Reset",
    length: "5–7 days",
    focus: "Restore + Build",
    flagship: false,
    body: "For people carrying a company. The same restoration and training work, run around a body that has been running on caffeine and five hours for years — and a small group in the same position.",
  },
  {
    name: "Executive Reset",
    length: "4–5 days",
    focus: "Restore",
    flagship: false,
    body: "For high-performing people who are running on empty and would never book something called a detox retreat. Same restoration work, framed for someone who has to be back on Monday.",
  },
  {
    name: "Private Team Retreat",
    length: "Custom",
    focus: "Gather",
    flagship: false,
    body: "A company or team, taken out of the environment that's grinding them down and put into one that rebuilds. Custom-built around what the team actually needs.",
  },
  {
    name: "Sakred Immersion",
    length: "10–14 days",
    focus: "All four",
    flagship: false,
    body: "The full arc, in one stay. Restoration into training into practice design, inside a group holding the same standard. The most complete version of everything on this site.",
  },
];

export default function Retreats() {
  usePageMeta(
    "Retreats + Mastermind — Gather | Sakred Body",
    "Where the work is actually done. Restoration, performance and immersion retreats — protocols run properly, small groups, custom dates, concierge-run.",
  );

  return (
    <div className="tone-ink min-h-screen bg-background text-foreground font-sans">
      <SiteHeader overHero={false} />

      {/* "Territory Four" no longer exists — there are three. The philosophy
          stays underneath here rather than on the surface: a retreat is a
          deliberate change of terrain, which is the whole argument, and it
          lands without a word of vocabulary attached to it. */}
      <PageHero
        eyebrow="Gather · The Social Terrain"
        title={<>Gather.</>}
        /* Five sentences down to two. The last two explained the Yin/Yang
           split that Restore and Build each carry in full, and the formats
           section below already says which direction a given retreat runs to. */
        intro="The room you're in and the standard the people around you hold are inputs like any other — and the hardest to change from inside your own life. A retreat changes them all at once, on purpose."
        testId="text-retreats-headline"
        image="/images/estate-vineyard.webp"
        imageAlt="A stone estate set among vineyards and low green hills"
        marks={["Six formats", "Three days to two weeks", "Private or shared", "By application"]}
      />

      {/* ── Told apart from the other two ──────────────────── */}
      <Section tone="ink">
        <SectionHeader
          eyebrow="Work With Us"
          title={<>The Standard <span className="text-gold">Doesn't Move</span></>}
          className="mb-10"
        />
        <WaysToWork current="retreats" />
      </Section>

      {/* ── The argument ─────────────────────────────────────── */}
      <Section tone="raised">
        <motion.div initial="hidden" whileInView="visible" viewport={viewportOnce} variants={stagger}>
          <motion.div variants={fadeInUp}>
            <SectionHeader
              eyebrow="Why Environment"
              title={<>Your Surroundings <span className="text-gold">Are an Input</span></>}
              testId="text-environment-headline"
            />
          </motion.div>

          <motion.div variants={fadeInUp}>
            <Deck
              testId="deck-social"
              autoAdvanceMs={7000}
              cards={SOCIAL_INPUTS.map((input, i) => ({
                title: input.title,
                body: input.body,
                image: SOCIAL_IMAGES[i % SOCIAL_IMAGES.length],
                imageAlt: "",
              }))}
            />
          </motion.div>

          <motion.p
            variants={fadeInUp}
            className="text-center font-display text-xl md:text-2xl mt-12 max-w-lg mx-auto leading-[1.6]"
          >
            {/* One clause to a line. Run together they wrapped mid-sentence on
                a phone and the last line landed as an orphan. */}
            Restore the organism.
            <br />
            Build its capacity.
            <br />
            Embody a way of living.
            <br />
            <span className="text-gold">Then put it somewhere that holds all three.</span>
          </motion.p>
        </motion.div>
      </Section>

      {/* ── The places ───────────────────────────────────────── */}
      <Section tone="ink" className="overflow-hidden">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
          variants={stagger}
          className="grid lg:grid-cols-2 gap-14 lg:gap-20 items-center"
        >
          <motion.div variants={fadeInUp} className="order-2 lg:order-1">
            <DiagonalStack
              testId="stack-places"
              className="mx-auto max-w-md lg:max-w-none"
              images={[
                { src: "/images/stone-villa.webp", alt: "A stone villa above the water" },
                { src: "/images/wooden-pavilion.webp", alt: "An open wooden pavilion looking out over green" },
                { src: "/images/zen-sand-garden.webp", alt: "A raked sand garden in morning light" },
              ]}
            />
          </motion.div>

          <div className="order-1 lg:order-2 text-center">
            <motion.p
              variants={fadeInUp}
              className="text-xs uppercase tracking-widest text-gold mb-4 rule-gold rule-gold-center"
            >
              The Places
            </motion.p>
            <motion.h2 variants={fadeInUp} className="text-3xl md:text-4xl font-display font-normal mb-6">
              Chosen for What They <span className="text-gold">Remove</span>
            </motion.h2>
            <motion.p variants={fadeInUp} className="text-muted-foreground leading-relaxed">
              Stone, water, and enough distance that the phone stops being the point. Every property is held
              to the same standard as the practice: quiet enough to hear the body, comfortable enough that
              nobody spends the week negotiating with the room.
            </motion.p>
          </div>
        </motion.div>
      </Section>

      {/* ── Formats ──────────────────────────────────────────── */}
      <Section tone="ink">
        <motion.div initial="hidden" whileInView="visible" viewport={viewportOnce} variants={stagger}>
          <motion.div variants={fadeInUp}>
            <SectionHeader
              eyebrow="The Formats"
              title={<>Built On the Same <span className="text-gold">Infrastructure</span></>}
              intro="Concierge-managed. Application only."
              testId="text-formats-headline"
            />
          </motion.div>

          {/* No "what's included" lists. Four bullets under each of six cards
              is twenty-four lines of near-identical phrasing that nobody reads
              and that make every format look like every other one. What tells
              them apart is the length, the territory and the paragraph. */}
          <motion.div variants={fadeInUp}>
            <Deck
              testId="deck-formats"
              cards={FORMATS.map((f) => ({
                title: f.name,
                body: f.body,
                meta: `${f.length} · ${f.focus}`,
                accent: f.flagship ? "var(--gold)" : undefined,
                image: FORMAT_IMAGES[f.name],
                imageAlt: "",
              }))}
            />
          </motion.div>

          <motion.p variants={fadeInUp} className="text-xs text-muted-foreground text-center mt-8 max-w-2xl mx-auto">
            Reset and Performance run on a regular schedule. The remaining formats are built to request —
            tell us which one fits and we'll schedule a call.
          </motion.p>
        </motion.div>
      </Section>

      <ImageBand
        image="/images/table-by-ocean.webp"
        alt="A long candlelit table set for dinner beside the ocean"
        eyebrow="The Table"
        title={<>The conversation at dinner <span className="text-gold">is part of the programme.</span></>}
        testId="text-table-headline"
      >
        <p>
          Not a networking session with a seating chart. Long meals, real food, and the kind of talk that
          only happens when nobody is trying to get somewhere afterwards.
        </p>
      </ImageBand>

      {/* ── CTA ──────────────────────────────────────────────── */}
      <Section tone="raised" width="max-w-3xl" className="text-center">
        <motion.div initial="hidden" whileInView="visible" viewport={viewportOnce} variants={stagger}>
          <motion.h2 variants={fadeInUp} className="text-3xl md:text-4xl font-display font-normal mb-6">
            Application <span className="text-gold">required.</span>
          </motion.h2>
          <motion.p variants={fadeInUp} className="text-muted-foreground max-w-xl mx-auto mb-9 leading-relaxed">
            Small groups only, so who's in the room matters. Membership includes the mastermind, the
            protocols, and the ability to design your own retreat — private or shared, three days to two
            weeks.
          </motion.p>
          <motion.div variants={fadeInUp}>
            <Link href="/mastermind">
              <Button size="lg" className="gold-metallic-btn px-8" data-testid="button-mastermind">
                Membership &amp; Applications <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
          </motion.div>
        </motion.div>
      </Section>

      <SiteFooter />
    </div>
  );
}
