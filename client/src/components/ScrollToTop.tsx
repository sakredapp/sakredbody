import { useEffect } from "react";
import { useLocation } from "wouter";

/**
 * wouter doesn't reset scroll position between routes, so navigating from
 * halfway down one page lands you halfway down the next. Anchors (#section)
 * are left alone so in-page links still work.
 */
export function ScrollToTop() {
  const [location] = useLocation();

  useEffect(() => {
    if (window.location.hash) return;
    window.scrollTo(0, 0);
  }, [location]);

  return null;
}
