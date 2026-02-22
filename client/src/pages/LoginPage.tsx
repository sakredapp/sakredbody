import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowRight, Loader2 } from "lucide-react";
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
        : { email, password, firstName, lastName };

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.message || "Something went wrong");
        return;
      }

      // Auth successful — redirect to member portal
      window.location.href = "/member";
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen relative flex flex-col">
      {/* Background */}
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: "url('/images/member-login-bg.jpg')" }}
      />
      <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/55 to-black/75" />

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
            Puerto Rico
          </p>
        </div>
      </div>
    </div>
  );
}
