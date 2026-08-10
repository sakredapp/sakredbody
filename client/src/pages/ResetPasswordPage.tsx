/**
 * Choosing a new password, from the link in the email.
 *
 * Its own page rather than a mode inside LoginPage, because it is the only
 * screen in the product reached from outside it. Someone arrives here with a
 * token in the URL, having clicked a link in a mail client, quite possibly on
 * a different device from the one they use the app on — and quite possibly
 * uncertain whether the email was genuine. That deserves a screen that says
 * what it is rather than a sign-in form wearing a different heading.
 *
 * The token never leaves this page except in the request body. It is in the
 * query string because email can carry nothing else, but it is deliberately
 * not stored, not logged, and not put in any link rendered here.
 */

import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowRight, Check, Loader2 } from "lucide-react";
import { apiFetch } from "@/lib/apiFetch";
import { ConstellationSky } from "@/components/portal/ConstellationSky";
import sakredLogo from "@assets/full_png_image_sakred__1771268151990.png";

/** Same floor as registration and the server. */
const MIN_LENGTH = 8;

export default function ResetPasswordPage() {
  const [, navigate] = useLocation();

  // Read once, at mount. Re-reading on every render would pick up a URL the
  // user edited mid-flow, and there is no good outcome from honouring that.
  const [token] = useState(
    () => new URLSearchParams(window.location.search).get("token") ?? "",
  );

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    // Checked here as well as by the server. Not for security — the server is
    // the gate — but because a round trip to be told the two boxes differ is a
    // round trip nobody needed.
    if (password !== confirm) {
      setError("Those two passwords don't match.");
      return;
    }
    if (password.length < MIN_LENGTH) {
      setError(`Password must be at least ${MIN_LENGTH} characters.`);
      return;
    }

    setLoading(true);
    try {
      const res = await apiFetch("/api/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || "Something went wrong");
        return;
      }
      setDone(true);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen relative flex flex-col">
      <div className="absolute inset-0 bg-[hsl(var(--ink))]" />
      <ConstellationSky
        className="absolute inset-0 w-full h-full"
        density={0.7}
        clearCentre={0.55}
        clearTop={0.15}
      />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,hsl(var(--ink)/0.35)_0%,hsl(var(--ink)/0.18)_55%,transparent_100%)]" />

      <div className="relative flex-1 flex flex-col" style={{ zIndex: 10 }}>
        <div className="flex-1 overflow-y-auto scroll-touch flex flex-col items-center p-4 pb-safe pt-safe">
          <Card className="w-full max-w-sm my-auto bg-white/5 border-white/10 backdrop-blur-xl">
            <CardContent className="pt-6 space-y-6">
              <div className="text-center space-y-3">
                <img
                  src={sakredLogo}
                  alt="Sakred Body"
                  className="h-16 w-16 mx-auto object-contain drop-shadow-xl"
                />
                <h1 className="font-display text-2xl text-white">
                  {done ? "Password updated" : "Choose a new password"}
                </h1>
                <div className="w-10 h-px bg-gradient-to-r from-transparent via-gold to-transparent mx-auto" />
              </div>

              {/* No token at all. Reached by someone opening /reset-password
                  directly, or by a mail client that mangled the link — the
                  second is common enough to be worth naming, since "invalid"
                  reads as "the app is broken" and this reads as "try again". */}
              {!token && !done && (
                <div className="space-y-4">
                  <p className="text-sm text-white/60 text-center">
                    This link is missing its code. Some mail apps cut long links in half — try
                    opening it again from the email, or ask for a new one.
                  </p>
                  <Button
                    onClick={() => navigate("/login")}
                    className="w-full bg-gold border-gold-border text-white"
                  >
                    Back to sign in
                  </Button>
                </div>
              )}

              {done && (
                <div className="space-y-5">
                  <div className="flex items-center justify-center">
                    <div className="h-11 w-11 rounded-full bg-gold/15 flex items-center justify-center">
                      <Check className="h-5 w-5 text-gold" />
                    </div>
                  </div>
                  {/* Said plainly because it is surprising, and because a
                      member who finds themselves signed out of their phone
                      without warning assumes something went wrong. */}
                  <p className="text-sm text-white/60 text-center leading-relaxed">
                    Your password has been changed. For safety we signed you out everywhere else —
                    sign in again on each device.
                  </p>
                  <Button
                    onClick={() => navigate("/login")}
                    size="lg"
                    className="w-full bg-gold border-gold-border text-white"
                    data-testid="reset-done-signin"
                  >
                    Sign in
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </div>
              )}

              {token && !done && (
                <>
                  {error && (
                    <p className="text-sm text-red-400 text-center bg-red-500/10 rounded-md py-2 px-3">
                      {error}
                    </p>
                  )}

                  <form onSubmit={handleSubmit} className="space-y-4">
                    {/* A hidden username field so password managers know which
                        account they are saving against. Without it Safari and
                        1Password offer to create a second, account-less entry
                        — the reason so many people end up with two saved
                        logins for one site. */}
                    <input
                      type="text"
                      name="username"
                      autoComplete="username"
                      className="hidden"
                      tabIndex={-1}
                      aria-hidden="true"
                    />
                    <Input
                      type="password"
                      placeholder="New password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      minLength={MIN_LENGTH}
                      autoComplete="new-password"
                      className="bg-white/10 border-white/20 text-white placeholder:text-white/40"
                      data-testid="reset-password"
                    />
                    <Input
                      type="password"
                      placeholder="Confirm new password"
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                      required
                      minLength={MIN_LENGTH}
                      autoComplete="new-password"
                      className="bg-white/10 border-white/20 text-white placeholder:text-white/40"
                      data-testid="reset-confirm"
                    />
                    <p className="text-white/35 text-[11px]">
                      At least {MIN_LENGTH} characters. Longer is the only thing that really helps —
                      a passphrase beats a short password with symbols in it.
                    </p>
                    <Button
                      type="submit"
                      size="lg"
                      disabled={loading}
                      className="w-full bg-gold border-gold-border text-white"
                      data-testid="reset-submit"
                    >
                      {loading ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <>
                          Set new password
                          <ArrowRight className="w-4 h-4 ml-2" />
                        </>
                      )}
                    </Button>
                  </form>

                  <div className="text-center">
                    <Link
                      href="/login"
                      className="text-white/50 text-sm hover:text-white/70 transition-colors"
                    >
                      Back to sign in
                    </Link>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
