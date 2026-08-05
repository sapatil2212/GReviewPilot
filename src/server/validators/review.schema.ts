/**
 * Zod schemas for the Review Management module.
 */

import { ReviewSource, ReviewStatus, SentimentType } from "@prisma/client";
import { z } from "zod";

// ---------- List / filter ----------

export const listReviewsQuerySchema = z.object({
  locationId: z.string().cuid().optional(),
  status: z.nativeEnum(ReviewStatus).optional(),
  source: z.nativeEnum(ReviewSource).optional(),
  sentiment: z.nativeEnum(SentimentType).optional(),
  minRating: z.coerce.number().int().min(1).max(5).optional(),
  maxRating: z.coerce.number().int().min(1).max(5).optional(),
  hasReply: z
    .string()
    .optional()
    .transform((v) => (v === "true" ? true : v === "false" ? false : undefined)),
  isArchived: z
    .string()
    .optional()
    .transform((v) => (v === "true" ? true : v === "false" ? false : undefined)),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  tagId: z.string().cuid().optional(),
});
export type ListReviewsQuery = z.infer<typeof listReviewsQuerySchema>;

// ---------- Reply ----------

export const replySchema = z.object({
  comment: z.string().trim().min(1, "Reply cannot be empty").max(4096),
});
export type ReplyInput = z.infer<typeof replySchema>;

// ---------- Edit reply ----------

export const editReplySchema = z.object({
  comment: z.string().trim().min(1).max(4096),
});

// ---------- Tags ----------

export const createTagSchema = z.object({
  name: z.string().trim().min(1).max(50),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Color must be a hex code like #ef4444")
    .optional(),
});
export type CreateTagInput = z.infer<typeof createTagSchema>;

export const updateTagSchema = createTagSchema.partial();

export const addTagToReviewSchema = z.object({
  tagId: z.string().cuid(),
});

// ---------- Bulk operations ----------

export const bulkReplySchema = z.object({
  reviewIds: z.array(z.string().cuid()).min(1).max(100),
  comment: z.string().trim().min(1).max(4096),
});
export type BulkReplyInput = z.infer<typeof bulkReplySchema>;

export const bulkArchiveSchema = z.object({
  reviewIds: z.array(z.string().cuid()).min(1).max(200),
  archive: z.boolean(),
});
export type BulkArchiveInput = z.infer<typeof bulkArchiveSchema>;

// ---------- Manual review ----------

// ---------- Location AI review profile ----------

export const reviewProfileInputSchema = z.object({
  gmbProfileUrl: z
    .string()
    .trim()
    .max(1000)
    .optional()
    .transform((v) => (v ? v : undefined)),
  websiteUrl: z
    .string()
    .trim()
    .max(1000)
    .optional()
    .transform((v) => (v ? v : undefined))
    .refine(
      (v) => v === undefined || /^https?:\/\/.+\..+/i.test(v),
      "Enter a valid website URL (including https://)",
    ),
  businessType: z
    .string()
    .trim()
    .max(150)
    .optional()
    .transform((v) => (v ? v : undefined)),
  description: z
    .string()
    .trim()
    .max(2000)
    .optional()
    .transform((v) => (v ? v : undefined)),
  highlights: z.array(z.string().trim().max(80)).max(15).optional(),
  keywords: z.array(z.string().trim().max(80)).max(15).optional(),
  tone: z.enum(["warm", "professional", "casual", "enthusiastic"]).optional(),
  // Manual override of the AI brief. When provided, it's saved verbatim
  // and used for review generation instead of the auto-synthesized one.
  // Send an empty string to clear the override and re-synthesize.
  aiContext: z.string().trim().max(4000).optional(),
});
export type ReviewProfileInputDto = z.infer<typeof reviewProfileInputSchema>;

export const createManualReviewSchema = z.object({
  locationId: z.string().cuid().optional(),
  reviewerName: z.string().trim().max(200).optional(),
  starRating: z.coerce.number().int().min(1).max(5),
  comment: z.string().trim().max(10000).optional(),
  reviewCreatedAt: z
    .string()
    .datetime()
    .optional()
    .transform((v) => (v ? new Date(v) : new Date())),
});
export type CreateManualReviewInput = z.infer<typeof createManualReviewSchema>;
