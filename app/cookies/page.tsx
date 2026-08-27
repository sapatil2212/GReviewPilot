import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, LegalSection } from "@/components/site/legal-page";

export const metadata: Metadata = {
  title: "Cookie Policy",
  description:
    "GReviewPilot uses only the cookies required to sign you in and keep your session secure. No advertising or tracking cookies.",
};

const PRIVACY_EMAIL = "contact.greviewpilot@gmail.com";

/**
 * Cookie policy.
 *
 * The list below is derived from src/server/auth/cookies.ts and the Auth.js
 * configuration, not from a template. There are no analytics or advertising
 * scripts in the app, so the honest answer is "strictly necessary only" —
 * keep this page in step with the code if that ever changes.
 */
export default function CookiePolicyPage() {
  return (
    <LegalPage
      title="Cookie Policy"
      intro="GReviewPilot sets only the cookies needed to sign you in and keep your session secure. We run no advertising or analytics trackers."
      lastUpdated="2026-08-27"
    >
      <LegalSection id="summary" heading="The short version">
        <p>
          We use <strong>strictly necessary cookies only</strong>. We do not use
          cookies for advertising, cross-site tracking, profiling, or
          third-party analytics, and we do not sell or share cookie data.
        </p>
        <p>
          Because every cookie we set is essential to delivering a service you
          asked for, no consent banner is required. If we ever add optional
          cookies, we will ask for consent before setting them.
        </p>
      </LegalSection>

      <LegalSection id="what-we-set" heading="Cookies we set">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-[14px]">
            <thead>
              <tr className="border-b border-border">
                <th className="py-2 pr-4 font-semibold text-foreground">Cookie</th>
                <th className="py-2 pr-4 font-semibold text-foreground">Purpose</th>
                <th className="py-2 font-semibold text-foreground">Lifetime</th>
              </tr>
            </thead>
            <tbody className="align-top">
              <tr className="border-b border-border/60">
                <td className="py-3 pr-4">
                  <code className="text-[13px]">__Secure-authjs.session-token</code>
                </td>
                <td className="py-3 pr-4">
                  Keeps you signed in and identifies your workspace and role.
                  Set <code className="text-[13px]">HttpOnly</code>,{" "}
                  <code className="text-[13px]">Secure</code>, and{" "}
                  <code className="text-[13px]">SameSite=Lax</code>, so it
                  cannot be read by JavaScript or sent from other sites.
                </td>
                <td className="py-3">Session, or 30 days with &ldquo;Remember me&rdquo;</td>
              </tr>
              <tr className="border-b border-border/60">
                <td className="py-3 pr-4">
                  <code className="text-[13px]">__Host-authjs.csrf-token</code>
                </td>
                <td className="py-3 pr-4">
                  Protects sign-in and form submissions against cross-site
                  request forgery.
                </td>
                <td className="py-3">Session</td>
              </tr>
              <tr>
                <td className="py-3 pr-4">
                  <code className="text-[13px]">__Secure-authjs.callback-url</code>
                </td>
                <td className="py-3 pr-4">
                  Remembers where to return you after sign-in, so a deep link
                  survives the login step.
                </td>
                <td className="py-3">Session</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          On local development the same cookies appear without the{" "}
          <code className="text-[13px]">__Secure-</code> and{" "}
          <code className="text-[13px]">__Host-</code> prefixes, because those
          prefixes require HTTPS.
        </p>
      </LegalSection>

      <LegalSection id="google" heading="Google and cookies">
        <p>
          When you connect your Google Business Profile, Google&rsquo;s own
          sign-in and consent pages are served from Google&rsquo;s domains and
          may set their own cookies. Those are governed by{" "}
          <a
            href="https://policies.google.com/technologies/cookies"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline"
          >
            Google&rsquo;s cookie policy
          </a>
          , not ours.
        </p>
        <p>
          GReviewPilot itself receives no Google cookies. Our connection to
          Google uses OAuth tokens stored encrypted on our server, never a
          browser cookie.
        </p>
      </LegalSection>

      <LegalSection id="published-sites" heading="Websites you publish">
        <p>
          Sites built with the GReviewPilot website builder do not set tracking
          cookies by default. If you embed third-party content — a maps widget,
          a video, or your own analytics — that provider may set cookies on your
          visitors. You are responsible for disclosing those on your own site.
        </p>
      </LegalSection>

      <LegalSection id="control" heading="Controlling cookies">
        <p>
          You can clear or block cookies in your browser settings. Blocking our
          session cookie will sign you out and prevent you from signing back in,
          because there is no other way for us to recognise an authenticated
          request. Signing out clears the session cookie immediately.
        </p>
      </LegalSection>

      <LegalSection id="contact" heading="Questions">
        <p>
          Email{" "}
          <a href={`mailto:${PRIVACY_EMAIL}`} className="text-primary underline">
            {PRIVACY_EMAIL}
          </a>
          . See also our{" "}
          <Link href="/privacy" className="text-primary underline">
            Privacy Policy
          </Link>{" "}
          and{" "}
          <Link href="/terms" className="text-primary underline">
            Terms &amp; Conditions
          </Link>
          .
        </p>
      </LegalSection>
    </LegalPage>
  );
}
