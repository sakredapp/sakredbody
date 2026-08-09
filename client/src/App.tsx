import { Suspense, useEffect } from "react";
import { Switch, Route, Redirect } from "wouter";
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
const MemberDashboard = lazyRoute("MemberDashboard", () => import("@/pages/MemberDashboard"));
const AdminPortal = lazyRoute("AdminPortal", () => import("@/pages/AdminPortal"));
const Privacy = lazyRoute("Privacy", () => import("@/pages/Privacy"));
const Terms = lazyRoute("Terms", () => import("@/pages/Terms"));
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
const isAppHost =
  typeof window !== "undefined" && window.location.hostname.startsWith("app.");

function Router() {
  return (
    <Switch>
      {/* Marketing */}
      <Route path="/">{() => (isAppHost ? <Redirect to="/member" /> : <Home />)}</Route>
      <Route path="/philosophy" component={Philosophy} />
      <Route path="/restore" component={Restore} />
      <Route path="/build" component={Build} />
      <Route path="/embody" component={Embody} />
      <Route path="/the-terrain" component={Terrain} />
      <Route path="/body-literacy" component={BodyLiteracy} />
      <Route path="/retreats" component={Retreats} />
      <Route path="/executive" component={Executive} />
      {/* The app and the portal are the same product. Old /app links land there. */}
      <Route path="/app">{() => <Redirect to="/member" />}</Route>
      <Route path="/food-chart" component={FoodChart} />
      <Route path="/mastermind" component={Mastermind} />

      {/* Legal. /privacy and /terms are the canonical URLs — both app
          stores want a policy at a stable public address, and these are the
          ones registered with them. The longer spellings are kept as
          redirects because they are what the old footer linked to. */}
      <Route path="/privacy" component={Privacy} />
      <Route path="/privacy-policy">{() => <Redirect to="/privacy" />}</Route>
      <Route path="/terms" component={Terms} />
      <Route path="/terms-of-service">{() => <Redirect to="/terms" />}</Route>

      {/* Members + admin */}
      <Route path="/login" component={LoginPage} />
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
