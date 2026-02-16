import { useState } from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { ArrowRight, Check, X, Shield, Activity, Zap, Brain, Battery, Calendar, MapPin, Anchor, Droplets, Wind, Sun } from "lucide-react";
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
            alt="Ocean representing depth and clarity"
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
              <Badge variant="outline" className="mb-6 border-gold-subtle text-gold-light tracking-widest uppercase bg-gold-subtle px-4 py-1" data-testid="badge-tagline">
                Mastermind + Retreats
              </Badge>
            </motion.div>
            
            <motion.h1 variants={fadeInUp} className="text-5xl md:text-7xl font-display leading-[1.1] mb-6 tracking-tight text-white">
              Rebuild Your Terrain.<br />
              <span className="gold-gradient-text">Upgrade Your Mind.</span>
            </motion.h1>
            
            <motion.p variants={fadeInUp} className="text-lg md:text-xl text-white/70 mb-8 max-w-2xl leading-relaxed">
              A premium mastermind and retreat experience designed to restore hydration, minerals, gut function, 
              inflammation control, nervous system capacity, and mental clarity — so you can perform longer, 
              think cleaner, and lead without dragging your body behind you.
            </motion.p>
            
            <motion.div variants={fadeInUp} className="flex flex-col sm:flex-row gap-4">
              <Button onClick={openApplication} size="lg" className="text-base px-8 bg-gold text-background border-gold-subtle" data-testid="button-apply-hero">
                Apply for Sakred Body <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
              <Button variant="outline" size="lg" className="text-base px-8 border-white/20 text-white backdrop-blur-sm bg-white/5" onClick={() => document.getElementById('method')?.scrollIntoView({ behavior: 'smooth'})} data-testid="button-view-program">
                View Program Details
              </Button>
            </motion.div>
          </motion.div>
        </div>
      </section>

      <Section dark className="border-y border-border/40 py-12">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-6">
          {[
            { icon: <MapPin className="h-4 w-4" />, label: "Puerto Rico Retreats" },
            { icon: <Droplets className="h-4 w-4" />, label: "Terrain-First Systems" },
            { icon: <Shield className="h-4 w-4" />, label: "Structured Protocols" },
            { icon: <Activity className="h-4 w-4" />, label: "High-Integrity Community" },
            { icon: <Brain className="h-4 w-4" />, label: "Coaching + Implementation" },
            { icon: <Wind className="h-4 w-4" />, label: "Mastermind, Not Vacation" },
          ].map((item, i) => (
            <div key={i} className="flex items-center justify-center gap-2 text-gold" data-testid={`trust-marker-${i}`}>
              {item.icon}
              <span className="text-xs font-sans font-medium uppercase tracking-wider text-muted-foreground">{item.label}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section>
        <div className="grid md:grid-cols-2 gap-12 md:gap-24 items-center">
          <div>
            <h2 className="text-3xl md:text-5xl font-display mb-6" data-testid="text-problem-headline">
              High Success.<br/>High Output.<br/>
              <span className="text-gold">Quiet Degradation.</span>
            </h2>
            <div className="space-y-4 text-muted-foreground leading-relaxed">
              <p>Your mind runs faster than your body can recover. Stress looks like productivity until it turns into inflammation.</p>
              <p>You can push through... until sleep, digestion, mood, libido, and focus start breaking. Your "discipline" becomes brute force instead of clean power.</p>
              <p className="font-sans font-semibold text-foreground">You don't need motivation — you need a system.</p>
            </div>
          </div>
          <div className="relative">
            <div className="absolute -inset-4 bg-gold/10 blur-3xl rounded-full opacity-30"></div>
            <img 
              src="/images/training-focus.jpg" 
              alt="Focused training in nature"
              className="relative rounded-md shadow-gold-subtle border border-gold-subtle"
            />
          </div>
        </div>
      </Section>

      <Section dark className="text-center">
        <div className="max-w-3xl mx-auto">
          <p className="text-xs font-sans font-medium uppercase tracking-widest text-gold mb-4">Philosophy</p>
          <h2 className="text-4xl md:text-5xl font-display mb-8" data-testid="text-philosophy-headline">Clarity Over Complexity</h2>
          <p className="text-lg text-muted-foreground leading-relaxed mb-12">
            We're not selling mysticism, hacks, or fear. We're teaching a terrain-based operating system 
            for the human body — simple principles applied at a high level.
          </p>
          <div className="grid sm:grid-cols-2 gap-4 text-left max-w-2xl mx-auto">
            {[
              "Terrain-first: internal environment determines performance",
              "Detox → Nourish → Rebuild: the correct order creates sustainable change",
              "Minerals and hydration are non-negotiable",
              "The gut is central command",
              "Stress is biochemical — you regulate the system",
              "Nature is medicine",
              "Structure creates freedom"
            ].map((belief, i) => (
              <div key={i} className="flex gap-3 text-sm text-muted-foreground">
                <span className="h-1.5 w-1.5 rounded-full bg-gold mt-2 flex-shrink-0" />
                {belief}
              </div>
            ))}
          </div>
        </div>
      </Section>

      <Section>
        <div className="grid md:grid-cols-2 gap-8">
          <Card className="border-gold-subtle bg-gold-subtle/30">
            <CardContent className="p-8">
              <h3 className="text-2xl font-display mb-6 text-gold flex items-center gap-3" data-testid="text-for-heading">
                <Check className="h-6 w-6" /> This Is For You If...
              </h3>
              <ul className="space-y-4">
                {[
                  "Entrepreneurs and operators running real responsibility",
                  "Sales leaders in high stimulation + high pressure",
                  "High performers with sleep, gut, fog, or burnout signals",
                  "People who want repeatable systems, not a one-time retreat high",
                  "Builders who want longevity, clean focus, and stable energy"
                ].map((item, i) => (
                  <li key={i} className="flex gap-3 text-muted-foreground text-sm">
                    <span className="h-1.5 w-1.5 rounded-full bg-gold mt-2 flex-shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-8">
              <h3 className="text-2xl font-display mb-6 text-destructive flex items-center gap-3" data-testid="text-not-for-heading">
                <X className="h-6 w-6" /> This Is NOT For You If...
              </h3>
              <ul className="space-y-4">
                {[
                  "Looking for a vacation disguised as wellness",
                  "Want a magic supplement or one ritual to fix everything",
                  "Unwilling to implement simple fundamentals consistently",
                  "Expecting medical treatment or diagnosis"
                ].map((item, i) => (
                  <li key={i} className="flex gap-3 text-muted-foreground text-sm">
                    <span className="h-1.5 w-1.5 rounded-full bg-destructive mt-2 flex-shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      </Section>

      <Section dark id="deliverables">
        <div className="text-center mb-16">
          <p className="text-xs font-sans font-medium uppercase tracking-widest text-gold mb-4">What You Get</p>
          <h2 className="text-4xl font-display mb-4" data-testid="text-deliverables-headline">A Mastermind That Upgrades the Operating System</h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">Behind your decisions.</p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {[
            {
              icon: <Calendar className="h-8 w-8 text-gold mb-4" />,
              title: "Quarterly Cycle",
              desc: "A repeatable 12-week system: hydration, minerals, gut optimization, inflammation control, cognitive clarity, movement, breathwork, and strategic detox."
            },
            {
              icon: <MapPin className="h-8 w-8 text-gold mb-4" />,
              title: "Island Retreat",
              desc: "Puerto Rico. Ocean + sun + movement + breath. Clean food. Nervous system downshift. Group calibration with leadership-level conversations."
            },
            {
              icon: <Brain className="h-8 w-8 text-gold mb-4" />,
              title: "Protocol Library",
              desc: "Morning & evening routines. Hydration/mineral strategy. Digestion protocol. Travel protocol. Stress-to-performance conversion tools."
            },
            {
              icon: <Activity className="h-8 w-8 text-gold mb-4" />,
              title: "Coaching & Community",
              desc: "Live calls, accountability without guilt culture, private curated community channel, optional 1:1 intensives."
            }
          ].map((item, i) => (
            <Card key={i} className="hover-elevate" data-testid={`card-deliverable-${i}`}>
              <CardContent className="p-6">
                {item.icon}
                <h3 className="text-lg font-display mb-2">{item.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{item.desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </Section>

      <Section id="method">
        <div className="text-center mb-16">
          <p className="text-xs font-sans font-medium uppercase tracking-widest text-gold mb-4">The Method</p>
          <h2 className="text-4xl font-display mb-4" data-testid="text-method-headline">The 3-Phase Sakred Method</h2>
          <p className="text-muted-foreground">This is not "health content." This is human optimization as a system.</p>
        </div>

        <div className="grid md:grid-cols-3 gap-8 relative">
          <div className="hidden md:block absolute top-16 left-[16%] right-[16%] h-px bg-gradient-to-r from-transparent via-gold/30 to-transparent z-0" />

          {[
            {
              step: "01",
              phase: "Stabilize the Terrain",
              desc: "Hydration, minerals, gut rhythm, sleep anchors, inflammation control. Stop the degradation and establish the baseline."
            },
            {
              step: "02",
              phase: "Clear the Noise",
              desc: "Strategic detox principles, drainage support, food simplification, reducing stimulants and inflammatory load."
            },
            {
              step: "03",
              phase: "Build the Engine",
              desc: "Performance nutrition, mitochondrial support, strength + mobility, breath capacity, cognition protocols, long-term regulation."
            }
          ].map((item, i) => (
            <div key={i} className="relative z-10">
              <Card>
                <CardContent className="p-8">
                  <div className="text-5xl font-display text-gold/20 mb-4">{item.step}</div>
                  <h3 className="text-xl font-display mb-4 text-gold">{item.phase}</h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">{item.desc}</p>
                </CardContent>
              </Card>
            </div>
          ))}
        </div>
      </Section>

      <Section dark>
        <div className="grid md:grid-cols-2 gap-12 items-center">
          <div className="order-2 md:order-1">
            <img 
              src="/images/puerto-rico-coast.jpg" 
              alt="Puerto Rico Coastline"
              className="rounded-md shadow-gold-subtle border border-gold-subtle"
            />
          </div>
          <div className="order-1 md:order-2">
            <p className="text-xs font-sans font-medium uppercase tracking-widest text-gold mb-4">The Location</p>
            <h2 className="text-4xl font-display mb-6" data-testid="text-retreat-headline">Puerto Rico Retreats</h2>
            <p className="text-muted-foreground mb-6 leading-relaxed">
              A focused reset environment. Morning breath + movement. Sun and ocean exposure. 
              Clean food rhythm. Deep recovery protocols. Mastermind sessions with high-caliber people. 
              Nature hikes + terrain education.
            </p>
            <div className="space-y-3 mb-8">
              {[
                { label: "Day 1", desc: "Arrival + nervous system downshift + terrain baseline" },
                { label: "Day 2", desc: "Hydration/mineral reset + breath + ocean + mastermind" },
                { label: "Day 3", desc: "Gut rhythm + movement + hike + recovery session" },
                { label: "Day 4", desc: "Performance installation + leadership integration + departure" },
              ].map((day, i) => (
                <div key={i} className="flex gap-3 items-start text-sm">
                  <span className="text-gold font-sans font-semibold min-w-[50px]">{day.label}</span>
                  <span className="text-muted-foreground">{day.desc}</span>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {["Stable Energy", "Clearer Thinking", "Better Digestion", "Stronger Sleep", "Reduced Stress"].map((outcome, i) => (
                <Badge key={i} variant="outline" className="border-gold-subtle text-gold text-xs">{outcome}</Badge>
              ))}
            </div>
          </div>
        </div>
      </Section>

      <Section>
        <div className="text-center mb-16">
          <p className="text-xs font-sans font-medium uppercase tracking-widest text-gold mb-4">Investment</p>
          <h2 className="text-4xl font-display mb-4" data-testid="text-pricing-headline">Select Your Commitment Level</h2>
          <p className="text-muted-foreground">Application-based. Limited seats. Curated room.</p>
        </div>

        <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
          <Card className="hover-elevate">
            <CardContent className="p-8 flex flex-col h-full">
              <div className="mb-8">
                <h3 className="text-lg text-muted-foreground mb-2 font-sans">Quarterly Membership</h3>
                <div className="text-4xl font-display">$2,000<span className="text-base text-muted-foreground font-sans font-normal">/quarter</span></div>
              </div>
              <ul className="space-y-3 mb-8 flex-1">
                {["Mastermind + protocols + calls", "Private community access", "Protocol Library access", "Retreat access separate"].map((item, i) => (
                  <li key={i} className="flex gap-2 text-sm text-muted-foreground"><Check className="h-4 w-4 text-gold flex-shrink-0 mt-0.5" /> {item}</li>
                ))}
              </ul>
              <Button variant="outline" className="w-full border-gold-subtle text-gold" onClick={openApplication} data-testid="button-apply-quarterly">Apply for Quarterly</Button>
            </CardContent>
          </Card>

          <Card className="border-gold-subtle shadow-gold-subtle relative hover-elevate">
            <div className="absolute top-0 right-0 bg-gold text-background text-xs font-sans font-semibold px-3 py-1 rounded-bl-md">BEST VALUE</div>
            <CardContent className="p-8 flex flex-col h-full">
              <div className="mb-8">
                <h3 className="text-lg text-gold mb-2 font-sans font-medium">All-In Annual</h3>
                <div className="text-4xl font-display">$5,000<span className="text-base text-muted-foreground font-sans font-normal">/year</span></div>
                <p className="text-xs text-gold mt-2 font-sans font-medium">Priority retreat invites + deeper access</p>
              </div>
              <ul className="space-y-3 mb-8 flex-1">
                {["Everything in Quarterly", "Puerto Rico Retreat included", "Priority retreat invitations", "Deeper 1:1 access"].map((item, i) => (
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
          <h2 className="text-3xl font-display mb-8 text-center" data-testid="text-faq-headline">Frequently Asked Questions</h2>
          <Accordion type="single" collapsible className="w-full">
            {[
              { q: "Is this a medical program?", a: "No. Sakred Body is education, coaching, and implementation support. We don't diagnose, treat, or prescribe." },
              { q: "Do I need to be 'into wellness'?", a: "No. You need to be into results and willing to implement fundamentals." },
              { q: "What if I travel constantly?", a: "Perfect. We teach a travel-proof system: hydration, minerals, food rhythm, sleep anchors, and nervous system regulation." },
              { q: "Is this esoteric?", a: "No. We're grounded. The program is practical: breath, nature, food, movement, detox principles, and structure." },
              { q: "How much time does it take weekly?", a: "We build it to fit real lives. The goal is a high-leverage system, not a second job." },
              { q: "Are retreats required?", a: "No — but they accelerate everything." }
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
          <h2 className="text-4xl md:text-5xl font-display mb-6" data-testid="text-final-cta-headline">Your Body Is Your Business Partner.</h2>
          <p className="text-muted-foreground text-lg mb-8 leading-relaxed">
            If your energy is unstable, your decisions degrade. If your digestion is off, your mood and cognition suffer. 
            If your nervous system is constantly activated, you lose your edge.
          </p>
          <p className="text-lg mb-10">
            <span className="text-gold font-display">Sakred Body installs a new baseline.</span><br/>
            <span className="text-muted-foreground text-sm">Not hype. Not theory. A repeatable operating system.</span>
          </p>
          <Button onClick={openApplication} size="lg" className="text-base px-10 bg-gold text-background border-gold-subtle" data-testid="button-apply-final">
            Apply to Join Sakred Body <ArrowRight className="ml-2 h-5 w-5" />
          </Button>
          <p className="text-xs text-muted-foreground mt-4">Limited seats. Curated room. High integrity only.</p>
        </div>
      </Section>

      <footer className="border-t border-border/30 bg-background py-12 text-center">
        <div className="container mx-auto px-4">
          <div className="font-display text-2xl tracking-tight mb-6">Sakred Body</div>
          <p className="text-muted-foreground text-sm mb-8 max-w-md mx-auto">
            A premium, structured health reset for high-capacity humans.
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
