/**
 * The panel, and the things that go in it.
 *
 * Every screen in the mockups is the same object repeated: a bordered card, a
 * small letterspaced heading in caps, an optional link on the right, then
 * content. Making it one component means the spacing, border weight and
 * heading treatment are decided once instead of drifting across fifteen
 * screens — which is what has already happened to the portal's ad-hoc cards.
 *
 * Kept deliberately thin. It is a frame and a heading, not a layout engine:
 * anything cleverer and screens start fighting it.
 */

import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export function Panel({
  title,
  action,
  onAction,
  children,
  className,
  "data-testid": testId,
  /*
    Forwarded, because a walkthrough anchor written on a component and dropped
    by it is worse than one that was never written: the release gate greps the
    source, finds `data-tour-id="build-today"`, and reports the anchor placed
    while the tour waits forever for an element that does not exist.

    TypeScript does not catch it — unknown hyphenated JSX attributes are
    permitted on components — so the only thing that can catch it is the
    component accepting the prop, or a browser.
  */
  "data-tour-id": tourId,
}: {
  /** Rendered in caps with wide tracking. Pass it in sentence case. */
  title?: string;
  /** Text for the right-hand link. Omit for no link. */
  action?: string;
  onAction?: () => void;
  children: ReactNode;
  className?: string;
  "data-testid"?: string;
  "data-tour-id"?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-xl border border-[hsl(var(--gold))]/12 bg-card/40 p-4 sm:p-5",
        className,
      )}
      data-testid={testId}
      data-tour-id={tourId}
    >
      {(title || action) && (
        <div className="flex items-center justify-between gap-3 mb-4">
          {title && (
            <h3 className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              {title}
            </h3>
          )}
          {action && (
            <button
              onClick={onAction}
              className="flex items-center gap-0.5 text-xs text-gold hover:text-gold-light transition-colors tap-clean shrink-0"
            >
              {action}
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}
      {children}
    </section>
  );
}

/**
 * One number in a box.
 *
 * The value is set in the display serif because that is what makes a figure
 * read as a result rather than as data — it is the same move the mockups make
 * with 86, 7h 12m and 24.5.
 */
export function StatTile({
  label,
  value,
  sub,
  tone = "neutral",
  className,
  "data-testid": testId,
}: {
  label: string;
  value: ReactNode;
  sub?: string;
  /** `up` and `down` colour the sub-line. Neutral leaves it grey. */
  tone?: "neutral" | "up" | "down";
  className?: string;
  "data-testid"?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border border-[hsl(var(--gold))]/10 bg-background/40 px-3 py-2.5",
        className,
      )}
      data-testid={testId}
    >
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground/70 truncate">
        {label}
      </p>
      <p className="font-display text-xl leading-tight mt-0.5">{value}</p>
      {sub && (
        <p
          className={cn(
            "text-[11px] mt-0.5",
            tone === "up" && "text-rise/80",
            tone === "down" && "text-destructive/80",
            tone === "neutral" && "text-muted-foreground",
          )}
        >
          {sub}
        </p>
      )}
    </div>
  );
}

/**
 * The hairline-and-caps heading used above a group of panels.
 *
 * The short gold rule is doing real work: it is the one mark that ties the
 * portal to the marketing pages, which open every section the same way.
 */
export function SectionHeading({
  title,
  subtitle,
  className,
}: {
  title: string;
  subtitle?: string;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="h-px w-8 bg-[hsl(var(--gold))]" />
      <h2 className="font-display text-2xl leading-tight">{title}</h2>
      {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
    </div>
  );
}
