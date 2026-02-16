import { useState } from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { ArrowRight, Check, Shield, Users, Calendar, MapPin, Star, Home, Utensils, Dumbbell, Heart, Sun, Waves } from "lucide-react";
import { ApplicationModal } from "@/components/ApplicationModal";
import { Section } from "@/components/Section";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

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

  const openApplication = () => setIsModalOpen(true);

  return (
    <div className="min-h-screen bg-background text-foreground font-sans">
      
      <header className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-md border-b border-border/50" style={{ zIndex: 9999 }}>
        <div className="container max-w-6xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
          <div className="font-display text-xl tracking-tight">Sakred Body</div>
          <div className="flex items-center gap-3 flex-wrap">
            <Link href="/member" data-testid="link-member-portal">
              <Button variant="outline" size="sm">Member Portal</Button>
            </Link>
            <Button onClick={openApplication} size="sm" data-testid="button-apply-header">
              Apply Now
            </Button>
          </div>
        </div>
      </header>

      <section className="relative min-h-[90vh] flex items-center pt-20 overflow-hidden">
        <div className="absolute inset-0 z-0">
          <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/50 to-background z-10" />
          <img 
            src="/images/hero-ocean.jpg"
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
              <Button onClick={openApplication} size="lg" className="text-base px-8 bg-gold text-background border-gold-subtle" data-testid="button-apply-hero">
                Apply for Sakred Body <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
              <Button variant="outline" size="lg" className="text-base px-8 border-white/20 text-white backdrop-blur-sm bg-white/5" onClick={() => document.getElementById('what-we-do')?.scrollIntoView({ behavior: 'smooth'})} data-testid="button-view-program">
                See How It Works
              </Button>
            </motion.div>
          </motion.div>
        </div>
      </section>

      <Section dark className="border-y border-border/40 py-12">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-6">
          {[
            { icon: <MapPin className="h-4 w-4" />, label: "Puerto Rico" },
            { icon: <Home className="h-4 w-4" />, label: "Luxury Housing" },
            { icon: <Users className="h-4 w-4" />, label: "Small Groups" },
            { icon: <Star className="h-4 w-4" />, label: "Concierge Service" },
            { icon: <Heart className="h-4 w-4" />, label: "Personal Growth" },
            { icon: <Calendar className="h-4 w-4" />, label: "Quarterly Retreats" },
          ].map((item, i) => (
            <div key={i} className="flex items-center justify-center gap-2 text-gold" data-testid={`trust-marker-${i}`}>
              {item.icon}
              <span className="text-xs font-sans font-normal uppercase tracking-wider text-muted-foreground">{item.label}</span>
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
              <p>Most masterminds sell you "personal growth" and then hand you business tactics. You leave with a new funnel strategy but the same stress, the same patterns, the same exhaustion.</p>
              <p>Sakred Body is different. We focus on you as a person — your health, your nervous system, your energy, your internal world. When you get right internally, everything external improves. Your business, your relationships, your decisions.</p>
              <p className="text-foreground">Better people build better businesses. We start with the person.</p>
            </div>
          </div>
          <div className="relative">
            <div className="absolute -inset-4 bg-gold/10 blur-3xl rounded-full opacity-30"></div>
            <img 
              src="/images/group-wellness.jpg" 
              alt="Group wellness retreat"
              className="relative rounded-md shadow-gold-subtle border border-gold-subtle"
            />
          </div>
        </div>
      </Section>

      <Section dark>
        <div className="grid md:grid-cols-2 gap-12 items-center">
          <div className="order-2 md:order-1">
            <img 
              src="/images/tropical-villa.jpg" 
              alt="Luxury tropical retreat villa"
              className="rounded-md shadow-gold-subtle border border-gold-subtle"
            />
          </div>
          <div className="order-1 md:order-2">
            <p className="text-xs font-sans font-normal uppercase tracking-widest text-gold mb-4">The Concierge Experience</p>
            <h2 className="text-3xl md:text-4xl font-display font-normal mb-6" data-testid="text-concierge-headline">
              Everything Is <span className="text-gold">Handled for You</span>
            </h2>
            <div className="space-y-4 text-muted-foreground leading-relaxed">
              <p>When you join Sakred Body, you get access to a private member portal with a full concierge team behind it. You browse upcoming retreats, pick your housing tier, and submit a booking request. We handle the rest.</p>
              <p>Housing ranges from comfortable essentials to premium villas to elite beachfront properties. Our concierge team coordinates everything — accommodations, wellness activities, dining, local experiences — so you can show up and focus on growth.</p>
            </div>
            <div className="mt-6 space-y-3">
              {[
                { icon: <Home className="h-4 w-4 text-gold flex-shrink-0" />, text: "Curated housing — from cozy studios to private beachfront villas" },
                { icon: <Utensils className="h-4 w-4 text-gold flex-shrink-0" />, text: "Restaurant reservations and clean food coordination" },
                { icon: <Dumbbell className="h-4 w-4 text-gold flex-shrink-0" />, text: "Local fitness, yoga, and wellness partners lined up for you" },
                { icon: <Star className="h-4 w-4 text-gold flex-shrink-0" />, text: "Your own member portal to browse, book, and manage everything" },
              ].map((item, i) => (
                <div key={i} className="flex gap-3 items-start text-sm text-muted-foreground">
                  {item.icon}
                  <span>{item.text}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Section>

      <Section>
        <div className="text-center mb-16">
          <p className="text-xs font-sans font-normal uppercase tracking-widest text-gold mb-4">Who This Is For</p>
          <h2 className="text-3xl md:text-4xl font-display font-normal mb-4" data-testid="text-who-headline">Built for People Who Build Things</h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">Entrepreneurs, founders, sales leaders, and high-performing professionals who are ready to invest in themselves — not just their business.</p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {[
            {
              title: "You're successful but running on fumes",
              desc: "You've built something real, but your sleep is off, your energy dips, and you know your body is paying for your output."
            },
            {
              title: "You want growth that actually sticks",
              desc: "You've done conferences and courses. You want something deeper — real changes in how you feel, think, and show up daily."
            },
            {
              title: "You're tired of surface-level wellness",
              desc: "You're not looking for crystals and mantras. You want practical, grounded work on your health, mindset, and nervous system."
            },
            {
              title: "You want community without the fluff",
              desc: "You want to be around other serious people working on themselves. Real conversations, not networking pitches."
            },
            {
              title: "You're ready to be a better human first",
              desc: "You get that becoming a better person makes you a better entrepreneur. Not the other way around."
            },
            {
              title: "You value experiences over information",
              desc: "You don't need more content. You need an environment that pulls the best version of you forward."
            }
          ].map((item, i) => (
            <Card key={i} className="hover-elevate" data-testid={`card-who-${i}`}>
              <CardContent className="p-6">
                <h3 className="text-sm font-sans font-medium tracking-wide text-foreground mb-2">{item.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{item.desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </Section>

      <Section dark>
        <div className="grid md:grid-cols-2 gap-12 items-center">
          <div>
            <p className="text-xs font-sans font-normal uppercase tracking-widest text-gold mb-4">The Retreats</p>
            <h2 className="text-3xl md:text-4xl font-display font-normal mb-6" data-testid="text-retreat-headline">Puerto Rico. Small Group. <span className="text-gold">Big Shifts.</span></h2>
            <div className="space-y-4 text-muted-foreground leading-relaxed">
              <p>Each retreat is 3-4 days in Puerto Rico with a small group of members. Morning movement on the beach. Breathwork sessions. Real conversations over clean food. Ocean time. Nature. Space to actually think.</p>
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
              src="/images/tropical-beach.jpg" 
              alt="Puerto Rico beach"
              className="rounded-md shadow-gold-subtle border border-gold-subtle"
            />
          </div>
        </div>
      </Section>

      <Section id="housing">
        <div className="text-center mb-16">
          <p className="text-xs font-sans font-normal uppercase tracking-widest text-gold mb-4">Housing Options</p>
          <h2 className="text-3xl md:text-4xl font-display font-normal mb-4" data-testid="text-housing-headline">Pick Your Space. We Handle the Rest.</h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">Every retreat offers three housing tiers. Browse options in your member portal and submit a booking request — our concierge team takes it from there.</p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {[
            {
              tier: "Essential",
              desc: "Clean, comfortable, everything you need. Perfect if you'd rather spend your budget on the experience itself.",
              img: "/images/studio-standard.jpg",
              features: ["Private room", "Wi-Fi + A/C", "Shared common areas"]
            },
            {
              tier: "Premium",
              desc: "More space, better views, extra comfort. A step up for when you want to relax in style between sessions.",
              img: "/images/villa-premium.jpg",
              features: ["Private suite", "Pool access", "Kitchen + lounge"]
            },
            {
              tier: "Elite",
              desc: "Top-tier beachfront or penthouse properties. For members who want the full experience with nothing held back.",
              img: "/images/penthouse.jpg",
              features: ["Beachfront / penthouse", "Full luxury amenities", "Concierge priority"]
            }
          ].map((item, i) => (
            <Card key={i} className="overflow-visible hover-elevate" data-testid={`card-housing-${i}`}>
              <img src={item.img} alt={item.tier} className="w-full h-48 object-cover rounded-t-md" />
              <CardContent className="p-6 space-y-3">
                <h3 className="text-base font-sans font-medium text-gold tracking-wide">{item.tier}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{item.desc}</p>
                <ul className="space-y-2">
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

      <Section dark id="method">
        <div className="text-center mb-16">
          <p className="text-xs font-sans font-normal uppercase tracking-widest text-gold mb-4">The Method</p>
          <h2 className="text-3xl md:text-4xl font-display font-normal mb-4" data-testid="text-method-headline">Three Phases. One System.</h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">Our approach works in a simple sequence — stabilize your foundation, clear what's getting in the way, then build real capacity.</p>
        </div>

        <div className="grid md:grid-cols-3 gap-8 relative">
          <div className="hidden md:block absolute top-16 left-[16%] right-[16%] h-px bg-gradient-to-r from-transparent via-gold/30 to-transparent z-0" />

          {[
            {
              step: "01",
              phase: "Stabilize",
              desc: "Get your basics right. Hydration, minerals, sleep, gut health, inflammation. Stop the slow breakdown that high-output living creates."
            },
            {
              step: "02",
              phase: "Clear",
              desc: "Remove what's dragging you down. Simplify food. Reduce stimulants. Support your body's natural ability to recover and reset."
            },
            {
              step: "03",
              phase: "Build",
              desc: "Now you build real capacity. Nutrition for performance. Movement. Breath. Mental clarity. Systems that keep you strong long-term."
            }
          ].map((item, i) => (
            <div key={i} className="relative z-10">
              <Card>
                <CardContent className="p-8">
                  <div className="text-5xl font-display text-gold/20 mb-4">{item.step}</div>
                  <h3 className="text-lg font-sans font-medium mb-4 text-gold tracking-wide">{item.phase}</h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">{item.desc}</p>
                </CardContent>
              </Card>
            </div>
          ))}
        </div>
      </Section>

      <Section>
        <div className="text-center mb-16">
          <p className="text-xs font-sans font-normal uppercase tracking-widest text-gold mb-4">What You Get</p>
          <h2 className="text-3xl md:text-4xl font-display font-normal mb-4" data-testid="text-deliverables-headline">Your Membership Includes</h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">Everything is designed to support you between retreats — so the growth doesn't stop when you go home.</p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {[
            {
              icon: <Calendar className="h-8 w-8 text-gold mb-4" />,
              title: "Quarterly Retreats",
              desc: "3-4 day immersive experiences in Puerto Rico. Breathwork, movement, nature, mastermind sessions, and real recovery time."
            },
            {
              icon: <Star className="h-8 w-8 text-gold mb-4" />,
              title: "Concierge Booking",
              desc: "Browse retreats and housing in your member portal. Pick your tier, submit a request, and we handle all the details."
            },
            {
              icon: <Shield className="h-8 w-8 text-gold mb-4" />,
              title: "Health Protocols",
              desc: "Practical daily routines for hydration, digestion, sleep, stress management, and travel. Built for busy lives."
            },
            {
              icon: <Users className="h-8 w-8 text-gold mb-4" />,
              title: "Community + Coaching",
              desc: "Live calls, a private member community, accountability without pressure, and optional 1:1 sessions."
            }
          ].map((item, i) => (
            <Card key={i} className="hover-elevate" data-testid={`card-deliverable-${i}`}>
              <CardContent className="p-6">
                {item.icon}
                <h3 className="text-base font-sans font-medium mb-2">{item.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{item.desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </Section>

      <Section dark className="py-16">
        <div className="grid md:grid-cols-2 gap-12 items-center">
          <div>
            <p className="text-xs font-sans font-normal uppercase tracking-widest text-gold mb-4">The Member Portal</p>
            <h2 className="text-3xl md:text-4xl font-display font-normal mb-6" data-testid="text-portal-headline">Your Own <span className="text-gold">Private Dashboard</span></h2>
            <div className="space-y-4 text-muted-foreground leading-relaxed">
              <p>When you become a member, you get access to a private portal where you can see all upcoming retreats, browse available properties, and submit booking requests with a few clicks.</p>
              <p>Your concierge team reviews each request and confirms everything. You'll also find our curated network of wellness partners — yoga studios, fitness centers, spas, restaurants — all coordinated under the Sakred Body brand so you don't have to research or plan anything yourself.</p>
            </div>
            <div className="mt-6 space-y-3">
              {[
                "Browse upcoming retreats and see what's available",
                "Select your housing tier and submit booking requests",
                "Track your bookings and get concierge updates",
                "Access curated wellness, fitness, and dining partners",
              ].map((item, i) => (
                <div key={i} className="flex gap-3 items-start text-sm text-muted-foreground">
                  <Check className="h-4 w-4 text-gold flex-shrink-0 mt-0.5" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="relative">
            <div className="absolute -inset-4 bg-gold/10 blur-3xl rounded-full opacity-20"></div>
            <img 
              src="/images/resort-hotel.jpg" 
              alt="Resort experience"
              className="relative rounded-md shadow-gold-subtle border border-gold-subtle"
            />
          </div>
        </div>
      </Section>

      <Section>
        <div className="text-center mb-16">
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
                {["Mastermind community + live calls", "Health protocols and daily systems", "Private member portal access", "Retreat booking available separately"].map((item, i) => (
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
                {["Everything in Quarterly", "One Puerto Rico retreat included", "Priority housing selection", "Direct concierge access"].map((item, i) => (
                  <li key={i} className="flex gap-2 text-sm text-muted-foreground"><Check className="h-4 w-4 text-gold flex-shrink-0 mt-0.5" /> {item}</li>
                ))}
              </ul>
              <Button className="w-full bg-gold text-background border-gold-subtle" onClick={openApplication} data-testid="button-apply-annual">Apply for Annual</Button>
            </CardContent>
          </Card>
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
              { q: "What happens at the retreats?", a: "3-4 days in Puerto Rico with a small group. Morning movement and breathwork on the beach, mastermind sessions, clean food, ocean time, nature, and recovery. It's structured but not rigid." },
              { q: "What if I travel a lot for work?", a: "The protocols are designed for busy, mobile lives. We teach systems that work on the road — hydration, sleep anchors, food strategies, nervous system tools you can use anywhere." },
              { q: "How does the concierge booking work?", a: "You log into your member portal, browse upcoming retreats, pick a housing tier, and submit a request. Our team confirms your booking and handles all the logistics." },
              { q: "How much time does this take each week?", a: "The daily protocols take 30-60 minutes. Live calls are optional. The retreats are 3-4 days per quarter. It's designed to fit into a real life, not replace it." }
            ].map((item, i) => (
              <AccordionItem key={i} value={`item-${i}`} data-testid={`faq-item-${i}`}>
                <AccordionTrigger className="text-left font-display text-base">{item.q}</AccordionTrigger>
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
            Sakred Body is for people who are done running on empty and ready to build a real foundation — physically, mentally, and personally. Small groups. Concierge-level support. Real results.
          </p>
          <Button onClick={openApplication} size="lg" className="text-base px-10 bg-gold text-background border-gold-subtle" data-testid="button-apply-final">
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
