/**
 * Zod schemas for the Media module.
 *
 * Upload validation happens partly in the multipart handler (file
 * size / MIME) and partly here (structured metadata coming with the
 * file). Search/list queries and PATCH bodies live here in full.
 */

import { MediaCategory, MediaKind, MediaStatus, MediaVisibility } from "@prisma/client";
import { z } from "zod";

// ---------- Upload metadata (companion to the file field) ----------

export const uploadMediaSchema = z.object({
  category: z.nativeEnum(MediaCategory).default(MediaCategory.OTHER),
  visibility: z.nativeEnum(MediaVisibility).default(MediaVisibility.PRIVATE),
  altText: z
    .string()
    .trim()
    .max(500)
    .optional()
    .transform((v) => (v ? v : undefined)),
  caption: z
    .string()
    .trim()
    .max(1000)
    .optional()
    .transform((v) => (v ? v : undefined)),
  locationId: z.string().cuid().optional(),

  // Optional attachment hooks — when supplied, service will update
  // the linked entity to point at this new asset. Only permitted for
  // categories where it makes sense (LOGO → Tenant, COVER → Profile,
  // AVATAR → self User).
  attachTo: z.enum(["tenantLogo", "profileCover", "userAvatar"]).optional(),
});
export type UploadMediaInput = z.infer<typeof uploadMediaSchema>;

// ---------- List / query ----------

export const listMediaQuerySchema = z.object({
  category: z.nativeEnum(MediaCategory).optional(),
  kind: z.nativeEnum(MediaKind).optional(),
  status: z.nativeEnum(MediaStatus).optional(),
  visibility: z.nativeEnum(MediaVisibility).optional(),
  locationId: z.string().cuid().optional(),
  uploadedById: z.string().cuid().optional(),
  includeDeleted: z
    .string()
    .optional()
    .transform((v) => v === "true"),
});
export type ListMediaQuery = z.infer<typeof listMediaQuerySchema>;

// ---------- Update ----------

export const updateMediaSchema = z.object({
  altText: z
    .string()
    .trim()
    .max(500)
    .nullable()
    .optional(),
  caption: z
    .string()
    .trim()
    .max(1000)
    .nullable()
    .optional(),
  category: z.nativeEnum(MediaCategory).optional(),
  visibility: z.nativeEnum(MediaVisibility).optional(),
  locationId: z.string().cuid().nullable().optional(),
});
export type UpdateMediaInput = z.infer<typeof updateMediaSchema>;

// ---------- Bulk delete ----------

export const bulkDeleteSchema = z.object({
  ids: z.array(z.string().cuid()).min(1).max(200),
});
export type BulkDeleteInput = z.infer<typeof bulkDeleteSchema>;

// ---------- Serve query ----------

export const serveMediaQuerySchema = z.object({
  key: z.string().min(1),
  t: z.coerce.number().int(),
  s: z.string().min(1),
  d: z.enum(["inline", "attachment"]).optional().default("inline"),
  f: z.string().max(200).optional(),
});
