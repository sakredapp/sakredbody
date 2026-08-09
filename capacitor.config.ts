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

  // `--ink` from client/src/index.css — hsl(30 10% 10%) — and the same value
  // as <meta name="theme-color">, the manifest's background_color, Android's
  // @color/sakredInk and the iOS launch storyboard. Five places, one colour,
  // because they all paint the same few hundred milliseconds of launch and
  // any one of them being different is a visible flash.
  //
  // It was #1a1a1a: a neutral grey, close enough to look deliberate and wrong
  // in a way that reads as cheap — the app's ink is warm, and a cold grey
  // sliding into a warm one at launch is the seam you notice without being
  // able to name.
  backgroundColor: "#1C1A17",

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
      backgroundColor: "#1C1A17",
    },
  },
};

export default config;
