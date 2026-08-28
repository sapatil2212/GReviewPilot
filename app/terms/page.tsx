import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, LegalSection } from "@/components/site/legal-page";

export const metadata: Metadata = {
  title: "Terms & Conditions",
  description:
    "The terms governing your use of GReviewPilot, including acceptable use, Google Business Profile connections, billing, and liability.",
};

const ENTITY = "Brightwave Digital Products LLP";
const CONTACT_EMAIL = "contact.greviewpilot@gmail.com";

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms & Conditions"
      intro={`The agreement between you and ${ENTITY} governing your use of GReviewPilot.`}
      lastUpdated="2026-08-27"
    >
      <LegalSection id="acceptance" heading="1. Acceptance">
        <p>
          By creating an account or using GReviewPilot, you agree to these
          terms. If you are agreeing on behalf of a company, you confirm you
          have authority to bind it. If you do not agree, do not use the
          service.
        </p>
      </LegalSection>

      <LegalSection id="service" heading="2. The service">
        <p>
          GReviewPilot helps businesses manage their online reputation:
          collecting and displaying reviews, drafting replies, publishing posts,
          running review campaigns, generating analytics, and building websites.
          Features may change as we develop the product.
        </p>
      </LegalSection>

      <LegalSection id="accounts" heading="3. Your account">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            You must provide accurate information and keep your credentials
            confidential.
          </li>
          <li>
            You are responsible for everything done under your account,
            including by team members you invite.
          </li>
          <li>Tell us promptly if you suspect unauthorised access.</li>
        </ul>
      </LegalSection>

      <LegalSection id="google" heading="4. Connecting Google Business Profile">
        <p>
          When you connect a Google Business Profile, you confirm that you own
          it or are an authorised manager of it, and that you may permit
          GReviewPilot to access and act on it.
        </p>
        <p>
          Your use of Google Business Profile through GReviewPilot remains
          subject to Google&rsquo;s own terms and policies, including its review
          content policies. You are responsible for anything published to your
          profile through GReviewPilot, whether written by you or drafted by our
          AI and approved by you.
        </p>
        <p>
          Google controls its APIs and may change, limit, or withdraw access. If
          Google restricts or rate-limits access, related features may be
          delayed or unavailable, and that is outside our control.
        </p>
      </LegalSection>

      <LegalSection id="acceptable-use" heading="5. Acceptable use">
        <p>You must not use GReviewPilot to:</p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            Create, solicit, incentivise, or publish fake, misleading, or
            review-gated content, or otherwise violate Google&rsquo;s review
            policies.
          </li>
          <li>
            Access a Business Profile you do not own or manage, or impersonate
            anyone.
          </li>
          <li>
            Publish unlawful, defamatory, harassing, or infringing content.
          </li>
          <li>
            Send unsolicited bulk messages or contact customers without a lawful
            basis.
          </li>
          <li>
            Reverse engineer, scrape, overload, or attempt to circumvent limits
            or security controls.
          </li>
        </ul>
        <p>
          We may suspend accounts that breach these rules, or where required to
          protect the service or comply with Google&rsquo;s policies.
        </p>
      </LegalSection>

      <LegalSection id="ai" heading="6. AI-generated content">
        <p>
          AI features produce drafts. Output can be inaccurate or unsuitable, so
          review it before publishing. You keep responsibility and liability for
          any content you publish. Nothing our AI produces is professional,
          legal, or financial advice.
        </p>
      </LegalSection>

      <LegalSection id="your-data" heading="7. Your data">
        <p>
          You retain ownership of your business data and the content you create.
          You grant us a limited licence to host, process, and display it solely
          to operate the service for you. Our handling of personal data is
          described in our{" "}
          <Link href="/privacy" className="text-primary underline">
            Privacy Policy
          </Link>
          .
        </p>
      </LegalSection>

      <LegalSection id="billing" heading="8. Plans, billing and cancellation">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            Paid plans are billed in advance for the period shown at checkout
            and renew automatically until cancelled.
          </li>
          <li>
            You can cancel at any time; access continues until the end of the
            paid period.
          </li>
          <li>
            Fees are exclusive of taxes unless stated. You are responsible for
            applicable taxes.
          </li>
          <li>
            We may change pricing with at least 30 days&rsquo; notice before it
            affects your next renewal.
          </li>
        </ul>
        <p>
          <strong>Cancellation.</strong> Cancel at any time from your dashboard
          or by emailing us. Cancellation stops the next renewal; it is not
          retroactive. You keep access for the remainder of the period you have
          already paid for, after which the account moves to the free plan. Your
          data is not deleted when you cancel.
        </p>
        <p>
          <strong>Fees are non-refundable.</strong> We do not offer refunds —
          including for partially used periods, unused time following a
          cancellation, or renewals you did not intend. The free plan and the
          trial both require no payment, and exist so you can evaluate the
          service before you upgrade.
        </p>
        <p>
          Nothing above limits a right to a refund that you have under
          applicable law and that cannot be excluded by agreement.
        </p>
      </LegalSection>

      <LegalSection id="availability" heading="9. Availability">
        <p>
          We work to keep GReviewPilot available and reliable, but we provide it
          on an &ldquo;as is&rdquo; and &ldquo;as available&rdquo; basis. We do
          not warrant uninterrupted or error-free operation. Planned maintenance
          and third-party outages, including Google&rsquo;s, may affect
          availability.
        </p>
      </LegalSection>

      <LegalSection id="liability" heading="10. Limitation of liability">
        <p>
          To the fullest extent permitted by law, {ENTITY} is not liable for
          indirect, incidental, special, consequential, or punitive damages, or
          for lost profits, revenue, data, or goodwill. Our total liability for
          any claim relating to the service is limited to the amount you paid us
          in the twelve months before the claim arose.
        </p>
        <p>
          Nothing here excludes liability that cannot be excluded under
          applicable law.
        </p>
      </LegalSection>

      <LegalSection id="termination" heading="11. Termination">
        <p>
          You may stop using the service and close your account at any time. We
          may suspend or terminate access if you materially breach these terms,
          if required by law or by Google&rsquo;s policies, or if your account
          poses a security risk. On termination we delete or return your data as
          described in the Privacy Policy.
        </p>
      </LegalSection>

      <LegalSection id="law" heading="12. Governing law">
        <p>
          These terms are governed by the laws of India. Courts in Pune,
          Maharashtra have exclusive jurisdiction over any dispute, subject to
          any mandatory consumer protections available where you live.
        </p>
      </LegalSection>

      <LegalSection id="changes" heading="13. Changes to these terms">
        <p>
          We may update these terms. If a change is material, we will notify you
          by email or in the dashboard before it takes effect. Continued use
          after that constitutes acceptance.
        </p>
      </LegalSection>

      <LegalSection id="contact" heading="14. Contact">
        <p>
          {ENTITY}
          <br />
          Pune, Maharashtra, India
          <br />
          Email:{" "}
          <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary underline">
            {CONTACT_EMAIL}
          </a>
        </p>
      </LegalSection>
    </LegalPage>
  );
}
