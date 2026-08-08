/**
 * The last thing between a render error and a white screen.
 *
 * React unmounts the entire tree when a render throws and nothing catches it.
 * With no boundary anywhere in this app, one bad field — a null where a string
 * was expected, a date that didn't parse — took the member from their morning
 * ritual to a blank page with no explanation and no way back except knowing to
 * reload. On a phone, where there is no console to check and no obvious
 * refresh, that is indistinguishable from the app being broken for good.
 *
 * ── What it does and does not do ──────────────────────────────────────────
 *
 * It does not try to recover the broken subtree — React gives no safe way to
 * do that, and pretending otherwise produces a screen that half works. It
 * offers the two things that actually help: try again (remount the tree, which
 * fixes anything transient) and go back to the start.
 *
 * It reports the failure to our own telemetry, because a render crash was
 * previously invisible — no log, no event, nothing. The only way we learned
 * about one was a member mentioning it.
 *
 * The error text is shown, not hidden behind "something went wrong". Someone
 * who screenshots it gives us the actual fault instead of a description of a
 * blank screen.
 */

import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { RefreshCw, Home } from "lucide-react";

interface Props {
  children: ReactNode;
  /** Names the area, so telemetry says which screen died. */
  area?: string;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Render error:", error, info.componentStack);

    // Deliberately fetch rather than the track() helper: that helper is fine,
    // but a boundary that itself throws while reporting an error is the one
    // failure mode with no backstop at all. Keep this path as small as it can
    // be, and let it fail silently if it fails.
    //
    // /api/track requires a session, so a crash on the login screen is not
    // reported. That is the right trade: the alternative is an unauthenticated
    // write endpoint, which is a much larger thing to open than the small
    // blind spot it closes.
    try {
      void fetch("/api/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: "error.client",
          surface: this.props.area ?? "app",
          props: {
            message: String(error?.message ?? error).slice(0, 500),
            component: (info.componentStack ?? "").split("\n")[1]?.trim().slice(0, 120),
          },
        }),
      }).catch(() => {});
    } catch {
      /* reporting must never be the thing that breaks the error screen */
    }
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-background">
        <div className="max-w-sm w-full space-y-5 text-center">
          <div className="h-px w-10 bg-[hsl(var(--gold))] mx-auto" />

          <div className="space-y-2">
            <h1 className="font-display text-2xl">This screen stopped.</h1>
            <p className="text-sm text-muted-foreground">
              Nothing you did caused it and nothing you've recorded is lost.
              Trying again usually clears it.
            </p>
          </div>

          <p className="text-xs font-mono text-muted-foreground/70 break-words border border-border/50 rounded-md p-3 text-left">
            {String(this.state.error.message ?? this.state.error).slice(0, 300)}
          </p>

          <div className="flex gap-2">
            <Button
              className="flex-1 bg-gold border-gold-border text-white"
              onClick={() => this.setState({ error: null })}
              data-testid="button-error-retry"
            >
              <RefreshCw className="h-4 w-4 mr-1.5" />
              Try again
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                // A full navigation, not a router push — the router is part of
                // the tree that just failed.
                window.location.href = "/";
              }}
              data-testid="button-error-home"
            >
              <Home className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    );
  }
}
