import { Suspense, useEffect } from "react";
import { Switch, Route, Redirect } from "wouter";
import { Capacitor } from "@capacitor/core";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ScrollToTop } from "@/components/ScrollToTop";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { lazyRoute, clearChunkReloadGuards } from "@/lib/lazyRoute";
import Home from "@/pages/Home";
const Philosophy = lazyRoute("Philosophy", () => import("@/pages/Philosophy"));
const Restore = lazyRoute("Restore", () => import("@/pages/Restore"));
const Build = lazyRoute("Build", () => import("@/pages/Build"));
const Embody = lazyRoute("Embody", () => import("@/pages/Embody"));
const Terrain = lazyRoute("Terrain", () => import("@/pages/Terrain"));
const BodyLiteracy = lazyRoute("BodyLiteracy", () => import("@/pages/BodyLiteracy"));
const Retreats = lazyRoute("Retreats", () => import("@/pages/Retreats"));
const Executive = lazyRoute("Executive", () => import("@/pages/Executive"));
const FoodChart = lazyRoute("FoodChart", () => import("@/pages/FoodChart"));
const Mastermind = lazyRoute("Mastermind", () => import("@/pages/Mastermind"));
const LoginPage = lazyRoute("LoginPage", () => import("@/pages/LoginPage"));
const ResetPasswordPage = lazyRoute("ResetPasswordPage", () => import("@/pages/ResetPasswordPage"));
const MemberDashboard = lazyRoute("MemberDashboard", () => import("@/pages/MemberDashboard"));
const AdminPortal = lazyRoute("AdminPortal", () => import("@/pages/AdminPortal"));
const Privacy = lazyRoute("Privacy", () => import("@/pages/Privacy"));
const Terms = lazyRoute("Terms", () => import("@/pages/Terms"));
const DeleteAccount = lazyRoute("DeleteAccount", () => import("@/pages/DeleteAccount"));
const Support = lazyRoute("Support", () => import("@/pages/Support"));
const NotFound = lazyRoute("NotFound", () => import("@/pages/not-found"));

/**
 * app.sakredbody.com and sakredbody.com are one deployment.
 *
 * The portal and the marketing site share a build, a session cookie and a
 * router; only the front door differs. On the app host the root is the
 * portal, because someone typing app.sakredbody.com is not arriving to read
 * about the philosophy. Every other path resolves the same on both hosts, so
 * a link shared from either one still works.
 */
/**
 * ── And the native shells are app hosts too ──────────────────────────────
 *
 * This check used to be the hostname alone, and that is why the iOS and
 * Android apps opened on the marketing landing page. The web bundle is
 * *inside* the app — it is not fetched from sakredbody.com — so the shells
 * serve it from `capacitor://localhost` (iOS) and `https://localhost`
 * (Android). Neither hostname starts with "app.", so both apps fell through
 * to `<Home />` and someone who had just installed a members-only app was
 * shown the page that tries to sell it to them.
 *
 * Nothing about it looked broken from the web, which is the whole problem:
 * the hostname rule is correct for the two real domains and silently wrong
 * for the only two clients that don't have one.
 */
const isNativeShell = Capacitor.isNativePlatform();

const isAppHost =
  isNativeShell ||
  (typeof window !== "undefined" && window.location.hostname.startsWith("app."));

/**
 * Every marketing page, in one list.
 *
 * Listed rather than written out as routes so that "is this page part of the
 * website?" has exactly one answer, and so the native shells can turn all of
 * them off in a single place. A page added here is automatically excluded
 * from the app; a page added as its own `<Route>` below is not, which is the
 * mistake this list exists to prevent.
 */
const MARKETING_PATHS: [string, React.ComponentType][] = [
  ["/philosophy", Philosophy],
  ["/restore", Restore],
  ["/build", Build],
  ["/embody", Embody],
  ["/the-terrain", Terrain],
  ["/body-literacy", BodyLiteracy],
  ["/retreats", Retreats],
  ["/executive", Executive],
  ["/food-chart", FoodChart],
  ["/mastermind", Mastermind],
];

function Router() {
  return (
    <Switch>
      {/* Marketing.
          None of it is routed in the native shells. The app is the portal,
          not a wrapper around the website — and a native build that can
          navigate to a landing page with a "Book a call" button is the
          textbook shape of an App Store 4.2 rejection ("minimum
          functionality / repackaged website"). It is also just wrong: the
          person holding the app has already bought.

          `isAppHost` covers native and the app.* hostname both. Every
          marketing path resolves to the portal there rather than 404ing,
          so an old link in an email still lands somewhere sensible. */}
      <Route path="/">{() => (isAppHost ? <Redirect to="/member" /> : <Home />)}</Route>
      {MARKETING_PATHS.map(([path, Page]) => (
        <Route key={path} path={path}>
          {() => (isAppHost ? <Redirect to="/member" /> : <Page />)}
        </Route>
      ))}
      {/* The app and the portal are the same product. Old /app links land there. */}
      <Route path="/app">{() => <Redirect to="/member" />}</Route>

      {/* Legal. /privacy and /terms are the canonical URLs — both app
          stores want a policy at a stable public address, and these are the
          ones registered with them. The longer spellings are kept as
          redirects because they are what the old footer linked to. */}
      <Route path="/privacy" component={Privacy} />
      <Route path="/privacy-policy">{() => <Redirect to="/privacy" />}</Route>
      <Route path="/terms" component={Terms} />
      <Route path="/terms-of-service">{() => <Redirect to="/terms" />}</Route>
      {/* Play requires this at a public URL, reachable without signing in. */}
      <Route path="/delete-account" component={DeleteAccount} />
      <Route path="/delete-my-account">{() => <Redirect to="/delete-account" />}</Route>
      {/* Both stores require a support URL, and both open it signed out. */}
      <Route path="/support" component={Support} />
      <Route path="/help">{() => <Redirect to="/support" />}</Route>
      <Route path="/contact">{() => <Redirect to="/support" />}</Route>

      {/* Members + admin */}
      <Route path="/login" component={LoginPage} />
      {/* Reached from an emailed link, so it must resolve on both hosts and
          while signed out. Above the auth'd routes for that reason. */}
      <Route path="/reset-password" component={ResetPasswordPage} />
      <Route path="/member" component={MemberDashboard} />
      <Route path="/coaching" component={MemberDashboard} />
      <Route path="/admin" component={AdminPortal} />
      <Route path="/admin/coaching" component={AdminPortal} />
      <Route path="/admin/masterclass" component={AdminPortal} />

      <Route component={NotFound} />
    </Switch>
  );
}

/** Held for the split-out routes. Ink, so it never flashes white. */
function RouteFallback() {
  return <div className="min-h-screen bg-background" aria-busy="true" />;
}

function App() {
  useEffect(clearChunkReloadGuards, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <ScrollToTop />
        {/*
          Inside Suspense rather than outside it, so a route that fails to
          load is caught too — and inside the providers, so the error screen
          can use the same buttons and toasts as everything else.
        */}
        <Suspense fallback={<RouteFallback />}>
          <ErrorBoundary>
            <Router />
          </ErrorBoundary>
        </Suspense>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
