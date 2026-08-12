import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Capacitor } from "@capacitor/core";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowRight, Download, Loader2, Smartphone, type LucideIcon } from "lucide-react";
import { APP_STORE_URL, PLAY_STORE_URL } from "@/lib/links";
import { apiFetch, setAuthToken } from "@/lib/apiFetch";
import { ConstellationSky } from "@/components/portal/ConstellationSky";
import sakredLogo from "@assets/full_png_image_sakred__1771268151990.png";

/** The app has no website to return to, and no store badges to offer. */
const isNative = Capacitor.isNativePlatform();

/**
 * "forgot" is a third state of this same screen, not a page of its own.
 *
 * Someone who cannot get in is already on this form with their email typed;
 * sending them elsewhere to type it again is the wrong direction. The screen
 * they *do* get sent to is /reset-password, and only from the emailed link.
 */
type Mode = "login" | "register" | "forgot";

/**
 * A store button, or the same button greyed out until that store approves us.
 *
 * `disabled` rather than a styled-down link: it drops the control out of the
 * tab order and announces as unavailable, both of which are true. Wrapping a
 * dead button in an `<a href={null}>` would leave a focusable link to nowhere.
 *
 * Per badge, not one banner over both — Apple and Google approve on their own
 * schedules and one is likely to land first.
 */
function StoreButton({
  href,
  icon: Icon,
  label,
  testId,
}: {
  href: string | null;
  icon: LucideIcon;
  label: string;
  testId: string;
}) {
  if (!href) {
    return (
      <Button
        variant="outline"
        disabled
        className="flex-1 border-white/10 text-white/40 bg-white/[0.02]"
        data-testid={testId}
      >
        <Icon className="w-4 h-4 mr-2" /> {label} · soon
      </Button>
    );
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex-1"
      data-testid={testId}
    >
      <Button
        variant="outline"
        className="w-full border-white/20 text-white bg-white/5 gold-outline-lift"
      >
        <Icon className="w-4 h-4 mr-2" /> {label}
      </Button>
    </a>
  );
}

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
  /** Set once a reset link has been asked for, so the form can stand down. */
  const [sent, setSent] = useState(false);

  // Redirect if already logged in
  if (isAuthenticated) {
    navigate("/member");
    return null;
  }

  /**
   * Ask for a reset link.
   *
   * Kept out of handleSubmit because it shares almost nothing with it: no
   * password, no token to store, no redirect, and a success state that stays
   * on this screen. Folding a third branch into the sign-in path would put the
   * one request that must never authenticate anybody inside the function whose
   * whole job is authenticating people.
   */
  async function handleForgot(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await apiFetch("/api/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      // The server answers the same way for an address it knows and one it
      // does not — see the note on the route. The only thing worth surfacing
      // is the throttle, which is about this person, not about the account.
      if (!res.ok) {
        setError(data.message || "Something went wrong");
        return;
      }
      setSent(true);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
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
      {/* A whisper, not a scrim.
          This was an ellipse running from 78% ink at the centre to nothing at
          75% — three stops across a short distance, which on a near-black
          ground makes its own edge visible: a brown ring floating in the
          middle of the screen with nothing to explain it. The card already
          has a blur and a border and does not need to be sat on. Half the
          strength, pushed right out to the corners, so it reads as depth
          rather than as a shape. */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,hsl(var(--ink)/0.35)_0%,hsl(var(--ink)/0.18)_55%,transparent_100%)]" />

      <div className="relative flex-1 flex flex-col" style={{ zIndex: 10 }}>
        {/* Top bar.
            One logo per screen. There were two — this one and the card's,
            forty pixels apart on a phone — and the second one doesn't say
            anything the first hasn't. The card keeps its own, because that
            is the thing you are actually looking at.

            "Back to site" is web-only. In the app there is no site to go
            back to: the marketing pages aren't routed on native, and a link
            that either dead-ends or throws the user out to Safari is worse
            than no link. `pt-safe` so the row clears the notch. */}
        <div className="pt-safe px-6 flex items-center justify-end gap-4 min-h-[3.5rem]">
          {!isNative && (
            <Link
              href="/"
              className="tap flex items-center text-white/50 text-xs uppercase tracking-widest hover:text-white/70 transition-colors"
            >
              Back to Site
            </Link>
          )}
        </div>

        {/* Form.
            Scrolls, and is centred only while it fits. Register mode is five
            fields plus a date picker taller than login, and on a 667px phone
            it ran past the bottom of a screen that could not scroll — the
            create-account button was simply unreachable. `flex-col` with
            `my-auto` on the card is what gives both behaviours: centred when
            there's room, scrolled from the top when there isn't. Plain
            `items-center` with overflow clips the top instead.

            `pb-safe` keeps the last control off the home indicator. */}
        <div className="flex-1 overflow-y-auto scroll-touch flex flex-col items-center p-4 pb-safe">
          <Card className="w-full max-w-sm my-auto bg-white/5 border-white/10 backdrop-blur-xl">
            <CardContent className="pt-6 space-y-6">
              <div className="text-center space-y-3">
                <img
                  src={sakredLogo}
                  alt="Sakred Body"
                  className="h-16 w-16 mx-auto object-contain drop-shadow-xl"
                />
                <h1 className="font-display text-2xl text-white">
                  {mode === "login"
                    ? "Welcome Back"
                    : mode === "register"
                      ? "Create Account"
                      : "Reset your password"}
                </h1>
                <div className="w-10 h-px bg-gradient-to-r from-transparent via-gold to-transparent mx-auto" />
              </div>

              {error && (
                <p className="text-sm text-red-400 text-center bg-red-500/10 rounded-md py-2 px-3">
                  {error}
                </p>
              )}

              {/* ── Forgot password ─────────────────────────────────────────
                  Two states, and the second one is the important one: once a
                  request has gone in, the form is replaced rather than left
                  sitting there with a button to press again. The server tells
                  us nothing about whether that address exists, so this copy
                  cannot promise an email is coming — "if that address belongs
                  to an account" is the honest phrasing and also the one that
                  keeps the membership private. */}
              {mode === "forgot" && (
                sent ? (
                  <div className="space-y-4">
                    <p className="text-sm text-white/70 leading-relaxed text-center">
                      If that address belongs to an account, a reset link is on its way. It works
                      once and expires in an hour.
                    </p>
                    <p className="text-xs text-white/40 leading-relaxed text-center">
                      Nothing arriving? Check spam, and check the address you typed.
                    </p>
                    <Button
                      type="button"
                      size="lg"
                      onClick={() => {
                        setMode("login");
                        setSent(false);
                        setError("");
                      }}
                      className="w-full bg-gold border-gold-border text-white"
                      data-testid="forgot-back"
                    >
                      Back to sign in
                    </Button>
                  </div>
                ) : (
                  <form onSubmit={handleForgot} className="space-y-4">
                    <p className="text-sm text-white/50 leading-relaxed">
                      Enter the email on your account and we'll send you a link to set a new
                      password.
                    </p>
                    <Input
                      type="email"
                      placeholder="Email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      autoComplete="email"
                      className="bg-white/10 border-white/20 text-white placeholder:text-white/40"
                      data-testid="forgot-email"
                    />
                    <Button
                      type="submit"
                      size="lg"
                      disabled={loading}
                      className="w-full bg-gold border-gold-border text-white"
                      data-testid="forgot-submit"
                    >
                      {loading ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <>
                          Send reset link
                          <ArrowRight className="w-4 h-4 ml-2" />
                        </>
                      )}
                    </Button>
                  </form>
                )
              )}

              {mode !== "forgot" && (
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
              )}

              {/* Under the button, not beside the password field. It is the
                  thing you look for after the button has already failed. */}
              {mode === "login" && (
                <div className="text-center -mt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setMode("forgot");
                      setSent(false);
                      setError("");
                      setPassword("");
                    }}
                    className="text-white/40 text-xs hover:text-white/70 transition-colors"
                    data-testid="link-forgot-password"
                  >
                    Forgot your password?
                  </button>
                </div>
              )}

              {/* The portal and the app are the same product — the web is
                  simply one of the doors into it.

                  Web only. Offering someone a download of the app they are
                  currently holding is absurd on its own terms, and the
                  Android button inside an iOS build is a link to a competing
                  store, which is a review rejection rather than a quirk. */}
              {!isNative && (
              <div className="pt-1">
                {/* Was "Or take it with you" — a promise, and until a store
                    approves us there is nothing to take. Neutral instead, so
                    the eyebrow stays true in all four combinations of the two
                    stores being live; each button carries its own state. */}
                <p className="text-white/35 text-[10px] uppercase tracking-[0.18em] text-center mb-3">
                  On your phone
                </p>
                <div className="flex gap-3">
                  <StoreButton
                    href={APP_STORE_URL}
                    icon={Download}
                    label="iOS"
                    testId="link-login-ios"
                  />
                  <StoreButton
                    href={PLAY_STORE_URL}
                    icon={Smartphone}
                    label="Android"
                    testId="link-login-android"
                  />
                </div>
              </div>
              )}

              <div className="text-center">
                <button
                  type="button"
                  onClick={() => {
                    setMode(mode === "login" ? "register" : "login");
                    setError("");
                    // Leaving this set would show the "check your email"
                    // panel again the next time forgot mode is opened, with
                    // no request behind it.
                    setSent(false);
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
