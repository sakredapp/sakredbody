import { Capacitor } from "@capacitor/core";
import { createRoot } from "react-dom/client";
import App from "./App";
import { applyInkSurfaceAtBoot } from "./lib/inkSurface";
import { installNativeApiFetch } from "./lib/apiFetch";
import "./index.css";

// Before render, and before anything can issue a request: in the native
// shells the bundled client is served from localhost, so an unpatched
// `fetch("/api/...")` resolves to the device rather than the server. No-op on
// the web.
installNativeApiFetch();

// Before render, not inside it. The portal pages are lazy chunks, so a
// fallback paints before they mount — and without this it paints in the light
// palette, flashing cream over the whole screen on every cold load of /member.
applyInkSurfaceAtBoot();

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
