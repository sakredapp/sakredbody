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

import { useRef, useState } from "react";
import { Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { Section } from "@/components/Section";
import { SectionBridge } from "@/components/SectionBridge";
import { PageHero, SectionHeader } from "@/components/PageHero";
import { ConstellationBody, NEIGHBOURS } from "@/components/ConstellationBody";
import { ImageBand } from "@/components/ImageBand";
import { TerrainWheel } from "@/components/TerrainWheel";
import { FlipCards } from "@/components/FlipCards";
import { Deck } from "@/components/Deck";
import { BreathPacer } from "@/components/BreathPacer";
import { StarDust } from "@/components/StarDust";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { MAP_REGIONS } from "@/data/bodyMap";
import { EMBODIED_PRACTICE } from "@/data/territories";
import { usePageMeta } from "@/hooks/use-page-meta";
import { usePrefersReducedMotion } from "@/hooks/use-reduced-motion";

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

/**
 * One labelled block inside the region panel.
 *
 * A quiet heading and a hairline, not a card. The panel holds five different
 * kinds of statement — anatomy, tradition, measurement, relationship,
 * practice — and without labels they read as one long paragraph in which the
 * lens and the measurement blur into each other, which is the exact merge
 * data/bodyMap.ts exists to prevent.
 */
function Facet({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mt-5 pt-4 border-t border-gold/12 first:mt-0 first:pt-0 first:border-0">
      <p className="text-[0.6rem] uppercase tracking-[0.2em] text-gold/70 mb-2">{label}</p>
      {children}
    </div>
  );
}

/** A middot-separated run of names. Reads as a set, not as a ranking. */
function Names({ items }: { items: string[] }) {
  return (
    <p className="text-sm text-foreground/85 leading-relaxed">
      {items.map((it, i) => (
        <span key={it}>
          {i > 0 && <span className="text-gold/40 mx-1.5">·</span>}
          {it}
        </span>
      ))}
    </p>
  );
}

/**
 * What this region answers in, named from the same map the canvas lights.
 *
 * NEIGHBOURS is keyed by the figure's geometry; the visitor reads the
 * conceptual names. Resolving through MAP_REGIONS means the panel can never
 * claim a relationship the figure does not draw.
 */
function connectedTo(key: string): string[] {
  return (NEIGHBOURS[key] ?? [])
    .map((n) => MAP_REGIONS.find((r) => r.key === n.key)?.name)
    .filter((n): n is string => !!n);
}

export default function TheBodyMap() {
  usePageMeta(
    "The Body Map — Many Traditions, One Living Terrain | Sakred Body",
    "The body as one connected chain, the traditions that studied each part of it, and how to tell where you currently are in it.",
  );

  /**
   * The one piece of state, driven by five things.
   *
   * The figure, the selector, the keyboard and the autocycle all resolve here;
   * ConstellationBody renders it and requests changes to it rather than owning
   * it. See the note above the component.
   */
  const [activeKey, setActiveKey] = useState(MAP_REGIONS[0].key);
  const region = MAP_REGIONS.find((r) => r.key === activeKey) ?? MAP_REGIONS[0];

  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  /** While the keyboard is in the selector, the figure stops cycling. */
  const [tabFocus, setTabFocus] = useState(false);
  const reduced = usePrefersReducedMotion();

  /** Standard tablist keyboard behaviour: move focus and select together. */
  const onTabKey = (e: React.KeyboardEvent, i: number) => {
    const last = MAP_REGIONS.length - 1;
    const to =
      e.key === "ArrowRight" || e.key === "ArrowDown"
        ? i === last
          ? 0
          : i + 1
        : e.key === "ArrowLeft" || e.key === "ArrowUp"
          ? i === 0
            ? last
            : i - 1
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? last
              : -1;
    if (to < 0) return;
    e.preventDefault();
    setActiveKey(MAP_REGIONS[to].key);
    tabRefs.current[to]?.focus();
  };

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
              /* The figure does not cycle under reduced motion, so the line
                 promising it does is only true for some visitors. The
                 normal-motion version keeps its full sentence. */
              intro={
                reduced
                  ? "No single tradition owns the human body. Explore the seven territories below the figure."
                  : "No single tradition owns the human body. Touch a region on the figure, choose one below it, or let it move on its own."
              }
              testId="text-figure-headline"
            />
          </motion.div>

          {/* One composition, not a figure with a text block under it. On a
              wide screen the body and what it is saying sit side by side and
              the seven selectors run beneath both, so the row reads as
              navigation for the whole thing. On a phone it stacks — and the
              selectors stay *between* the figure and the panel, because
              putting them last would mean scrolling past the answer to reach
              the question. */}
          <div className="grid lg:grid-cols-2 gap-y-8 gap-x-10 lg:gap-x-16 items-center">
            <motion.div variants={fadeInUp} className="order-1 lg:col-start-1 lg:row-start-1">
              <ConstellationBody value={activeKey} onActive={setActiveKey} paused={tabFocus} />
            </motion.div>

              {/* ── The seven, named ─────────────────────────
                  Not only an accessibility fallback, though it is that: the
                  canvas is aria-hidden, and without real controls the keyboard
                  and a reduced-motion visitor had no way to reach any of this.

                  It earns its place for everyone. The figure alone requires you
                  to discover seven anatomical hit areas by exploration before
                  you learn the map contains seven specific systems. The row
                  hands over the vocabulary at a glance — Mind · Breath · Axis ·
                  Organs · Middle · Flow · Structure — and then the body gives
                  those words anatomy and movement.

                  Wrapping rather than scrolling sideways: the entire purpose is
                  that all seven are visible, so hiding some off the edge of a
                  phone would defeat it. Two quiet rows is the right answer. */}
            <motion.div
              variants={fadeInUp}
              role="tablist"
              aria-label="Body territories"
              aria-orientation="horizontal"
              className="order-2 lg:col-span-2 lg:row-start-2 flex flex-wrap justify-center gap-2"
                onFocus={() => setTabFocus(true)}
                onBlur={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) setTabFocus(false);
                }}
              >
                {MAP_REGIONS.map((r, i) => {
                  const selected = r.key === activeKey;
                  return (
                    <button
                      key={r.key}
                      ref={(el) => { tabRefs.current[i] = el; }}
                      role="tab"
                      id={`region-tab-${r.key}`}
                      aria-selected={selected}
                      aria-controls="region-panel"
                      // Roving tabindex: the group is one tab stop, and the
                      // arrows move within it.
                      tabIndex={selected ? 0 : -1}
                      onClick={() => setActiveKey(r.key)}
                      onKeyDown={(e) => onTabKey(e, i)}
                      className={cn(
                        "rounded-full border px-3.5 py-1.5 text-[0.7rem] uppercase tracking-[0.14em] transition-colors",
                        "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gold/70",
                        selected
                          ? "border-gold/45 bg-gold/10 text-gold"
                          : "border-white/12 text-white/55 hover:text-white/85 hover:border-white/25",
                      )}
                      data-testid={`region-tab-${r.key}`}
                    >
                      {r.short}
                    </button>
                  );
                })}
            </motion.div>

            {/* min-h so the column doesn't resize as regions of different
                length swap through it, which on a desktop makes the figure
                beside it jump. */}
            {/* The panel is the tabpanel, and it is the whole semantic path to
                this content — the canvas beside it is aria-hidden and always
                will be. A screen reader does not need 29 stars, 37 fascia edges
                and 42 motes; it needs to know there are seven territories,
                which one is selected, and what that one means. */}
            <motion.div
              variants={fadeInUp}
              className="order-3 lg:order-none lg:col-start-2 lg:row-start-1 min-h-[22rem] flex flex-col justify-center"
              role="tabpanel"
              id="region-panel"
              aria-labelledby={`region-tab-${region.key}`}
            >
              <AnimatePresence mode="wait">
                <motion.div
                  key={region.key}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.35, ease: "easeOut" }}
                  data-testid={`region-${region.key}`}
                >
                  <h3 className="font-display text-4xl md:text-5xl mb-3 tracking-tight">{region.name}</h3>
                  <p className="text-foreground leading-relaxed mb-7">{region.governs}</p>

                  {/* The traditions are met through the part of the body being
                      explored, rather than in a directory somewhere else on the
                      page. Selecting Breath is how you find out that pranayama
                      and respiratory physiology were looking at one thing. */}
                  <Facet label="The body">
                    <p className="text-sm text-muted-foreground">{region.covers}</p>
                  </Facet>

                  {/* The two lenses stay two lenses, each with its own heading
                      and its own sentence. See data/bodyMap.ts for why the
                      merge is the thing being prevented. */}
                  <Facet label="Traditional lenses">
                    <Names items={region.traditional} />
                    <p className="text-sm text-muted-foreground leading-relaxed mt-2">{region.lens}</p>
                  </Facet>

                  <Facet label="Modern lens">
                    <Names items={region.modern} />
                    <p className="text-sm text-muted-foreground leading-relaxed mt-2">{region.measured}</p>
                  </Facet>

                  <Facet label="Connected to">
                    <Names items={connectedTo(region.key)} />
                  </Facet>

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

      <SectionBridge />

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
      <Section tone="ink" containerClassName="max-w-4xl">
        <motion.div initial="hidden" whileInView="visible" viewport={viewportOnce} variants={stagger}>
          <motion.div variants={fadeInUp}>
            <SectionHeader
              eyebrow="The Practice"
              title={<>Reading it is half. <span className="text-gold">Living it is the rest.</span></>}
              intro={EMBODIED_PRACTICE.promise}
              onInk
            />
          </motion.div>

          {/* The argument stays centred with the heading above it. It used to
              be the left half of a two-column grid, so the section opened
              centred and then the one paragraph that carried the point swung
              hard left under it — which reads as a layout accident rather than
              a decision. The list below is where the composition becomes
              structured, on purpose. */}
          <motion.p
            variants={fadeInUp}
            className="text-muted-foreground leading-relaxed text-center max-w-2xl mx-auto"
          >
            {EMBODIED_PRACTICE.body}
          </motion.p>

          <motion.div variants={fadeInUp} className="mt-14 pt-10 border-t border-gold/12">
            <div className="grid md:grid-cols-[1fr_auto] gap-10 md:gap-14 items-center">
              <div>
                <p className="text-[0.6rem] uppercase tracking-[0.2em] text-gold/70 mb-5">In practice</p>
                {/* Left aligned deliberately — eight short labels are read by
                    scanning down a column, not by reading a centred block. */}
                <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2.5">
                  {EMBODIED_PRACTICE.domains.map((d) => (
                    <li key={d} className="text-sm text-muted-foreground flex gap-2.5">
                      <span className="text-gold shrink-0" aria-hidden="true">·</span>
                      {d}
                    </li>
                  ))}
                </ul>
              </div>

              {/* The pacer is not filling space. It is the shortest possible
                  demonstration of the sentence beside it: a practice is
                  something you enter and keep time with, not something you
                  read about. The caption says so, so it cannot be mistaken
                  for a glowing circle. */}
              <div className="md:w-[15rem] shrink-0">
                <BreathPacer className="w-full" />
                <p className="text-[0.6rem] uppercase tracking-[0.2em] text-gold/60 text-center mt-4">
                  Practice becomes rhythm
                </p>
                <p className="text-xs text-muted-foreground text-center mt-2 leading-relaxed">
                  Four in, six out. Follow it for a minute and the section stops being something you're
                  reading.
                </p>
              </div>
            </div>
          </motion.div>
        </motion.div>
      </Section>

      <SectionBridge />

      {/* ── CTA ──────────────────────────────────────────────── */}
      <Section tone="raised" containerClassName="max-w-3xl" className="text-center">
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
