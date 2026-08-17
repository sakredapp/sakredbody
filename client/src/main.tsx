import { Capacitor } from "@capacitor/core";
import { createRoot } from "react-dom/client";
import App from "./App";
import { applyInkSurfaceAtBoot, isPortalPath } from "./lib/inkSurface";
import { installNativeApiFetch } from "./lib/apiFetch";
import "./index.css";

// Before render, and before anything can issue a request: in the native
// shells the bundled client is served from localhost, so an unpatched
// `fetch("/api/...")` resolves to the device rather than the server. No-op on
// the web.
installNativeApiFetch();

// Before render, not inside it. The portal pages are lazy chunks, so a
// fallback paints before they mount — and without this it paints in whichever
// palette the stylesheet happens to default to, flashing a full screen of the
// wrong atmosphere on every cold load of /member. Both attributes are set
// here: the surface from the URL, the theme from a synchronous read of the
// stored preference.
applyInkSurfaceAtBoot();

/**
 * Recover an appearance that outlived its web storage.
 *
 * `localStorage` in a WebView is not permanent — iOS evicts it under storage
 * pressure and "Clear website data" removes it — so the preference is mirrored
 * into Capacitor Preferences on every change. This reads that mirror back, and
 * only when nothing is stored locally: there is no preference on screen to
 * contradict in that case, so adopting a late answer cannot be a visible
 * change of mind. Reading it unconditionally would resolve the theme twice on
 * every cold launch, with the second answer arriving after the first paint —
 * which is the flash this whole arrangement exists to avoid.
 */
if (Capacitor.isNativePlatform()) {
  void import("./lib/appearance").then((m) =>
    m.hydrateFromNative(() => isPortalPath(window.location.pathname)),
  );
}

/**
 * Before render, because a cold start caused by a tap delivers that tap as soon
 * as something is listening — and the launch that came from a notification is
 * exactly the one that must not land on the default screen.
 *
 * Native only, and lazily imported so the messaging plugin stays out of the web
 * bundle. Recording a destination needs no permission and no session: it writes
 * down where to go, and the screen it names does its own authorization.
 */
if (Capacitor.isNativePlatform()) {
  void import("./lib/nativeNotifications").then((m) => m.installNotificationTapRouting());
}

createRoot(document.getElementById("root")!).render(<App />);
