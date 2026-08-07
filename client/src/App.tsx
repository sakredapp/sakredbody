import { Switch, Route } from "wouter";
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
import AppPage from "@/pages/AppPage";
import FoodChart from "@/pages/FoodChart";
import Mastermind from "@/pages/Mastermind";
import LoginPage from "@/pages/LoginPage";
import MemberDashboard from "@/pages/MemberDashboard";
import AdminPortal from "@/pages/AdminPortal";
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
      <Route path="/app" component={AppPage} />
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

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <ScrollToTop />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
