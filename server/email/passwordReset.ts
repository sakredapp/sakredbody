/**
 * The reset email itself.
 *
 * Its own file because the markup has constraints nothing else in the codebase
 * has: email clients render a subset of CSS from about 2005, Gmail rewrites
 * what it does not understand, and Outlook's engine is Word. So this is tables
 * with `bgcolor` attributes and inline styles, deliberately, and it should not
 * be "modernised" to match the app's Tailwind.
 *
 * ── Why this is light when the app is dark ────────────────────────────────
 *
 * The first version was ink-on-dark, matching the product. It rendered dark on
 * desktop Gmail and **white on the phone** — because a client that decides to
 * impose its own light background does not also recover your text colour, so
 * #E8E4DD body copy landed on white and the email was, in practice, blank.
 * A transactional email that is sometimes invisible is worse than one that is
 * off-brand, and this is the single email a locked-out member must be able to
 * read.
 *
 * Light ground with dark type is the direction that survives. Every client
 * renders it as intended, and the ones that force dark mode invert it into
 * something still readable rather than into nothing. The brand carries through
 * the palette, the serif, the wordmark and the gold rules instead of through
 * the background — which is how print does it, and it reads more considered
 * than the dark version did.
 *
 * Kept plain otherwise, on purpose. A reset email that looks like a marketing
 * send lands in Promotions, and one full of imagery reads as phishing — which
 * is exactly the instinct we want members to keep about emails asking them to
 * change a password.
 */

import type { Mail } from "./index.js";

// The real tokens from client/src/index.css, converted — email cannot read a
// CSS custom property, and hand-picked approximations drift from the product.
/** --ink: 30 10% 10% */
const INK = "#1c1a17";
/** --gold: 39 48% 56% — the app's gold. Correct on dark, thin on white. */
const GOLD = "#c59f59";
/** --gold-text: 39 56% 34% — the light-mode gold, which is what this is. */
const GOLD_TEXT = "#876526";
/** Warm parchment ground, and the card that sits on it. */
const GROUND = "#ece7df";
const CARD = "#fcfaf7";
const RULE = "#e2dacb";
const BODY_TEXT = "#3a3630";
const MUTED = "#7d766c";

/**
 * Playfair Display is the product's display face. No web font is requested:
 * Gmail strips @import and @font-face outright, so a request would buy nothing
 * and cost a render-blocking round trip in the clients that do honour it.
 * Georgia is the fallback that matters — it is on every machine and it is the
 * closest widely-installed serif in weight and feel.
 */
const SERIF = "'Playfair Display', Georgia, 'Times New Roman', Times, serif";
const SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";

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

  const safeUrl = escapeHtml(url);

  const html = `<!doctype html>
<html lang="en" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <!-- Tells Apple Mail and Outlook not to invert this into a dark theme of
         their own invention. The design already is the light one. -->
    <meta name="color-scheme" content="light only">
    <meta name="supported-color-schemes" content="light only">
    <title>Reset your password</title>
    <!--[if mso]>
      <noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript>
    <![endif]-->
    <style>
      :root { color-scheme: light only; supported-color-schemes: light only; }
      /* Gmail's web client honours a style block; nothing here is load-bearing.
         Every rule below has an inline equivalent, so a client that strips this
         entirely still gets the intended layout. */
      @media only screen and (max-width: 620px) {
        .sk-card { padding: 32px 24px !important; }
        .sk-shell { padding: 24px 12px !important; }
        .sk-lede { font-size: 17px !important; }
      }
    </style>
  </head>
  <body style="margin:0;padding:0;background-color:${GROUND};-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
    <!-- Preheader: the grey line the inbox shows next to the subject. Without
         one, clients scrape the first visible words and the list reads
         "Sakred Body Hello, Someone asked to…". Hidden in the body itself, and
         padded so no further content is dragged into the preview. -->
    <div style="display:none;font-size:1px;color:${GROUND};line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">
      A link to set a new password. It works once and expires in ${expiresMinutes} minutes.
      &#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;
    </div>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${GROUND}" style="background-color:${GROUND};">
      <tr>
        <td align="center" class="sk-shell" style="padding:40px 16px;">

          <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;">

            <!-- ── Masthead ───────────────────────────────────────────────
                 The mark is an image and images are blocked by default in a
                 good share of clients, so the wordmark underneath is text.
                 With images off this still reads as Sakred Body rather than as
                 a broken box. -->
            <tr>
              <td align="center" style="padding:0 0 28px;">
                <img src="https://sakredbody.com/favicon.png" width="44" height="44" alt="Sakred Body"
                     style="display:block;width:44px;height:44px;border:0;outline:none;text-decoration:none;">
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:0 0 26px;">
                <div style="font-family:${SANS};font-size:11px;letter-spacing:0.32em;text-transform:uppercase;color:${GOLD_TEXT};">
                  Sakred&nbsp;Body
                </div>
              </td>
            </tr>

            <!-- ── The card ──────────────────────────────────────────────── -->
            <tr>
              <td bgcolor="${CARD}" class="sk-card" style="background-color:${CARD};border:1px solid ${RULE};border-radius:14px;padding:44px 44px 38px;">

                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td style="font-family:${SERIF};font-size:27px;line-height:1.25;color:${INK};padding:0 0 20px;">
                      Reset your password
                    </td>
                  </tr>
                  <!-- The gold hairline the product uses under every heading.
                       A solid rule rather than a gradient: Outlook drops
                       background-image and would leave nothing at all. -->
                  <tr>
                    <td style="padding:0 0 26px;">
                      <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
                        <td width="44" height="2" bgcolor="${GOLD}" style="background-color:${GOLD};font-size:0;line-height:0;">&nbsp;</td>
                      </tr></table>
                    </td>
                  </tr>
                  <tr>
                    <td class="sk-lede" style="font-family:${SANS};font-size:16px;line-height:1.65;color:${BODY_TEXT};padding:0 0 8px;">
                      ${escapeHtml(greeting)}
                    </td>
                  </tr>
                  <tr>
                    <td class="sk-lede" style="font-family:${SANS};font-size:16px;line-height:1.65;color:${BODY_TEXT};padding:0 0 30px;">
                      Someone asked to reset the password on your account. Choose a new one here.
                    </td>
                  </tr>

                  <!-- ── Button ──────────────────────────────────────────
                       Ink rather than gold. Gold on parchment is a 3:1 contrast
                       at best, and this is the one control in the email that
                       has to be unmissable. The VML block is what makes it a
                       rectangle in Outlook instead of a bare underlined link. -->
                  <tr>
                    <td style="padding:0 0 30px;">
                      <!--[if mso]>
                      <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word"
                                   href="${safeUrl}" style="height:50px;v-text-anchor:middle;width:260px;" arcsize="16%" strokecolor="${INK}" fillcolor="${INK}">
                        <w:anchorlock/>
                        <center style="color:${CARD};font-family:${SANS};font-size:15px;font-weight:600;">Set a new password</center>
                      </v:roundrect>
                      <![endif]-->
                      <!--[if !mso]><!-- -->
                      <a href="${safeUrl}"
                         style="display:inline-block;background-color:${INK};color:${CARD};font-family:${SANS};font-size:15px;font-weight:600;line-height:1;text-decoration:none;padding:17px 34px;border-radius:8px;">
                        Set a new password
                      </a>
                      <!--<![endif]-->
                    </td>
                  </tr>

                  <!-- The URL in full, because some clients strip the anchor
                       and some people will not press a button in an email on
                       principle. Both are reasonable. -->
                  <tr>
                    <td style="font-family:${SANS};font-size:12px;line-height:1.6;color:${MUTED};padding:0 0 6px;">
                      Or paste this into your browser:
                    </td>
                  </tr>
                  <tr>
                    <td style="font-family:${SANS};font-size:12px;line-height:1.6;color:${GOLD_TEXT};word-break:break-all;padding:0 0 30px;">
                      <a href="${safeUrl}" style="color:${GOLD_TEXT};text-decoration:underline;">${safeUrl}</a>
                    </td>
                  </tr>

                  <tr>
                    <td style="border-top:1px solid ${RULE};padding:24px 0 0;">
                      <div style="font-family:${SANS};font-size:13px;line-height:1.65;color:${MUTED};padding-bottom:10px;">
                        The link works once and expires in ${expiresMinutes} minutes.
                      </div>
                      <div style="font-family:${SANS};font-size:13px;line-height:1.65;color:${MUTED};">
                        If this wasn't you, ignore this email. Nothing has changed and your current
                        password still works.
                      </div>
                    </td>
                  </tr>
                </table>

              </td>
            </tr>

            <!-- ── Footer ─────────────────────────────────────────────────
                 No unsubscribe link. This is transactional — a member cannot
                 opt out of being able to recover their own account, and an
                 unsubscribe control here would imply otherwise. -->
            <tr>
              <td align="center" style="padding:26px 12px 0;">
                <div style="font-family:${SANS};font-size:11px;line-height:1.7;color:${MUTED};">
                  You received this because someone asked to reset the password for this address.
                </div>
                <div style="font-family:${SERIF};font-size:13px;line-height:1.7;color:${GOLD_TEXT};padding-top:10px;">
                  Sakred Body
                </div>
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
