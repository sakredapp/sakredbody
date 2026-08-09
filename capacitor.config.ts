import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Native shell config for the iOS and Android builds.
 *
 * `webDir` is Vite's `build.outDir` from vite.config.ts — the client is
 * *bundled* into the app, not loaded from the network. That is deliberate:
 * a shell that fetches the live site over `server.url` has no offline mode
 * and reads to App Store review as a repackaged website (guideline 4.2).
 * Bundling means the only thing crossing the network is /api.
 *
 * Consequence to keep in mind: the WebView origin is `https://localhost`
 * (Android) or `capacitor://localhost` (iOS), so every /api call is
 * cross-origin. The server needs CORS with an explicit allowlist, and auth
 * has to travel as a bearer token — the `sameSite: "lax"` session cookie in
 * server/auth/sessionAuth.ts will not be sent cross-site, and WebKit's ITP
 * drops it on iOS regardless.
 */
const config: CapacitorConfig = {
  appId: "com.sakredbody.app",
  appName: "Sakred Body",
  webDir: "dist/public",

  // Matches <meta name="theme-color"> and the manifest's background_color, so
  // the native background behind the WebView doesn't flash white on launch.
  backgroundColor: "#1a1a1a",

  android: {
    // https://localhost rather than the legacy http:// scheme: it makes the
    // WebView a secure context, which the Web Crypto and service-worker APIs
    // both require.
    allowMixedContent: false,
  },

  ios: {
    // The app draws under the status bar (index.html already sets
    // viewport-fit=cover and black-translucent for the PWA case).
    contentInset: "never",
  },

  plugins: {
    SplashScreen: {
      launchShowDuration: 0,
      backgroundColor: "#1a1a1a",
    },
  },
};

export default config;
