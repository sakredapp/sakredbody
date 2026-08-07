import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Home from "@/pages/Home";
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
      <Route path="/" component={Home} />
      <Route path="/app" component={AppPage} />
      <Route path="/food-chart" component={FoodChart} />
      <Route path="/mastermind" component={Mastermind} />
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
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
