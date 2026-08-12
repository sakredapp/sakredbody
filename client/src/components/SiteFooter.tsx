import { Link } from "wouter";
import { Download, Smartphone, type LucideIcon } from "lucide-react";
import { YinYang } from "@/components/YinYang";
import {
  LEGAL_LINKS,
  APP_STORE_URL,
  PLAY_STORE_URL,
  SAKRED_HEALTH_URL,
} from "@/lib/links";

/** The four territories, in sequence. */
const PATH_LINKS = [
  { label: "Restore", href: "/restore" },
  { label: "Build", href: "/build" },
  { label: "Gather — Retreats", href: "/retreats" },
];

/** Worldview pages. */
const PHILOSOPHY_LINKS = [
  { label: "What Is a Sakred Body?", href: "/philosophy" },
  { label: "The Terrain", href: "/the-terrain" },
  { label: "Body Literacy", href: "/body-literacy" },
];

/** Product + tools. */
const EXPLORE_LINKS = [
  { label: "Portal", href: "/member" },
  { label: "Food Chart", href: "/food-chart" },
  { label: "Sakred Executive", href: "/executive" },
  { label: "Mastermind", href: "/mastermind" },
  { label: "Member Portal", href: "/member" },
  { label: "Sign In", href: "/login" },
];

/** Genuinely external — the insurance side of the business. */
const HEALTH_LINKS = [
  { label: "Insurance & Coverage", href: SAKRED_HEALTH_URL },
  { label: "Get a Quote", href: `${SAKRED_HEALTH_URL}/get-coverage` },
  { label: "About Sakred Health", href: `${SAKRED_HEALTH_URL}/about` },
  { label: "Research & Blog", href: `${SAKRED_HEALTH_URL}/blog` },
];

/**
 * A store button, or the placeholder standing in for one until that store
 * approves the app.
 *
 * The placeholder is a `<span>`, not an `<a>` without an href. A bare anchor
 * still announces as a link to a screen reader and still takes focus, which
 * promises a destination that does not exist yet — and the whole reason this
 * component exists is that we stopped promising the wrong destination.
 *
 * The two stores approve independently, so the pending state is per badge
 * rather than one banner over both.
 */
function StoreBadge({
  href,
  icon: Icon,
  label,
  testId,
}: {
  href: string | null;
  icon: LucideIcon;
  label: string;
  testId: string;
}) {
  const shape = "inline-flex items-center gap-2 px-4 py-2 rounded-md border text-xs transition-colors";

  if (!href) {
    return (
      <span className={`${shape} border-border text-muted-foreground`} data-testid={testId}>
        <Icon className="h-4 w-4" /> {label} · soon
      </span>
    );
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`${shape} border-gold/30 text-gold hover-elevate`}
      data-testid={testId}
    >
      <Icon className="h-4 w-4" /> {label}
    </a>
  );
}

export function SiteFooter() {
  return (
    /* The margin is the gap the eye actually reads, because the border-t is
       where the footer visually begins — padding only moves the columns down
       behind that line.

       This margin is only safe because the page wrappers now carry `tone-ink`.
       They used to be plain `bg-background`, which resolves against :root —
       the *light* palette — so a margin here painted a cream band across the
       bottom of every page. */
    <footer className="tone-ink bg-background border-t border-border mt-20 md:mt-28 pt-16 pb-10">
      <div className="container max-w-6xl mx-auto px-4">
        <div className="grid gap-12 md:grid-cols-2 lg:grid-cols-6 mb-14">
          {/* Brand */}
          <div className="lg:col-span-2">
            <Link href="/" className="flex items-center gap-3 mb-4 w-fit">
              <YinYang className="h-6 w-6 text-gold" voidColor="hsl(var(--ink))" />
              <span className="font-display text-2xl tracking-tight">Sakred Body</span>
            </Link>
            <p className="text-sm text-muted-foreground leading-relaxed max-w-sm mb-6">
              Traditional principles, modern strength. Guided protocols, daily practice, and in-person
              retreats for people who want to live in harmony with their environment without giving up
              their edge.
            </p>
            <div className="flex flex-wrap gap-3">
              <StoreBadge
                href={APP_STORE_URL}
                icon={Download}
                label="iOS"
                testId="footer-app-store"
              />
              <StoreBadge
                href={PLAY_STORE_URL}
                icon={Smartphone}
                label="Android"
                testId="footer-play-store"
              />
            </div>
          </div>

          <FooterColumn title="The Path">
            {PATH_LINKS.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="hover:text-gold transition-colors">
                  {l.label}
                </Link>
              </li>
            ))}
          </FooterColumn>

          <FooterColumn title="Philosophy">
            {PHILOSOPHY_LINKS.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="hover:text-gold transition-colors">
                  {l.label}
                </Link>
              </li>
            ))}
          </FooterColumn>

          <FooterColumn title="Explore">
            {EXPLORE_LINKS.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="hover:text-gold transition-colors">
                  {l.label}
                </Link>
              </li>
            ))}
            <li>
              <a href="mailto:contact@sakredbody.com" className="hover:text-gold transition-colors">
                Contact
              </a>
            </li>
          </FooterColumn>

          <FooterColumn title="Sakred Health">
            {HEALTH_LINKS.map((l) => (
              <li key={l.href}>
                <a
                  href={l.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-gold transition-colors"
                >
                  {l.label}
                </a>
              </li>
            ))}
          </FooterColumn>
        </div>

        <div className="border-t border-border pt-8 space-y-5">
          <p className="text-xs text-muted-foreground leading-relaxed max-w-3xl">
            Sakred Body is an education and coaching company. We do not diagnose, treat, cure, or prescribe.
            Nothing here is medical advice. Traditional practices are presented as philosophy and lifestyle
            framework, not as a replacement for care from a qualified provider. Talk to your doctor before
            changing your health regimen — especially if you are pregnant, taking medication, or managing a
            diagnosed condition.
          </p>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 text-xs text-muted-foreground">
            <span>Copyright {new Date().getFullYear()} Sakred Body. All rights reserved.</span>
            <div className="flex flex-wrap gap-x-6 gap-y-2">
              {/* Privacy and Terms live on this site now, so they route
                  in-app rather than opening a tab. The remaining entries still
                  point at sakredhealth.com and keep the external treatment. */}
              {LEGAL_LINKS.map((l) => {
                const testId = `link-${l.label.toLowerCase().replace(/\s+/g, "-")}`;
                const className = "hover:text-gold transition-colors";
                return l.href.startsWith("/") ? (
                  <Link key={l.href} href={l.href} className={className} data-testid={testId}>
                    {l.label}
                  </Link>
                ) : (
                  <a
                    key={l.href}
                    href={l.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={className}
                    data-testid={testId}
                  >
                    {l.label}
                  </a>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs uppercase tracking-widest text-gold mb-4 font-sans">{title}</h3>
      <ul className="space-y-2.5 text-sm text-muted-foreground">{children}</ul>
    </div>
  );
}
