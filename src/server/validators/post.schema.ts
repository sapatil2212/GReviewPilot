/**
 * Zod schemas for the Google Posts module.
 */

import { PostCtaType, PostStatus, PostType } from "@prisma/client";
import { z } from "zod";

export const createPostSchema = z.object({
  locationId: z.string().cuid().optional(),
  type: z.nativeEnum(PostType).default(PostType.STANDARD),
  title: z.string().trim().max(300).optional(),
  body: z.string().trim().min(1, "Post body is required").max(5000),
  mediaIds: z.array(z.string().cuid()).max(10).optional(),
  ctaType: z.nativeEnum(PostCtaType).default(PostCtaType.NONE),
  ctaUrl: z
    .string()
    .trim()
    .max(1000)
    .optional()
    .transform((v) => (v ? v : undefined)),

  // Event / Offer specific
  eventTitle: z.string().trim().max(300).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  couponCode: z.string().trim().max(100).optional(),
  termsConditions: z.string().trim().max(5000).optional(),
  redeemOnlineUrl: z.string().trim().max(1000).optional(),

  // Optional scheduling
  scheduledAt: z.string().datetime().optional(),
});
export type CreatePostInput = z.infer<typeof createPostSchema>;

export const updatePostSchema = createPostSchema.partial().extend({
  status: z.enum(["DRAFT", "SCHEDULED"]).optional(),
});
export type UpdatePostInput = z.infer<typeof updatePostSchema>;

export const listPostsQuerySchema = z.object({
  locationId: z.string().cuid().optional(),
  status: z.nativeEnum(PostStatus).optional(),
  type: z.nativeEnum(PostType).optional(),
  includeDeleted: z
    .string()
    .optional()
    .transform((v) => v === "true"),
});
export type ListPostsQuery = z.infer<typeof listPostsQuerySchema>;

export const publishPostSchema = z.object({
  publishNow: z.boolean().default(true),
  scheduledAt: z.string().datetime().optional(),
});
export type PublishPostInput = z.infer<typeof publishPostSchema>;
