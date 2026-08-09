import { LegalPage, type LegalSection } from "@/components/LegalPage";
import { usePageMeta } from "@/hooks/use-page-meta";

/**
 * Account deletion instructions, at /delete-account.
 *
 * This page exists because Google Play requires it: any app that lets people
 * create an account must publish a deletion route at a URL a reviewer can open
 * *without signing in*, and that URL goes in the Play Console Data safety
 * form. Play checks three things specifically, so all three are explicit
 * below — the app and developer are named, the steps are the first thing on
 * the page, and what is deleted is separated from what is kept and for how
 * long.
 *
 * Every retention claim here is copied from the retention section of
 * /privacy rather than restated. Two pages that describe the same policy in
 * slightly different words is the kind of discrepancy a reviewer notices and
 * a regulator asks about — if one changes, change both.
 *
 * NOTE: the steps below describe deletion by written request, because that is
 * what the product currently supports. /privacy already tells members they can
 * delete "from within the member portal", which is not yet true. When the
 * in-app flow ships, it becomes step 1 here and that sentence stops being a
 * promise the product doesn't keep.
 */

const CONTACT = "team@sakredbody.com";

const SECTIONS: LegalSection[] = [
  {
    id: "how",
    heading: "How to delete your account",
    body: (
      <>
        <p>
          Write to <a href={`mailto:${CONTACT}?subject=Delete%20my%20account`}>{CONTACT}</a> from{" "}
          <strong>the email address on your account</strong>, and ask us to delete it. Sending from the
          account address is how we confirm the request is yours — we cannot action a deletion request
          sent from another address, because doing so would let anyone delete anyone.
        </p>
        <p>You do not need to explain why, and there is nothing to pay.</p>
        <ol>
          <li>
            Email <a href={`mailto:${CONTACT}?subject=Delete%20my%20account`}>{CONTACT}</a> from your
            account address with the subject <em>Delete my account</em>.
          </li>
          <li>We reply to confirm we have received it, usually within two business days.</li>
          <li>
            Your account and the data listed below are deleted within <strong>30 days</strong> of that
            confirmation.
          </li>
        </ol>
        <p>
          If you would like a copy of your data before it goes, ask in the same email and we will send
          it in a portable format first.
        </p>
      </>
    ),
  },
  {
    id: "partial",
    heading: "Deleting some of your data, but keeping your account",
    body: (
      <>
        <p>
          You do not have to close your account to remove things from it. Write to{" "}
          <a href={`mailto:${CONTACT}`}>{CONTACT}</a> and tell us what you want removed — your community
          posts, your coaching thread, your energy readings, your daily notes, or anything else named
          below — and we will remove it and leave the rest of the account intact.
        </p>
      </>
    ),
  },
  {
    id: "deleted",
    heading: "What is deleted",
    body: (
      <>
        <p>Deleting your account removes:</p>
        <ul>
          <li>your profile — name, email address, password, profile photo, timezone and preferences;</li>
          <li>
            your practice record — protocols and routines you were enrolled in, habits, completions and
            streaks;
          </li>
          <li>your daily notes, intentions and food-chart entries;</li>
          <li>your energy-centre readings and any cosmology data you provided;</li>
          <li>your coaching thread, including anything you or your coach uploaded to it;</li>
          <li>your wins, and any images generated from them;</li>
          <li>your Apothecary check-offs, library reading progress and masterclass subscriptions;</li>
          <li>your retreat and offering registrations, and any application you submitted;</li>
          <li>
            your signed-in devices — the credentials held by the iOS and Android apps, and the tokens
            used to send you notifications, so those devices stop receiving them.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "kept",
    heading: "What is kept, and for how long",
    body: (
      <>
        <p>Three things outlive the account, and it is worth being precise about them:</p>
        <ul>
          <li>
            <strong>Records we are legally required to keep.</strong> The fact and amount of a
            transaction, for tax and accounting purposes, retained for as long as the relevant law
            requires. These records are not used for anything else.
          </li>
          <li>
            <strong>Community posts, with your name removed.</strong> So that a conversation other
            members took part in doesn't collapse. If you want your posts deleted as well, say so in
            your email and we will delete them.
          </li>
          <li>
            <strong>Backups</strong>, which are purged on a rolling <strong>90-day</strong> cycle. Your
            data is gone from the live system within 30 days; it ages out of backups within 90.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "questions",
    heading: "Questions",
    body: (
      <>
        <p>
          Write to <a href={`mailto:${CONTACT}`}>{CONTACT}</a>. Our{" "}
          <a href="/privacy">privacy policy</a> describes everything we collect and why.
        </p>
      </>
    ),
  },
];

export default function DeleteAccount() {
  usePageMeta(
    "Delete your Sakred Body account",
    "How to request deletion of your Sakred Body account, what data is deleted, what is kept, and for how long.",
  );

  return (
    <LegalPage
      title="Delete your Sakred Body account"
      updated="9 August 2026"
      intro={
        <>
          <p>
            This page explains how to delete your <strong>Sakred Body</strong> account and everything
            attached to it. It applies to the Sakred Body website, the member portal, and the Sakred
            Body apps for iOS and Android.
          </p>
          <p>
            You can close your account at any time, and you can also remove individual pieces of your
            data without closing it.
          </p>
        </>
      }
      sections={SECTIONS}
      testId="page-delete-account"
    />
  );
}
