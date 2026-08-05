/**
 * Review service.
 *
 * Handles listing, replying, archiving, tags, manual creation, stats,
 * and bulk operations. Google review sync is in a separate file
 * (services/google/googleReviewSync.service.ts) and calls into this
 * service's upsert methods.
 */

import {
  AuditAction,
  Prisma,
  ReviewSource,
  ReviewStatus,
} from "@prisma/client";
import { auditRepository } from "@/server/repositories/audit.repository";
import { locationRepository } from "@/server/repositories/location.repository";
import { reviewRepository } from "@/server/repositories/review.repository";
import { reviewTagRepository } from "@/server/repositories/reviewTag.repository";
import { analyzeAndSaveReview } from "@/server/services/sentiment.service";
import { extractRequestContext } from "@/server/middleware/requestContext";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "@/server/utils/errors";
import {
  buildPagedResult,
  parsePagination,
} from "@/server/utils/pagination";
import type { AuthContext } from "@/server/auth/requireSession";
import type {
  BulkArchiveInput,
  BulkReplyInput,
  CreateManualReviewInput,
  CreateTagInput,
  ListReviewsQuery,
  ReplyInput,
} from "@/server/validators/review.schema";
import { prisma } from "@/server/db/prisma";

export const reviewService = {
  // ============================================================
  // LIST
  // ============================================================
  async list(ctx: AuthContext, req: Request, filter: ListReviewsQuery) {
    const url = new URL(req.url);
    const pagination = parsePagination(url.searchParams);
    const from = filter.from ? new Date(`${filter.from}T00:00:00Z`) : undefined;
    const to = filter.to ? new Date(`${filter.to}T23:59:59Z`) : undefined;
    const { items, total } = await reviewRepository.list({
      tenantId: ctx.tenantId,
      filter: { ...filter, from, to },
      pagination,
    });
    return buildPagedResult(items, total, pagination);
  },

  async getById(ctx: AuthContext, id: string) {
    const review = await reviewRepository.findByIdForTenant(id, ctx.tenantId);
    if (!review) throw new NotFoundError("Review not found");
    return review;
  },

  // ============================================================
  // STATS
  // ============================================================
  async stats(ctx: AuthContext) {
    const [total, pending, replied, archived, avgResult] =
      await reviewRepository.stats(ctx.tenantId);
    return {
      total,
      pending,
      replied,
      archived,
      averageRating: avgResult._avg.starRating
        ? Number(avgResult._avg.starRating.toFixed(2))
        : null,
    };
  },

  // ============================================================
  // REPLY
  // ============================================================
  async reply(ctx: AuthContext, reviewId: string, input: ReplyInput, req: Request) {
    const review = await reviewRepository.findByIdForTenant(reviewId, ctx.tenantId);
    if (!review) throw new NotFoundError("Review not found");
    if (review.isArchived) {
      throw new ForbiddenError("Cannot reply to an archived review");
    }

    // Soft-delete any prior active reply (keeps timeline history).
    await prisma.reviewReply.updateMany({
      where: { reviewId, deletedAt: null },
      data: { deletedAt: new Date() },
    });

    const reply = await prisma.reviewReply.create({
      data: {
        review: { connect: { id: reviewId } },
        comment: input.comment,
        repliedBy: { connect: { id: ctx.userId } },
      },
      include: {
        repliedBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });

    await reviewRepository.update(reviewId, { status: ReviewStatus.REPLIED });

    const rc = extractRequestContext(req);
    await auditRepository.record({
      action: AuditAction.REVIEW_REPLIED,
      userId: ctx.userId,
      tenantId: ctx.tenantId,
      ipAddress: rc.ipAddress,
      userAgent: rc.userAgent,
      browser: rc.browser,
      device: rc.device,
      metadata: { reviewId, replyId: reply.id },
    });

    return reply;
  },

  async editReply(
    ctx: AuthContext,
    reviewId: string,
    replyId: string,
    comment: string,
    req: Request,
  ) {
    const review = await reviewRepository.findByIdForTenant(reviewId, ctx.tenantId);
    if (!review) throw new NotFoundError("Review not found");
    const reply = await prisma.reviewReply.findFirst({
      where: { id: replyId, reviewId, deletedAt: null },
    });
    if (!reply) throw new NotFoundError("Reply not found");

    const updated = await prisma.reviewReply.update({
      where: { id: replyId },
      data: { comment },
    });

    const rc = extractRequestContext(req);
    await auditRepository.record({
      action: AuditAction.REVIEW_REPLY_EDITED,
      userId: ctx.userId,
      tenantId: ctx.tenantId,
      ipAddress: rc.ipAddress,
      metadata: { reviewId, replyId },
    });

    return updated;
  },

  async deleteReply(ctx: AuthContext, reviewId: string, replyId: string, req: Request) {
    const review = await reviewRepository.findByIdForTenant(reviewId, ctx.tenantId);
    if (!review) throw new NotFoundError("Review not found");
    const reply = await prisma.reviewReply.findFirst({
      where: { id: replyId, reviewId, deletedAt: null },
    });
    if (!reply) throw new NotFoundError("Reply not found");

    await prisma.reviewReply.update({
      where: { id: replyId },
      data: { deletedAt: new Date() },
    });
    // If no other active reply, revert status to NEW.
    const remaining = await prisma.reviewReply.count({
      where: { reviewId, deletedAt: null },
    });
    if (remaining === 0) {
      await reviewRepository.update(reviewId, { status: ReviewStatus.NEW });
    }

    const rc = extractRequestContext(req);
    await auditRepository.record({
      action: AuditAction.REVIEW_REPLY_DELETED,
      userId: ctx.userId,
      tenantId: ctx.tenantId,
      ipAddress: rc.ipAddress,
      metadata: { reviewId, replyId },
    });

    return { deleted: replyId };
  },

  // ============================================================
  // ARCHIVE / UNARCHIVE
  // ============================================================
  async archive(ctx: AuthContext, id: string, archive: boolean, req: Request) {
    const review = await reviewRepository.findByIdForTenant(id, ctx.tenantId);
    if (!review) throw new NotFoundError("Review not found");
    if (review.isArchived === archive) return review;

    const updated = await reviewRepository.update(id, {
      isArchived: archive,
      archivedAt: archive ? new Date() : null,
      status: archive ? ReviewStatus.ARCHIVED : ReviewStatus.NEW,
    });

    const rc = extractRequestContext(req);
    await auditRepository.record({
      action: archive
        ? AuditAction.REVIEW_ARCHIVED
        : AuditAction.REVIEW_UNARCHIVED,
      userId: ctx.userId,
      tenantId: ctx.tenantId,
      ipAddress: rc.ipAddress,
      metadata: { reviewId: id },
    });

    return updated;
  },

  // ============================================================
  // TAGS
  // ============================================================
  async listTags(ctx: AuthContext) {
    return reviewTagRepository.listForTenant(ctx.tenantId);
  },

  async createTag(ctx: AuthContext, input: CreateTagInput) {
    const existing = await reviewTagRepository.findByName(
      ctx.tenantId,
      input.name,
    );
    if (existing) throw new ConflictError("CONFLICT", "Tag already exists");
    return reviewTagRepository.create({
      tenantId: ctx.tenantId,
      name: input.name,
      color: input.color,
    });
  },

  async deleteTag(ctx: AuthContext, id: string) {
    const tag = await reviewTagRepository.findByIdForTenant(id, ctx.tenantId);
    if (!tag) throw new NotFoundError("Tag not found");
    await reviewTagRepository.remove(id);
    return { deleted: id };
  },

  async addTag(ctx: AuthContext, reviewId: string, tagId: string, req: Request) {
    const review = await reviewRepository.findByIdForTenant(reviewId, ctx.tenantId);
    if (!review) throw new NotFoundError("Review not found");
    const tag = await reviewTagRepository.findByIdForTenant(tagId, ctx.tenantId);
    if (!tag) throw new NotFoundError("Tag not found");
    const existing = await reviewTagRepository.findLink(reviewId, tagId);
    if (existing) return existing;
    const link = await reviewTagRepository.addToReview(reviewId, tagId);

    await auditRepository.record({
      action: AuditAction.REVIEW_TAGGED,
      userId: ctx.userId,
      tenantId: ctx.tenantId,
      metadata: { reviewId, tagId, tagName: tag.name },
    });
    return link;
  },

  async removeTag(ctx: AuthContext, reviewId: string, tagId: string, req: Request) {
    const review = await reviewRepository.findByIdForTenant(reviewId, ctx.tenantId);
    if (!review) throw new NotFoundError("Review not found");
    await reviewTagRepository.removeFromReview(reviewId, tagId);
    await auditRepository.record({
      action: AuditAction.REVIEW_TAG_REMOVED,
      userId: ctx.userId,
      tenantId: ctx.tenantId,
      metadata: { reviewId, tagId },
    });
    return { removed: tagId };
  },

  // ============================================================
  // BULK
  // ============================================================
  async bulkReply(ctx: AuthContext, input: BulkReplyInput, req: Request) {
    let replied = 0;
    for (const reviewId of input.reviewIds) {
      const review = await reviewRepository.findByIdForTenant(reviewId, ctx.tenantId);
      if (!review || review.isArchived) continue;
      await prisma.reviewReply.updateMany({
        where: { reviewId, deletedAt: null },
        data: { deletedAt: new Date() },
      });
      await prisma.reviewReply.create({
        data: {
          review: { connect: { id: reviewId } },
          comment: input.comment,
          repliedBy: { connect: { id: ctx.userId } },
        },
      });
      await reviewRepository.update(reviewId, { status: ReviewStatus.REPLIED });
      replied += 1;
    }
    const rc = extractRequestContext(req);
    await auditRepository.record({
      action: AuditAction.REVIEW_BULK_REPLIED,
      userId: ctx.userId,
      tenantId: ctx.tenantId,
      ipAddress: rc.ipAddress,
      metadata: { count: replied, reviewIds: input.reviewIds },
    });
    return { replied };
  },

  async bulkArchive(ctx: AuthContext, input: BulkArchiveInput, req: Request) {
    const result = await reviewRepository.archiveMany(
      ctx.tenantId,
      input.reviewIds,
      input.archive,
    );
    const rc = extractRequestContext(req);
    await auditRepository.record({
      action: AuditAction.REVIEW_BULK_ARCHIVED,
      userId: ctx.userId,
      tenantId: ctx.tenantId,
      ipAddress: rc.ipAddress,
      metadata: {
        count: result.count,
        archive: input.archive,
        reviewIds: input.reviewIds,
      },
    });
    return { affected: result.count, archive: input.archive };
  },

  // ============================================================
  // MANUAL CREATE
  // ============================================================
  async createManual(ctx: AuthContext, input: CreateManualReviewInput, req: Request) {
    if (input.locationId) {
      const loc = await locationRepository.findByIdForTenant(
        input.locationId,
        ctx.tenantId,
      );
      if (!loc) throw new ValidationError("Location not found");
    }
    const review = await reviewRepository.create({
      tenant: { connect: { id: ctx.tenantId } },
      ...(input.locationId
        ? { location: { connect: { id: input.locationId } } }
        : {}),
      source: ReviewSource.MANUAL,
      status: ReviewStatus.NEW,
      reviewerName: input.reviewerName ?? null,
      starRating: input.starRating,
      comment: input.comment ?? null,
      reviewCreatedAt: input.reviewCreatedAt,
    });

    // Classify sentiment inline so the review lands fully populated.
    // Never let an AI hiccup fail the create.
    await analyzeAndSaveReview(review.id);

    // Re-read so the response carries the sentiment fields.
    const withSentiment = await reviewRepository.findByIdForTenant(
      review.id,
      ctx.tenantId,
    );
    return withSentiment ?? review;
  },
};
