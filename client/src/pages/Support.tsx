import { useState } from "react";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { usePageMeta } from "@/hooks/use-page-meta";
import { apiFetch } from "@/lib/apiFetch";
import { Loader2 } from "lucide-react";

/**
 * Support, at /support.
 *
 * Both stores require a support URL, and both open it **signed out** — so
 * this page, and the endpoint behind it, work without an account. That is not
 * only a store requirement: the member most likely to need help is the one
 * who cannot get in, and a contact form behind a login is useless to them.
 *
 * The email address is stated in plain text above the form rather than hidden
 * behind it. If the form breaks, or the throttle trips, or someone simply
 * distrusts a form, there has to be a route that does not depend on our code
 * working.
 */

const CONTACT = "team@sakredbody.com";

const CATEGORIES = [
  { value: "account", label: "My account or signing in" },
  { value: "billing", label: "Membership or billing" },
  { value: "technical", label: "Something isn't working" },
  { value: "protocol", label: "My protocol or coaching" },
  { value: "privacy", label: "Privacy or my data" },
  { value: "other", label: "Something else" },
] as const;

export default function Support() {
  usePageMeta(
    "Support — Sakred Body",
    "Get help with your Sakred Body account, membership, protocol or app. Reach us by form or email.",
  );

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [category, setCategory] = useState<string>("account");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setStatus("sending");

    try {
      const res = await apiFetch("/api/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, category, subject, message }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.message || "Something went wrong. Please email us instead.");
        setStatus("idle");
        return;
      }

      setStatus("sent");
    } catch {
      setError(`We couldn't reach the server. Please email ${CONTACT} instead.`);
      setStatus("idle");
    }
  }

  return (
    <div className="tone-ink min-h-screen bg-background text-foreground font-sans">
      <SiteHeader overHero={false} />

      <main className="tone-ink bg-background pt-32 pb-24">
        <div className="container max-w-3xl mx-auto px-4">
          <header className="mb-12">
            <p className="text-xs uppercase tracking-[0.22em] text-gold mb-4 rule-gold">Support</p>
            <h1 className="font-display text-4xl md:text-5xl mb-6">How can we help?</h1>
            <p className="text-lg opacity-80 leading-relaxed">
              Write to us at{" "}
              <a href={`mailto:${CONTACT}`} className="text-gold underline underline-offset-4">
                {CONTACT}
              </a>{" "}
              and a person will answer — usually within two business days, sooner if you are mid-protocol.
              Or use the form below, which reaches the same place.
            </p>
          </header>

          {status === "sent" ? (
            <div
              className="border border-gold/30 rounded-sm p-8"
              data-testid="support-sent"
            >
              <h2 className="font-display text-2xl mb-3">We have it.</h2>
              <p className="opacity-80 leading-relaxed">
                Thank you — we'll reply to <strong>{email}</strong>. If it's urgent, or you don't hear
                back within two business days, email{" "}
                <a href={`mailto:${CONTACT}`} className="text-gold underline underline-offset-4">
                  {CONTACT}
                </a>{" "}
                directly.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6" data-testid="support-form">
              <div className="grid md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="support-name">Your name</Label>
                  <Input
                    id="support-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    maxLength={120}
                    autoComplete="name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="support-email">Email</Label>
                  <Input
                    id="support-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    maxLength={254}
                    autoComplete="email"
                  />
                  <p className="text-xs opacity-60">
                    If you have an account, use the address it's under — it helps us find you.
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="support-category">What's this about?</Label>
                {/* A plain select rather than the Radix one: this page has to
                    work for someone whose app is broken, and the fewer moving
                    parts between them and us, the better. */}
                <select
                  id="support-category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="support-subject">Subject</Label>
                <Input
                  id="support-subject"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  required
                  maxLength={200}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="support-message">What's going on?</Label>
                <Textarea
                  id="support-message"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  required
                  minLength={10}
                  maxLength={5000}
                  rows={8}
                />
                <p className="text-xs opacity-60">
                  If something isn't working, tell us what you were doing and what happened. Don't
                  include passwords — we never need them.
                </p>
              </div>

              {error && (
                <p className="text-sm text-destructive" data-testid="support-error">
                  {error}
                </p>
              )}

              <Button type="submit" disabled={status === "sending"} className="min-w-40">
                {status === "sending" ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Sending
                  </>
                ) : (
                  "Send"
                )}
              </Button>
            </form>
          )}

          <section className="mt-16 pt-10 border-t border-foreground/10 space-y-4">
            <h2 className="font-display text-2xl">Before you write</h2>
            <p className="opacity-80 leading-relaxed">
              <strong>Deleting your account.</strong> You can do that at any time —{" "}
              <a href="/delete-account" className="text-gold underline underline-offset-4">
                here are the steps
              </a>
              , including exactly what is deleted and what we are required to keep.
            </p>
            <p className="opacity-80 leading-relaxed">
              <strong>Your data.</strong> Our{" "}
              <a href="/privacy" className="text-gold underline underline-offset-4">
                privacy policy
              </a>{" "}
              sets out what we collect and why. Ask us for a copy of yours and we'll send it.
            </p>
            <p className="opacity-80 leading-relaxed">
              <strong>Anything medical.</strong> Sakred Body is education and coaching, not medical
              care. For symptoms, medication, or anything urgent, speak to a licensed clinician — and
              if it is an emergency, contact your local emergency service rather than us.
            </p>
          </section>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
