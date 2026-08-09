import { LegalPage, type LegalSection } from "@/components/LegalPage";
import { usePageMeta } from "@/hooks/use-page-meta";

/**
 * Terms of service, at /terms.
 *
 * The clauses that actually matter for this business, in rough order of how
 * likely they are to be needed: the medical disclaimer, assumption of physical
 * risk, and what happens to a retreat deposit. Everything else is standard and
 * kept short so the load-bearing parts are findable.
 */

const CONTACT = "team@sakredhealth.com";

const SECTIONS: LegalSection[] = [
  {
    id: "agreement",
    heading: "The agreement",
    body: (
      <>
        <p>
          <strong>Sakred Body</strong> ("we", "us") is a registered trade name of the company that
          operates the service, and that company is the contracting party under these terms.
        </p>
        <p>
          They govern your use of the Sakred Body website, the member portal, the mobile applications,
          and any coaching, mastermind or retreat we provide (together, "the service").
        </p>
        <p>
          By creating an account, applying, or attending anything we run, you agree to these terms. If
          you do not agree to them, do not use the service.
        </p>
      </>
    ),
  },
  {
    id: "not-medical-advice",
    heading: "Not medical advice",
    body: (
      <>
        <p>
          <strong>
            Sakred Body is health education and coaching. It is not medical care. We do not diagnose,
            treat, cure or prevent any disease, and we do not practise medicine, nursing, dietetics,
            physiotherapy or psychotherapy.
          </strong>
        </p>
        <p>
          No one at Sakred Body is acting as your physician, and using the service creates no
          doctor-patient or other clinical relationship. Our coaches are coaches. Where a coach holds a
          clinical licence, they are not acting under it here.
        </p>
        <p>
          Everything in the service — the protocols, the daily note, the food chart, the body map, the
          library, and anything said at a retreat or in a coaching thread — is general education and
          interpretation. It is not personalised medical advice, it has not been evaluated by the Food
          and Drug Administration, and it is not a substitute for consulting a licensed professional who
          has examined you.
        </p>
        <p>
          <strong>Before you begin</strong>, consult your doctor — especially before changing your diet,
          starting or changing a training programme, taking any supplement, fasting, using heat or cold
          exposure, or if you are pregnant or nursing, have any diagnosed condition, or take any
          prescription medication.{" "}
          <strong>
            Never disregard professional medical advice, delay seeking it, or stop or change a prescribed
            medication because of anything you encounter here.
          </strong>{" "}
          If you think you are having a medical emergency, call your local emergency number immediately.
        </p>
      </>
    ),
  },
  {
    id: "risk",
    heading: "Physical practice and assumption of risk",
    body: (
      <>
        <p>
          The service involves physical activity — strength training, conditioning, mobility work,
          breathwork, sauna and cold exposure, hiking, swimming and ocean time — and changes to diet,
          fasting and sleep. All of it carries risk, including the risk of serious injury, aggravation of
          an existing condition, and in rare cases death.
        </p>
        <p>
          <strong>You take part voluntarily and you assume that risk.</strong> You confirm that you are
          physically able to take part in what you choose to do, that you have consulted a doctor where
          it would be sensible to, and that you will stop and seek help if something feels wrong. You are
          responsible for telling us about any condition, injury, allergy or medication that is relevant
          to a retreat before you attend, and for telling your coach about anything relevant to a
          protocol.
        </p>
        <p>
          Retreats may require a separate waiver, medical questionnaire, and proof of travel and medical
          insurance. Those are in addition to these terms, not instead of them.
        </p>
      </>
    ),
  },
  {
    id: "eligibility",
    heading: "Eligibility and your account",
    body: (
      <>
        <p>
          You must be 18 or older. You must give accurate information when you register and keep it
          current — including health information, where inaccuracy could put you at risk.
        </p>
        <p>
          Your account is yours alone. Do not share your login. You are responsible for what happens
          under your account, and you must tell us at <a href={`mailto:${CONTACT}`}>{CONTACT}</a> as soon
          as you suspect it has been used by someone else.
        </p>
      </>
    ),
  },
  {
    id: "membership",
    heading: "Membership, applications and payment",
    body: (
      <>
        <p>
          Some parts of the service are by application, and we may decline any application without giving
          a reason. Applying does not entitle you to a place.
        </p>
        <p>
          Membership fees, retreat prices and what each includes are as stated at the point of purchase.
          Recurring memberships renew automatically at the stated interval until cancelled, and you may
          cancel at any time — cancellation ends the next renewal and does not refund the current period
          unless the law says otherwise.
        </p>
        <p>
          Purchases made inside the iOS or Android app are processed by Apple or Google under their
          terms, and refunds for those are handled by the store, not by us.
        </p>
        <p>
          <strong>Retreats.</strong> Deposits secure a place and are non-refundable unless stated
          otherwise in writing at the time of booking, because a place held is a place another member
          could not take. The cancellation terms, balance due date and any transfer rights for a specific
          retreat are given to you in writing before you pay. If we cancel a retreat, you receive a full
          refund of what you paid us; we are not responsible for flights, accommodation booked separately
          or other travel costs, which is why we ask you to insure them.
        </p>
        <p>Prices exclude taxes unless stated. We may change prices prospectively, never retroactively.</p>
      </>
    ),
  },
  {
    id: "acceptable-use",
    heading: "Acceptable use",
    body: (
      <>
        <p>You agree not to:</p>
        <ul>
          <li>share, resell or republish our protocols, guides or course material outside the service;</li>
          <li>
            use the service to give medical advice to other members, or to sell anything to them without
            our agreement;
          </li>
          <li>harass, abuse, impersonate or threaten anyone, in a channel or at a retreat;</li>
          <li>
            repeat outside the service what another member disclosed inside it — cohorts and retreats run
            on the understanding that what is said in the room stays there;
          </li>
          <li>
            scrape the service, attempt to breach its security, or use it to build a competing product.
          </li>
        </ul>
        <p>
          We may suspend or close an account that breaches this section, and we may remove content that
          does. Where it is safe and lawful to do so, we will tell you why.
        </p>
      </>
    ),
  },
  {
    id: "content",
    heading: "Content and intellectual property",
    body: (
      <>
        <p>
          The protocols, written material, food chart, body map, imagery, software and brand are ours or
          our licensors'. Your membership buys you a personal, non-transferable licence to use them while
          it lasts. It does not transfer ownership of anything.
        </p>
        <p>
          What you write stays yours. By posting in a community channel or sharing a win you give us a
          licence to display it inside the service to the members it was meant for. We will not use your
          words, image or story in marketing without asking you first.
        </p>
      </>
    ),
  },
  {
    id: "third-parties",
    heading: "Third parties",
    body: (
      <p>
        The service links to other sites and depends on providers we do not control — venues, hosts,
        practitioners, app stores and infrastructure. We choose them with care and we are not responsible
        for their acts, their content or their terms. A retreat partner or venue is an independent
        business, not our agent.
      </p>
    ),
  },
  {
    id: "disclaimers",
    heading: "Disclaimers",
    body: (
      <>
        <p>
          The service is provided "as is" and "as available". To the fullest extent the law allows, we
          disclaim all warranties, express or implied, including merchantability, fitness for a particular
          purpose and non-infringement.
        </p>
        <p>
          <strong>We make no promise about results.</strong> Outcomes depend on your body, your history
          and what you actually do, and nothing we say should be read as a guarantee of any particular
          health, fitness or business outcome.
        </p>
        <p>
          We do not warrant that the service will be uninterrupted or error-free, and we may change,
          suspend or discontinue any part of it. Some jurisdictions do not allow the exclusion of certain
          warranties, so parts of this section may not apply to you.
        </p>
      </>
    ),
  },
  {
    id: "liability",
    heading: "Limitation of liability",
    body: (
      <>
        <p>
          To the fullest extent permitted by law, we are not liable for indirect, incidental, special,
          consequential or punitive damages, or for lost profits, revenue or data, arising out of your use
          of the service.
        </p>
        <p>
          Our total liability for any claim relating to the service is limited to the amount you paid us
          in the twelve months before the event giving rise to the claim.
        </p>
        <p>
          Nothing in these terms excludes or limits liability for death or personal injury caused by our
          negligence, for fraud, or for anything else that cannot lawfully be limited. Some jurisdictions
          do not allow these limits, so they may not apply to you in full.
        </p>
      </>
    ),
  },
  {
    id: "indemnity",
    heading: "Indemnity",
    body: (
      <p>
        You agree to indemnify us against claims, losses and reasonable legal costs arising from your
        breach of these terms, your misuse of the service, or your violation of anyone else's rights.
      </p>
    ),
  },
  {
    id: "termination",
    heading: "Ending it",
    body: (
      <p>
        You may close your account at any time from the member portal or by writing to{" "}
        <a href={`mailto:${CONTACT}`}>{CONTACT}</a>. We may suspend or close an account for a breach of
        these terms, or discontinue the service on reasonable notice — in which case we refund the unused
        part of any prepaid membership. The sections on content, disclaimers, liability and indemnity
        survive the end of the agreement.
      </p>
    ),
  },
  {
    id: "changes",
    heading: "Changes to these terms",
    body: (
      <p>
        We may update these terms. The effective date at the top tells you when they last changed, and we
        will give notice by email before a material change takes effect. Continuing to use the service
        after that date means you accept the revised terms.
      </p>
    ),
  },
  {
    id: "law",
    heading: "Governing law",
    body: (
      <p>
        These terms are governed by the laws of the State of Florida, United States, without regard to
        its conflict of law rules, and the courts of that state have exclusive jurisdiction over any
        dispute — except that consumers retain any right to bring proceedings in their own country of
        residence where local law gives them that right.
      </p>
    ),
  },
  {
    id: "contact",
    heading: "Contact",
    body: (
      <p>
        Questions about these terms: <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.
      </p>
    ),
  },
];

export default function Terms() {
  usePageMeta(
    "Terms of Service | Sakred Body",
    "The terms covering Sakred Body membership, coaching and retreats — including the medical disclaimer and assumption of physical risk.",
  );

  return (
    <LegalPage
      title="Terms of Service"
      updated="9 August 2026"
      testId="text-terms-headline"
      intro={
        <>
          <p>
            The agreement between you and Sakred Body. Two sections carry most of the weight and are
            worth reading even if you skip the rest:{" "}
            <strong>Not medical advice</strong> and{" "}
            <strong>Physical practice and assumption of risk</strong>.
          </p>
        </>
      }
      sections={SECTIONS}
    />
  );
}
