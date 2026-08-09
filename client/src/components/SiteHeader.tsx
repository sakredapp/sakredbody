import { ReactNode, useEffect, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { Menu, X, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SITE_NAV, type NavEntry } from "@/lib/links";
import sakredLogo from "@assets/full_png_image_sakred__1771268151990.png";

export type { NavEntry as NavItem };

interface SiteHeaderProps {
  /** Defaults to the shared site navigation so every page matches. */
  navItems?: NavEntry[];
  /** Right-hand action rendered after the Member Portal button. */
  cta?: ReactNode;
  /** Start transparent over a dark hero, then solidify on scroll. */
  overHero?: boolean;
}

export function SiteHeader({ navItems = SITE_NAV, cta, overHero = true }: SiteHeaderProps) {
  const [scrolled, setScrolled] = useState(!overHero);
  const [menuOpen, setMenuOpen] = useState(false);
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [location] = useLocation();
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!overHero) return;
    const onScroll = () => setScrolled(window.scrollY > 100);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [overHero]);

  // Close everything on navigation.
  useEffect(() => {
    setMenuOpen(false);
    setOpenGroup(null);
  }, [location]);

  // Close the dropdown on outside click or Escape.
  useEffect(() => {
    if (!openGroup) return;
    const onDown = (e: MouseEvent) => {
      if (navRef.current && !navRef.current.contains(e.target as Node)) setOpenGroup(null);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpenGroup(null);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [openGroup]);

  const solid = scrolled || menuOpen || openGroup !== null;
  const isActive = (href: string) => location === href;
  const linkTone = (active: boolean) => (active ? "text-gold" : "text-white/75");

  return (
    <header className="fixed top-0 left-0 right-0 pointer-events-none" style={{ zIndex: 9999 }}>
      <div className="container max-w-6xl mx-auto px-4 pt-3 sm:pt-4">
        <div
          className={cn(
            // Floating pill: the page shows above it and down both sides, so it
            // reads as an object on the page rather than a bar bolted to the top.
            //
            // At rest over a hero it is nothing at all — no fill, no border, no
            // blur. It used to sit there as a 60%-opaque bordered slab a
            // thousand pixels wide, which over the star field on the homepage
            // read as a hard rule straight across the page above the
            // constellation's head. The pill assembles itself on scroll, when
            // there is content underneath it that it actually needs to sit on.
            "pointer-events-auto rounded-full border transition-all duration-300",
            "h-14 pl-5 pr-3 flex items-center justify-between gap-4",
            solid
              ? "border-white/12 shadow-lg shadow-black/30 backdrop-blur-xl"
              : "border-transparent shadow-none",
          )}
          style={{
            background: solid ? "hsl(30 10% 9% / 0.88)" : "transparent",
          }}
        >
        <Link href="/" className="flex items-center shrink-0" data-testid="link-home">
          <img src={sakredLogo} alt="Sakred Body" className="h-9 w-9 object-contain" />
        </Link>

        <nav ref={navRef} className="hidden lg:flex items-center gap-6">
          {navItems.map((item) =>
            item.children ? (
              <div key={item.label} className="relative">
                <button
                  onClick={() => setOpenGroup((g) => (g === item.label ? null : item.label))}
                  aria-expanded={openGroup === item.label}
                  aria-haspopup="true"
                  className={cn(
                    "text-sm font-sans transition-colors hover:text-gold inline-flex items-center gap-1",
                    linkTone(item.children.some((c) => isActive(c.href))),
                  )}
                  data-testid={`nav-${item.label.toLowerCase().replace(/\s+/g, "-")}`}
                >
                  {item.label}
                  <ChevronDown
                    className={cn(
                      "h-3.5 w-3.5 transition-transform",
                      openGroup === item.label && "rotate-180",
                    )}
                  />
                </button>

                {openGroup === item.label && (
                  <div className="absolute left-1/2 -translate-x-1/2 top-full mt-3 w-72 rounded-lg border border-border bg-popover shadow-lg overflow-hidden">
                    {item.children.map((c) => (
                      <Link
                        key={c.href}
                        href={c.href}
                        className={cn(
                          "block px-5 py-3.5 hover-elevate transition-colors border-b border-border/40 last:border-0",
                          isActive(c.href) && "bg-gold/5",
                        )}
                        data-testid={`nav-${c.href.replace(/\//g, "")}`}
                      >
                        <span className={cn("block text-sm", isActive(c.href) ? "text-gold" : "text-foreground")}>
                          {c.label}
                        </span>
                        {c.note && (
                          <span className="block text-xs text-muted-foreground mt-0.5">{c.note}</span>
                        )}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <Link
                key={item.href}
                href={item.href!}
                className={cn("text-sm font-sans transition-colors hover:text-gold", linkTone(isActive(item.href!)))}
                data-testid={`nav-${item.label.toLowerCase().replace(/\s+/g, "-")}`}
              >
                {item.label}
              </Link>
            ),
          )}
        </nav>

        <div className="flex items-center gap-3">
          <Link href="/member" className="hidden lg:block" data-testid="link-member-portal">
            <Button
              variant="outline"
              size="sm"
              className="rounded-full px-4 transition-colors duration-300 border-white/25 text-white bg-white/5 hover:bg-white/10"
            >
              Member Portal
            </Button>
          </Link>
          {cta}
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="lg:hidden p-2 -mr-2 text-white"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            data-testid="button-mobile-menu"
          >
            {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
        </div>

        {menuOpen && (
          <nav className="tone-ink lg:hidden pointer-events-auto mt-2 rounded-3xl border border-white/12 bg-[hsl(30_10%_9%/0.96)] backdrop-blur-xl max-h-[70vh] overflow-y-auto shadow-lg shadow-black/30">
            <div className="px-5 py-3 flex flex-col">
            <Link
              href="/member"
              className="py-3 text-sm text-gold-light border-b border-white/10"
              data-testid="link-member-portal-mobile"
            >
              Member Portal
            </Link>
            {navItems.map((item) =>
              item.children ? (
                <div key={item.label} className="py-3 border-b border-white/10 last:border-0">
                  <p className="text-xs uppercase tracking-widest text-gold-light mb-2">{item.label}</p>
                  {item.children.map((c) => (
                    <Link
                      key={c.href}
                      href={c.href}
                      className={cn(
                        "block py-2 text-sm",
                        isActive(c.href) ? "text-gold-light" : "text-white/75",
                      )}
                    >
                      {c.label}
                    </Link>
                  ))}
                </div>
              ) : (
                <Link
                  key={item.href}
                  href={item.href!}
                  className={cn(
                    "py-3 text-sm border-b border-white/10 last:border-0",
                    isActive(item.href!) ? "text-gold-light" : "text-white/75",
                  )}
                >
                  {item.label}
                </Link>
              ),
            )}
            </div>
          </nav>
        )}
      </div>
    </header>
  );
}
