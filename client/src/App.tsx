import { lazy, Suspense } from "react";
import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ScrollToTop } from "@/components/ScrollToTop";
import Home from "@/pages/Home";
import Philosophy from "@/pages/Philosophy";
import Restore from "@/pages/Restore";
import Build from "@/pages/Build";
import Embody from "@/pages/Embody";
import Terrain from "@/pages/Terrain";
import BodyLiteracy from "@/pages/BodyLiteracy";
import Retreats from "@/pages/Retreats";
const Executive = lazy(() => import("@/pages/Executive"));
const FoodChart = lazy(() => import("@/pages/FoodChart"));
const Mastermind = lazy(() => import("@/pages/Mastermind"));
import LoginPage from "@/pages/LoginPage";
const MemberDashboard = lazy(() => import("@/pages/MemberDashboard"));
const AdminPortal = lazy(() => import("@/pages/AdminPortal"));
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <Switch>
      {/* Marketing */}
      <Route path="/" component={Home} />
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
        <Suspense fallback={<RouteFallback />}>
          <Router />
        </Suspense>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
