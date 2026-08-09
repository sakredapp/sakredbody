import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowRight, Download, Loader2, Smartphone } from "lucide-react";
import { APP_STORE_URL, PLAY_STORE_URL } from "@/lib/links";
import { apiFetch, setAuthToken } from "@/lib/apiFetch";
import { ConstellationSky } from "@/components/portal/ConstellationSky";
import sakredLogo from "@assets/full_png_image_sakred__1771268151990.png";

type Mode = "login" | "register";

export default function LoginPage() {
  const [, navigate] = useLocation();
  const { isAuthenticated } = useAuth();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");

  // Eighteen years ago today, as the picker's upper bound. Computed once per
  // render rather than stored — a session left open across midnight on a
  // birthday would otherwise hold a stale limit.
  const maxBirthDate = (() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 18);
    return d.toISOString().slice(0, 10);
  })();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Redirect if already logged in
  if (isAuthenticated) {
    navigate("/member");
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const endpoint = mode === "login" ? "/api/login" : "/api/register";
    const body =
      mode === "login"
        ? { email, password }
        : { email, password, firstName, lastName, dateOfBirth };

    try {
      const res = await apiFetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.message || "Something went wrong");
        return;
      }

      // Present only for the native shells, which cannot hold the session
      // cookie. Storing it before the redirect matters: the member portal
      // fires /api/auth/user immediately on load, and without the token that
      // request is anonymous and bounces straight back to this page.
      if (data.token) await setAuthToken(data.token);

      // Auth successful — redirect to member portal
      // `?next=` is set when something bounced you here — /admin does it
      // rather than showing a second sign-in screen of its own. Same-origin
      // paths only: an open redirect is how a login page becomes a phishing
      // relay, and "starts with a single slash" is the check that rules out
      // both absolute URLs and protocol-relative `//evil.com`.
      const next = new URLSearchParams(window.location.search).get("next");
      const safe = next && /^\/(?!\/)/.test(next) ? next : "/member";
      window.location.href = safe;
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen relative flex flex-col">
      {/* ── Background ──────────────────────────────────────────────────────
          The ground, then the sky. Nothing else.

          There was a photograph of water under here — first as the background
          proper, then dimmed to 25% and held under a 95% wash on the argument
          that it kept the screen from being flat black. At that strength it
          contributed a bit over one percent of what you were looking at: a
          131KB download nobody could see, on the one screen a person hits
          before they have any reason to trust the app is fast. If a layer has
          to be argued for, it isn't doing anything.

          The sky has its own depth and doesn't need help faking it.

          `--ink`, the token, not a hex. An earlier pass used #05060a — a cold
          near-black that looked right alone and was wrong the moment you
          signed in, because every other surface in the product is warm. Two
          greys three points apart in lightness and thirty degrees apart in
          hue read as two different apps when you cross between them. */}
      <div className="absolute inset-0 bg-[hsl(var(--ink))]" />
      {/* `clearTop` keeps the figures out from under the logo and the back
          link, which float over the top of this screen. Without it the first
          figure stood with its head behind the logo — placed correctly on the
          canvas, and invisible on the page. */}
      <ConstellationSky
        className="absolute inset-0 w-full h-full"
        // A login screen is a door, not a gallery. Three figures at most, so
        // the dark between them is doing as much work as they are.
        density={0.7}
        clearCentre={0.55}
        clearTop={0.15}
      />
      {/* Settles the middle so the card has something quiet to sit on without
          dimming the corners, where the field is doing its work. */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,hsl(var(--ink)/0.78)_0%,hsl(var(--ink)/0.3)_45%,transparent_75%)]" />

      <div className="relative flex-1 flex flex-col" style={{ zIndex: 10 }}>
        {/* Top bar */}
        <div className="pt-6 pb-2 px-6 flex items-center justify-between gap-4">
          <Link href="/">
            <img src={sakredLogo} alt="Sakred Body" className="h-12 w-12 object-contain drop-shadow-lg" />
          </Link>
          <Link
            href="/"
            className="text-white/50 text-xs uppercase tracking-widest hover:text-white/70 transition-colors"
          >
            Back to Site
          </Link>
        </div>

        {/* Form */}
        <div className="flex-1 flex items-center justify-center p-4">
          <Card className="w-full max-w-sm bg-white/5 border-white/10 backdrop-blur-xl">
            <CardContent className="pt-6 space-y-6">
              <div className="text-center space-y-3">
                <img
                  src={sakredLogo}
                  alt="Sakred Body"
                  className="h-16 w-16 mx-auto object-contain drop-shadow-xl"
                />
                <h1 className="font-display text-2xl text-white">
                  {mode === "login" ? "Welcome Back" : "Create Account"}
                </h1>
                <div className="w-10 h-px bg-gradient-to-r from-transparent via-gold to-transparent mx-auto" />
              </div>

              {error && (
                <p className="text-sm text-red-400 text-center bg-red-500/10 rounded-md py-2 px-3">
                  {error}
                </p>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                {mode === "register" && (
                  <div className="grid grid-cols-2 gap-3">
                    <Input
                      placeholder="First name"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      required
                      className="bg-white/10 border-white/20 text-white placeholder:text-white/40"
                    />
                    <Input
                      placeholder="Last name"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      required
                      className="bg-white/10 border-white/20 text-white placeholder:text-white/40"
                    />
                  </div>
                )}
                {mode === "register" && (
                  <div className="space-y-1.5">
                    <label
                      htmlFor="dateOfBirth"
                      className="text-xs uppercase tracking-[0.18em] text-white/50"
                    >
                      Date of birth
                    </label>
                    <Input
                      id="dateOfBirth"
                      type="date"
                      value={dateOfBirth}
                      onChange={(e) => setDateOfBirth(e.target.value)}
                      required
                      // The server enforces this; max is only so the picker
                      // doesn't invite a date it will then refuse.
                      max={maxBirthDate}
                      className="bg-white/10 border-white/20 text-white placeholder:text-white/40 [color-scheme:dark]"
                    />
                    <p className="text-xs text-white/40">
                      Sakred Body is for adults. We check your age and don't keep the date.
                    </p>
                  </div>
                )}
                <Input
                  type="email"
                  placeholder="Email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  className="bg-white/10 border-white/20 text-white placeholder:text-white/40"
                />
                <Input
                  type="password"
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={mode === "register" ? 8 : undefined}
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  className="bg-white/10 border-white/20 text-white placeholder:text-white/40"
                />
                <Button
                  type="submit"
                  size="lg"
                  disabled={loading}
                  className="w-full bg-gold border-gold-border text-white"
                >
                  {loading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      {mode === "login" ? "Sign In" : "Create Account"}
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </>
                  )}
                </Button>
              </form>

              {/* The portal and the app are the same product — the web is
                  simply one of the doors into it. */}
              <div className="pt-1">
                <p className="text-white/35 text-[10px] uppercase tracking-[0.18em] text-center mb-3">
                  Or take it with you
                </p>
                <div className="flex gap-3">
                  <a
                    href={APP_STORE_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1"
                    data-testid="link-login-ios"
                  >
                    <Button
                      variant="outline"
                      className="w-full border-white/20 text-white bg-white/5 gold-outline-lift"
                    >
                      <Download className="w-4 h-4 mr-2" /> iOS
                    </Button>
                  </a>
                  <a
                    href={PLAY_STORE_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1"
                    data-testid="link-login-android"
                  >
                    <Button
                      variant="outline"
                      className="w-full border-white/20 text-white bg-white/5 gold-outline-lift"
                    >
                      <Smartphone className="w-4 h-4 mr-2" /> Android
                    </Button>
                  </a>
                </div>
              </div>

              <div className="text-center">
                <button
                  type="button"
                  onClick={() => {
                    setMode(mode === "login" ? "register" : "login");
                    setError("");
                  }}
                  className="text-white/50 text-sm hover:text-white/70 transition-colors"
                >
                  {mode === "login"
                    ? "Don't have an account? Register"
                    : "Already have an account? Sign in"}
                </button>
              </div>

              <p className="text-white/30 text-[10px] text-center">
                Members only. If you haven't been accepted yet,{" "}
                <Link href="/" className="underline text-white/40 hover:text-white/60">
                  apply here
                </Link>
                .
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="pb-6 text-center">
          <p className="text-white/25 text-[10px] tracking-[0.25em] uppercase">
          </p>
        </div>
      </div>
    </div>
  );
}
