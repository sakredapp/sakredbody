import { LegalPage, type LegalSection } from "@/components/LegalPage";
import { usePageMeta } from "@/hooks/use-page-meta";

/**
 * The privacy policy, at /privacy.
 *
 * Both app stores require a policy at a stable public URL, and both require it
 * to name the categories of data actually collected. So this is written from
 * the schema rather than from a template: every category below corresponds to
 * tables that exist in this repo, and the health-data section names the ones
 * that hold it.
 *
 * Two disclosures are load-bearing and easy to get wrong:
 *
 *   1. Health data. Habit completion, energy-centre readings, coaching
 *      threads and the intake applications are health information about an
 *      identified person. Apple's health-data rules and the GDPR's Article 9
 *      both attach to it, and it has to be named as such rather than folded
 *      into "usage data".
 *   2. The daily note is written by a language model from a member's own
 *      records. Members are entitled to know their data reaches a model, which
 *      model host, and that it isn't training anything.
 */

const CONTACT = "team@sakredhealth.com";

const SECTIONS: LegalSection[] = [
  {
    id: "who-we-are",
    heading: "Who we are",
    body: (
      <>
        <p>
          <strong>Sakred Body</strong> is a registered trade name — a DBA — of{" "}
          <strong>Sakred Health</strong>, the legal entity behind it ("we", "us"). Naming both matters
          here: the company that holds your data and answers for it is Sakred Health, and the product
          you signed up to is Sakred Body.
        </p>
        <p>
          This policy covers the Sakred Body website, the member portal at app.sakredbody.com, and the
          Sakred Body mobile applications for iOS and Android.
        </p>
        <p>
          For anything in this policy, or to exercise any right described in it, write to{" "}
          <a href={`mailto:${CONTACT}`}>{CONTACT}</a>. We are the controller of the personal data
          described here.
        </p>
      </>
    ),
  },
  {
    id: "not-medical",
    heading: "This is not medical advice",
    body: (
      <>
        <p>
          <strong>
            Sakred Body is education and coaching. It is not medical care, and nothing in the product
            diagnoses, treats, cures or prevents any disease.
          </strong>{" "}
          We are not your doctor, and using the app or attending a retreat does not create a
          doctor-patient relationship.
        </p>
        <p>
          The protocols, the daily note, the food chart, the body map and everything a coach writes to
          you are interpretive. They describe what you are doing and why it is sequenced that way. They
          are not a clinical assessment, they never name a disease, and they are not a substitute for
          advice from a licensed professional who has examined you.
        </p>
        <p>
          Talk to your doctor before starting any protocol, changing what you eat, beginning or altering
          a training programme, taking any supplement, or stopping or adjusting a prescribed medication —
          particularly if you are pregnant, nursing, have a diagnosed condition, or take prescription
          drugs. If you think you have a medical emergency, call your local emergency number. Do not
          delay seeking care because of something you read here.
        </p>
      </>
    ),
  },
  {
    id: "what-we-collect",
    heading: "What we collect",
    body: (
      <>
        <p>We collect the following, and nothing else:</p>
        <p>
          <strong>Account information.</strong> Your name, email address, password (stored only as a
          salted hash — we never hold the password itself), profile photo if you upload one, time zone,
          and your membership tier.
        </p>
        <p>
          <strong>Health and practice information.</strong> The substance of the product, described
          separately in the next section.
        </p>
        <p>
          <strong>Birth and cosmology data, if you choose to provide it.</strong> Birth date, birth time,
          birth place, the full name given at birth, and a self-selected energetic polarity, from which
          we derive astrological placements and numerology numbers. This section is entirely optional; a
          member who provides none of it uses everything else normally.
        </p>
        <p>
          <strong>Applications and bookings.</strong> What you tell us when you apply to the mastermind,
          apply to Sakred Executive, or request a retreat — which typically includes health context,
          goals, and your reasons for applying — along with dates, housing preferences and any
          accessibility or dietary needs.
        </p>
        <p>
          <strong>Community and coaching content.</strong> Messages you post in member channels, replies
          and reactions, and the full contents of your thread with your coach.
        </p>
        <p>
          <strong>Technical and usage data.</strong> IP address, device and browser type, operating
          system, app version, pages and screens viewed, and timestamps. We record failed login attempts
          in order to rate-limit them.
        </p>
        <p>
          <strong>Push notification tokens</strong>, if you enable notifications in the mobile app.
        </p>
        <p>
          We do not collect precise geolocation, we do not use advertising identifiers, and we do not
          read your device's contacts, photos, microphone or camera except for a photo you deliberately
          upload.
        </p>
      </>
    ),
  },
  {
    id: "health-data",
    heading: "Health data specifically",
    body: (
      <>
        <p>
          <strong>
            Sakred Body collects health information about you, and we treat it as the most sensitive
            thing we hold.
          </strong>{" "}
          Naming it plainly matters more than a euphemism would, so: the following is health data.
        </p>
        <ul>
          <li>
            Which practices and protocols you are assigned, which you complete, and when — the daily
            record of what you actually did.
          </li>
          <li>
            Body map readings: the state you or your coach record for each of the nine energy centres,
            over time, together with any note attached to a reading.
          </li>
          <li>
            Your daily intentions and the notes you write about how you feel, sleep, digest and recover.
          </li>
          <li>
            Anything about your health that you disclose in a coaching thread, in a mastermind or
            executive application, or in a retreat booking request.
          </li>
          <li>Dietary preferences, restrictions and allergies you tell us about.</li>
        </ul>
        <p>
          Under the UK and EU GDPR this is special category data (Article 9). We process it only with
          your explicit consent, given when you create an account and provide it, and you may withdraw
          that consent at any time by deleting the data or your account. Under US state privacy laws it
          is sensitive personal information, and we neither sell it nor share it for cross-context
          behavioural advertising.
        </p>
        <p>
          <strong>We are not a HIPAA covered entity.</strong> Sakred Body is not a healthcare provider,
          health plan or clearinghouse, so the information you give us here is generally not protected
          health information under HIPAA — which is precisely why we set out our own commitments in this
          document rather than pointing at a statute.
        </p>
        <p>
          Health data you give us is never used for advertising, never sold, and never disclosed to a
          third party for their own purposes.
        </p>
      </>
    ),
  },
  {
    id: "how-we-use-it",
    heading: "How we use it",
    body: (
      <>
        <ul>
          <li>To create and run your account, and to authenticate you.</li>
          <li>
            To deliver the product: assign and sequence protocols, track what you have completed, show
            your body map over time, and let your coach see enough to coach you.
          </li>
          <li>
            To write your daily note, which is generated from your own records — see the next section.
          </li>
          <li>To review your application and administer a retreat, cohort or booking.</li>
          <li>
            To send you service messages: password resets, booking confirmations, session reminders, and
            changes to this policy. These are not marketing and you cannot opt out of them while you hold
            an account.
          </li>
          <li>
            To send push notifications, if you turned them on. You can turn them off in your device
            settings at any time.
          </li>
          <li>
            To keep the service secure and working — rate-limiting sign-in attempts, diagnosing errors,
            preventing abuse.
          </li>
          <li>To comply with law, and to establish or defend legal claims.</li>
        </ul>
        <p>
          We do not use your data to build advertising profiles, and we run no advertising or tracking
          pixels on the member portal.
        </p>
      </>
    ),
  },
  {
    id: "ai",
    heading: "Automated processing and the daily note",
    body: (
      <>
        <p>
          The daily note is written by a large language model. To write it, a short prompt containing
          your own recent records — the protocol you are running, the day you are on, recent habit
          completions and readings, the season, and your cosmology data if you provided it — is sent to
          a model hosted on <strong>Amazon Bedrock</strong>, which runs inside AWS.
        </p>
        <p>
          Two things follow, and both are the reason we chose that host. Your prompt is not used to train
          the model or any other model, and it is not retained by the model provider after the response
          is returned. AWS processes it as our service provider under contract, and only to return the
          note.
        </p>
        <p>
          The note is guidance and reflection, not a decision about you. Nothing in Sakred Body makes an
          automated decision that produces a legal or similarly significant effect, and no model decides
          whether you are accepted to a cohort, a retreat, or Sakred Executive — a person does.
        </p>
      </>
    ),
  },
  {
    id: "sharing",
    heading: "Who we share it with",
    body: (
      <>
        <p>
          <strong>We do not sell your personal information.</strong> We have never sold it, and we do not
          share it for cross-context behavioural advertising. We disclose it only as follows.
        </p>
        <p>
          <strong>Your coach.</strong> If you are a coaching member, the coach assigned to you can see
          your protocols, your practice record, your body map readings and your thread with them. That is
          the service.
        </p>
        <p>
          <strong>Other members, where you choose.</strong> Anything you post in a community channel is
          visible to other members of that channel, and a win you choose to share is visible to your
          cohort. Nothing else about you is ever shown to another member.
        </p>
        <p>
          <strong>Service providers,</strong> each under contract and each processing only on our
          instructions:
        </p>
        <ul>
          <li>
            <strong>Supabase</strong> — the Postgres database that stores everything described above.
          </li>
          <li>
            <strong>Vercel</strong> — hosting for the website, the portal and the API.
          </li>
          <li>
            <strong>Amazon Web Services</strong> — the language model behind the daily note.
          </li>
          <li>
            <strong>Google Firebase</strong> — delivery of push notifications to mobile devices, where
            enabled.
          </li>
          <li>
            <strong>Apple and Google</strong> — app distribution, and any in-app purchase you make, which
            is processed by the store and not by us. We never receive your card number.
          </li>
          <li>
            <strong>Retreat partners and venues</strong> — only the details needed to host you: name,
            dates, room preference, and any dietary or accessibility need you disclosed.
          </li>
        </ul>
        <p>
          <strong>Legal.</strong> We will disclose information where we are legally required to, and to
          establish, exercise or defend a legal claim. If we are ever compelled to hand over member data,
          we will tell the affected members unless the law forbids it.
        </p>
        <p>
          <strong>A change of ownership.</strong> If the business is acquired or merged, member data may
          transfer as part of it. This policy continues to apply to that data until you are given notice
          of a new one.
        </p>
      </>
    ),
  },
  {
    id: "retention",
    heading: "How long we keep it",
    body: (
      <>
        <p>
          We keep your account and the data attached to it for as long as your account is open, because a
          practice record whose history is deleted is not a practice record.
        </p>
        <p>
          When you delete your account we delete your personal data within <strong>30 days</strong>, with
          two exceptions. Records we must keep for tax, accounting or legal reasons — the fact and amount
          of a transaction, for example — are retained for as long as the relevant law requires.
          Community posts may remain visible with your name removed, so a conversation other members took
          part in doesn't collapse; tell us if you want your posts removed as well and we will remove
          them.
        </p>
        <p>Backups are purged on a rolling 90-day cycle.</p>
      </>
    ),
  },
  {
    id: "your-rights",
    heading: "Your rights, and deleting your account",
    body: (
      <>
        <p>
          <strong>You can delete your account at any time</strong>, from within the member portal, or by
          writing to <a href={`mailto:${CONTACT}`}>{CONTACT}</a> from the address on the account. We do
          not require you to call anyone or explain why.
        </p>
        <p>Whatever jurisdiction you are in, you may ask us to:</p>
        <ul>
          <li>tell you what we hold about you, and give you a copy in a portable format;</li>
          <li>correct anything inaccurate;</li>
          <li>delete your data;</li>
          <li>restrict or object to how we process it;</li>
          <li>withdraw consent for the optional parts, such as cosmology data or notifications.</li>
        </ul>
        <p>
          We respond within 30 days and we do not charge for it. Exercising any of these rights will
          never result in worse service or a higher price.
        </p>
        <p>
          If you are in the UK or EU you also have the right to complain to your data protection
          authority. If you are in California you have the rights described above under the CCPA as
          amended by the CPRA, including the right to know, delete, correct, and to limit the use of
          sensitive personal information — we already limit ours to providing the service.
        </p>
      </>
    ),
  },
  {
    id: "security",
    heading: "How we protect it",
    body: (
      <>
        <p>
          Traffic is encrypted in transit with TLS. Data is encrypted at rest by our database provider.
          Passwords are stored as salted hashes and are not recoverable, by us or by anyone.
        </p>
        <p>
          Every table carrying member data has row-level security enabled in the database, so a query is
          scoped to the member who made it at the database itself rather than only in application code.
          Administrative access is limited to the people who need it to run the service and is logged.
          Sign-in attempts are rate-limited.
        </p>
        <p>
          No system is perfectly secure, and we will not claim otherwise. If a breach affects your
          personal data we will notify you and the relevant regulator within the timeframes the law
          requires.
        </p>
      </>
    ),
  },
  {
    id: "children",
    heading: "Children",
    body: (
      <p>
        Sakred Body is for adults. You must be <strong>18 or older</strong> to create an account, and the
        service is not directed at children. We do not knowingly collect data from anyone under 18. If
        you believe a child has given us personal data, write to{" "}
        <a href={`mailto:${CONTACT}`}>{CONTACT}</a> and we will delete it.
      </p>
    ),
  },
  {
    id: "international",
    heading: "Where your data is held",
    body: (
      <p>
        We operate from the United States and our providers store and process data there. If you are in
        the UK, the EEA or another region with data transfer rules, your data is transferred to the
        United States under the standard contractual clauses or another lawful transfer mechanism agreed
        with each provider.
      </p>
    ),
  },
  {
    id: "changes",
    heading: "Changes to this policy",
    body: (
      <p>
        If we change this policy we will update the effective date at the top. Where a change materially
        affects how we use your data, we will tell you by email and, where the law requires it, ask for
        your consent again before the change applies to you.
      </p>
    ),
  },
  {
    id: "contact",
    heading: "Contact",
    body: (
      <p>
        Questions, requests, or anything you think this document gets wrong:{" "}
        <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.
      </p>
    ),
  },
];

export default function Privacy() {
  usePageMeta(
    "Privacy Policy | Sakred Body",
    "What Sakred Body collects, how health data is handled, who it is shared with, and how to delete your account.",
  );

  return (
    <LegalPage
      title="Privacy Policy"
      updated="9 August 2026"
      testId="text-privacy-headline"
      intro={
        <>
          <p>
            This explains what Sakred Body collects, why, who else ever sees it, and how to get it back
            or get rid of it. It is written to be read rather than to be survived.
          </p>
          <p>
            The two things most people want to know first: <strong>we collect health data about you</strong>{" "}
            and treat it as the most sensitive thing we hold, and{" "}
            <strong>nothing in this product is medical advice</strong>. Both are set out in full below.
          </p>
        </>
      }
      sections={SECTIONS}
    />
  );
}
