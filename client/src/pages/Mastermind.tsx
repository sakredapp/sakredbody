import { useState } from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { ArrowRight, Check } from "lucide-react";
import { ApplicationModal } from "@/components/ApplicationModal";
import { Section } from "@/components/Section";
import { ImageBand } from "@/components/ImageBand";
import { WaysToWork } from "@/components/WaysToWork";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { FlipCards } from "@/components/FlipCards";
import { responsive, SIZES_FULL_BLEED, SIZES_HALF } from "@/lib/img";
import { usePageMeta } from "@/hooks/use-page-meta";

const fadeInUp = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" } }
};

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1
    }
  }
};

export default function Mastermind() {
  usePageMeta(
    "The Mastermind — The Room and the People In It | Sakred Body",
    "The membership: cohorts on a real schedule, the portal that runs your practice between them, and retreats at member rates.",
  );
  const [isModalOpen, setIsModalOpen] = useState(false);

  const openApplication = () => setIsModalOpen(true);

  return (
    <div className="min-h-screen bg-background text-foreground font-sans">
      <SiteHeader
        cta={
          <Button
            onClick={openApplication}
            size="sm"
            className="rounded-full px-4 bg-gold border-gold-border text-white"
            data-testid="button-apply-header"
          >
            Apply Now
          </Button>
        }
      />

      {/* tone-ink, or `to-background` in the scrim below resolves against
          :root — which is the light palette. That is why this hero faded the
          ocean out to white and then met the next section on a hard black
          line. It now resolves to the page ink and hands off cleanly. */}
      <section className="tone-ink bg-background relative min-h-[72vh] flex items-center pt-20 overflow-hidden">
        <div className="absolute inset-0 z-0">
          <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/65 to-black/40 z-10" />
          <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-background z-10" />
          <img
            {...responsive("/images/hero-ocean.webp", SIZES_FULL_BLEED)}
            alt="A coastline at first light"
            fetchPriority="high"
            decoding="async"
            className="w-full h-full object-cover"
          />
        </div>

        <div className="container max-w-6xl mx-auto px-4 relative z-20">
          <motion.div 
            initial="hidden"
            animate="visible"
            variants={staggerContainer}
            className="max-w-3xl"
          >
            <motion.div variants={fadeInUp}>
              <Badge variant="outline" className="mb-6 border-gold-subtle text-gold-light tracking-widest uppercase bg-gold-subtle px-4 py-1 font-normal" data-testid="badge-tagline">
                The Membership
              </Badge>
            </motion.div>
            
            <motion.h1 variants={fadeInUp} className="text-5xl md:text-7xl font-display font-normal leading-[1.1] mb-6 tracking-tight text-white">
              A Room Worth<br />
              <span className="gold-gradient-text">Being In.</span>
            </motion.h1>
            
            <motion.p variants={fadeInUp} className="text-base md:text-lg text-white/60 mb-8 max-w-2xl leading-relaxed font-sans font-normal">
              {/* Four sentences down to two. The third restated the Yin/Yang
                  split every other page already carries, and the fourth
                  explained where protocols and retreats live — both of which
                  this page goes on to say properly further down. */}
              Discussion and teaching, not treatment. Cohorts on a real schedule, people who hold the same
              standard, and the portal that runs your practice between sessions.
            </motion.p>
            
            <motion.div variants={fadeInUp} className="flex flex-col sm:flex-row gap-4">
              <Button onClick={openApplication} size="lg" className="text-base px-8 gold-metallic-btn" data-testid="button-apply-hero">
                Apply for Sakred Body <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
              <Button variant="outline" size="lg" className="text-base px-8 border-white/20 text-white backdrop-blur-sm bg-white/5" onClick={() => document.getElementById('what-we-do')?.scrollIntoView({ behavior: 'smooth'})} data-testid="button-view-program">
                See How It Works
              </Button>
            </motion.div>
          </motion.div>
        </div>
      </section>

      <Section id="what-we-do" tone="raised">
        <div className="grid md:grid-cols-2 gap-12 md:gap-24 items-center">
          <div>
            <p className="text-xs font-sans font-normal uppercase tracking-widest text-gold mb-4">What This Actually Is</p>
            <h2 className="text-3xl md:text-4xl font-display font-normal mb-6" data-testid="text-what-headline">
              Personal Development.<br/>
              <span className="text-gold">The Real Kind.</span>
            </h2>
            <div className="space-y-4 text-muted-foreground leading-relaxed">
              <p>Most masterminds sell you "personal growth" and then hand you business tactics. Sakred Body is different — we focus on you as a person. Your health, your energy, your nervous system.</p>
              <p className="text-foreground">Better people build better businesses. We start with the person.</p>
            </div>
          </div>
          <div className="relative">
            <div className="absolute -inset-4 bg-gold/10 blur-3xl rounded-full opacity-30"></div>
            <img
              {...responsive("/images/group-wellness.webp", SIZES_HALF)}
              alt="An open pavilion looking out to the sea"
              width={1500}
              height={1050}
              loading="lazy"
              decoding="async"
              className="relative rounded-md shadow-gold-subtle border border-gold-subtle"
            />
          </div>
        </div>
      </Section>

      {/* ── Told apart from the other two ──────────────────── */}
      <Section tone="ink">
        <p className="text-xs uppercase tracking-widest text-gold mb-4 rule-gold rule-gold-center text-center">
          Work With Us
        </p>
        <h2 className="text-3xl md:text-4xl font-display font-normal mb-10 text-center">
          Three Shapes, <span className="text-gold">One Standard</span>
        </h2>
        <WaysToWork current="mastermind" />
      </Section>

      <Section tone="ink">
        <div className="grid md:grid-cols-2 gap-12 items-center">
          <div className="order-2 md:order-1">
            <img
              {...responsive("/images/tropical-villa.webp", SIZES_HALF)}
              alt="A villa set back in tropical planting"
              width={1500}
              height={1050}
              loading="lazy"
              decoding="async"
              className="rounded-md shadow-gold-subtle border border-gold-subtle"
            />
          </div>
          <div className="order-1 md:order-2">
            <p className="text-xs font-sans font-normal uppercase tracking-widest text-gold mb-4">The Concierge Experience</p>
            <h2 className="text-3xl md:text-4xl font-display font-normal mb-6" data-testid="text-concierge-headline">
              Your Retreat, <span className="text-gold">Your Way</span>
            </h2>
            <div className="space-y-4 text-muted-foreground leading-relaxed">
              <p>Choose a private 1-on-1 retreat or a shared group experience. Pick your dates, duration, and housing tier — then our concierge team schedules a call to finalize everything before anything is booked.</p>
              <p>Accommodations, wellness activities, dining, local experiences — all coordinated so you can show up and focus on growth.</p>
            </div>
          </div>
        </div>
      </Section>

      {/* ── Retreats live on their own page now ─────────────── */}
      <Section tone="ink">
        <div className="max-w-2xl mx-auto text-center">
          <p className="text-xs uppercase tracking-widest text-gold mb-4 rule-gold rule-gold-center">
            Where It Goes In Person
          </p>
          <h2 className="text-3xl md:text-4xl font-display font-normal mb-5">
            Members Travel at <span className="text-gold">Member Rates</span>
          </h2>
          <p className="text-muted-foreground leading-relaxed mb-8">
            The mastermind is where the thinking happens. A retreat is where the work does — protocols run,
            training programmed, sleep repaired, for days at a time. Membership gets you the rate and the
            first look at dates.
          </p>
          <Link href="/retreats">
            <Button variant="outline" className="border-gold-subtle text-gold gold-outline-lift px-8" data-testid="button-see-retreats">
              See the Retreats <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Link>
        </div>
      </Section>

      <Section tone="raised">
        <div className="text-center mb-10">
          <p className="text-xs font-sans font-normal uppercase tracking-widest text-gold mb-4">Investment</p>
          <h2 className="text-3xl md:text-4xl font-display font-normal mb-4" data-testid="text-pricing-headline">Two Ways to Join</h2>
          <p className="text-muted-foreground">Application required. Limited spots per cohort.</p>
        </div>

        <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
          <Card className="hover-elevate">
            <CardContent className="p-8 flex flex-col h-full">
              <div className="mb-8">
                <h3 className="text-sm text-muted-foreground mb-2 font-sans font-normal tracking-wide uppercase">Quarterly Membership</h3>
                <div className="text-3xl font-display font-normal">$2,000<span className="text-base text-muted-foreground font-sans font-normal">/quarter</span></div>
              </div>
              <ul className="space-y-3 mb-8 flex-1">
                {["Mastermind community + live calls", "Health protocols and daily systems", "Private member portal access", "Design your own retreat (dates + duration)", "Essential housing included, upgrades available"].map((item, i) => (
                  <li key={i} className="flex gap-2 text-sm text-muted-foreground"><Check className="h-4 w-4 text-gold flex-shrink-0 mt-0.5" /> {item}</li>
                ))}
              </ul>
              <Button variant="outline" className="w-full border-gold-subtle text-gold" onClick={openApplication} data-testid="button-apply-quarterly">Apply for Quarterly</Button>
            </CardContent>
          </Card>

          <Card className="border-gold-subtle shadow-gold-subtle relative hover-elevate">
            <div className="absolute top-0 right-0 bg-gold text-background text-xs font-sans font-medium tracking-wide px-3 py-1 rounded-bl-md">BEST VALUE</div>
            <CardContent className="p-8 flex flex-col h-full">
              <div className="mb-8">
                <h3 className="text-sm text-gold mb-2 font-sans font-normal tracking-wide uppercase">All-In Annual</h3>
                <div className="text-3xl font-display font-normal">$5,000<span className="text-base text-muted-foreground font-sans font-normal">/year</span></div>
                <p className="text-xs text-gold mt-2 font-sans font-normal">Retreat included + priority booking</p>
              </div>
              <ul className="space-y-3 mb-8 flex-1">
                {["Everything in Quarterly", "One retreat included", "Essential housing included", "Priority upgrade to Premium + Elite", "Direct concierge access + priority scheduling"].map((item, i) => (
                  <li key={i} className="flex gap-2 text-sm text-muted-foreground"><Check className="h-4 w-4 text-gold flex-shrink-0 mt-0.5" /> {item}</li>
                ))}
              </ul>
              <Button className="w-full gold-metallic-btn" onClick={openApplication} data-testid="button-apply-annual">Apply for Annual</Button>
            </CardContent>
          </Card>
        </div>
      </Section>

      <Section tone="ink">
        <div className="text-center mb-10">
          <p className="text-xs font-sans font-normal uppercase tracking-widest text-gold mb-4">Who This Is For</p>
          <h2 className="text-3xl md:text-4xl font-display font-normal mb-4" data-testid="text-who-headline">Built for People Who Build Things</h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">Entrepreneurs, founders, and high-performing professionals who are ready to invest in themselves — not just their business.</p>
        </div>
        {/* Not an accordion. Three of these in a row turned the page into a
            filing cabinet, and only the last one — the FAQ — is genuinely a
            list of questions somebody asks one at a time. */}
        <FlipCards
          testId="flip-who"
          columns={3}
          cards={[
            { title: "You're successful but running on fumes", body: "You've built something real, but your sleep is off, your energy dips, and you know your body is paying for your output." },
            { title: "You want growth that actually sticks", body: "You've done conferences and courses. You want something deeper — real changes in how you feel, think, and show up daily." },
            { title: "You're tired of surface-level wellness", body: "You're not looking for crystals and mantras. You want practical, grounded work on your health, mindset, and nervous system." },
            { title: "You want community without the fluff", body: "You want to be around other serious people working on themselves. Real conversations, not networking pitches." },
            { title: "You value experiences over information", body: "You don't need more content. You need an environment that pulls the best version of you forward." },
          ]}
        />
      </Section>

      {/* Two five-card grids ran straight into each other here — who it's for,
          then what you get — which is the same shape twice and reads as one
          long cabinet however different the copy is. The band separates them,
          and says the thing this page is actually selling. */}
      <ImageBand
        image="/images/long-dining-table.webp"
        alt="A long table laid for a shared dinner"
        title={<>Nobody holds a standard <span className="text-gold">alone.</span></>}
        tall
        testId="text-mastermind-turn"
      />

      <Section tone="raised">
        <div className="text-center mb-10">
          <p className="text-xs font-sans font-normal uppercase tracking-widest text-gold mb-4">What You Get</p>
          <h2 className="text-3xl md:text-4xl font-display font-normal mb-4" data-testid="text-deliverables-headline">Your Membership Includes</h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">Everything is designed to support you between retreats — so the growth doesn't stop when you go home.</p>
        </div>
        <FlipCards
          testId="flip-includes"
          columns={3}
          cards={[
            { title: "Customizable retreats", body: "Design your own — private or shared, three days to two weeks. Pick your dates and housing tier; the concierge handles the rest." },
            { title: "Concierge booking", body: "Choose private or shared, pick dates and housing in the portal, submit the request. Our team schedules a call to finalise it." },
            { title: "Health protocols", body: "Daily routines for hydration, digestion, sleep and stress. Built for busy, mobile lives." },
            { title: "Community and coaching", body: "Live calls, a private member community, accountability without pressure, and optional one-to-one sessions." },
            { title: "The method", body: "Three phases. Stabilise the foundation — hydration, sleep, gut. Clear what's dragging you down. Then build real capacity: nutrition, movement, breath, clarity." },
          ]}
        />
      </Section>

      <Section tone="ink" className="py-16">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-3xl font-display font-normal mb-8 text-center" data-testid="text-faq-headline">Common Questions</h2>
          <Accordion type="single" collapsible className="w-full">
            {[
              { q: "Is this a medical program?", a: "No. Sakred Body is education, coaching, and hands-on experience. We don't diagnose or prescribe anything. We teach you how to take better care of yourself through practical systems." },
              { q: "Is this a business mastermind?", a: "No. This is personal development. We focus on you as a person — your health, energy, stress, and internal patterns. The business benefits come as a result of you being a better, more grounded human." },
              { q: "Is this going to be really esoteric and woo-woo?", a: "No. We're practical and grounded. Breathwork, movement, nutrition, sleep — real things that actually work. No crystals, no chanting, no pseudoscience." },
              { q: "What happens at the retreats?", a: "You design your retreat — private or shared, 3 days to 2 weeks. Morning movement and breathwork on the beach, mastermind sessions, clean food, ocean time, nature, and recovery. It's structured but flexible to you." },
              { q: "What if I travel a lot for work?", a: "The protocols are designed for busy, mobile lives. We teach systems that work on the road — hydration, sleep anchors, food strategies, nervous system tools you can use anywhere." },
              { q: "How does the concierge booking work?", a: "Log into your member portal, choose private or shared, pick your dates and duration, select a housing tier, and submit your request. Our concierge team schedules a call to finalize everything." },
              { q: "How much time does this take each week?", a: "The daily protocols take 30-60 minutes. Live calls are optional. Retreats are customizable — from 3 days to 2 weeks. Designed to fit into your life." }
            ].map((item, i) => (
              <AccordionItem key={i} value={`item-${i}`} data-testid={`faq-item-${i}`}>
                <AccordionTrigger className="text-center justify-center gap-3 font-display text-base font-normal">{item.q}</AccordionTrigger>
                <AccordionContent className="text-muted-foreground leading-relaxed text-sm">
                  {item.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </Section>

      <Section tone="raised" width="max-w-3xl" className="text-center">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-display font-normal mb-6" data-testid="text-final-cta-headline">You've invested in your business.<br/><span className="text-gold">Now invest in yourself.</span></h2>
          <p className="text-muted-foreground text-lg mb-10 leading-relaxed">
            Sakred Body is for people who are done running on empty and ready to build a real foundation — physically, mentally, and personally.
          </p>
          <Button onClick={openApplication} size="lg" className="text-base px-10 gold-metallic-btn" data-testid="button-apply-final">
            Apply to Join Sakred Body <ArrowRight className="ml-2 h-5 w-5" />
          </Button>
          <p className="text-xs text-muted-foreground mt-4">Limited spots. Application required.</p>
        </div>
      </Section>

      <SiteFooter />

      <ApplicationModal
        open={isModalOpen} 
        onOpenChange={setIsModalOpen} 
      />
    </div>
  );
}
