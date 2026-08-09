import { ReactNode } from "react";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";

export interface LegalSection {
  id: string;
  heading: string;
  body: ReactNode;
}

/**
 * The shared frame for the policy pages.
 *
 * Deliberately the plainest thing on the site: no canvas, no parallax, no
 * cards. A privacy policy is read by three audiences — a member deciding
 * whether to trust us, an App Store or Play Store reviewer checking a box, and
 * eventually a lawyer — and all three want a single scrollable column of
 * numbered sections with anchors they can link to. Every ambient flourish
 * elsewhere on this site would be noise here.
 *
 * It still belongs to the same world: ink ground, gilt rules, the display face
 * on headings. Restraint, not a different brand.
 */
export function LegalPage({
  title,
  updated,
  intro,
  sections,
  testId,
}: {
  title: string;
  /** Human-readable effective date. */
  updated: string;
  intro: ReactNode;
  sections: LegalSection[];
  testId?: string;
}) {
  return (
    <div className="min-h-screen bg-background text-foreground font-sans">
      <SiteHeader overHero={false} />

      <main className="tone-ink bg-background pt-32 pb-24">
        <div className="container max-w-3xl mx-auto px-4">
          <header className="mb-12">
            <p className="text-xs uppercase tracking-[0.22em] text-gold mb-4 rule-gold">Legal</p>
            <h1
              className="font-display font-normal text-4xl md:text-5xl leading-[1.05] tracking-[-0.02em] mb-4"
              data-testid={testId}
            >
              {title}
            </h1>
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Effective {updated}
            </p>
            <div className="mt-7 text-muted-foreground leading-relaxed space-y-4">{intro}</div>
          </header>

          {/* Contents. A reviewer looking for one clause shouldn't have to
              read the document to find out whether it's in here. */}
          <nav aria-label="Contents" className="mb-14 border-y border-border/70 py-6">
            <p className="text-[10px] uppercase tracking-[0.2em] text-gold mb-4">Contents</p>
            <ol className="space-y-2 list-none counter-reset">
              {sections.map((s, i) => (
                <li key={s.id} className="text-sm">
                  <a
                    href={`#${s.id}`}
                    className="text-muted-foreground hover:text-gold transition-colors inline-flex gap-3"
                  >
                    <span className="tabular-nums text-gold/60 w-6 shrink-0">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    {s.heading}
                  </a>
                </li>
              ))}
            </ol>
          </nav>

          <div className="space-y-12">
            {sections.map((s, i) => (
              <section key={s.id} id={s.id} className="scroll-mt-28">
                <h2 className="font-display font-normal text-2xl md:text-[1.75rem] leading-snug mb-4">
                  <span className="text-gold/60 tabular-nums mr-3 text-lg">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  {s.heading}
                </h2>
                <div className="text-muted-foreground leading-relaxed space-y-4 [&_a]:text-gold [&_a:hover]:underline [&_strong]:text-foreground [&_strong]:font-normal [&_ul]:space-y-2 [&_ul]:pl-5 [&_li]:list-disc [&_li]:marker:text-gold/50">
                  {s.body}
                </div>
              </section>
            ))}
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
