/**
 * Security headers.
 *
 * There were none. Not a weakened set — none: no CSP, no frame protection, no
 * nosniff, no HSTS. Concretely that meant the whole app could be loaded in an
 * invisible iframe on someone else's page and clicked through by a member who
 * thought they were clicking something else, and that a single injected
 * script tag anywhere had the entire origin to work with.
 *
 * ── Written by hand rather than with helmet ───────────────────────────────
 *
 * Not because helmet is bad — it is the right default — but because its
 * defaults would have to be half-disabled to let Google Fonts load, and a
 * policy assembled by disabling parts of someone else's is harder to read
 * than eight lines that say what they mean. This is also the only place in
 * the app that needs it, so the dependency would earn nothing.
 *
 * ── The policy, and why each part is loose where it is ────────────────────
 *
 * A CSP that breaks the app gets deleted the first time somebody is in a
 * hurry, so each relaxation below is deliberate and noted:
 *
 *   script-src 'self'          — no inline scripts anywhere. This is the one
 *                                that actually stops XSS, and it is strict.
 *   style-src  'unsafe-inline' — unavoidable. Framer Motion animates by
 *                                writing inline styles on every frame, and
 *                                Radix positions overlays the same way.
 *                                Nonces can't work for styles written by JS
 *                                after load.
 *   fonts.googleapis / gstatic — the two families in client/index.html.
 *   img-src https: blob: data: — member photos come from Supabase storage,
 *                                and the win-card export renders to a blob.
 *   frame-ancestors 'none'     — the clickjacking fix, and the reason
 *                                X-Frame-Options below is belt and braces.
 *   object-src 'none'          — nothing here embeds Flash or PDFs.
 *   form-action 'self'         — a form cannot be repointed at another host.
 *
 * HSTS is set only in production: sending it from a local dev server pins
 * localhost to HTTPS in the developer's browser, which is a genuinely
 * annoying thing to have to undo.
 */

import type { RequestHandler } from "express";

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  "connect-src 'self' https:",
  "media-src 'self' https: blob:",
  // Zoom and any future embedded player get named here when one is actually
  // embedded. Today nothing is, so nothing is allowed.
  "frame-src 'none'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

export const securityHeaders: RequestHandler = (_req, res, next) => {
  res.setHeader("Content-Security-Policy", CSP);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");

  // Nothing in the app asks for any of these, so nothing embedded in it
  // should be able to ask either.
  res.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  );

  if (process.env.NODE_ENV === "production") {
    res.setHeader(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains",
    );
  }

  next();
};
