import { useEffect, useState } from "react";

/**
 * Whether the visitor has asked for reduced motion.
 *
 * The canvases each read the media query themselves inside `mountStage`,
 * because a draw loop needs the answer before React has rendered anything.
 * This is for the other half of the problem: copy and markup that would
 * otherwise describe motion that is not going to happen. A line promising a
 * diagram will "move on its own" is a small lie to exactly the person who
 * turned that off.
 *
 * Subscribed rather than read once. The setting can change while the page is
 * open — macOS "Reduce motion" flips live, and so does the OS-level switch on
 * a phone.
 */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return reduced;
}
