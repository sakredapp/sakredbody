/**
 * The little "i".
 *
 * An explanation that is only there when someone asks for it.
 *
 * ── Why this exists ───────────────────────────────────────────────────────
 *
 * The portal explains itself in paragraphs sitting permanently next to things:
 * what a cadence is, what an energy centre reading means, why a protocol has
 * a pause. Read once, they are useful. Read on every visit, they are furniture
 * — and they push the actual content below the fold on a phone.
 *
 * So the rule is: the interface states the thing, and the explanation hides
 * behind an icon. Nobody has to read the manual twice.
 *
 * ── Why a popover and not a tooltip ───────────────────────────────────────
 *
 * A tooltip opens on hover, and a phone has no hover. Radix's tooltip does
 * fall back to long-press, but long-press on iOS also raises the system
 * text-selection menu, so the two fight. A popover opens on tap, on every
 * platform, with one interaction model — and it can hold a sentence with a
 * link in it, which a tooltip should never do.
 */

import type { ReactNode } from "react";
import { Info } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface InfoTipProps {
  /** One or two sentences. If it needs three, it isn't a tip. */
  children: ReactNode;
  /** Optional heading, for when the tip explains a named concept. */
  title?: string;
  /** Announced to screen readers, which never see the icon. */
  label?: string;
  side?: "top" | "right" | "bottom" | "left";
  className?: string;
}

export function InfoTip({
  children,
  title,
  label = "What's this?",
  side = "top",
  className,
}: InfoTipProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={label}
          // The icon is 14px so it sits inside a line of text without shoving
          // it around, but the hit area is 44 — the icon is the sign, not the
          // target.
          className={cn(
            "inline-flex items-center justify-center align-middle",
            "h-11 w-11 -m-3.5 shrink-0 tap-clean",
            "text-muted-foreground/50 hover:text-[hsl(var(--gold))] transition-colors",
            "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[hsl(var(--gold))] rounded-full",
            className,
          )}
          // A tip is an aside. Clicking it should never submit the form it
          // happens to be sitting in.
          onClick={(e) => e.preventDefault()}
          data-testid="info-tip"
        >
          <Info className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>

      <PopoverContent
        side={side}
        align="center"
        // Narrow on purpose: a wide tip invites paragraphs, and this is the
        // component that exists to stop paragraphs.
        className="w-64 text-sm leading-relaxed"
        collisionPadding={12}
      >
        {title && <p className="font-medium mb-1">{title}</p>}
        <div className="text-muted-foreground">{children}</div>
      </PopoverContent>
    </Popover>
  );
}

/**
 * A label with its explanation attached.
 *
 * The common case, and worth having so the spacing between a label and its
 * icon is decided once rather than in forty places.
 */
export function LabelWithInfo({
  label,
  children,
  className,
  ...rest
}: InfoTipProps & { label: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      {label}
      <InfoTip label={`About ${label}`} {...rest}>
        {children}
      </InfoTip>
    </span>
  );
}
