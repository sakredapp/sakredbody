import { Link } from "wouter";
import { YinYang } from "@/components/YinYang";
import { LEGAL_LINKS } from "@/lib/links";

export function SiteFooter() {
  return (
    <footer className="bg-ink text-ink-foreground border-t border-ink-line py-14">
      <div className="container max-w-6xl mx-auto px-4">
        <div className="grid gap-10 md:grid-cols-4 mb-12">
          <div className="md:col-span-2">
            <div className="flex items-center gap-3 mb-4">
              <YinYang className="h-6 w-6 text-gold" voidColor="hsl(var(--ink))" />
              <span className="font-display text-2xl tracking-tight">Sakred Body</span>
            </div>
            <p className="text-sm text-ink-foreground/55 leading-relaxed max-w-sm">
              Traditional principles, modern strength. Guided protocols, daily practice, and in-person
              retreats for people who want to live in harmony with their environment without giving up
              their edge.
            </p>
          </div>

          <div>
            <h3 className="text-xs uppercase tracking-widest text-gold mb-4 font-sans">Explore</h3>
            <ul className="space-y-2.5 text-sm text-ink-foreground/55">
              {/* Absolute so these also work from /mastermind, where the sections don't exist. */}
              <li><a href="/#duality" className="hover:text-gold transition-colors">The Duality</a></li>
              <li><a href="/#principles" className="hover:text-gold transition-colors">Principles</a></li>
              <li><a href="/#elements" className="hover:text-gold transition-colors">Five Elements</a></li>
              <li><a href="/#app" className="hover:text-gold transition-colors">The App</a></li>
              <li><Link href="/mastermind" className="hover:text-gold transition-colors">Mastermind + Retreats</Link></li>
            </ul>
          </div>

          <div>
            <h3 className="text-xs uppercase tracking-widest text-gold mb-4 font-sans">Sakred Health</h3>
            <ul className="space-y-2.5 text-sm text-ink-foreground/55">
              <li><a href="https://www.sakredhealth.com" className="hover:text-gold transition-colors">Insurance &amp; Coverage</a></li>
              <li><a href="https://www.sakredhealth.com/food-chart" className="hover:text-gold transition-colors">Food Chart</a></li>
              <li><a href="https://www.sakredhealth.com/about" className="hover:text-gold transition-colors">About</a></li>
              <li><Link href="/member" className="hover:text-gold transition-colors">Member Portal</Link></li>
              <li><a href="mailto:contact@sakredbody.com" className="hover:text-gold transition-colors">Contact</a></li>
            </ul>
          </div>
        </div>

        <div className="border-t border-ink-line pt-8 space-y-4">
          <p className="text-xs text-ink-foreground/40 leading-relaxed max-w-3xl">
            Sakred Body is an education and coaching company. We do not diagnose, treat, cure, or prescribe.
            Nothing here is medical advice. Traditional practices are presented as philosophy and lifestyle
            framework, not as a replacement for care from a qualified provider. Talk to your doctor before
            changing your health regimen — especially if you are pregnant, taking medication, or managing a
            diagnosed condition.
          </p>
          <div className="flex flex-wrap justify-between gap-4 text-xs text-ink-foreground/40">
            <span>Copyright {new Date().getFullYear()} Sakred Body. All rights reserved.</span>
            <div className="flex flex-wrap gap-x-6 gap-y-2">
              {LEGAL_LINKS.map((l) => (
                <a
                  key={l.href}
                  href={l.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-gold transition-colors"
                  data-testid={`link-${l.label.toLowerCase().replace(/\s+/g, "-")}`}
                >
                  {l.label}
                </a>
              ))}
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
