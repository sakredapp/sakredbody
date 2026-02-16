import { useState, useEffect } from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { ArrowRight, Check } from "lucide-react";
import { ApplicationModal } from "@/components/ApplicationModal";
import { Section } from "@/components/Section";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import sakredLogo from "@assets/full_png_image_sakred__1771268151990.png";

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

export default function Landing() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  const openApplication = () => setIsModalOpen(true);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 100);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground font-sans">
      
      <header
        className={`fixed top-0 left-0 right-0 transition-all duration-300 ${
          scrolled
            ? "bg-background/95 backdrop-blur-md border-b border-border/50"
            : "bg-gradient-to-b from-black/50 to-transparent"
        }`}
        style={{ zIndex: 9999 }}
      >
        <div className="container max-w-6xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center">
            <img src={sakredLogo} alt="Sakred Body" className="h-10 w-10 object-contain" />
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <Link href="/member" data-testid="link-member-portal">
              <Button variant="outline" size="sm" className={`transition-colors duration-300 ${scrolled ? "" : "border-white/25 text-white bg-white/5"}`}>Member Portal</Button>
            </Link>
            <Button onClick={openApplication} size="sm" className="bg-gold border-gold-border text-white" data-testid="button-apply-header">
              Apply Now
            </Button>
          </div>
        </div>
      </header>

      <section className="relative min-h-[90vh] flex items-center pt-20 overflow-hidden">
        <div className="absolute inset-0 z-0">
          <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/50 to-background z-10" />
          <img 
            src="/images/hero-ocean.png"
            alt="Puerto Rico coastline"
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
                Concierge Retreats + Mastermind
              </Badge>
            </motion.div>
            
            <motion.h1 variants={fadeInUp} className="text-5xl md:text-7xl font-display font-normal leading-[1.1] mb-6 tracking-tight text-white">
              Grow as a Person.<br />
              <span className="gold-gradient-text">Become a Better Leader.</span>
            </motion.h1>
            
            <motion.p variants={fadeInUp} className="text-base md:text-lg text-white/60 mb-8 max-w-2xl leading-relaxed font-sans font-normal">
              A concierge-style mastermind and retreat experience in Puerto Rico for entrepreneurs who want real personal growth — not another business workshop dressed up as self-improvement.
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

      <Section dark className="border-y border-border/40 py-10">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 max-w-xl sm:max-w-none mx-auto">
          {["Puerto Rico", "Small Groups", "Concierge Service", "Quarterly Retreats"].map((label, i) => (
            <div
              key={i}
              className="px-5 py-2 rounded-full border border-gold/30 bg-gold/5 text-xs font-sans font-normal uppercase tracking-wider text-muted-foreground text-center"
              style={{ boxShadow: '0 0 14px hsl(39 48% 56% / 0.15)' }}
              data-testid={`trust-marker-${i}`}
            >
              {label}
            </div>
          ))}
        </div>
      </Section>

      <Section id="what-we-do">
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
              src="/images/group-wellness.png" 
              alt="Beachside wellness space"
              className="relative rounded-md shadow-gold-subtle border border-gold-subtle"
            />
          </div>
        </div>
      </Section>

      <Section dark>
        <div className="grid md:grid-cols-2 gap-12 items-center">
          <div className="order-2 md:order-1">
            <img 
              src="/images/tropical-villa.png" 
              alt="Caribbean beachside property"
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

      <Section id="housing">
        <p className="text-xs font-sans font-normal uppercase tracking-widest text-gold mb-4">Housing Options</p>
        <h2 className="text-3xl md:text-4xl font-display font-normal mb-4" data-testid="text-housing-headline">Pick Your Space. We Handle the Rest.</h2>
        <p className="text-muted-foreground mb-10 max-w-2xl leading-relaxed">Essential housing is included with every retreat. Upgrade to a five-star resort or a fully staffed private home if you want the top-tier experience.</p>

        <div className="grid md:grid-cols-3 gap-6">
          {[
            {
              tier: "Essential",
              price: "Included",
              priceNote: "with membership",
              desc: "Boutique hotel-style room with shared common spaces. Clean, comfortable, and everything you need to focus on the experience.",
              img: "/images/housing-essential.png",
              features: ["Private hotel-style room", "Shared common areas", "Wi-Fi, A/C, daily housekeeping"]
            },
            {
              tier: "Premium",
              price: "$450",
              priceNote: "/night",
              desc: "Your own suite at a five-star resort. Full resort amenities, pool, spa access, and room service — all coordinated by our concierge team.",
              img: "/images/housing-premium.png",
              features: ["Private suite at 5-star resort", "Pool, spa + fitness center", "Restaurant access + room service"]
            },
            {
              tier: "Elite",
              price: "$1,500",
              priceNote: "/night",
              desc: "A fully private 4-5 bedroom luxury home with your own chef, daily catering, housekeeping, and a personal trainer on call.",
              img: "/images/housing-elite.png",
              features: ["Private luxury home (4-5 bedrooms)", "Private chef + daily catering", "Housekeeping + personal trainer"]
            }
          ].map((item, i) => (
            <Card key={i} className="overflow-visible hover-elevate" data-testid={`card-housing-${i}`}>
              <img src={item.img} alt={item.tier} className="w-full h-48 object-cover rounded-t-md" />
              <CardContent className="p-5 space-y-2">
                <div className="flex items-baseline justify-between gap-2 flex-wrap">
                  <h3 className="text-base font-sans font-medium text-gold tracking-wide">{item.tier}</h3>
                  <span className="text-sm font-display font-normal text-foreground">{item.price} <span className="text-xs text-muted-foreground font-sans">{item.priceNote}</span></span>
                </div>
                <p className="text-sm text-muted-foreground">{item.desc}</p>
                <ul className="space-y-1.5 pt-1">
                  {item.features.map((f, j) => (
                    <li key={j} className="flex gap-2 text-sm text-muted-foreground">
                      <Check className="h-4 w-4 text-gold flex-shrink-0 mt-0.5" /> {f}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
      </Section>

      <Section dark>
        <div className="grid md:grid-cols-2 gap-12 items-center">
          <div>
            <p className="text-xs font-sans font-normal uppercase tracking-widest text-gold mb-4">The Retreats</p>
            <h2 className="text-3xl md:text-4xl font-display font-normal mb-6" data-testid="text-retreat-headline">Puerto Rico. Your Dates. <span className="text-gold">Your Way.</span></h2>
            <div className="space-y-4 text-muted-foreground leading-relaxed">
              <p>Choose a private 1-on-1 retreat or go shared and overlap dates with other members for a small group experience. Pick 3 days to 2 weeks — whatever fits your life. Morning movement on the beach. Breathwork sessions. Real conversations over clean food. Ocean time. Nature.</p>
              <p>This isn't a vacation and it isn't a bootcamp. It's a structured reset — designed to pull you out of your routine long enough to see what needs to change and give you the tools to change it.</p>
            </div>
            <div className="flex flex-wrap gap-2 mt-6">
              {["Breathwork", "Ocean + Nature", "Movement", "Clean Food", "Mastermind Sessions", "Recovery Protocols"].map((tag, i) => (
                <Badge key={i} variant="outline" className="border-gold-subtle text-gold text-xs font-normal">{tag}</Badge>
              ))}
            </div>
          </div>
          <div>
            <img 
              src="/images/tropical-beach.png" 
              alt="Puerto Rico beach"
              className="rounded-md shadow-gold-subtle border border-gold-subtle"
            />
          </div>
        </div>
      </Section>

      <Section>
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
                {["Everything in Quarterly", "One Puerto Rico retreat included", "Essential housing included", "Priority upgrade to Premium + Elite", "Direct concierge access + priority scheduling"].map((item, i) => (
                  <li key={i} className="flex gap-2 text-sm text-muted-foreground"><Check className="h-4 w-4 text-gold flex-shrink-0 mt-0.5" /> {item}</li>
                ))}
              </ul>
              <Button className="w-full gold-metallic-btn" onClick={openApplication} data-testid="button-apply-annual">Apply for Annual</Button>
            </CardContent>
          </Card>
        </div>
      </Section>

      <Section dark>
        <div className="text-center mb-10">
          <p className="text-xs font-sans font-normal uppercase tracking-widest text-gold mb-4">Who This Is For</p>
          <h2 className="text-3xl md:text-4xl font-display font-normal mb-4" data-testid="text-who-headline">Built for People Who Build Things</h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">Entrepreneurs, founders, and high-performing professionals who are ready to invest in themselves — not just their business.</p>
        </div>
        <div className="max-w-3xl mx-auto">
          <Accordion type="single" collapsible className="w-full">
            {[
              { q: "You're successful but running on fumes", a: "You've built something real, but your sleep is off, your energy dips, and you know your body is paying for your output." },
              { q: "You want growth that actually sticks", a: "You've done conferences and courses. You want something deeper — real changes in how you feel, think, and show up daily." },
              { q: "You're tired of surface-level wellness", a: "You're not looking for crystals and mantras. You want practical, grounded work on your health, mindset, and nervous system." },
              { q: "You want community without the fluff", a: "You want to be around other serious people working on themselves. Real conversations, not networking pitches." },
              { q: "You value experiences over information", a: "You don't need more content. You need an environment that pulls the best version of you forward." }
            ].map((item, i) => (
              <AccordionItem key={i} value={`who-${i}`} data-testid={`who-item-${i}`}>
                <AccordionTrigger className="text-left font-display text-base font-normal">{item.q}</AccordionTrigger>
                <AccordionContent className="text-muted-foreground leading-relaxed text-sm">
                  {item.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </Section>

      <Section>
        <div className="text-center mb-10">
          <p className="text-xs font-sans font-normal uppercase tracking-widest text-gold mb-4">What You Get</p>
          <h2 className="text-3xl md:text-4xl font-display font-normal mb-4" data-testid="text-deliverables-headline">Your Membership Includes</h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">Everything is designed to support you between retreats — so the growth doesn't stop when you go home.</p>
        </div>
        <div className="max-w-3xl mx-auto">
          <Accordion type="single" collapsible className="w-full">
            {[
              { q: "Customizable Retreats", a: "Design your own retreat — private or shared, 3 days to 2 weeks. Pick your dates, housing tier, and let our concierge handle the rest." },
              { q: "Concierge Booking", a: "Choose private or shared, pick your dates and housing in your member portal. Submit a request — our team schedules a call to finalize everything." },
              { q: "Health Protocols", a: "Practical daily routines for hydration, digestion, sleep, and stress management. Built for busy, mobile lives." },
              { q: "Community + Coaching", a: "Live calls, a private member community, accountability without pressure, and optional 1:1 sessions." },
              { q: "The Method: Stabilize, Clear, Build", a: "Our approach works in three phases. First, stabilize your foundation — hydration, sleep, gut health. Then clear what's dragging you down. Then build real capacity — nutrition, movement, breath, mental clarity. Systems that keep you strong long-term." }
            ].map((item, i) => (
              <AccordionItem key={i} value={`get-${i}`} data-testid={`deliverable-item-${i}`}>
                <AccordionTrigger className="text-left font-display text-base font-normal">{item.q}</AccordionTrigger>
                <AccordionContent className="text-muted-foreground leading-relaxed text-sm">
                  {item.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </Section>

      <Section dark className="py-16">
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
                <AccordionTrigger className="text-left font-display text-base font-normal">{item.q}</AccordionTrigger>
                <AccordionContent className="text-muted-foreground leading-relaxed text-sm">
                  {item.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </Section>

      <Section className="text-center py-24">
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

      <footer className="border-t border-border/30 bg-background py-12 text-center">
        <div className="container mx-auto px-4">
          <div className="font-display text-2xl tracking-tight mb-6">Sakred Body</div>
          <p className="text-muted-foreground text-sm mb-8 max-w-md mx-auto">
            A concierge retreat and mastermind experience for entrepreneurs who take personal growth seriously.
            <br/>Copyright {new Date().getFullYear()} Sakred Body. All rights reserved.
          </p>
          <p className="text-xs text-muted-foreground max-w-lg mx-auto mb-6">
            Disclaimer: Sakred Body is not a medical program. We do not diagnose, treat, or prescribe. 
            Consult your healthcare provider before making changes to your health regimen.
          </p>
          <div className="flex justify-center flex-wrap gap-6 text-sm text-muted-foreground">
            <a href="#" className="hover:text-gold transition-colors" data-testid="link-privacy">Privacy Policy</a>
            <a href="#" className="hover:text-gold transition-colors" data-testid="link-terms">Terms of Service</a>
            <a href="mailto:contact@sakredbody.com" className="hover:text-gold transition-colors" data-testid="link-contact">Contact</a>
          </div>
        </div>
      </footer>

      <ApplicationModal 
        open={isModalOpen} 
        onOpenChange={setIsModalOpen} 
      />
    </div>
  );
}
