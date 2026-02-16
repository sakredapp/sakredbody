import { useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight, Check, X, Shield, Activity, Zap, Brain, Battery, Calendar, MapPin, Anchor } from "lucide-react";
import { ApplicationModal } from "@/components/ApplicationModal";
import { Section } from "@/components/Section";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

// Animation variants
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
    <div className="min-h-screen bg-background text-foreground font-sans selection:bg-primary/30">
      
      {/* Navigation / Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-md border-b border-border/50">
        <div className="container max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="font-display font-bold text-xl tracking-tighter uppercase">Sakred Body</div>
          <Button onClick={openApplication} size="sm" className="hidden sm:flex bg-primary text-primary-foreground hover:bg-primary/90">
            Apply Now
          </Button>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative min-h-[90vh] flex items-center pt-20 overflow-hidden">
        {/* Abstract Background - Dark Ocean / Technical */}
        <div className="absolute inset-0 z-0">
          <div className="absolute inset-0 bg-gradient-to-b from-background via-background/90 to-background z-10" />
          {/* Hero background: vast ocean or abstract landscape */}
          <img 
            src="https://images.unsplash.com/photo-1518176258769-f227c798150e?auto=format&fit=crop&q=80"
            alt="Vast dark ocean representing depth and clarity"
            className="w-full h-full object-cover opacity-40 grayscale contrast-125"
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
              <Badge variant="outline" className="mb-6 border-primary/50 text-primary tracking-widest uppercase bg-primary/10 px-4 py-1">
                Recalibrate. Restore. Ascend.
              </Badge>
            </motion.div>
            
            <motion.h1 variants={fadeInUp} className="text-5xl md:text-7xl font-display font-bold leading-[1.1] mb-6 tracking-tight text-white">
              Optimize the Vessel.<br />
              <span className="text-primary/90">Clarify the Mission.</span>
            </motion.h1>
            
            <motion.p variants={fadeInUp} className="text-xl md:text-2xl text-muted-foreground mb-8 max-w-2xl leading-relaxed">
              A private health mastermind & retreat for the high-capacity human. 
              Move from quiet degradation to peak physiological sovereignty.
            </motion.p>
            
            <motion.div variants={fadeInUp} className="flex flex-col sm:flex-row gap-4">
              <Button onClick={openApplication} size="lg" className="text-lg px-8 py-6 h-auto bg-primary text-primary-foreground hover:bg-primary/90 hover:scale-[1.02] transition-all">
                Apply for Sakred Body <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
              <Button variant="outline" size="lg" className="text-lg px-8 py-6 h-auto border-muted-foreground/30 hover:bg-white/5" onClick={() => document.getElementById('method')?.scrollIntoView({ behavior: 'smooth'})}>
                View Program Protocol
              </Button>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Trust Markers */}
      <Section dark className="border-y border-border/40 py-12">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 opacity-70">
          {[
            "Elite Performance",
            "Physiological Reset",
            "Metabolic Flexibility",
            "Cognitive Clarity"
          ].map((item, i) => (
            <div key={i} className="flex items-center justify-center gap-3">
              <Shield className="h-5 w-5 text-primary" />
              <span className="font-display font-medium uppercase tracking-wide text-sm">{item}</span>
            </div>
          ))}
        </div>
      </Section>

      {/* The Problem */}
      <Section>
        <div className="grid md:grid-cols-2 gap-12 md:gap-24 items-center">
          <div>
            <h2 className="text-3xl md:text-5xl font-display font-bold mb-6">High Success. <br/>High Output. <br/><span className="text-destructive/80">Quiet Degradation.</span></h2>
            <p className="text-lg text-muted-foreground mb-6 leading-relaxed">
              You are operating at a high level in business, but your biological machinery is accumulating debt. 
              The sleep is fragmented. The digestion is reactive. The energy is borrowed from caffeine and adrenaline.
            </p>
            <p className="text-lg text-muted-foreground leading-relaxed">
              You don't need another generic fitness plan. You need a system that respects your constraints 
              while demanding your absolute best.
            </p>
          </div>
          <div className="relative">
            <div className="absolute -inset-4 bg-primary/20 blur-3xl rounded-full opacity-20"></div>
            {/* Image: Intense focus or solitary figure in landscape */}
            <img 
              src="https://images.unsplash.com/photo-1517836357463-d25dfeac3438?auto=format&fit=crop&q=80" 
              alt="Person training alone in dark gym"
              className="relative rounded-lg shadow-2xl border border-border/30 grayscale hover:grayscale-0 transition-all duration-700"
            />
          </div>
        </div>
      </Section>

      {/* Philosophy */}
      <Section dark className="text-center">
        <div className="max-w-3xl mx-auto">
          <Badge className="mb-4 bg-accent/20 text-accent hover:bg-accent/30 transition-colors">Philosophy</Badge>
          <h2 className="text-4xl md:text-5xl font-display font-bold mb-8">Clarity Over Complexity</h2>
          <p className="text-xl text-muted-foreground leading-relaxed">
            We strip away the noise. No 12-step complicated routines that fall apart under pressure. 
            We build a bedrock of physiological habits that withstand the chaos of high-stakes leadership.
          </p>
        </div>
      </Section>

      {/* Who This Is For */}
      <Section>
        <div className="grid md:grid-cols-2 gap-12">
          <Card className="bg-card/50 border-primary/20">
            <CardContent className="p-8">
              <h3 className="text-2xl font-display font-bold mb-6 text-primary flex items-center gap-2">
                <Check className="h-6 w-6" /> Who This Is For
              </h3>
              <ul className="space-y-4">
                {[
                  "Leaders carrying significant responsibility",
                  "Individuals ready to confront physical limitations",
                  "High-capacity humans feeling the 'drag' of poor health",
                  "Those willing to invest in their biological longevity"
                ].map((item, i) => (
                  <li key={i} className="flex gap-3 text-muted-foreground">
                    <span className="h-1.5 w-1.5 rounded-full bg-primary mt-2 flex-shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card className="bg-card/50 border-destructive/20">
            <CardContent className="p-8">
              <h3 className="text-2xl font-display font-bold mb-6 text-destructive flex items-center gap-2">
                <X className="h-6 w-6" /> Who This Is NOT For
              </h3>
              <ul className="space-y-4">
                {[
                  "Tourists looking for a spa vacation",
                  "People looking for a quick fix or magic pill",
                  "Those unwilling to examine their own habits",
                  "Victims of circumstance"
                ].map((item, i) => (
                  <li key={i} className="flex gap-3 text-muted-foreground">
                    <span className="h-1.5 w-1.5 rounded-full bg-destructive mt-2 flex-shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      </Section>

      {/* The Deliverables */}
      <Section dark id="deliverables">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-display font-bold mb-4">The Architecture</h2>
          <p className="text-muted-foreground text-lg">Four pillars of the Sakred Body ecosystem.</p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {[
            {
              icon: <Calendar className="h-10 w-10 text-primary mb-4" />,
              title: "The Quarterly Cycle",
              desc: "90-day sprints. Data-driven. Outcome-focused. We track, measure, and adjust."
            },
            {
              icon: <MapPin className="h-10 w-10 text-accent mb-4" />,
              title: "The Island Retreat",
              desc: "Deep immersion in Puerto Rico. Physical challenges, nature exposure, and disconnect to reconnect."
            },
            {
              icon: <Brain className="h-10 w-10 text-blue-400 mb-4" />,
              title: "Protocol Library",
              desc: "Access to our proprietary protocols for sleep, nutrition, and training optimization."
            },
            {
              icon: <Activity className="h-10 w-10 text-purple-400 mb-4" />,
              title: "Direct Coaching",
              desc: "Access to the architect. Real-time feedback loops. No generic templates."
            }
          ].map((item, i) => (
            <Card key={i} className="bg-secondary/20 border-border hover:border-primary/50 transition-colors">
              <CardContent className="p-6">
                {item.icon}
                <h3 className="text-xl font-display font-bold mb-2">{item.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{item.desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </Section>

      {/* The Method */}
      <Section id="method">
        <div className="grid md:grid-cols-3 gap-8 relative">
          {/* Connector Line */}
          <div className="hidden md:block absolute top-12 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-primary/30 to-transparent z-0" />

          {[
            {
              step: "01",
              phase: "Stabilize",
              desc: "Stop the bleeding. Fix sleep hygiene. Regulate blood sugar. Establish the baseline."
            },
            {
              step: "02",
              phase: "Clear",
              desc: "Remove the friction. Detoxify the environment. Eliminate energy leaks."
            },
            {
              step: "03",
              phase: "Build",
              desc: "Layer on intensity. Strength acquisition. Metabolic conditioning. Peak output."
            }
          ].map((item, i) => (
            <div key={i} className="relative z-10 bg-card p-8 border border-border rounded-lg">
              <div className="text-6xl font-display font-bold text-background stroke-text text-stroke-primary opacity-20 mb-4">
                {item.step}
              </div>
              <h3 className="text-2xl font-display font-bold mb-4 text-primary">{item.phase}</h3>
              <p className="text-muted-foreground">{item.desc}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* Retreat Details */}
      <Section dark className="bg-black/40">
        <div className="grid md:grid-cols-2 gap-12 items-center">
          <div className="order-2 md:order-1">
             {/* Image: Tropical but rugged terrain */}
            <img 
              src="https://images.unsplash.com/photo-1596395819057-d37f71583d47?auto=format&fit=crop&q=80" 
              alt="Puerto Rico Coastline"
              className="rounded-lg shadow-2xl border border-border/30 opacity-90"
            />
          </div>
          <div className="order-1 md:order-2">
            <Badge className="mb-4 bg-primary/20 text-primary">The Location</Badge>
            <h2 className="text-4xl font-display font-bold mb-6">Puerto Rico<br/>Sanctuary</h2>
            <p className="text-lg text-muted-foreground mb-6">
              We gather where the ocean meets the jungle. A place to unplug from the digital hive mind 
              and plug back into circadian rhythms.
            </p>
            <ul className="space-y-4 mb-8">
              <li className="flex items-center gap-3">
                <Anchor className="h-5 w-5 text-accent" />
                <span>Private Villa Accommodations</span>
              </li>
              <li className="flex items-center gap-3">
                <Activity className="h-5 w-5 text-accent" />
                <span>Daily Training & Breathwork</span>
              </li>
              <li className="flex items-center gap-3">
                <Zap className="h-5 w-5 text-accent" />
                <span>Organic, Local Nutrition</span>
              </li>
            </ul>
          </div>
        </div>
      </Section>

      {/* Pricing */}
      <Section>
        <div className="text-center mb-16">
          <h2 className="text-4xl font-display font-bold mb-4">Investment</h2>
          <p className="text-muted-foreground">Select your commitment level.</p>
        </div>

        <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
          {/* Option A */}
          <Card className="bg-card/30 border-border hover:border-primary/50 transition-all">
            <CardContent className="p-8 flex flex-col h-full">
              <div className="mb-8">
                <h3 className="text-xl font-medium text-muted-foreground mb-2">Quarterly Cycle</h3>
                <div className="text-4xl font-display font-bold">$2,000<span className="text-lg text-muted-foreground font-normal">/qtr</span></div>
              </div>
              <ul className="space-y-4 mb-8 flex-1">
                <li className="flex gap-2 text-sm"><Check className="h-4 w-4 text-primary" /> 90-Day Training Program</li>
                <li className="flex gap-2 text-sm"><Check className="h-4 w-4 text-primary" /> Bi-weekly Group Calls</li>
                <li className="flex gap-2 text-sm"><Check className="h-4 w-4 text-primary" /> Nutrition Protocol</li>
                <li className="flex gap-2 text-sm"><Check className="h-4 w-4 text-primary" /> Private Community Access</li>
              </ul>
              <Button variant="outline" className="w-full" onClick={openApplication}>Apply for Quarterly</Button>
            </CardContent>
          </Card>

          {/* Option B */}
          <Card className="bg-primary/5 border-primary/50 relative overflow-hidden">
            <div className="absolute top-0 right-0 bg-primary text-primary-foreground text-xs font-bold px-3 py-1 rounded-bl">BEST VALUE</div>
            <CardContent className="p-8 flex flex-col h-full">
              <div className="mb-8">
                <h3 className="text-xl font-medium text-primary mb-2">Annual Mastermind</h3>
                <div className="text-4xl font-display font-bold">$5,000<span className="text-lg text-muted-foreground font-normal">/yr</span></div>
                <p className="text-xs text-accent mt-2 font-medium">Save $3,000 compared to quarterly</p>
              </div>
              <ul className="space-y-4 mb-8 flex-1">
                <li className="flex gap-2 text-sm"><Check className="h-4 w-4 text-primary" /> <span className="font-bold text-foreground">Everything in Quarterly</span></li>
                <li className="flex gap-2 text-sm"><Check className="h-4 w-4 text-primary" /> <span className="font-bold text-foreground">Puerto Rico Retreat Included</span></li>
                <li className="flex gap-2 text-sm"><Check className="h-4 w-4 text-primary" /> 1-on-1 Strategy Call / Month</li>
                <li className="flex gap-2 text-sm"><Check className="h-4 w-4 text-primary" /> Priority Support</li>
              </ul>
              <Button className="w-full bg-primary hover:bg-primary/90" onClick={openApplication}>Apply for Annual</Button>
            </CardContent>
          </Card>
        </div>
      </Section>

      {/* FAQ */}
      <Section dark className="py-16">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-3xl font-display font-bold mb-8 text-center">Frequently Asked Questions</h2>
          <Accordion type="single" collapsible className="w-full">
            {[
              { q: "Do I need to be in elite shape to join?", a: "No. You need to be willing to do the work. We scale the physical demands to your baseline, but the mental demand is non-negotiable." },
              { q: "What if I can't make the retreat dates?", a: "For annual members, we can credit the retreat portion to the following year, or offer a virtual equivalent intensive." },
              { q: "Is the nutrition plan strict keto/vegan/carnivore?", a: "We don't do dogmatic diets. We do metabolic flexibility. We eat real food, timed correctly, to support hormonal health." },
              { q: "How much time does this require daily?", a: "Expect 45-60 minutes of physical practice and 15 minutes of planning/logging. If you don't have that time, you don't have a life, you have a cage." }
            ].map((item, i) => (
              <AccordionItem key={i} value={`item-${i}`}>
                <AccordionTrigger className="text-left font-display text-lg hover:text-primary">{item.q}</AccordionTrigger>
                <AccordionContent className="text-muted-foreground leading-relaxed">
                  {item.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </Section>

      {/* Footer */}
      <footer className="border-t border-border/30 bg-background py-12 text-center">
        <div className="container mx-auto px-4">
          <div className="font-display font-bold text-2xl tracking-tighter uppercase mb-6">Sakred Body</div>
          <p className="text-muted-foreground text-sm mb-8 max-w-md mx-auto">
            Optimizing the human vessel for high-capacity output.
            <br/>Copyright © {new Date().getFullYear()}
          </p>
          <div className="flex justify-center gap-6 text-sm text-muted-foreground">
            <a href="#" className="hover:text-primary transition-colors">Privacy Policy</a>
            <a href="#" className="hover:text-primary transition-colors">Terms of Service</a>
            <a href="mailto:contact@sakredbody.com" className="hover:text-primary transition-colors">Contact</a>
          </div>
        </div>
      </footer>

      {/* Modal is rendered at root level */}
      <ApplicationModal 
        open={isModalOpen} 
        onOpenChange={setIsModalOpen} 
      />
    </div>
  );
}
