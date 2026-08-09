import { Capacitor } from "@capacitor/core";

/**
 * Where /api actually lives.
 *
 * On the web this is the empty string: the client is served from the same
 * origin as the Express function, so a relative `/api/...` already resolves
 * correctly and nothing changes.
 *
 * In the native shells it cannot be. Capacitor bundles the built client into
 * the app and serves it from `https://localhost` (Android) or
 * `capacitor://localhost` (iOS), so a relative `/api/...` resolves against
 * *the device*, not the server, and every request 404s against a WebView that
 * has no backend behind it. Native builds need an absolute origin.
 *
 * Two consequences that follow from this and are handled elsewhere:
 *   - Requests from the app are cross-origin, so the server needs CORS with an
 *     allowlist for `capacitor://localhost` and `https://localhost`.
 *   - The `sameSite: "lax"` session cookie will not ride along cross-site, and
 *     WebKit drops it on iOS regardless — native auth has to be a bearer token.
 *
 * VITE_API_ORIGIN overrides the default so a device build can be pointed at a
 * Vercel preview deployment instead of production.
 */
const NATIVE_API_ORIGIN =
  import.meta.env.VITE_API_ORIGIN ?? "https://sakredbody.com";

export const apiOrigin = Capacitor.isNativePlatform() ? NATIVE_API_ORIGIN : "";

/**
 * Resolve an app-relative path to a fetchable URL.
 *
 * Absolute URLs pass through untouched, so callers that already point at a
 * third party (or at sakredhealth.com for the legal pages) are unaffected.
 */
export function apiUrl(path: string): string {
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(path)) return path;
  return `${apiOrigin}${path.startsWith("/") ? path : `/${path}`}`;
}
