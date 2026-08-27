import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, LegalSection } from "@/components/site/legal-page";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "How GReviewPilot collects, uses, stores, shares, and deletes your data — including data accessed from your Google Business Profile.",
};

const ENTITY = "Brightwave Digital Products LLP";
const PRIVACY_EMAIL = "contact.greviewpilot@gmail.com";

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      intro={`How ${ENTITY} collects, uses, stores, shares, and deletes data in GReviewPilot — including the data we access from your Google Business Profile.`}
      lastUpdated="2026-08-27"
    >
      <LegalSection id="who-we-are" heading="1. Who we are">
        <p>
          GReviewPilot is a reputation management platform operated by {ENTITY},
          Pune, Maharashtra, India. In this policy, &ldquo;we&rdquo; and
          &ldquo;us&rdquo; mean {ENTITY}, and &ldquo;you&rdquo; means the
          business or individual using GReviewPilot.
        </p>
        <p>
          For data you bring into GReviewPilot about your own customers, you are
          the data controller and we act as your processor. For your own account
          and billing data, we are the controller.
        </p>
      </LegalSection>

      <LegalSection id="account-data" heading="2. Data you give us directly">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            <strong>Account details</strong> — name, email address, password
            (stored only as a salted hash), and workspace membership.
          </li>
          <li>
            <strong>Business details</strong> — business name, locations,
            addresses, phone numbers, opening hours, and categories.
          </li>
          <li>
            <strong>Content you create</strong> — review replies, posts,
            websites built in the site builder, and uploaded media.
          </li>
          <li>
            <strong>Support correspondence</strong> — messages you send us.
          </li>
        </ul>
      </LegalSection>

      <LegalSection
        id="google-data"
        heading="3. Google user data we access, and why"
      >
        <p>
          When you connect your Google Business Profile, you grant GReviewPilot
          access through Google OAuth. We request these scopes and nothing else:
        </p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            <code className="rounded bg-muted px-1 py-0.5 text-[13px]">
              openid
            </code>
            ,{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-[13px]">
              email
            </code>
            ,{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-[13px]">
              profile
            </code>{" "}
            — to identify which Google account is connected and show it back to
            you in the dashboard.
          </li>
          <li>
            <code className="rounded bg-muted px-1 py-0.5 text-[13px]">
              https://www.googleapis.com/auth/business.manage
            </code>{" "}
            — to read the Business Profiles you manage and to act on them on
            your behalf.
          </li>
        </ul>
        <p>Using that access, we read and store:</p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            <strong>Your Google account identity</strong> — email address, and
            the Business Profile account name and identifier.
          </li>
          <li>
            <strong>Your locations</strong> — title, store code, address, phone
            number, website, categories, and Google Place ID.
          </li>
          <li>
            <strong>Your reviews</strong> — star rating, review text, review
            timestamp, and the reviewer&rsquo;s public display name and profile
            photo URL as published by Google.
          </li>
        </ul>
        <p>
          We use this data solely to provide the features you asked for:
          displaying your reviews and locations, drafting and publishing
          replies, generating analytics, and running review campaigns. We do{" "}
          <strong>not</strong> use Google user data for advertising, and we do
          not sell it.
        </p>
      </LegalSection>

      <LegalSection id="limited-use" heading="4. Limited use of Google user data">
        <p>
          Our use of information received from Google APIs adheres to the{" "}
          <a
            href="https://developers.google.com/terms/api-services-user-data-policy"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline"
          >
            Google API Services User Data Policy
          </a>
          , including its Limited Use requirements. Specifically:
        </p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            We use Google user data only to provide and improve features that
            are visible to you inside GReviewPilot.
          </li>
          <li>We do not transfer or sell Google user data to third parties for advertising, market research, or any unrelated purpose.</li>
          <li>
            We do not allow humans to read your Google user data, except where
            you have given us explicit permission (for example, when you ask
            support to investigate a specific problem), where it is necessary
            for security or to comply with applicable law, or where the data has
            been aggregated and de-identified.
          </li>
        </ul>
      </LegalSection>

      <LegalSection id="ai" heading="5. Automated processing and AI">
        <p>
          To provide sentiment analysis, reply drafting, insights, and website
          generation, we send relevant content — including review text — to
          Google&rsquo;s Generative Language (Gemini) API for processing. We
          send only what the feature needs, and we do not send your account
          credentials or OAuth tokens.
        </p>
        <p>
          AI output is a draft. Replies are not published to Google until you
          approve them, and you remain responsible for the content you publish.
        </p>
      </LegalSection>

      <LegalSection id="storage" heading="6. How we store and protect data">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            <strong>OAuth tokens are encrypted at rest</strong> using AES-256-GCM
            with a key held outside the database. They are decrypted only in
            memory, only when a request to Google needs them, and are never
            written to logs or returned by our API.
          </li>
          <li>
            <strong>Transport is encrypted</strong> — all traffic to
            GReviewPilot and to Google runs over HTTPS/TLS.
          </li>
          <li>
            <strong>Access is scoped per workspace</strong> — every query is
            restricted to your workspace, and team members only see the
            locations assigned to them.
          </li>
          <li>
            <strong>Operational logs</strong> record which Google endpoints were
            called and whether they succeeded. They record request metadata, not
            access tokens or review content, and are deleted on a rolling
            14-day window.
          </li>
        </ul>
        <p>
          No system is perfectly secure. We work to protect your data but cannot
          guarantee absolute security.
        </p>
      </LegalSection>

      <LegalSection id="sharing" heading="7. Who we share data with">
        <p>
          We do not sell your data. We share it only with service providers who
          process it on our behalf, under contract, and only as needed to run
          the product:
        </p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            <strong>Google</strong> — Business Profile APIs, Places API, and the
            Gemini API, as described above.
          </li>
          <li>
            <strong>Hosting and database infrastructure</strong> — to run the
            application and store your data.
          </li>
          <li>
            <strong>Email delivery</strong> — to send transactional email such
            as verification, invitations, and password resets.
          </li>
        </ul>
        <p>
          We may also disclose data where required by law, or to protect our
          rights, safety, or property.
        </p>
      </LegalSection>

      <LegalSection id="retention" heading="8. Retention and deletion">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            <strong>Disconnecting Google</strong> — use{" "}
            <em>Integrations → Google → Disconnect</em>. We revoke the token
            with Google immediately and delete the stored connection, including
            the encrypted access and refresh tokens.
          </li>
          <li>
            <strong>Revoking from Google&rsquo;s side</strong> — you can remove
            GReviewPilot at any time from your{" "}
            <a
              href="https://myaccount.google.com/permissions"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline"
            >
              Google account permissions
            </a>
            . Our access stops at once.
          </li>
          <li>
            <strong>Account deletion</strong> — follow our{" "}
            <Link href="/data-deletion" className="text-primary underline">
              data deletion instructions
            </Link>
            , or email{" "}
            <a
              href={`mailto:${PRIVACY_EMAIL}`}
              className="text-primary underline"
            >
              {PRIVACY_EMAIL}
            </a>
            . We delete your workspace and its data within 30 days, except where
            we must retain records to comply with law.
          </li>
          <li>
            <strong>Operational data</strong> — API request logs are kept 14
            days; synchronisation history is kept 90 days.
          </li>
        </ul>
      </LegalSection>

      <LegalSection id="rights" heading="9. Your rights">
        <p>
          Depending on where you live, you may have the right to access,
          correct, export, or delete your personal data, to object to or
          restrict processing, and to withdraw consent. Indian users have rights
          under the Digital Personal Data Protection Act, 2023. To exercise any
          of these, contact us at{" "}
          <a href={`mailto:${PRIVACY_EMAIL}`} className="text-primary underline">
            {PRIVACY_EMAIL}
          </a>
          . We respond within 30 days.
        </p>
      </LegalSection>

      <LegalSection id="children" heading="10. Children">
        <p>
          GReviewPilot is a business tool and is not directed at children under
          18. We do not knowingly collect their personal data.
        </p>
      </LegalSection>

      <LegalSection id="changes" heading="11. Changes to this policy">
        <p>
          We will update this page when our practices change and revise the
          &ldquo;last updated&rdquo; date. If a change materially affects how we
          handle your data, we will notify you by email or in the dashboard
          before it takes effect.
        </p>
      </LegalSection>

      <LegalSection id="contact" heading="12. Contact us">
        <p>
          {ENTITY}
          <br />
          Pune, Maharashtra, India
          <br />
          Email:{" "}
          <a href={`mailto:${PRIVACY_EMAIL}`} className="text-primary underline">
            {PRIVACY_EMAIL}
          </a>
        </p>
        <p>
          See also our{" "}
          <Link href="/terms" className="text-primary underline">
            Terms &amp; Conditions
          </Link>
          ,{" "}
          <Link href="/cookies" className="text-primary underline">
            Cookie Policy
          </Link>
          , and{" "}
          <Link href="/data-deletion" className="text-primary underline">
            Data Deletion
          </Link>{" "}
          instructions.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
