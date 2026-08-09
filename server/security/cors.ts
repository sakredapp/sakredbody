/**
 * Cross-origin access for the native shells.
 *
 * The web app has never needed this: the client and the Express function are
 * served from the same origin, so nothing was ever cross-origin and the
 * absence of CORS headers cost nothing.
 *
 * The iOS and Android builds change that. Capacitor bundles the built client
 * into the app and serves it from `https://localhost` (Android) or
 * `capacitor://localhost` (iOS). Every /api call from the app is therefore
 * cross-origin, and a browser blocks the *response* when no
 * Access-Control-Allow-Origin comes back — the request reaches the server and
 * succeeds, the WebView just refuses to hand the result to the JavaScript.
 * That failure looks like a network error in the app and like a 200 in the
 * logs, which is exactly how it survives to production.
 *
 * ── Written by hand, like headers.ts ──────────────────────────────────────
 *
 * The `cors` package would be four lines of config, but it also reflects the
 * request origin by default when you pass `credentials: true`, and that
 * default is the one thing that must not happen here. Spelling it out keeps
 * the allowlist visible.
 *
 * ── Why the allowlist is exact and never a wildcard ───────────────────────
 *
 * `Access-Control-Allow-Origin: *` is incompatible with credentials, and the
 * common workaround — echo whatever Origin arrived — turns every member's
 * browser into a proxy for any site they visit. Origins are matched against a
 * fixed set and echoed only on a hit.
 */

import type { RequestHandler } from "express";

/**
 * The three origins the client can legitimately be served from.
 *
 * `capacitor://` and `https://localhost` are not ours in any meaningful
 * sense — any Capacitor app on the device presents the same Origin, so these
 * two entries are a statement that the API is reachable from a native shell,
 * not proof of which one. That is acceptable because they buy no authority on
 * their own: a request still needs a bearer token or a session, and neither
 * is obtainable by knowing the origin string.
 */
const ALLOWED_ORIGINS = new Set([
  "https://sakredbody.com",
  "https://www.sakredbody.com",
  "capacitor://localhost", // iOS WKWebView
  "https://localhost", // Android WebView
]);

/** Vite's dev server, allowed only outside production. */
const DEV_ORIGIN_PATTERN = /^http:\/\/localhost:\d+$/;

function isAllowed(origin: string): boolean {
  if (ALLOWED_ORIGINS.has(origin)) return true;
  if (process.env.NODE_ENV !== "production" && DEV_ORIGIN_PATTERN.test(origin)) {
    return true;
  }
  return false;
}

export const cors: RequestHandler = (req, res, next) => {
  const origin = req.headers.origin;

  // Same-origin requests send no Origin header at all. Nothing to do, and
  // emitting the headers anyway would only add noise to every page response.
  if (!origin) return next();

  if (!isAllowed(origin)) {
    // Deliberately not a 403. Refusing the *request* would break same-origin
    // form posts that happen to carry an Origin, and tells a prober that the
    // endpoint exists. Omitting the header is what actually blocks the read,
    // and it is the browser that enforces it.
    return next();
  }

  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Credentials", "true");

  // Without this, a CDN or proxy can cache the response for one origin and
  // serve it to another — the header is per-origin by construction.
  res.setHeader("Vary", "Origin");

  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
    // Authorization is the one that matters: it is not a CORS-safelisted
    // header, so without naming it here every authenticated native request
    // fails its preflight.
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, X-Client-Platform"
    );
    res.setHeader("Access-Control-Max-Age", "86400");
    return res.sendStatus(204);
  }

  next();
};
