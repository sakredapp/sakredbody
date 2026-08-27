/**
 * The second row of navigation.
 *
 * Two things it fixes over the inline version it replaces:
 *
 * STICKING TO THE RIGHT PLACE. It was `top-16` — 4rem, the header's height.
 * Once the header pays back the notch (`pt-safe`), the header is taller than
 * 4rem on any modern phone, so the sub-nav sat *under* it and the first tab
 * was unreachable. The offset now includes the same inset the header does.
 *
 * SAYING WHEN THERE IS MORE. A row that scrolls with no edge treatment looks
 * like a row that ends. The mask fades the trailing edge only while there is
 * something past it, which is the difference between "there are six of these"
 * and "there are four of these".
 */

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { PORTAL_COLUMN } from "@/lib/layout";

export interface SubNavItem<T extends string> {
  id: T;
  label: string;
  /** Small count shown after the label — requests waiting, unread, and so on. */
  badge?: number | null;
}

export function SubNav<T extends string>({
  items,
  value,
  onChange,
  className,
}: {
  items: SubNavItem<T>[];
  value: T;
  onChange: (id: T) => void;
  className?: string;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const [atEnd, setAtEnd] = useState(true);

  // Whether anything is off the right edge. Recomputed on scroll and on
  // resize, because rotating the phone changes the answer.
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;

    const update = () => {
      const remaining = el.scrollWidth - el.clientWidth - el.scrollLeft;
      setAtEnd(remaining < 8);
    };

    update();
    el.addEventListener("scroll", update, { passive: true });

    const observer = new ResizeObserver(update);
    observer.observe(el);

    return () => {
      el.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, [items.length]);

  // Keep the selected tab in view when it changes from elsewhere — landing on
  // a deep tab shouldn't leave its own label off-screen.
  useEffect(() => {
    const el = scroller.current;
    const active = el?.querySelector<HTMLElement>('[aria-current="page"]');
    active?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [value]);

  return (
    <div
      className={cn(
        "border-b border-border/50 bg-background/80 backdrop-blur-sm sticky",
        // The header is h-16 plus whatever the notch takes. Both terms, or the
        // row hides underneath it.
        "top-[calc(4rem+env(safe-area-inset-top,0px))]",
        className,
      )}
      style={{ zIndex: 9998 }}
    >
      {/* Same column as the header and the panes — see lib/layout.ts. When
          this was 6xl and the pane under it was 3xl, the tabs started an inch
          to the left of the content they switched. */}
      <div className={`${PORTAL_COLUMN} relative`}>
        <div
          ref={scroller}
          className="flex gap-1 overflow-x-auto scrollbar-thin scroll-touch py-1"
          style={{
            maskImage: atEnd
              ? undefined
              : "linear-gradient(to right, black calc(100% - 32px), transparent)",
            WebkitMaskImage: atEnd
              ? undefined
              : "linear-gradient(to right, black calc(100% - 32px), transparent)",
          }}
        >
          {items.map(({ id, label, badge }) => (
            <button
              key={id}
              onClick={() => onChange(id)}
              aria-current={value === id ? "page" : undefined}
              className={cn(
                // 44px min height: Apple asks 44pt, Android 48dp, and the old
                // row was 32.
                "inline-flex items-center gap-1.5 px-3.5 text-sm rounded-md whitespace-nowrap",
                "min-h-[44px] tap-clean transition-colors",
                value === id
                  ? "bg-[hsl(var(--gold))]/15 text-gold font-medium"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
              )}
              data-testid={`subnav-${id}`}
            >
              {label}
              {badge != null && badge > 0 && (
                <span className="text-[10px] rounded-full bg-muted px-1.5 py-0.5 leading-none">
                  {badge}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
