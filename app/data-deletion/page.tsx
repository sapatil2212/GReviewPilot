import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, LegalSection } from "@/components/site/legal-page";

export const metadata: Metadata = {
  title: "Data Deletion",
  description:
    "How to disconnect your Google Business Profile, revoke GReviewPilot's access, and permanently delete your account and data.",
};

const ENTITY = "Brightwave Digital Products LLP";
const PRIVACY_EMAIL = "contact.greviewpilot@gmail.com";

/**
 * Dedicated data-deletion page.
 *
 * Google's OAuth verification review asks how users revoke access and delete
 * the data an app has collected. Answering with a single public URL — rather
 * than a buried paragraph — is the difference between a clean review and a
 * round trip of follow-up questions.
 */
export default function DataDeletionPage() {
  return (
    <LegalPage
      title="Data Deletion"
      intro="Three ways to stop GReviewPilot from accessing your data, and how to have it permanently erased."
      lastUpdated="2026-08-27"
    >
      <LegalSection
        id="disconnect"
        heading="Option 1 — Disconnect Google (immediate, self-service)"
      >
        <p>
          This is the fastest route and it takes effect at once. It stops all
          access to your Google Business Profile and destroys the credentials we
          hold.
        </p>
        <ol className="list-decimal space-y-1.5 pl-5">
          <li>Sign in to GReviewPilot.</li>
          <li>
            Go to <em>Dashboard → Integrations → Google</em>.
          </li>
          <li>
            Click <strong>Disconnect</strong> and confirm.
          </li>
        </ol>
        <p>What happens the moment you confirm:</p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            We call Google&rsquo;s token revocation endpoint, which invalidates
            our refresh token and every access token derived from it.
          </li>
          <li>
            We delete the stored connection record, including the encrypted
            access and refresh tokens.
          </li>
          <li>
            We can no longer read your locations, reviews, or profile
            information.
          </li>
        </ul>
        <p>
          Reviews and locations already synced into your workspace remain
          visible to you, because they are part of your own records. To erase
          those too, use Option 3.
        </p>
      </LegalSection>

      <LegalSection
        id="revoke-at-google"
        heading="Option 2 — Revoke from your Google Account"
      >
        <p>
          You can withdraw access from Google&rsquo;s side without signing in to
          GReviewPilot at all.
        </p>
        <ol className="list-decimal space-y-1.5 pl-5">
          <li>
            Open{" "}
            <a
              href="https://myaccount.google.com/permissions"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline"
            >
              myaccount.google.com/permissions
            </a>
            .
          </li>
          <li>
            Find <strong>GReviewPilot</strong> in the list of apps with account
            access.
          </li>
          <li>
            Click it, then choose <strong>Remove access</strong>.
          </li>
        </ol>
        <p>
          Our access stops immediately. The next time GReviewPilot tries to
          sync, Google rejects the request and we mark the connection as needing
          reauthorisation.
        </p>
      </LegalSection>

      <LegalSection
        id="full-deletion"
        heading="Option 3 — Delete your account and all data"
      >
        <p>
          To have everything permanently erased, email us from the address
          registered on your account:
        </p>
        <p className="rounded-xl border border-border bg-surface p-4 text-[15px]">
          To:{" "}
          <a
            href={`mailto:${PRIVACY_EMAIL}?subject=Data%20deletion%20request`}
            className="text-primary underline"
          >
            {PRIVACY_EMAIL}
          </a>
          <br />
          Subject: <strong>Data deletion request</strong>
          <br />
          Body: your workspace name and the email address on the account.
        </p>
        <p>
          We verify the request comes from an account owner, then delete within{" "}
          <strong>30 days</strong>:
        </p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>Your user account, workspace, and team members.</li>
          <li>
            All Google connection records and encrypted OAuth tokens (and we
            revoke the grant at Google).
          </li>
          <li>
            All synced Google data — locations, reviews, reviewer display names
            and photo URLs, and stored API payloads.
          </li>
          <li>
            Business profile details, review replies, posts, QR campaigns,
            websites, uploaded media, and analytics.
          </li>
        </ul>
        <p>
          We send written confirmation when deletion is complete. Deletion is
          irreversible.
        </p>
      </LegalSection>

      <LegalSection id="retained" heading="What we may retain, and why">
        <p>
          After a deletion request we keep only what the law requires or what
          contains no personal data:
        </p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            <strong>Invoices and payment records</strong> — retained as required
            by Indian tax and accounting law.
          </li>
          <li>
            <strong>Security and audit logs</strong> — retained briefly where
            needed to investigate abuse or comply with a legal obligation.
          </li>
          <li>
            <strong>Operational API logs</strong> — endpoint names, status
            codes, and timings. These contain no review content or tokens, and
            are deleted automatically on a rolling 14-day window.
          </li>
          <li>
            <strong>Encrypted backups</strong> — expire on their normal cycle
            within 30 days of deletion.
          </li>
        </ul>
      </LegalSection>

      <LegalSection id="questions" heading="Questions">
        <p>
          Contact {ENTITY} at{" "}
          <a href={`mailto:${PRIVACY_EMAIL}`} className="text-primary underline">
            {PRIVACY_EMAIL}
          </a>
          . Full details of what we collect and why are in our{" "}
          <Link href="/privacy" className="text-primary underline">
            Privacy Policy
          </Link>
          .
        </p>
      </LegalSection>
    </LegalPage>
  );
}
