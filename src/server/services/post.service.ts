/**
 * Google Posts service.
 *
 * Manages the full lifecycle of posts: draft, schedule, publish,
 * edit, duplicate, and delete. Publishing to Google is a separate
 * step — currently a placeholder that just flips status to PUBLISHED.
 * Real Google publishing (calling the Local Posts API) lands with
 * the background-job module.
 */

import { AuditAction, PostStatus, Prisma } from "@prisma/client";
import { auditRepository } from "@/server/repositories/audit.repository";
import { locationRepository } from "@/server/repositories/location.repository";
import { postRepository } from "@/server/repositories/post.repository";
import { extractRequestContext } from "@/server/middleware/requestContext";
import {
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
  CreatePostInput,
  ListPostsQuery,
  PublishPostInput,
  UpdatePostInput,
} from "@/server/validators/post.schema";

export const postService = {
  // ============================================================
  // LIST
  // ============================================================
  async list(ctx: AuthContext, req: Request, filter: ListPostsQuery) {
    const url = new URL(req.url);
    const pagination = parsePagination(url.searchParams);
    const { items, total } = await postRepository.list({
      tenantId: ctx.tenantId,
      filter,
      pagination,
    });
    return buildPagedResult(items, total, pagination);
  },

  async getById(ctx: AuthContext, id: string) {
    const post = await postRepository.findByIdForTenant(id, ctx.tenantId);
    if (!post) throw new NotFoundError("Post not found");
    return post;
  },

  async stats(ctx: AuthContext) {
    const groups = await postRepository.countByStatus(ctx.tenantId);
    const map: Record<string, number> = {};
    for (const g of groups) map[g.status] = g._count._all;
    return {
      draft: map[PostStatus.DRAFT] ?? 0,
      scheduled: map[PostStatus.SCHEDULED] ?? 0,
      published: map[PostStatus.PUBLISHED] ?? 0,
      failed: map[PostStatus.FAILED] ?? 0,
      total: Object.values(map).reduce((a, b) => a + b, 0),
    };
  },

  // ============================================================
  // CREATE
  // ============================================================
  async create(ctx: AuthContext, input: CreatePostInput, req: Request) {
    if (input.locationId) {
      const loc = await locationRepository.findByIdForTenant(
        input.locationId,
        ctx.tenantId,
      );
      if (!loc) throw new ValidationError("Location not found");
    }

    const status = input.scheduledAt
      ? PostStatus.SCHEDULED
      : PostStatus.DRAFT;

    const post = await postRepository.create({
      tenant: { connect: { id: ctx.tenantId } },
      ...(input.locationId
        ? { location: { connect: { id: input.locationId } } }
        : {}),
      type: input.type,
      status,
      title: input.title ?? null,
      body: input.body,
      mediaIds: input.mediaIds
        ? (input.mediaIds as unknown as Prisma.InputJsonValue)
        : Prisma.JsonNull,
      ctaType: input.ctaType,
      ctaUrl: input.ctaUrl ?? null,
      eventTitle: input.eventTitle ?? null,
      startDate: input.startDate ? new Date(input.startDate) : null,
      endDate: input.endDate ? new Date(input.endDate) : null,
      couponCode: input.couponCode ?? null,
      termsConditions: input.termsConditions ?? null,
      redeemOnlineUrl: input.redeemOnlineUrl ?? null,
      scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null,
      createdBy: { connect: { id: ctx.userId } },
    });

    const rc = extractRequestContext(req);
    await auditRepository.record({
      action: AuditAction.POST_CREATED,
      userId: ctx.userId,
      tenantId: ctx.tenantId,
      ipAddress: rc.ipAddress,
      metadata: { postId: post.id, type: input.type, status },
    });

    return post;
  },

  // ============================================================
  // UPDATE (drafts / scheduled only)
  // ============================================================
  async update(ctx: AuthContext, id: string, input: UpdatePostInput, req: Request) {
    const existing = await postRepository.findByIdForTenant(id, ctx.tenantId);
    if (!existing) throw new NotFoundError("Post not found");
    if (existing.status === PostStatus.PUBLISHED) {
      throw new ForbiddenError("Published posts cannot be edited. Duplicate and republish.");
    }
    if (existing.deletedAt) {
      throw new ForbiddenError("Cannot edit a deleted post");
    }

    if (input.locationId) {
      const loc = await locationRepository.findByIdForTenant(
        input.locationId,
        ctx.tenantId,
      );
      if (!loc) throw new ValidationError("Location not found");
    }

    const data: Prisma.GooglePostUpdateInput = {
      ...(input.type ? { type: input.type } : {}),
      ...(input.title !== undefined ? { title: input.title ?? null } : {}),
      ...(input.body ? { body: input.body } : {}),
      ...(input.mediaIds !== undefined
        ? {
            mediaIds: input.mediaIds
              ? (input.mediaIds as unknown as Prisma.InputJsonValue)
              : Prisma.JsonNull,
          }
        : {}),
      ...(input.ctaType ? { ctaType: input.ctaType } : {}),
      ...(input.ctaUrl !== undefined ? { ctaUrl: input.ctaUrl ?? null } : {}),
      ...(input.eventTitle !== undefined
        ? { eventTitle: input.eventTitle ?? null }
        : {}),
      ...(input.startDate !== undefined
        ? { startDate: input.startDate ? new Date(input.startDate) : null }
        : {}),
      ...(input.endDate !== undefined
        ? { endDate: input.endDate ? new Date(input.endDate) : null }
        : {}),
      ...(input.couponCode !== undefined
        ? { couponCode: input.couponCode ?? null }
        : {}),
      ...(input.termsConditions !== undefined
        ? { termsConditions: input.termsConditions ?? null }
        : {}),
      ...(input.redeemOnlineUrl !== undefined
        ? { redeemOnlineUrl: input.redeemOnlineUrl ?? null }
        : {}),
      ...(input.scheduledAt !== undefined
        ? {
            scheduledAt: input.scheduledAt
              ? new Date(input.scheduledAt)
              : null,
            status: input.scheduledAt
              ? PostStatus.SCHEDULED
              : PostStatus.DRAFT,
          }
        : {}),
      ...(input.locationId !== undefined
        ? input.locationId === null
          ? { location: { disconnect: true } }
          : { location: { connect: { id: input.locationId } } }
        : {}),
      ...(input.status ? { status: input.status as PostStatus } : {}),
    };

    const updated = await postRepository.update(id, data);

    const rc = extractRequestContext(req);
    await auditRepository.record({
      action: AuditAction.POST_UPDATED,
      userId: ctx.userId,
      tenantId: ctx.tenantId,
      ipAddress: rc.ipAddress,
      metadata: { postId: id },
    });

    return updated;
  },

  // ============================================================
  // PUBLISH
  // ============================================================
  async publish(ctx: AuthContext, id: string, input: PublishPostInput, req: Request) {
    const post = await postRepository.findByIdForTenant(id, ctx.tenantId);
    if (!post) throw new NotFoundError("Post not found");
    if (post.deletedAt) throw new ForbiddenError("Cannot publish a deleted post");
    if (post.status === PostStatus.PUBLISHED) {
      return post; // idempotent
    }

    let nextStatus: PostStatus = PostStatus.PUBLISHED;
    let scheduledAt = post.scheduledAt;
    let publishedAt: Date | null = new Date();

    if (!input.publishNow && input.scheduledAt) {
      nextStatus = PostStatus.SCHEDULED;
      scheduledAt = new Date(input.scheduledAt);
      publishedAt = null;
    }

    // TODO: call Google Local Posts API here when the background-jobs
    // module lands. For now we flip status locally.
    const updated = await postRepository.update(id, {
      status: nextStatus,
      publishedAt,
      scheduledAt,
    });

    const rc = extractRequestContext(req);
    await auditRepository.record({
      action:
        nextStatus === PostStatus.PUBLISHED
          ? AuditAction.POST_PUBLISHED
          : AuditAction.POST_SCHEDULED,
      userId: ctx.userId,
      tenantId: ctx.tenantId,
      ipAddress: rc.ipAddress,
      metadata: { postId: id, status: nextStatus },
    });

    return updated;
  },

  // ============================================================
  // DUPLICATE
  // ============================================================
  async duplicate(ctx: AuthContext, id: string, req: Request) {
    const original = await postRepository.findByIdForTenant(id, ctx.tenantId);
    if (!original) throw new NotFoundError("Post not found");

    const dup = await postRepository.create({
      tenant: { connect: { id: ctx.tenantId } },
      ...(original.locationId
        ? { location: { connect: { id: original.locationId } } }
        : {}),
      type: original.type,
      status: PostStatus.DRAFT,
      title: original.title ? `${original.title} (copy)` : null,
      body: original.body,
      mediaIds: original.mediaIds ?? Prisma.JsonNull,
      ctaType: original.ctaType,
      ctaUrl: original.ctaUrl,
      eventTitle: original.eventTitle,
      startDate: original.startDate,
      endDate: original.endDate,
      couponCode: original.couponCode,
      termsConditions: original.termsConditions,
      redeemOnlineUrl: original.redeemOnlineUrl,
      createdBy: { connect: { id: ctx.userId } },
      duplicatedFrom: { connect: { id: original.id } },
    });

    const rc = extractRequestContext(req);
    await auditRepository.record({
      action: AuditAction.POST_DUPLICATED,
      userId: ctx.userId,
      tenantId: ctx.tenantId,
      ipAddress: rc.ipAddress,
      metadata: { postId: dup.id, originalId: original.id },
    });

    return dup;
  },

  // ============================================================
  // DELETE (soft)
  // ============================================================
  async remove(ctx: AuthContext, id: string, req: Request) {
    const post = await postRepository.findByIdForTenant(id, ctx.tenantId);
    if (!post) throw new NotFoundError("Post not found");
    if (post.deletedAt) return { deleted: id };

    await postRepository.softDelete(id);

    const rc = extractRequestContext(req);
    await auditRepository.record({
      action: AuditAction.POST_DELETED,
      userId: ctx.userId,
      tenantId: ctx.tenantId,
      ipAddress: rc.ipAddress,
      metadata: { postId: id },
    });

    return { deleted: id };
  },
};
