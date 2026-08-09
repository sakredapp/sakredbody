import { createRoot } from "react-dom/client";
import App from "./App";
import { applyInkSurfaceAtBoot } from "./lib/inkSurface";
import "./index.css";

// Before render, not inside it. The portal pages are lazy chunks, so a
// fallback paints before they mount — and without this it paints in the light
// palette, flashing cream over the whole screen on every cold load of /member.
applyInkSurfaceAtBoot();

createRoot(document.getElementById("root")!).render(<App />);
