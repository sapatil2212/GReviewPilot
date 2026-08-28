# Getting GReviewPilot verified so anyone can connect

Every step, in order, with the things that cause rejection called out.

For the API-access side and the error reference, see
[GOOGLE-BUSINESS-SETUP.md](./GOOGLE-BUSINESS-SETUP.md).

---

## First: understand that there are two approvals

Do not conflate these. They are reviewed by different teams, on different
timelines, and each is useless without the other.

| | Approval | Grants | Symptom if missing |
| --- | --- | --- | --- |
| **A** | Business Profile API access (per Cloud project) | Your project may call the GBP APIs | Quota 0 QPM, every call 403 `SERVICE_DISABLED` |
| **B** | OAuth app verification (per OAuth client) | Any Google user may consent | `Error 403: access_denied` |

**Start A first.** It has a 60-day eligibility clock you cannot shortcut, and a
verified OAuth app on a non-approved project lets users consent and then see
nothing.

---

## Phase 0 — Fix these before Google looks at your site

A reviewer opens your homepage, clicks your policy links, and reads them
against your consent screen. Anything inconsistent invites scrutiny of
everything else.

### 0.1 Legal pages — done

| Page | Route | Required by |
| --- | --- | --- |
| Privacy Policy | `/privacy` | **Google — mandatory** |
| Terms & Conditions | `/terms` | **Google — mandatory consent screen field** |
| Data Deletion | `/data-deletion` | Google verification questionnaire |
| Cookie Policy | `/cookies` | DPDP / GDPR |

All four are live and linked from the footer, which renders on the homepage.

There is deliberately **no refund policy page**: the business does not offer
refunds. The non-refundable position and the cancellation mechanics live in
`/terms` §8 instead. Note that Indian payment gateways commonly ask for a
published refund/cancellation policy URL during onboarding — `/terms` is the
URL to give them.
No dead `#` links remain.

The privacy policy is written to match what the code actually does — the exact
scopes, the reviewer display names and photo URLs you store, AES-256-GCM token
encryption, Gemini processing, and the 14-day / 90-day retention windows.
**Have a lawyer review all five before submitting.**

### 0.2 Remove claims you cannot substantiate — NOT done, blocking

Your public pages currently assert things the codebase contradicts:

| Claim | Where | Problem |
| --- | --- | --- |
| "Private AI · zero retention", "never train public models" | homepage, about, pricing FAQ | Review text goes to `generativelanguage.googleapis.com`. On the Gemini free tier Google uses it to improve products. |
| "All customer data is stored in India (Mumbai & Hyderabad)" | homepage, pricing FAQ | One VPS IP; Gemini calls hit Google's global endpoints. |
| "SOC 2 Type II certified", "ISO 27001 certified" | homepage, pricing FAQ, about | Stated as fact. Certification is auditable — claim it only if you hold it. |
| "99.99% / 99.95% uptime SLA", "12,400+ businesses", "3.2M AI replies", "4.9★ rating" | homepage, pricing, about, contact | Unverifiable metrics. |
| "₹120 Cr raised", named investors (Kunal Shah, Naval Ravikant, Peak XV, Blume…) | about | Names real people as backers. |
| Named team members | about | Presented as real staff. |

Your new privacy policy correctly discloses Gemini processing. A reviewer
reading "zero retention private AI" on the homepage and then that disclosure
sees a contradiction in one sitting. Misrepresenting the app is grounds for
rejection, and the investor and certification claims carry exposure
independent of Google.

**Action:** cut every claim you cannot evidence. Separately, move Gemini to a
paid tier if you want a "not used for training" statement to hold.

### 0.3 Confirm the app works end-to-end for a test user

Add yourself as a test user (Phase 3.1) and complete a real connection. You
need working screenshots and a demo video, and you cannot fake either.

---

## Phase A — Business Profile API access

### A.1 Meet the eligibility bar

- Manage a Google Business Profile that is **verified and active for 60+ days**.
  Yours or a client's.
- That business has a **website**.
- The profile is complete and current — Google says this speeds review.

### A.2 Apply

1. Cloud console → select your project → **Dashboard → Project info** → copy
   the **Project Number**.
2. Submit the [GBP API contact form](https://support.google.com/business/contact/api_default).
3. Choose **Application for Basic API Access**.
4. Apply from an email that is an **owner or manager** on that Business
   Profile. Applications from unrelated addresses get rejected.
5. Supply the project number and every requested field.

### A.3 Confirm approval

Cloud console → **APIs & Services → Quotas**, filter to a Business Profile API:

- **0 QPM** → not approved. Do **not** file a quota-increase request; that is a
  different queue and will be closed.
- **300 QPM** → approved.

### A.4 Enable all eight APIs

API Library → search each → **Enable**. Missing one produces a 403 only on the
call that needs it, which is painful to debug:

1. Google My Business API
2. My Business Account Management API
3. My Business Business Information API
4. My Business Lodging API
5. My Business Place Actions API
6. My Business Notifications API
7. My Business Verifications API
8. My Business Q&A API

Also enable **Places API** (Quick Connect and Places review sync).

---

## Phase B — OAuth verification

### B.1 Verify domain ownership

Google will only accept authorized domains you own.

1. Open [Google Search Console](https://search.google.com/search-console).
2. Add `greviewpilot.com` as a **Domain** property (DNS TXT record).
3. **Use the same Google account that owns the Cloud project**, or add it as a
   verified owner. A mismatch here is a common silent blocker.

### B.2 Configure the OAuth consent screen

Cloud console → **APIs & Services → OAuth consent screen** (newer console:
**Google Auth Platform → Branding / Audience / Data access**).

**User type:** External.

**App information:**

| Field | Value |
| --- | --- |
| App name | `GReviewPilot` — must match your site and logo |
| User support email | a monitored address |
| App logo | square PNG/JPG, 120×120, ≤1 MB, no rounded corners baked in |
| Application home page | `https://app.greviewpilot.com` |
| Privacy policy link | `https://app.greviewpilot.com/privacy` |
| Terms of service link | `https://app.greviewpilot.com/terms` |
| Authorized domains | `greviewpilot.com` |
| Developer contact email | monitored; Google replies here |

Uploading a logo triggers brand verification, which adds review time but is
expected for a published app.

**Consistency matters:** app name, logo, and homepage must clearly be the same
product. A mismatch between the consent screen name and your site is a
rejection reason.

### B.3 Declare scopes — exactly these, no more

Under **Data access → Add or remove scopes**:

```
openid
https://www.googleapis.com/auth/userinfo.email
https://www.googleapis.com/auth/userinfo.profile
https://www.googleapis.com/auth/business.manage
```

`business.manage` is the **sensitive** one driving verification. The other three
are non-sensitive.

Two rules that catch people out:

- **Never request a sensitive scope your consent screen does not list.** Users
  get the "unverified app" screen even after verification.
- **Never add a new sensitive scope to a verified app before that scope is
  itself approved.** Same result.

Your code requests exactly this set, from `GOOGLE_BUSINESS_SCOPES`. Do not
widen it to look future-proof — every extra scope needs separate justification
and slows review.

### B.4 Register the redirect URI

**APIs & Services → Credentials →** your OAuth 2.0 Client ID → **Authorized
redirect URIs**:

```
https://app.greviewpilot.com/api/google/callback
```

Byte-for-byte identical to `GOOGLE_REDIRECT_URI`. No trailing slash, correct
scheme, correct host. Add a `http://localhost:3000/api/google/callback` entry
for development.

Verify what the app actually uses:

```
GET /api/private/google/diagnostics
```

The `config` block reports the redirect URI in use, whether it was set
explicitly or derived from `APP_URL`, and any host mismatch against `APP_URL`.

### B.5 Write the scope justification

Google asks why you need `business.manage`. Be concrete about the API calls and
the user-visible feature each one powers. A vague answer guarantees a round
trip.

Something like:

> GReviewPilot is a reputation management tool for local businesses. Users
> connect the Google Business Profile they own or manage so we can:
>
> - read their locations (`mybusinessbusinessinformation.googleapis.com`
>   `accounts.locations.list`) to display them and let the user link each one to
>   a workspace location;
> - read reviews (`mybusiness.googleapis.com` `accounts.locations.reviews.list`)
>   to show them in a unified inbox with sentiment analysis;
> - publish review replies the user has written or approved.
>
> `business.manage` is the only scope Google offers for this, and it is the
> minimum that supports these features. Data is used solely to deliver them, is
> never sold, and is never used for advertising.

### B.6 Record the demo video

The most common cause of rejection is a video that omits something. Upload to
YouTube as **Unlisted** (not private — reviewers cannot see private videos).

It must show, in one continuous recording:

1. The **browser URL bar** showing your production domain.
2. Your app's **OAuth client ID visible on the consent screen** — this is an
   explicit Google requirement and the step most often missed. Zoom the consent
   screen so the client ID in the URL is legible.
3. The **full consent flow**: clicking Connect Google Business → the Google
   account chooser → the consent screen with each requested scope visible →
   granting.
4. **What happens with the data afterwards**: locations appearing, reviews
   syncing into the inbox, a reply being drafted and published.
5. **How a user revokes access and deletes data** — walk through
   Integrations → Google → Disconnect, and show the `/data-deletion` page.

Narrate or caption it. Keep it under ~5 minutes.

### B.7 Publish and submit

1. OAuth consent screen → **Publish app** → confirm.
2. Publishing status becomes **In production**. The 100-test-user cap and the
   7-day refresh token expiry both disappear at this point.
3. Because a sensitive scope is declared, a **Submit for verification** action
   appears. Complete it with the justification and video URL.
4. Watch the developer contact email and reply promptly — a stalled thread gets
   the request closed.

> **Console quirk:** the newer Google Auth Platform UI sometimes shows
> `business.manage` as non-sensitive and offers no verification path, while the
> backend still blocks all external users with `access_denied`. Publish the app
> first; the verification prompt generally appears afterwards. Others have hit
> this in the [Google developer forums](https://discuss.google.dev/t/oauth-business-manage-shown-as-non-sensitive-in-auth-platform-but-backend-blocks-all-external-users-with-error-403-access-denied-no-submit-for-verification-path-exists/384175).

### B.8 What to expect

- Sensitive scopes need Google review but **not** the third-party security
  assessment (CASA) that restricted scopes require — that distinction saves you
  significant time and cost.
- Typical turnaround is days to several weeks, longer with brand verification.
- Expect at least one clarification email.
- Until it completes, the app behaves as if in Testing, so keep the test-user
  list populated for demos.

---

## Phase C — After approval

- [ ] Remove test users you no longer need.
- [ ] Confirm an external Google account, not on the test list, can connect end
      to end.
- [ ] Run `GET /api/private/google/diagnostics?probe=true` — one live
      `accounts.list` call. This is the only reliable way to tell "project not
      approved" from "this account manages no profiles"; both otherwise look
      like an empty location list.
- [ ] Confirm `CRON_SECRET` is set and a scheduler hits `/api/cron/auto-sync`
      and `/api/cron/google-sync-worker`. Without this, jobs queue and never
      run — connections look successful and then never sync.
- [ ] Keep app-level QPM below the granted 300 (`GOOGLE_ACCOUNT_API_QPM=60`,
      `GOOGLE_BUSINESS_API_QPM=120`, `GOOGLE_REVIEW_API_QPM=60`).
- [ ] Restrict `GOOGLE_MAPS_API_KEY` to the Places API and this server's IP.
- [ ] Back up `ENCRYPTION_KEY`. It decrypts stored refresh tokens; lose or
      change it and every tenant must reconnect.

### Keeping verification

- Re-verification is needed if you change the app name, logo, homepage, privacy
  policy URL, or add a sensitive scope.
- Google auto-cancels approvals for apps that go unused or whose OAuth client
  is deleted.
- Do not let the privacy policy drift from what the code does. If you add a
  data flow — a new third-party processor, a new stored field — update
  `/privacy` in the same change.

---

## Rejection causes, ranked

1. Privacy policy missing, unreachable, on the wrong domain, or silent about
   Google user data.
2. Demo video missing the OAuth client ID on the consent screen.
3. Scopes requested in code that are not declared on the consent screen.
4. Homepage that does not clearly explain the app, or contradicts it.
5. Redirect URI mismatch.
6. Vague scope justification.
7. Unverified authorized domain, or Search Console owned by a different account
   than the Cloud project.
8. App name or logo inconsistent with the site.
9. No visible way for users to revoke access and delete data.
