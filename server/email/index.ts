/**
 * Transactional email.
 *
 * The whole provider, in one file, over `fetch`. Deliberately not the `resend`
 * npm package: the thing we need is one HTTPS POST with a bearer token, and a
 * dependency in the server bundle for that is weight on every cold start of a
 * function that mostly does other work. It also keeps swapping provider to an
 * edit of `send()` rather than an edit of every caller.
 *
 * ── Missing configuration is a state, not a crash ─────────────────────────
 *
 * `RESEND_API_KEY` may not be set — it wasn't when this was written. Every
 * call site here is something a member triggered, and a member asking to reset
 * their password must not get a 500 because an environment variable is absent
 * on a Tuesday. So `send()` reports `{ sent: false }` and the caller decides;
 * nothing in this file throws.
 *
 * Outside production the link is printed to the server log instead, which is
 * what makes the flow testable end to end before any DNS is verified. In
 * production it is not printed, because a reset link in a log is a credential
 * in a log — the one place a secret is most likely to be read by someone who
 * shouldn't and least likely to be noticed.
 */

/** Where links in email point. The app is served from here. */
export const APP_URL = (process.env.APP_URL ?? "https://sakredbody.com").replace(/\/+$/, "");

/**
 * Envelope sender.
 *
 * Must be an address on a domain verified in Resend, or every send is rejected
 * with a 403 that reads like an authentication problem rather than a domain
 * one. This is the mailbox that exists — `noreply@`, no hyphen. The two spell
 * differently and only one of them is verified, so the default is written out
 * here rather than left to an environment variable somebody has to remember.
 */
const FROM = process.env.EMAIL_FROM ?? "Sakred Body <noreply@sakredbody.com>";

const ENDPOINT = "https://api.resend.com/emails";

/** Give up well inside the function's 30s ceiling. */
const TIMEOUT_MS = 8000;

export type Mail = {
  to: string;
  subject: string;
  /** Both parts, always. A text/html-only email is a spam signal on its own. */
  text: string;
  html: string;
};

export type SendResult = { sent: boolean; id?: string; reason?: string };

/** Whether mail can actually leave the building. */
export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

export async function send(mail: Mail): Promise<SendResult> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { sent: false, reason: "no-provider" };

  // AbortSignal.timeout rather than a manual setTimeout + controller: the
  // manual form leaks the timer on the success path unless it is cleared, and
  // in a long-lived Fluid instance that is a slow accumulation of handles.
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM,
        to: [mail.to],
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!res.ok) {
      // Read the body for the reason, but never let a parse failure become the
      // error — a provider returning HTML from a proxy is a real case.
      const detail = await res.text().catch(() => "");
      return { sent: false, reason: `http_${res.status}${detail ? `: ${detail.slice(0, 200)}` : ""}` };
    }

    const body = (await res.json().catch(() => null)) as { id?: string } | null;
    return { sent: true, id: body?.id };
  } catch (error: unknown) {
    return { sent: false, reason: error instanceof Error ? error.message : "unknown" };
  }
}

/**
 * Print a link the operator can use when there is no provider configured.
 *
 * Separate from `send()` so the decision "is it safe to log this" lives in one
 * place rather than at every call site that happens to be handling a secret.
 */
export function logFallbackLink(label: string, url: string): void {
  if (process.env.NODE_ENV === "production") return;
  // eslint-disable-next-line no-console
  console.log(`\n[email] ${label} (no RESEND_API_KEY set, not sent):\n  ${url}\n`);
}
