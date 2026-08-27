import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, LegalSection } from "@/components/site/legal-page";

export const metadata: Metadata = {
  title: "Refund & Cancellation Policy",
  description:
    "How trials, cancellations, and refunds work for GReviewPilot subscriptions.",
};

const ENTITY = "Brightwave Digital Products LLP";
const BILLING_EMAIL = "contact.greviewpilot@gmail.com";

/**
 * Refund policy.
 *
 * Not a Google OAuth requirement, but Indian payment gateways (Razorpay, PayU,
 * Cashfree) require a published refund and cancellation policy before they
 * will activate a live account — and the footer previously linked to one that
 * did not exist.
 */
export default function RefundPolicyPage() {
  return (
    <LegalPage
      title="Refund & Cancellation Policy"
      intro={`How trials, cancellations, and refunds work for GReviewPilot subscriptions from ${ENTITY}.`}
      lastUpdated="2026-08-27"
    >
      <LegalSection id="trial" heading="1. Free plan and trial">
        <p>
          GReviewPilot offers a free plan and a time-limited trial on paid
          plans. Neither requires payment, so nothing is charged and no refund
          arises. When a trial ends without an upgrade, the account moves to the
          free plan — your data is not deleted.
        </p>
      </LegalSection>

      <LegalSection id="billing" heading="2. How billing works">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            Paid plans are billed <strong>in advance</strong> for the chosen
            period (monthly or yearly).
          </li>
          <li>Subscriptions renew automatically until you cancel.</li>
          <li>
            Prices are shown at checkout. Applicable GST or other taxes are
            added where required.
          </li>
        </ul>
      </LegalSection>

      <LegalSection id="cancellation" heading="3. Cancellation">
        <p>
          You can cancel at any time from <em>Dashboard → Settings → Billing</em>
          , or by emailing{" "}
          <a href={`mailto:${BILLING_EMAIL}`} className="text-primary underline">
            {BILLING_EMAIL}
          </a>
          .
        </p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            Cancellation stops the next renewal. It is not retroactive.
          </li>
          <li>
            You keep full access until the end of the period you have already
            paid for.
          </li>
          <li>
            At the end of that period the account moves to the free plan. Your
            data remains available unless you ask us to delete it.
          </li>
        </ul>
      </LegalSection>

      <LegalSection id="refunds" heading="4. Refunds">
        <p>
          <strong>New subscriptions — 7 day money back.</strong> If you are
          unhappy with your first paid period, email us within{" "}
          <strong>7 days</strong> of the initial charge and we will refund it in
          full. No justification needed.
        </p>
        <p>
          <strong>Renewals.</strong> Renewal charges are generally
          non-refundable, because access was available for the period charged.
          We make two exceptions:
        </p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            <strong>Accidental renewal</strong> — if you contact us within 7
            days of a renewal and have not meaningfully used the service in that
            period, we will refund it.
          </li>
          <li>
            <strong>Extended outage</strong> — if a fault on our side made the
            service substantially unusable for a prolonged period, we will
            refund or credit the affected time on a pro-rata basis.
          </li>
        </ul>
        <p>
          <strong>Yearly plans.</strong> Cancelling mid-term does not
          automatically refund the remaining months, but contact us — we review
          these individually and will usually offer a pro-rata credit.
        </p>
      </LegalSection>

      <LegalSection id="not-refundable" heading="5. What we do not refund">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            Periods already elapsed, beyond the windows described above.
          </li>
          <li>
            Accounts suspended or terminated for breaching our{" "}
            <Link href="/terms" className="text-primary underline">
              Terms &amp; Conditions
            </Link>
            , including review-gating or publishing fake reviews.
          </li>
          <li>
            Loss of access caused by a third party outside our control — for
            example Google restricting, suspending, or removing your Business
            Profile or its API access.
          </li>
          <li>Custom development or onboarding work already delivered.</li>
        </ul>
      </LegalSection>

      <LegalSection id="how-to-request" heading="6. Requesting a refund">
        <p>
          Email{" "}
          <a
            href={`mailto:${BILLING_EMAIL}?subject=Refund%20request`}
            className="text-primary underline"
          >
            {BILLING_EMAIL}
          </a>{" "}
          from the address on the account, with the subject{" "}
          <strong>Refund request</strong>, and include your workspace name and
          the invoice or payment reference.
        </p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>We acknowledge within 2 business days.</li>
          <li>Approved refunds are issued within 7 business days.</li>
          <li>
            Refunds go back to the original payment method. Your bank or card
            issuer may take a further 5&ndash;10 business days to post it.
          </li>
        </ul>
      </LegalSection>

      <LegalSection id="contact" heading="7. Contact">
        <p>
          {ENTITY}
          <br />
          Pune, Maharashtra, India
          <br />
          Email:{" "}
          <a href={`mailto:${BILLING_EMAIL}`} className="text-primary underline">
            {BILLING_EMAIL}
          </a>
        </p>
      </LegalSection>
    </LegalPage>
  );
}
