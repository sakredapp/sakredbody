/**
 * The other end of the confirmation link.
 *
 * ── Why it requires a session ─────────────────────────────────────────────
 *
 * The link changes where a coach's client alerts are delivered. A bare token
 * that worked for anybody who opened the URL would make forwarding the email
 * — or a shared work inbox — enough to redirect somebody's coaching
 * notifications. So the token is redeemed by an authenticated request, and a
 * signed-out coach is asked to sign in first rather than being told the link
 * is broken.
 */

import { useEffect, useState } from "react";
import { Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";

type State = "working" | "confirmed" | "already" | "failed" | "signin";

export default function VerifyEmailPage() {
  const [state, setState] = useState<State>("working");
  const [detail, setDetail] = useState<string | null>(null);

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("token");
    if (!token) {
      setState("failed");
      setDetail("That link is missing its token.");
      return;
    }

    let alive = true;
    apiRequest("POST", "/api/coach/notification-email/confirm", { token })
      .then(async (res) => {
        const body = (await res.json()) as { outcome: "confirmed" | "already" };
        if (alive) setState(body.outcome);
      })
      .catch((err: Error) => {
        if (!alive) return;
        /* 401 is the signed-out case, which has a way forward. */
        if (/401/.test(err.message)) setState("signin");
        else {
          setState("failed");
          setDetail(err.message);
        }
      });

    return () => {
      alive = false;
    };
  }, []);

  const words: Record<State, { title: string; body: string }> = {
    working: { title: "One moment…", body: "Confirming that address." },
    confirmed: {
      title: "Confirmed",
      body: "Your coaching alerts will arrive at this address from now on.",
    },
    already: {
      title: "Already confirmed",
      body: "This address was confirmed earlier. Nothing has changed.",
    },
    failed: {
      title: "That link didn't work",
      body: detail ?? "It may have expired, or the address may have changed since it was sent.",
    },
    signin: {
      title: "Sign in first",
      body: "This link confirms a change to your account, so it needs you signed in.",
    },
  };

  const said = words[state];

  return (
    <div className="min-h-screen bg-background grid place-items-center px-6">
      <div className="w-full max-w-sm space-y-3 text-center">
        <h1 className="font-display text-2xl">{said.title}</h1>
        <p className="text-sm text-muted-foreground">{said.body}</p>
        {state !== "working" && (
          <Link
            href={state === "signin" ? "/login" : "/coach"}
            className="inline-block text-sm text-[hsl(var(--gold))]"
            data-testid="link-verify-continue"
          >
            {state === "signin" ? "Sign in" : "Back to Sakred"}
          </Link>
        )}
      </div>
    </div>
  );
}
