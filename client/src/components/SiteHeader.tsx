import { ReactNode, useEffect, useState } from "react";
import { Link } from "wouter";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SITE_NAV } from "@/lib/links";
import sakredLogo from "@assets/full_png_image_sakred__1771268151990.png";

export interface NavItem {
  label: string;
  /** "#section-id" scrolls on the current page; anything else routes. */
  href: string;
}

interface SiteHeaderProps {
  /** Defaults to the shared site navigation so every page matches. */
  navItems?: NavItem[];
  /** Right-hand action rendered after the Member Portal button. */
  cta?: ReactNode;
  /** Start transparent over a dark hero, then solidify on scroll. */
  overHero?: boolean;
}

export function SiteHeader({ navItems = [...SITE_NAV], cta, overHero = true }: SiteHeaderProps) {
  const [scrolled, setScrolled] = useState(!overHero);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!overHero) return;
    const onScroll = () => setScrolled(window.scrollY > 100);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [overHero]);

  const solid = scrolled || menuOpen;

  const handleNavClick = (href: string) => {
    setMenuOpen(false);
    if (href.startsWith("#")) {
      document.getElementById(href.slice(1))?.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <header
      className={cn(
        "fixed top-0 left-0 right-0 transition-all duration-300",
        solid
          ? "bg-background/95 backdrop-blur-md border-b border-border/50"
          : "bg-gradient-to-b from-black/50 to-transparent",
      )}
      style={{ zIndex: 9999 }}
    >
      <div className="container max-w-6xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
        <Link href="/" className="flex items-center shrink-0" data-testid="link-home">
          <img src={sakredLogo} alt="Sakred Body" className="h-10 w-10 object-contain" />
        </Link>

        <nav className="hidden md:flex items-center gap-7">
          {navItems.map((item) =>
            item.href.startsWith("#") ? (
              <button
                key={item.href}
                onClick={() => handleNavClick(item.href)}
                className={cn(
                  "text-sm font-sans transition-colors hover:text-gold",
                  solid ? "text-muted-foreground" : "text-white/75",
                )}
                data-testid={`nav-${item.label.toLowerCase().replace(/\s+/g, "-")}`}
              >
                {item.label}
              </button>
            ) : (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "text-sm font-sans transition-colors hover:text-gold",
                  solid ? "text-muted-foreground" : "text-white/75",
                )}
                data-testid={`nav-${item.label.toLowerCase().replace(/\s+/g, "-")}`}
              >
                {item.label}
              </Link>
            ),
          )}
        </nav>

        <div className="flex items-center gap-3">
          <Link href="/member" data-testid="link-member-portal">
            <Button
              variant="outline"
              size="sm"
              className={cn("transition-colors duration-300", !solid && "border-white/25 text-white bg-white/5")}
            >
              Member Portal
            </Button>
          </Link>
          {cta}
          {navItems.length > 0 && (
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className={cn("md:hidden p-2 -mr-2", solid ? "text-foreground" : "text-white")}
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              aria-expanded={menuOpen}
              data-testid="button-mobile-menu"
            >
              {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          )}
        </div>
      </div>

      {menuOpen && navItems.length > 0 && (
        <nav className="md:hidden border-t border-border/50 bg-background/95 backdrop-blur-md">
          <div className="container max-w-6xl mx-auto px-4 py-3 flex flex-col">
            {navItems.map((item) =>
              item.href.startsWith("#") ? (
                <button
                  key={item.href}
                  onClick={() => handleNavClick(item.href)}
                  className="py-3 text-left text-sm text-muted-foreground border-b border-border/30 last:border-0"
                >
                  {item.label}
                </button>
              ) : (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMenuOpen(false)}
                  className="py-3 text-sm text-muted-foreground border-b border-border/30 last:border-0"
                >
                  {item.label}
                </Link>
              ),
            )}
          </div>
        </nav>
      )}
    </header>
  );
}
