import { Link } from "wouter";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { Section } from "@/components/Section";
import { PageHero, SectionHeader } from "@/components/PageHero";
import { ImageBand } from "@/components/ImageBand";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { usePageMeta } from "@/hooks/use-page-meta";

const fadeInUp = {
  hidden: { opacity: 0, y: 26 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.55, ease: "easeOut" } },
};
const stagger = { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: 0.08 } } };
const viewportOnce = { once: true, amount: 0.15 } as const;

const SOCIAL_INPUTS = [
  "Who you're around, and what they expect of you",
  "Whether your life contains any real challenge",
  "Whether you're constantly digitally stimulated",
  "Whether you ever spend uninterrupted days in nature",
  "What standards the people near you actually hold",
  "Whether anyone around you is building something",
];

const FORMATS = [
  {
    name: "Sakred Reset",
    length: "3–7 days",
    focus: "Restore",
    flagship: true,
    body: "The restoration retreat. Clean food, sleep, drainage work, breathwork, ocean, and enough silence that the nervous system finally believes it. Built for people arriving depleted.",
    includes: ["Daily movement and breathwork", "Protocol-aligned meals", "Sleep and circadian reset", "Ocean, nature, and unstructured time"],
  },
  {
    name: "Sakred Performance",
    length: "5–7 days",
    focus: "Build",
    flagship: true,
    body: "The training retreat. Strength work, conditioning, mobility, and recovery run properly for a week — with the nutrition and sleep actually handled so the training does something.",
    includes: ["Structured strength + conditioning", "Recovery protocols and contrast work", "Performance nutrition", "Movement assessment"],
  },
  {
    name: "Founder Mastermind",
    length: "5–7 days",
    focus: "Embody + Gather",
    flagship: false,
    body: "Business and body in the same week. Strategic work in the mornings, physical discipline around it, and a small group of people who are actually building things.",
    includes: ["Small-group mastermind sessions", "Daily physical practice", "Strategic working blocks", "Peer accountability"],
  },
  {
    name: "Executive Reset",
    length: "4–5 days",
    focus: "Restore",
    flagship: false,
    body: "For high-performing people who are running on empty and would never book something called a detox retreat. Same restoration work, framed for someone who has to be back on Monday.",
    includes: ["Private or small group", "Discreet, concierge-run", "Sleep and stress-capacity focus", "Flexible around a working schedule"],
  },
  {
    name: "Private Team Retreat",
    length: "Custom",
    focus: "Gather",
    flagship: false,
    body: "A company or team, taken out of the environment that's grinding them down and put into one that rebuilds. Custom-built around what the team actually needs.",
    includes: ["Fully custom itinerary", "Whole-team accommodation", "Facilitated sessions", "Shared physical practice"],
  },
  {
    name: "Sakred Immersion",
    length: "10–14 days",
    focus: "All four",
    flagship: false,
    body: "The full arc, in one stay. Restoration into training into practice design, inside a group holding the same standard. The most complete version of everything on this site.",
    includes: ["Full protocol run, start to finish", "Strength and conditioning block", "Practice and environment design", "Mastermind and community"],
  },
];

export default function Retreats() {
  usePageMeta(
    "Retreats + Mastermind — Gather | Sakred Body",
    "The terrain isn't only biological. Restoration, performance, and mastermind retreats in Puerto Rico — small groups, custom dates, concierge-run.",
  );

  return (
    <div className="min-h-screen bg-background text-foreground font-sans">
      <SiteHeader overHero={false} />

      <PageHero
        eyebrow="Territory Four · The Social Terrain"
        title={<>Gather. <span className="text-gold">Environment Holds It.</span></>}
        intro="The terrain isn't only biological. You are shaped by who you're around, what standards they hold, whether your life contains real challenge, and whether you ever get more than a day away from stimulation."
        note="Retreats aren't an unrelated product sitting beside the health work. They're the same philosophy, applied to the environment instead of the organism."
        testId="text-retreats-headline"
        image="/images/estate-vineyard.jpg"
        imageAlt="A stone estate set among vineyards and low green hills"
      />

      {/* ── The argument ─────────────────────────────────────── */}
      <Section tone="light">
        <motion.div initial="hidden" whileInView="visible" viewport={viewportOnce} variants={stagger}>
          <motion.div variants={fadeInUp}>
            <SectionHeader
              eyebrow="Why Environment"
              title={<>You Cannot Out-Discipline <span className="text-gold">Your Surroundings</span></>}
              intro="These are inputs in exactly the way food and sleep are inputs. People try to fix a physiology problem with willpower while sitting inside an environment engineered against them."
              testId="text-environment-headline"
            />
          </motion.div>

          <div className="max-w-2xl mx-auto">
            {SOCIAL_INPUTS.map((s, i) => (
              <motion.div
                variants={fadeInUp}
                key={s}
                className="flex flex-col items-center gap-1.5 py-5 border-b border-border/50 last:border-0 text-center"
                data-testid={`row-social-${i}`}
              >
                <span className="font-mono text-[10px] text-muted-foreground shrink-0">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="text-muted-foreground">{s}</span>
              </motion.div>
            ))}
          </div>

          <motion.p
            variants={fadeInUp}
            className="text-center font-display text-xl md:text-2xl mt-12 max-w-2xl mx-auto leading-relaxed"
          >
            Restore the organism. Build its capacity. Embody a way of living.
            <br />
            <span className="text-gold">Then put it somewhere that reinforces all three.</span>
          </motion.p>
        </motion.div>
      </Section>

      {/* ── Formats ──────────────────────────────────────────── */}
      <Section tone="ink">
        <motion.div initial="hidden" whileInView="visible" viewport={viewportOnce} variants={stagger}>
          <motion.div variants={fadeInUp}>
            <SectionHeader
              eyebrow="The Formats"
              title={<>Six Ways In, <span className="text-gold">One Infrastructure</span></>}
              intro="All of these run in Puerto Rico, concierge-managed, with essential housing included and Premium or Elite upgrades available. Every format is application-only."
              testId="text-formats-headline"
            />
          </motion.div>

          <div className="grid md:grid-cols-2 gap-x-12 gap-y-14">
            {FORMATS.map((f, i) => (
              <motion.div variants={fadeInUp} key={f.name}>
                <div
                  className={`h-full rounded-lg p-7 text-center flex flex-col border ${
                    f.flagship ? "bg-card border-gold/30 shadow-gold-subtle" : "bg-card border-border"
                  }`}
                  data-testid={`card-format-${i}`}
                >
                  {f.flagship && (
                    <Badge
                      variant="outline"
                      className="mx-auto mb-4 border-gold-subtle text-gold text-[10px] uppercase tracking-wider font-normal"
                    >
                      Flagship
                    </Badge>
                  )}
                  <h3 className="font-display text-2xl mb-2">{f.name}</h3>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-5">
                    {f.length} · {f.focus}
                  </p>
                  <p className="text-sm text-muted-foreground leading-relaxed flex-1">{f.body}</p>
                  <ul className="mt-6 pt-5 border-t border-border space-y-2">
                    {f.includes.map((inc) => (
                      <li key={inc} className="text-xs text-foreground/80">
                        {inc}
                      </li>
                    ))}
                  </ul>
                </div>
              </motion.div>
            ))}
          </div>

          <motion.p variants={fadeInUp} className="text-xs text-muted-foreground text-center mt-8 max-w-2xl mx-auto">
            Reset and Performance run on a regular schedule. The remaining formats are built to request —
            tell us which one fits and we'll schedule a call.
          </motion.p>
        </motion.div>
      </Section>

      <ImageBand
        image="/images/table-by-ocean.jpg"
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
      <Section tone="light" className="text-center py-20">
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
