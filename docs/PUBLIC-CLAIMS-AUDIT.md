# Public claims audit — Google verification readiness

Scope: public-facing copy only. No application logic, API, schema, auth,
Google integration, or AI configuration was inspected for change or modified.

Code-verified facts used as the source of truth:

| Fact | Source |
| --- | --- |
| Trial length is **7 days** | `src/lib/plans.ts` → `TRIAL_DAYS = 7` |
| Plans are **Starter (Free) / Growth (₹4,999/mo) / Scale (Custom)** | `src/lib/plans.ts` → `SUBSCRIPTION_PLANS` |
| AI calls go to Google's Generative Language API | `src/server/services/ai/gemini.service.ts` → `generativelanguage.googleapis.com` |
| OAuth tokens are AES-256-GCM encrypted at rest | `src/server/utils/crypto.ts`, `googleAccount.service.ts` |
| RBAC, audit logs, tenant scoping exist | `src/server/permissions/`, `audit.repository.ts` |
| Custom domains + SSL provisioning exist | `src/server/services/sslProvisioning.service.ts` |
| Essential cookies only, no trackers | `src/server/auth/cookies.ts`; no analytics scripts in `app/layout.tsx` |
| Single database host; no multi-region residency | `DATABASE_URL` (one host) |

---

## Audit table

### Certification & compliance claims

| Claim | Location | Problem | Action |
| --- | --- | --- | --- |
| "SOC 2 aligned" (hero trust chip) | `app/page.tsx` | Unsupported certification signal | Remove |
| "SOC 2 · DPDP · ISO 27001" (security badge) | `app/page.tsx` | Unsupported certifications | Remove |
| "SOC 2 aligned, DPDP Act 2023 compliant, ISO 27001 certified" (FAQ) | `app/page.tsx` | Unsupported | Rewrite |
| "SOC 2 Type II certified, DPDP Act 2023 compliant, ISO 27001 certified" (FAQ) | `app/pricing/page.tsx` | Unsupported | Rewrite |
| "SOC 2, DPDP Act 2023 … baked in" | `app/about/page.tsx` | Unsupported | Rewrite |
| "Google API Connection Verified (SOC 2 Aligned)" toast | `src/components/dashboard-v2/header.tsx` | Unsupported, inside product UI | Rewrite |
| "audited annually" | `app/page.tsx` | No evidence of an audit programme | Remove |
| "engineered for the world's most regulated brands" | `app/page.tsx` | Unsupported | Rewrite |

### AI privacy claims

| Claim | Location | Problem | Action |
| --- | --- | --- | --- |
| "Private AI · zero retention" | `app/page.tsx` | Contradicts actual flow to a third-party AI provider | Rewrite |
| "uses private AI with zero training retention on your data" | `app/page.tsx` FAQ | Absolute claim not demonstrable from provider config | Rewrite |
| "never train public models on your data" | `app/pricing/page.tsx` FAQ | Same | Rewrite |
| "Your customer data never trains a public model" | `app/about/page.tsx` | Same | Rewrite |

### Data residency claims

| Claim | Location | Problem | Action |
| --- | --- | --- | --- |
| "Data residency in India (Mumbai & Hyderabad)" | `app/page.tsx` | Single DB host; AI calls leave the region | Remove |
| "All customer data is stored in India (Mumbai & Hyderabad regions)" | `app/page.tsx` FAQ, `app/pricing/page.tsx` FAQ | Same | Remove |
| "India-only data residency baked in" | `app/about/page.tsx` | Same | Remove |
| "Regional data residency" (Enterprise feature) | `app/pricing/page.tsx` | Not implemented | Remove |
| "Data residency" (comparison row) | `app/pricing/page.tsx` | Not implemented | Remove |

### Uptime / SLA claims

| Claim | Location | Problem | Action |
| --- | --- | --- | --- |
| "99.99% uptime SLA" | `app/page.tsx` pricing tier | No formal SLA | Remove |
| "99.99% uptime SLA + priority incident response" | `app/page.tsx` enterprise list | No formal SLA | Remove |
| "99.95% uptime SLA" | `app/pricing/page.tsx` | No formal SLA | Remove |
| "Uptime SLA — 99.9% / 99.95%" (comparison row) | `app/pricing/page.tsx` | No formal SLA | Remove |
| "99.95% Uptime last quarter" | `app/contact/page.tsx` | Unverifiable measurement | Remove |
| "4 hrs Sales SLA" | `app/contact/page.tsx` | No formal SLA | Remove |

### Customer counts & outcome metrics

| Claim | Location | Problem | Action |
| --- | --- | --- | --- |
| "Trusted by 4,200+ local & multi-location businesses" | `app/page.tsx` | Unsupported number | Rewrite |
| Customer logo marquee (Aroma Café, Vertex Dental, Meridian Auto, …) | `app/page.tsx` | Implies real customers | Rewrite to industries |
| "4.8 Average rating lift", "5.2× More reviews with QR", "12s Median AI reply time", "38% Local rank improvement" | `app/page.tsx` Metrics | Unsupported outcome metrics | Remove section |
| "5× your review volume" | `app/page.tsx` | Unsupported | Rewrite |
| 3 named testimonials + "+38% new customers", "4× review volume", "#1 in 12 grids" | `app/page.tsx` | Fabricated customer stories | Remove section |
| "12,400+ Businesses served", "3.2M AI replies sent", "14 Countries live", "4.9★ Customer rating" | `app/about/page.tsx` | Unsupported | Remove section |
| "From a 2am inbox to 12,000 merchants" | `app/about/page.tsx` | Unsupported | Rewrite |
| "Reply time 3 days → 6 minutes", "+312%", "3.8 → 4.7", "+58%" | `app/about/page.tsx` | Unsupported outcome metrics | Rewrite card |
| "12 min Median first response", "4.9 / 5 Support CSAT" | `app/contact/page.tsx` | Unverifiable | Remove |
| "online 24×5. Median first reply is under 12 minutes" | `app/contact/page.tsx` | Unsupported | Rewrite |
| "Median first response: 12 minutes on chat, 2 hours on email" | `app/pricing/page.tsx` | Unsupported | Rewrite |

### Funding, investors, team, company scale

| Claim | Location | Problem | Action |
| --- | --- | --- | --- |
| "Series A + AI Studio … ₹120 Cr raised from operators at Razorpay, Flipkart, and Zomato" | `app/about/page.tsx` | Unsupported funding claim | Remove |
| Investor list: Peak XV Partners, Blume Ventures, Kunal Shah, Naval Ravikant, Titan Capital, Nexus Venture Partners | `app/about/page.tsx` | Names real parties as backers; implies endorsement | Remove section |
| "Backed by operators", "The people betting on us have built this before" | `app/about/page.tsx` | Implies investment | Remove |
| 4 named team members with bios | `app/about/page.tsx` | Presented as real staff | Remove section |
| "24 people across 4 continents" | `app/about/page.tsx` | Unsupported | Remove |
| Timeline 2023–2026 (40 coffee shops, 12 pilot merchants, 100% retention, 10,000 businesses) | `app/about/page.tsx` | Unsupported history | Remove section |
| "founded in 2024 by operators who spent a decade scaling neighborhood businesses" | `app/about/page.tsx` | Unverifiable backstory | Rewrite |
| "HQ Bengaluru" | `app/about/page.tsx` | Contradicts footer/legal pages (Pune) | Rewrite |
| Office phone numbers for Bengaluru / Mumbai / toll-free | `app/contact/page.tsx` | Contradicts the single published number in the footer | Rewrite |

### Internal contradictions (documentation vs documentation)

| Claim | Location | Conflicts with | Action |
| --- | --- | --- | --- |
| "Start 14-day trial", "after the 14-day trial" | `app/pricing/page.tsx` | `TRIAL_DAYS = 7`; navbar says "7 Day Free Trial" | Correct to 7 |
| "30-day money back" | `app/pricing/page.tsx` | No refunds are offered at all | **Removed** |
| "we credit the unused portion to your next invoice" | `app/pricing/page.tsx` FAQ | No refunds or credits are offered | **Removed** |
| "Setup in 8 minutes" vs "Setup in 3 minutes" vs "live in under 3 minutes" | `app/pricing/page.tsx`, `app/page.tsx` | Each other | Make non-numeric |
| Marketing "Enterprise" vs in-app plan "Scale" | `app/pricing/page.tsx`, `app/page.tsx` | `SUBSCRIPTION_PLANS` | **Flag** |
| "supports 20+ languages" | `app/page.tsx` FAQ | Count not evidenced in code | Soften |
| "partner dashboard" for agencies | `app/pricing/page.tsx` FAQ | No such feature found | **Flag** + soften |
| "sathi.app / dashboard", "Sathi AI" in product mockup | `src/components/site/hero-parts.tsx` | Product is GReviewPilot | Rewrite |
| Contact form privacy link `href="#"` | `app/contact/page.tsx` | `/privacy` exists | Point to `/privacy` |

### Google relationship wording

Checked for "Google partner", "Google certified", "Google-endorsed",
"Google-approved", "official Google product". **None found.**

| Claim | Location | Assessment |
| --- | --- | --- |
| "Official Google Business" (connection method card) | `app/dashboard/integrations/google/page.tsx` | Describes *which connection method* (OAuth vs Quick Connect), not an endorsement. Ambiguous enough to reword. |
| "connects via Google's official OAuth" | `app/page.tsx` FAQ | Factually describes Google's OAuth. Reworded to avoid reading as endorsement. |

---

## Intentionally preserved

| Item | Why |
| --- | --- |
| Hero dashboard mockup (Blue Tokri, 4.9★, 12,847 reviews) | Illustrative product UI mockup with an obviously fictional business, not a claim about GReviewPilot's own scale. Standard SaaS practice. |
| Plan prices ₹4,999 / ₹3,999 | Match `SUBSCRIPTION_PLANS`. |
| Feature lists (AI replies, QR campaigns, sentiment, local SEO, website builder, competitor tracking) | Correspond to implemented features. |
| "No credit card", "Cancel anytime" | Supported: free plan requires no payment; cancellation is self-service. |
| RBAC, audit logs, SSO-ready, encrypted credentials | Implemented in code. |
| "20+ languages" → "multiple languages" | Multi-language support exists; only the count was unverifiable. |
| Site-builder preset demo data (`4.9`, `2500 customers served`) in `src/site/registry/presets.ts` | Template placeholder content for **tenant-built** websites, not GReviewPilot's own claims. |

---

## Follow-up: refund policy removed

The business does not offer refunds, so every statement implying one has been
removed rather than reworded:

- deleted `app/refund/page.tsx` (the `/refund` route no longer exists)
- removed the "Refund Policy" link from the footer
- pricing page: the "Money-back window" card became "Try before you pay", and
  the cancellation FAQ now states that fees already paid are not refunded
- `/terms` §8 renamed to "Plans, billing and cancellation" and now states the
  cancellation mechanics and that fees are non-refundable, with a carve-out for
  refund rights that applicable law does not allow to be excluded

`/terms` is now the single authoritative place the billing position is stated.

**Flagged for the business owner:** Indian payment gateways (Razorpay, PayU,
Cashfree) typically require a published refund/cancellation policy URL during
onboarding, and card network rules generally expect a stated cancellation
policy for online subscriptions. A no-refund stance is a legitimate policy, but
it usually still has to be *published*. `/terms` §8 satisfies that if the
gateway accepts it; if a gateway insists on a dedicated URL, the fix is a short
page that states the same no-refund position rather than reinstating a refund
offer. Confirm with the gateway before go-live, and have counsel review the
wording.

Unrelated matches left untouched: the AI reply guardrails in
`src/server/ai/*` ("Never promise refunds", the resolution-tone instruction,
and the `humanize` word-form matcher). Those stop the AI offering refunds in
review replies, which reinforces the policy rather than contradicting it.
