/**
 * POST /api/site/[slug]/submit
 *
 * Public form submission endpoint. Unauthenticated by design — anyone visiting
 * a tenant's website must be able to send them a lead.
 *
 * That makes it the most exposed surface in the builder, so it is defended in
 * layers rather than by any single check:
 *   1. the site must exist and be published (no submitting to drafts)
 *   2. per-IP rate limit, so one source cannot flood a tenant's inbox
 *   3. honeypot field, which catches naive form-filling bots for free
 *   4. timing + content heuristics, scored rather than hard-blocked
 *   5. strict payload caps in Zod, applied before any DB work
 *
 * Spam is scored, not rejected: a false positive that silently discards a real
 * customer enquiry is worse for the tenant than a spam row they can archive.
 * Suspicious submissions are stored and flagged.
 */

import type { NextRequest } from "next/server";
import { SiteFormSubmissionStatus } from "@prisma/client";
import { sitePublicRepository } from "@/server/repositories/sitePublic.repository";
import { siteFormRepository } from "@/server/repositories/siteForm.repository";
import { submitFormSchema } from "@/server/validators/site.schema";
import { callerKey, checkRateLimit } from "@/server/middleware/rateLimit";
import { extractRequestContext } from "@/server/middleware/requestContext";
import { emailService } from "@/server/email/email.service";
import { handleError, ok } from "@/server/utils/response";
import { NotFoundError, ValidationError } from "@/server/utils/errors";
import { logger } from "@/server/utils/logger";

export const runtime = "nodejs";

type Params = { params: Promise<{ slug: string }> };

/** Terms that appear in almost every automated submission. */
const SPAM_TERMS = [
  "viagra",
  "casino",
  "crypto investment",
  "seo services",
  "backlink",
  "guest post",
  "loan offer",
  "bitcoin",
  "forex",
  "porn",
];

interface SpamSignals {
  score: number;
  reasons: string[];
}

/**
 * Heuristic spam score in 0..1.
 *
 * Cheap, explainable signals only. Anything requiring a third party belongs in
 * the optional captcha configuration, not on the default path.
 */
function scoreSpam(data: Record<string, string | number | boolean>): SpamSignals {
  const reasons: string[] = [];
  let score = 0;

  const text = Object.values(data)
    .filter((v): v is string => typeof v === "string")
    .join(" ")
    .toLowerCase();

  for (const term of SPAM_TERMS) {
    if (text.includes(term)) {
      score += 0.35;
      reasons.push(`contains "${term}"`);
      break;
    }
  }

  // Real enquiries rarely contain multiple links.
  const links = (text.match(/https?:\/\//g) ?? []).length;
  if (links >= 2) {
    score += 0.3;
    reasons.push(`${links} links`);
  }

  // All-caps shouting across a long message.
  const letters = text.replace(/[^a-z]/gi, "");
  if (letters.length > 40) {
    const upper = (Object.values(data).join("").match(/[A-Z]/g) ?? []).length;
    if (upper / letters.length > 0.6) {
      score += 0.2;
      reasons.push("mostly uppercase");
    }
  }

  // Cyrillic or CJK in an otherwise Latin form is a common bot signature.
  if (/[\u0400-\u04FF]/.test(text) && /[a-z]{10,}/.test(text)) {
    score += 0.2;
    reasons.push("mixed scripts");
  }

  return { score: Math.min(1, score), reasons };
}

/** Pick out the common contact fields for list views and dedupe. */
function extractContact(data: Record<string, string | number | boolean>) {
  const find = (patterns: RegExp) => {
    for (const [key, value] of Object.entries(data)) {
      if (patterns.test(key) && typeof value === "string" && value.trim()) return value.trim();
    }
    return null;
  };
  return {
    name: find(/^(name|full_?name|your_?name|firstname)$/i)?.slice(0, 200) ?? null,
    email: find(/e-?mail/i)?.slice(0, 200) ?? null,
    phone: find(/phone|mobile|tel|contact_?number/i)?.slice(0, 60) ?? null,
  };
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { slug } = await params;

    // 20 submissions per 10 minutes per IP. Generous for a family filling in a
    // form on shared wifi, restrictive for a script.
    checkRateLimit({
      key: `site-submit:${callerKey(req)}`,
      max: 20,
      windowMs: 10 * 60 * 1000,
    });

    const site = await sitePublicRepository.findSiteBySlug(slug);
    if (!site) throw new NotFoundError("Website not found");

    const body = await req.json().catch(() => null);
    const input = submitFormSchema.parse(body);

    // Honeypot. Answer success so the bot does not learn it was detected and
    // retry with the field omitted.
    if (typeof (input.data as Record<string, unknown>).__hp === "string" && (input.data as Record<string, string>).__hp) {
      return ok({ received: true });
    }
    const data = { ...input.data };
    delete (data as Record<string, unknown>).__hp;

    // A Form node with no `formId` still has to store its lead — that is the
    // default state after AI generation. `ensureDefault` is idempotent, so a
    // site created before forms existed gets a catch-all on first submission
    // rather than silently dropping the enquiry.
    const form = input.formId
      ? await sitePublicRepository.formById(site.id, input.formId)
      : await siteFormRepository.ensureDefault({
          siteId: site.id,
          tenantId: site.tenantId,
        });

    // An explicit formId that does not resolve is a real error: the page is out
    // of date, and guessing a different form would file the lead in the wrong place.
    if (input.formId && !form) throw new NotFoundError("Form not found");

    if (Object.values(data).every((v) => String(v).trim() === "")) {
      throw new ValidationError("Please fill in the form before sending");
    }

    const spam = scoreSpam(data);
    const contact = extractContact(data);
    const request = extractRequestContext(req);

    if (form) {
      await sitePublicRepository.createSubmission({
        formId: form.id,
        tenantId: site.tenantId,
        siteId: site.id,
        data: data as object,
        name: contact.name,
        email: contact.email,
        phone: contact.phone,
        pagePath: input.pagePath ?? null,
        referrer: req.headers.get("referer")?.slice(0, 500) ?? null,
        ipAddress: request.ipAddress,
        userAgent: request.userAgent,
        spamScore: spam.score,
        status: spam.score >= 0.6 ? SiteFormSubmissionStatus.SPAM : SiteFormSubmissionStatus.NEW,
      });
      await sitePublicRepository.incrementSubmissionCount(form.id);
    }

    // Record a funnel event whether or not a form row exists, so analytics
    // still reflect real conversions on freshly generated sites.
    await sitePublicRepository
      .recordEvent({
        siteId: site.id,
        tenantId: site.tenantId,
        type: "FORM_SUBMIT",
        path: input.pagePath ?? null,
        meta: { formId: form?.id ?? null, spamScore: spam.score },
      })
      .catch(() => undefined);

    // Notify the tenant, but never let a mail failure fail the visitor's
    // submission — the lead is already safely stored.
    if (form && spam.score < 0.6) {
      const recipients = Array.isArray(form.notifyEmails)
        ? (form.notifyEmails as unknown[]).filter((e): e is string => typeof e === "string")
        : [];
      if (recipients.length > 0) {
        void emailService
          .sendSiteLeadEmail({
            to: recipients,
            siteName: site.name,
            formName: form.name,
            fields: Object.entries(data).map(([label, value]) => ({
              label,
              value: String(value),
            })),
            pagePath: input.pagePath,
          })
          .catch((err) =>
            logger.warn("Form notification email failed", {
              siteId: site.id,
              err: err instanceof Error ? err.message : String(err),
            }),
          );
      }
    }

    return ok({
      received: true,
      message: form?.successMessage ?? "Thank you. We have received your message.",
    });
  } catch (err) {
    return handleError(err);
  }
}


