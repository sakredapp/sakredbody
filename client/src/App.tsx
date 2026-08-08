import { lazy, Suspense } from "react";
import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ScrollToTop } from "@/components/ScrollToTop";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import Home from "@/pages/Home";
const Philosophy = lazy(() => import("@/pages/Philosophy"));
const Restore = lazy(() => import("@/pages/Restore"));
const Build = lazy(() => import("@/pages/Build"));
const Embody = lazy(() => import("@/pages/Embody"));
const Terrain = lazy(() => import("@/pages/Terrain"));
const BodyLiteracy = lazy(() => import("@/pages/BodyLiteracy"));
const Retreats = lazy(() => import("@/pages/Retreats"));
const Executive = lazy(() => import("@/pages/Executive"));
const FoodChart = lazy(() => import("@/pages/FoodChart"));
const Mastermind = lazy(() => import("@/pages/Mastermind"));
const LoginPage = lazy(() => import("@/pages/LoginPage"));
const MemberDashboard = lazy(() => import("@/pages/MemberDashboard"));
const AdminPortal = lazy(() => import("@/pages/AdminPortal"));
const NotFound = lazy(() => import("@/pages/not-found"));

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
