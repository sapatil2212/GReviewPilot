# Connecting real Google Business Profiles

This is the operational half of the Google integration. The code is ready; the
remaining blockers live in the Google Cloud console.

## The error you are seeing

```
Access blocked: GReviewPilot has not completed the Google verification process
Error 403: access_denied
```

This is **not** an application bug. Google refuses to issue a grant, so our
callback is never reached. The OAuth client is in **Testing** publishing
status, and in that state only accounts on the test-user list can complete the
consent screen. Everyone else is rejected before a consent screen is ever
shown. ([Google: unverified app warnings](https://support.google.com/cloud/answer/7454865?hl=en), [Nylas: fixing Google access_denied](https://developer.nylas.com/docs/cookbook/use-cases/build/fix-google-access-denied/))

There are two independent approval tracks, and you need **both**. This is the
part that catches most teams: getting one does nothing for the other.

| Track | Gates | Symptom when missing |
| --- | --- | --- |
| **A. Business Profile API access** (project allowlisting) | Whether your Cloud project may call the GBP APIs at all | API quota shows 0 QPM; calls fail with 403 `SERVICE_DISABLED` |
| **B. OAuth app verification** | Whether non-test users may grant consent | `Error 403: access_denied` — what you are hitting now |

---

## Unblock right now (minutes)

Add the account as a test user. This is the only fast path and it works
immediately.

1. Google Cloud console → **APIs & Services → OAuth consent screen** (newer
   consoles: **Google Auth Platform → Audience**).
2. Under **Test users**, click **Add users**.
3. Add `devdutayurvedclinic@gmail.com` and any other account you are demoing with.
4. Retry the connection.

Limits worth knowing: the test-user list caps at 100 accounts, and refresh
tokens issued by an app in Testing expire after 7 days — so a connection made
this way will need reconnecting weekly until the app is published. That
expiry now surfaces correctly as a "reconnect" prompt rather than silently
failing (see `invalid_grant` handling below).

---

## Track A — Business Profile API access

The GBP APIs are not public. Access is granted per Cloud project on
application. ([Google: GBP API FAQ](https://developers.google.com/my-business/content/faq))

**Eligibility** — Google requires all applicants to:

- manage a Google Business Profile that is verified and has been active for
  60+ days (yours or a client's), and
- have a website representing that business.

**Applying:**

1. In the Cloud console, note your **Project Number** (Dashboard → Project info).
2. Submit the [GBP API contact form](https://support.google.com/business/contact/api_default),
   choosing **Application for Basic API Access**.
3. Apply from an email address that is listed as an **owner or manager** on the
   business's Google Business Profile. Applications from unrelated addresses
   get rejected.
4. Wait for the follow-up email.

**Checking approval without waiting for the email** — look at the Business
Profile API quotas in the Cloud console:

- **0 QPM** → not approved yet. Do not file a quota-increase request; file the
  basic access request above.
- **300 QPM** → approved.

**After approval**, enable all eight APIs (API Library → search → Enable).
Missing any one of them produces a 403 on the specific call that needs it,
which is confusing to debug:

- Google My Business API
- My Business Account Management API
- My Business Business Information API
- My Business Lodging API
- My Business Place Actions API
- My Business Notifications API
- My Business Verifications API
- My Business Q&A API

Source: [Google: Prerequisites](https://developers.google.com/my-business/content/prereqs)
and [Basic setup](https://developers.google.com/my-business/content/basic-setup).
Content was rephrased for compliance with licensing restrictions.

---

## Track B — OAuth app verification

`https://www.googleapis.com/auth/business.manage` is a **sensitive** scope, so
the app must pass OAuth verification before external users can consent.
Sensitive scopes require Google review but **not** the third-party security
assessment that restricted scopes demand. ([Google: sensitive scope verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification))

Before submitting, make sure of the following, because each is a common
rejection or "unverified app" trigger:

1. **The scope is declared on the consent screen.** If the app requests a
   sensitive scope that is not listed in the consent screen configuration,
   users see the unverified-app screen even after verification.
2. **App name, logo, and support email** are filled in.
3. **Authorized domains** include your app's domain.
4. **A published privacy policy and terms of service** are reachable on that
   domain.
5. **Authorized redirect URI** exactly matches `GOOGLE_REDIRECT_URI`, byte for
   byte, including scheme and path:
   `https://app.greviewpilot.com/api/google/callback`
6. **A demo video** showing the OAuth consent flow and what the app does with
   the data. Google asks for this for sensitive scopes; having it ready
   shortens the round trip.

Then **Publish app** and submit for verification. Expect days to weeks.

While verification is pending the app stays effectively in Testing, so keep the
test-user list populated for demos.

> **Console quirk:** the newer Google Auth Platform UI sometimes shows
> `business.manage` as non-sensitive while the backend still blocks all
> external users with `access_denied`, and no obvious "submit for
> verification" button appears. If you hit that, publish the app first — the
> verification prompt generally appears afterwards. Reported by others in the
> [Google developer forums](https://discuss.google.dev/t/oauth-business-manage-shown-as-non-sensitive-in-auth-platform-but-backend-blocks-all-external-users-with-error-403-access-denied-no-submit-for-verification-path-exists/384175).

---

## Google Workspace accounts

If the connecting account belongs to a Workspace organisation and Google
Business Profile is turned **off** for that account in the Workspace admin
console, GBP API calls return `403 PERMISSION_DENIED` even with a valid token
and an approved project. Ask the Workspace admin to enable it.

A Workspace admin can also block third-party apps outright, which returns
`admin_policy_enforced`. The dashboard now renders that as a distinct
"Blocked by your Google administrator" banner rather than a generic failure.

---

## Verifying the deployment

Configuration is checked in two places, so you do not have to read Google's
error pages to find a typo.

**1. Boot-time validation.** The process refuses to start on an inconsistent
Google config: a client ID without a secret, a redirect URI that is not
absolute https (localhost excepted), scopes missing `business.manage`, or a
production deploy with no `ENCRYPTION_KEY`.

**2. Diagnostics endpoint** (requires `audit:read`):

```
GET /api/private/google/diagnostics
```

Returns a `config` audit — redirect URI actually in use, whether it was set
explicitly or derived from `APP_URL`, host mismatches against `APP_URL`,
missing scopes, unset `CRON_SECRET` — alongside queue depth and the last
hour of API error counts.

Add `?probe=true` to also make one live `accounts.list` call:

```
GET /api/private/google/diagnostics?probe=true
```

This is the only reliable way to tell **"project not approved for the GBP
APIs"** apart from **"this Google account manages no Business Profiles"** —
both otherwise look like an empty location list. It spends one Account
Management quota unit, so it is opt-in.

---

## Post-connection checklist

- [ ] `CRON_SECRET` is set, and a scheduler calls `/api/cron/auto-sync` and
      `/api/cron/google-sync-worker`. Without this, jobs queue but never run,
      so a connection looks successful and then never syncs.
- [ ] `ENCRYPTION_KEY` is pinned and backed up. It encrypts stored refresh
      tokens; if it changes, every tenant must reconnect. Rotating
      `AUTH_SECRET` while `ENCRYPTION_KEY` is unset has the same effect,
      because the key is derived from it.
- [ ] App-level QPM settings stay below the 300 QPM Google grants. Defaults
      (`GOOGLE_ACCOUNT_API_QPM=60`, `GOOGLE_BUSINESS_API_QPM=120`,
      `GOOGLE_REVIEW_API_QPM=60`) are deliberately conservative.
- [ ] `GOOGLE_MAPS_API_KEY` is restricted to the Places API and to this
      server's IP. An unrestricted key in a client-reachable config is a
      billing risk.

## Error reference

What each failure now does, so log lines map to a cause.

| Category | Cause | Handling |
| --- | --- | --- |
| `GOOGLE_CONSENT_REQUIRED` | App in Testing / unverified, or user declined | Terminal. Account → `REAUTH_REQUIRED` |
| `GOOGLE_API_DISABLED` | Project not approved or API not enabled | Terminal. Account → `ERROR`, remediation logged at `error` level |
| `GOOGLE_SCOPE_INSUFFICIENT` | `business.manage` not granted | Rejected at the callback, before tokens are stored |
| `GOOGLE_AUTH_ERROR` | Revoked/expired refresh token (`invalid_grant`) | Terminal. Account → `REAUTH_REQUIRED` |
| `GOOGLE_CONFIG_ERROR` | Bad client credentials or redirect URI | Terminal. Account → `ERROR` |
| `GOOGLE_QUOTA_EXCEEDED` / `GOOGLE_RATE_LIMIT` | Quota or QPM ceiling | Retried with backoff, honouring `Retry-After` |
| `GOOGLE_SERVER_ERROR` / `GOOGLE_NETWORK_ERROR` | Google-side or transport | Retried with backoff |

Tenants only ever see the sanitized message; raw Google text (which can carry
project identifiers and quota metrics) goes to logs only.
