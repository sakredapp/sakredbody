/**
 * The reset email itself.
 *
 * Its own file because the markup has constraints nothing else in the codebase
 * has: email clients render a subset of CSS from about 2005, Gmail strips
 * `<style>` blocks in some contexts, and Outlook's engine is Word. So this is
 * inline styles on tables, deliberately, and it should not be "modernised" to
 * match the app's Tailwind.
 *
 * Kept plain on purpose. A reset email that looks like a marketing send is a
 * reset email that lands in Promotions, and one full of imagery is one a
 * cautious person assumes is phishing — which is exactly the instinct we want
 * members to keep.
 */

import type { Mail } from "./index.js";

/** Ink and gold, as hex — email cannot read a CSS custom property. */
const INK = "#0b0a09";
const GOLD = "#c9a227";
const BODY = "#e8e4dd";
const MUTED = "#9a9389";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function passwordResetMail(opts: {
  to: string;
  firstName?: string | null;
  url: string;
  /** For "this link expires in N minutes" — kept honest against the real TTL. */
  expiresMinutes: number;
}): Mail {
  const greeting = opts.firstName ? `${opts.firstName},` : "Hello,";
  const { url, expiresMinutes } = opts;

  const text = [
    greeting,
    "",
    "Someone asked to reset the password on your Sakred Body account.",
    "Open this link to choose a new one:",
    "",
    url,
    "",
    `The link works once and expires in ${expiresMinutes} minutes.`,
    "",
    "If this wasn't you, ignore this email — nothing has changed, and your",
    "current password still works.",
    "",
    "— Sakred Body",
  ].join("\n");

  // The URL appears twice by design: once as the button, once as plain text
  // underneath. Some clients strip the anchor, some members will not click a
  // button in an email on principle, and both are reasonable.
  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:${INK};color:${BODY};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${INK};padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;">
            <tr>
              <td style="padding-bottom:24px;">
                <p style="margin:0;font-size:11px;letter-spacing:0.22em;text-transform:uppercase;color:${GOLD};">Sakred Body</p>
              </td>
            </tr>
            <tr>
              <td style="padding-bottom:16px;">
                <p style="margin:0 0 16px;font-size:16px;line-height:1.5;color:${BODY};">${escapeHtml(greeting)}</p>
                <p style="margin:0;font-size:15px;line-height:1.6;color:${BODY};">
                  Someone asked to reset the password on your account. Choose a new one here:
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 0;">
                <a href="${escapeHtml(url)}"
                   style="display:inline-block;padding:13px 26px;background:${GOLD};color:${INK};text-decoration:none;border-radius:8px;font-size:15px;font-weight:600;">
                  Set a new password
                </a>
              </td>
            </tr>
            <tr>
              <td style="padding-bottom:24px;">
                <p style="margin:0 0 8px;font-size:12px;line-height:1.6;color:${MUTED};">
                  Or paste this into your browser:
                </p>
                <p style="margin:0;font-size:12px;line-height:1.6;color:${MUTED};word-break:break-all;">
                  ${escapeHtml(url)}
                </p>
              </td>
            </tr>
            <tr>
              <td style="border-top:1px solid rgba(255,255,255,0.08);padding-top:20px;">
                <p style="margin:0 0 8px;font-size:12px;line-height:1.6;color:${MUTED};">
                  The link works once and expires in ${expiresMinutes} minutes.
                </p>
                <p style="margin:0;font-size:12px;line-height:1.6;color:${MUTED};">
                  If this wasn't you, ignore this email. Nothing has changed and your current
                  password still works.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return {
    to: opts.to,
    // No "Sakred Body" prefix: the from-name already says it, and clients that
    // show both render "Sakred Body — Sakred Body: reset…".
    subject: "Reset your password",
    text,
    html,
  };
}
