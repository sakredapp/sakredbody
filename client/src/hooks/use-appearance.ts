/**
 * The appearance preference, as something React can render.
 *
 * The preference itself deliberately lives outside React — it has to be
 * readable synchronously before the first paint, which is a thing a component
 * cannot do. This is the other end of that: a subscription, so a control can
 * show the current value and stay correct when it changes somewhere else.
 *
 * "Somewhere else" is not hypothetical. The same preference can be changed by
 * the native mirror arriving after a data clear, and on `system` it is
 * effectively changed by the phone crossing into night mode while Settings is
 * open. Both of those have to move the selected pill without a reload.
 */

import { useCallback, useEffect, useState } from "react";
import {
  type Appearance,
  appearance,
  prefersDark,
  resolveAppearance,
  setAppearance,
  subscribeAppearance,
} from "@/lib/appearance";
import { isPortalPath } from "@/lib/inkSurface";

export function useAppearance() {
  const [preference, setPreference] = useState<Appearance>(() => appearance());
  const [systemDark, setSystemDark] = useState<boolean>(() => prefersDark());

  useEffect(() => subscribeAppearance(setPreference), []);

  /*
    Watched separately from `watchSystemAppearance`, which repaints the
    document and notifies only when the preference is `system`. This one runs
    regardless, because the label under the System option names what the phone
    is doing right now — and that stays true whether or not we are following it.
  */
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setSystemDark(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const choose = useCallback((next: Appearance) => {
    setAppearance(next, isPortalPath(window.location.pathname));
  }, []);

  return {
    preference,
    resolved: resolveAppearance(preference, systemDark),
    systemDark,
    choose,
  };
}
