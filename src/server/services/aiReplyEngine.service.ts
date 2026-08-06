/**
 * AI Review Reply engine.
 *
 * Orchestrates the whole reply lifecycle: read the review, classify it, compose
 * a prompt from the business personality, produce text, check it, and route it
 * according to the tenant's approval mode.
 *
 * No AI provider is wired up here yet, by design for this phase. Composition is
 * complete and the seam is explicit — `ReplyProducer` — so plugging Gemini in
 * later is a one-line registration and nothing else in the pipeline changes.
 * Until then a deterministic composer fills the seam, which has a real benefit
 * beyond stubbing: the entire pipeline (classification, duplicate protection,
 * humanization, approval routing, learning capture) is exercisable and testable
 * offline, and remains the fallback when the provider is down.
 */

import { AuditAction, ReplyDraftStatus, type Prisma } from "@prisma/client";
import type { AuthContext } from "@/server/auth/requireSession";
import { prisma } from "@/server/db/prisma";
import { aiReplyDraftRepository } from "@/server/repositories/businessPersonality.repository";
import { auditRepository } from "@/server/repositories/audit.repository";
import { extractRequestContext } from "@/server/middleware/requestContext";
import { businessPersonalityService } from "./businessPersonality.service";
import { reviewService } from "./review.service";
import {
  buildReplyPrompt,
  type BuiltPrompt,
  type PromptSection,
} from "@/server/ai/promptBuilder";
import {
  classifyReplySentiment,
  escalationReasons,
  lengthGuidance,
  needsHumanEscalation,
  temperatureFor,
} from "@/server/ai/replySentiment";
import {
  checkDuplicate,
  fingerprint,
  inspectReply,
  isPublishable,
  openingFingerprint,
  type HumanizationIssue,
} from "@/server/ai/humanize";
import type { BusinessKnowledge, ReplySentiment } from "@/server/ai/personality.types";
import { composeDeterministicReply } from "@/server/ai/deterministicReply";
import { ForbiddenError, NotFoundError, ValidationError } from "@/server/utils/errors";
import { logger } from "@/server/utils/logger";

/** Hard ceiling on a public reply, matching the existing generator. */
const MAX_REPLY_CHARS = 1200;
/** How many recent sent replies duplicate protection compares against. */
const DUPLICATE_WINDOW = 40;
/** Attempts before accepting a reply that still looks repetitive. */
const MAX_ATTEMPTS = 3;

// =====================================================================
// Provider seam
// =====================================================================

export interface ReplyProducerInput {
  prompt: BuiltPrompt;
  knowledge: BusinessKnowledge;
  sentiment: ReplySentiment;
  review: { reviewerName?: string | null; starRating: number; comment?: string | null };
  temperature: number;
}

export interface ReplyProducerResult {
  text: string;
  source: "ai" | "template";
}

export type ReplyProducer = (input: ReplyProducerInput) => Promise<ReplyProducerResult>;

/**
 * Currently registered producer. Defaults to the deterministic composer.
 *
 * A module-level slot rather than a constructor argument so the AI phase can
 * register a provider once at startup without touching any call site.
 */
let producer: ReplyProducer = async (input) => ({
  text: composeDeterministicReply({
    knowledge: input.knowledge,
    sentiment: input.sentiment,
    review: input.review,
  }),
  source: "template",
});

export function registerReplyProducer(next: ReplyProducer): void {
  producer = next;
}

// =====================================================================
// Types
// =====================================================================

export interface GeneratedDraft {
  id: string | null;
  text: string;
  source: "ai" | "template";
  sentiment: ReplySentiment;
  status: ReplyDraftStatus;
  /** Blocking + advisory findings, so the UI can explain any hold. */
  issues: HumanizationIssue[];
  /** True when a human must handle it regardless of approval mode. */
  escalated: boolean;
  escalationReasons: string[];
  /** How many attempts duplicate protection needed. */
  attempts: number;
  /** Prompt sections used, so the preview can show what shaped the reply. */
  sections: PromptSection[];
  language: string;
}

// =====================================================================
// Core generation
// =====================================================================

interface ReviewFacts {
  id?: string;
  reviewerName?: string | null;
  starRating: number;
  comment?: string | null;
  detectedLanguage?: string | null;
}

/**
 * Produce a reply for a review, applying every rule.
 *
 * Retries on duplicates rather than returning one, feeding the rejection reason
 * back into the prompt so the next attempt knows what to avoid. Accepts the
 * final attempt even if still similar: a slightly repetitive reply is better
 * than no reply, and the caller is told via `issues` either way.
 */
async function produceReply(args: {
  knowledge: BusinessKnowledge;
  review: ReviewFacts;
  tenantId: string;
}): Promise<Omit<GeneratedDraft, "id" | "status">> {
  const { knowledge, review } = args;

  const sentiment = classifyReplySentiment({
    starRating: review.starRating,
    comment: review.comment,
  });
  const escalated = needsHumanEscalation({
    starRating: review.starRating,
    comment: review.comment,
  });

  const recent = await aiReplyDraftRepository
    .recentSent(args.tenantId, DUPLICATE_WINDOW)
    .catch(() => []);
  const priorReplies = recent.map((r) => ({
    text: r.sentText ?? r.generatedText,
    fingerprint: r.fingerprint,
    openingHash: r.openingHash,
  }));
  const avoidOpenings = priorReplies
    .map((p) => p.text.split(/(?<=[.!?])\s+/)[0]?.trim())
    .filter((s): s is string => Boolean(s))
    .slice(0, 8);

  const length = lengthGuidance(knowledge.voice.replyLength);
  const temperature = temperatureFor(knowledge.voice.confidenceLevel, sentiment);
  const language =
    knowledge.language.autoDetect && review.detectedLanguage
      ? review.detectedLanguage
      : knowledge.language.primary;

  let attempt = 0;
  let regenerateReason: string | null = null;
  let best: { text: string; source: "ai" | "template" } | null = null;
  let prompt: BuiltPrompt = buildReplyPrompt({ knowledge, review, sentiment });

  while (attempt < MAX_ATTEMPTS) {
    attempt += 1;
    prompt = buildReplyPrompt({
      knowledge,
      review,
      sentiment,
      avoidOpenings,
      regenerateReason,
    });

    let result: ReplyProducerResult;
    try {
      result = await producer({ prompt, knowledge, sentiment, review, temperature });
    } catch (err) {
      // A producer failure must never surface as a 500: fall through to the
      // deterministic composer so the user still gets a starting point.
      logger.warn("Reply producer failed — using deterministic composer", {
        err: err instanceof Error ? err.message : String(err),
      });
      result = {
        text: composeDeterministicReply({ knowledge, sentiment, review, variant: attempt }),
        source: "template",
      };
    }

    const text = result.text.trim().slice(0, MAX_REPLY_CHARS);
    best = { text, source: result.source };

    const dup = checkDuplicate(text, priorReplies);
    if (!dup.isDuplicate) break;

    regenerateReason =
      dup.reason === "opening"
        ? "the opening repeated a recent reply"
        : `too similar to a recent reply (${Math.round(dup.score * 100)}% overlap)`;
  }

  const text = best?.text ?? "";
  const issues = inspectReply({
    text,
    minSentences: length.min,
    maxSentences: length.max,
    neverSay: knowledge.restrictions.neverSay,
    maxChars: MAX_REPLY_CHARS,
  });

  return {
    text,
    source: best?.source ?? "template",
    sentiment,
    issues,
    escalated,
    escalationReasons: escalationReasons({
      starRating: review.starRating,
      comment: review.comment,
    }),
    attempts: attempt,
    sections: prompt.sections,
    language,
  };
}

// =====================================================================
// Service
// =====================================================================

export const aiReplyEngineService = {
  /**
   * Draft a reply to a hypothetical review, persisting nothing.
   *
   * The testing surface for the onboarding wizard: a business can see how its
   * answers behave before it has any real reviews, which is exactly when it is
   * configuring them.
   */
  async preview(
    ctx: AuthContext,
    input: { starRating: number; comment?: string; reviewerName?: string; language?: string },
  ): Promise<GeneratedDraft> {
    const knowledge = await businessPersonalityService.getKnowledge(ctx);
    const produced = await produceReply({
      knowledge,
      tenantId: ctx.tenantId,
      review: {
        starRating: input.starRating,
        comment: input.comment ?? null,
        reviewerName: input.reviewerName ?? null,
        detectedLanguage: input.language ?? null,
      },
    });
    return { ...produced, id: null, status: ReplyDraftStatus.DRAFT };
  },

  /**
   * Draft a reply for a real review and persist it.
   *
   * Status is decided here, not by the caller, so approval mode cannot be
   * bypassed by hitting a different endpoint. Escalated reviews and drafts with
   * blocking issues are forced into review even under AUTO_SEND — an automation
   * setting should not be able to auto-publish an apology for an alleged
   * injury, or a reply containing a leftover placeholder.
   */
  async generateForReview(
    ctx: AuthContext,
    input: { reviewId: string; regenerate?: boolean },
    req?: Request,
  ): Promise<GeneratedDraft> {
    const review = await prisma.review.findFirst({
      where: { id: input.reviewId, tenantId: ctx.tenantId },
      select: {
        id: true,
        starRating: true,
        comment: true,
        reviewerName: true,
        isArchived: true,
        locationId: true,
      },
    });
    if (!review) throw new NotFoundError("Review not found");
    if (review.isArchived) throw new ForbiddenError("Cannot reply to an archived review");

    const knowledge = await businessPersonalityService.getKnowledge(ctx, review.locationId);
    const produced = await produceReply({
      knowledge,
      tenantId: ctx.tenantId,
      review: {
        id: review.id,
        starRating: review.starRating,
        comment: review.comment,
        reviewerName: review.reviewerName,
      },
    });

    const blocked = !isPublishable(produced.issues);
    const status = resolveInitialStatus({
      approvalMode: knowledge.automation.approvalMode,
      escalated: produced.escalated,
      blocked,
    });

    const draft = await aiReplyDraftRepository.create({
      tenantId: ctx.tenantId,
      reviewId: review.id,
      status,
      generatedText: produced.text,
      sentiment: produced.sentiment,
      starRating: review.starRating,
      language: produced.language,
      source: produced.source,
      personalityRevision: knowledge.meta.revision,
      fingerprint: fingerprint(produced.text),
      openingHash: openingFingerprint(produced.text),
      generatedById: ctx.userId,
    });

    const rc = req ? extractRequestContext(req) : null;
    await auditRepository.record({
      action: AuditAction.AI_REPLY_DRAFTED,
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      metadata: {
        reviewId: review.id,
        draftId: draft.id,
        sentiment: produced.sentiment,
        source: produced.source,
        status,
        escalated: produced.escalated,
        attempts: produced.attempts,
      },
      ...(rc ? { ipAddress: rc.ipAddress, userAgent: rc.userAgent, browser: rc.browser, device: rc.device } : {}),
    });

    return { ...produced, id: draft.id, status };
  },

  async listDrafts(
    ctx: AuthContext,
    input: { status?: ReplyDraftStatus; reviewId?: string; page: number; pageSize: number },
  ) {
    const [items, total] = await aiReplyDraftRepository.list({
      tenantId: ctx.tenantId,
      status: input.status,
      reviewId: input.reviewId,
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
    });
    return {
      items: items.map((d) => ({
        id: d.id,
        reviewId: d.reviewId,
        status: d.status,
        generatedText: d.generatedText,
        editedText: d.editedText,
        sentText: d.sentText,
        sentiment: d.sentiment,
        starRating: d.starRating,
        source: d.source,
        createdAt: d.createdAt.toISOString(),
        sentAt: d.sentAt?.toISOString() ?? null,
        review: d.review
          ? {
              id: d.review.id,
              reviewerName: d.review.reviewerName,
              starRating: d.review.starRating,
              comment: d.review.comment,
            }
          : null,
      })),
      total,
      page: input.page,
      pageSize: input.pageSize,
    };
  },

  /**
   * Act on a draft: approve, reject, send, or discard.
   *
   * An edit is stored in `editedText` alongside the untouched `generatedText`.
   * That difference is the learning signal the spec asks for — overwriting the
   * original would make it unmeasurable, and it is the only honest record of
   * how far the engine was off.
   */
  async decide(
    ctx: AuthContext,
    draftId: string,
    input: { action: "approve" | "reject" | "send" | "discard"; editedText?: string; reason?: string },
    req?: Request,
  ) {
    const draft = await aiReplyDraftRepository.findByIdForTenant(draftId, ctx.tenantId);
    if (!draft) throw new NotFoundError("Draft not found");
    if (draft.status === ReplyDraftStatus.SENT) {
      throw new ValidationError("This reply has already been sent");
    }

    const edited = input.editedText?.trim();
    const wasEdited = Boolean(edited && edited !== draft.generatedText);

    switch (input.action) {
      case "discard":
        await aiReplyDraftRepository.update(draftId, {
          status: ReplyDraftStatus.DISCARDED,
          reviewedById: ctx.userId,
          reviewedAt: new Date(),
        });
        break;

      case "reject":
        await aiReplyDraftRepository.update(draftId, {
          status: ReplyDraftStatus.REJECTED,
          reviewedById: ctx.userId,
          reviewedAt: new Date(),
          ...(edited ? { editedText: edited } : {}),
        });
        await this.audit(ctx, AuditAction.AI_REPLY_REJECTED, { draftId, reason: input.reason ?? null }, req);
        break;

      case "approve":
        await aiReplyDraftRepository.update(draftId, {
          status: ReplyDraftStatus.APPROVED,
          reviewedById: ctx.userId,
          reviewedAt: new Date(),
          ...(edited ? { editedText: edited } : {}),
        });
        await this.audit(ctx, AuditAction.AI_REPLY_APPROVED, { draftId }, req);
        break;

      case "send": {
        if (!draft.reviewId) {
          throw new ValidationError("This draft is not attached to a review");
        }
        const text = edited || draft.editedText || draft.generatedText;

        // Re-check before publishing. The text may have been edited since
        // generation, and a human edit can introduce exactly the problems the
        // engine is checked for — a placeholder, or a forbidden topic.
        const knowledge = await businessPersonalityService.getKnowledge(ctx);
        const length = lengthGuidance(knowledge.voice.replyLength);
        const issues = inspectReply({
          text,
          minSentences: length.min,
          maxSentences: length.max,
          neverSay: knowledge.restrictions.neverSay,
          maxChars: MAX_REPLY_CHARS,
        });
        if (!isPublishable(issues)) {
          throw new ValidationError(
            `This reply cannot be sent: ${issues.find((i) => i.severity === "block")?.detail}`,
          );
        }

        // Reuses the existing reply path so history, review status, and the
        // REVIEW_REPLIED audit row all behave exactly as a manual reply.
        await reviewService.reply(
          ctx,
          draft.reviewId,
          { comment: text },
          req ?? new Request("http://localhost"),
        );

        await aiReplyDraftRepository.update(draftId, {
          status: ReplyDraftStatus.SENT,
          sentText: text,
          ...(wasEdited ? { editedText: edited } : {}),
          reviewedById: ctx.userId,
          reviewedAt: draft.reviewedAt ?? new Date(),
          sentAt: new Date(),
          // Recomputed from what was actually sent, so duplicate protection
          // compares against published wording rather than the draft.
          fingerprint: fingerprint(text),
          openingHash: openingFingerprint(text),
        });
        await this.audit(ctx, AuditAction.AI_REPLY_SENT, { draftId, edited: wasEdited }, req);
        break;
      }
    }

    if (wasEdited && input.action !== "discard") {
      await this.audit(ctx, AuditAction.AI_REPLY_EDITED, { draftId }, req);
    }

    const updated = await aiReplyDraftRepository.findByIdForTenant(draftId, ctx.tenantId);
    return {
      id: draftId,
      status: updated?.status ?? ReplyDraftStatus.DISCARDED,
      sentText: updated?.sentText ?? null,
    };
  },

  /**
   * Engine performance over a window.
   *
   * "Time saved" is a modelled estimate, not a measurement, and is labelled as
   * such: assume three minutes to write a reply by hand, and count what was
   * sent. Presenting a guess as a measured figure would be worse than omitting
   * it, so the unit is exposed for the UI to caveat.
   */
  async analytics(ctx: AuthContext, days: number) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const { byStatus, edited, sentRows } = await aiReplyDraftRepository.analytics(
      ctx.tenantId,
      since,
    );

    const generated = Object.values(byStatus).reduce((a, b) => a + b, 0);
    const sent = byStatus[ReplyDraftStatus.SENT] ?? 0;
    const approved = (byStatus[ReplyDraftStatus.APPROVED] ?? 0) + sent;

    const approvalTimes = sentRows
      .map((t) => (t.sentAt ? t.sentAt.getTime() - t.requestedAt.getTime() : -1))
      .filter((ms) => ms >= 0);
    const avgApprovalMs =
      approvalTimes.length > 0
        ? Math.round(approvalTimes.reduce((a, b) => a + b, 0) / approvalTimes.length)
        : null;

    const ratings = sentRows.map((t) => t.starRating).filter((r): r is number => typeof r === "number");
    const avgRating =
      ratings.length > 0
        ? Number((ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(2))
        : null;

    return {
      periodDays: days,
      generated,
      approved,
      sent,
      edited,
      rejected: byStatus[ReplyDraftStatus.REJECTED] ?? 0,
      pending: byStatus[ReplyDraftStatus.PENDING_APPROVAL] ?? 0,
      /** Share of sent replies a human changed. High means the voice is off. */
      editRate: sent > 0 ? Number((edited / sent).toFixed(3)) : null,
      avgApprovalMs,
      avgRatingRepliedTo: avgRating,
      estimatedMinutesSaved: sent * 3,
      estimateBasis: "3 minutes per manually written reply",
      aiShare:
        sentRows.length > 0
          ? Number(
              (sentRows.filter((t) => t.source === "ai").length / sentRows.length).toFixed(3),
            )
          : null,
    };
  },

  /** Shared audit helper — the metadata shape is identical across actions. */
  async audit(
    ctx: AuthContext,
    action: AuditAction,
    metadata: Prisma.InputJsonObject,
    req?: Request,
  ) {
    const rc = req ? extractRequestContext(req) : null;
    await auditRepository.record({
      action,
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      metadata,
      ...(rc ? { ipAddress: rc.ipAddress, userAgent: rc.userAgent, browser: rc.browser, device: rc.device } : {}),
    });
  },
};

/**
 * Where a fresh draft lands.
 *
 * Escalation and blocking issues override the tenant's automation setting.
 * Auto-send exists to save time on routine praise, not to publish an unreviewed
 * response to a legal allegation.
 */
export function resolveInitialStatus(args: {
  approvalMode: BusinessKnowledge["automation"]["approvalMode"];
  escalated: boolean;
  blocked: boolean;
}): ReplyDraftStatus {
  if (args.escalated || args.blocked) return ReplyDraftStatus.PENDING_APPROVAL;
  switch (args.approvalMode) {
    case "AUTO_SEND":
      return ReplyDraftStatus.APPROVED;
    case "MANAGER_APPROVAL":
      return ReplyDraftStatus.PENDING_APPROVAL;
    case "DRAFT_ONLY":
      return ReplyDraftStatus.DRAFT;
  }
}
