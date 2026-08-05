/**
 * Media service.
 *
 * Handles uploads, list, update, delete, download-url signing, and
 * usage stats. Every write is tenant-scoped; every download-url is
 * short-lived; the physical bytes live behind the StorageProvider
 * abstraction (see src/server/storage).
 *
 * Deduplication: uploads are content-addressed by SHA-256. Uploading
 * the same bytes twice in the same tenant returns the existing row —
 * we still update the metadata (altText/caption/etc) if supplied.
 *
 * Attachment hooks: an upload can optionally be marked as the tenant
 * logo / profile cover / user avatar in the same call, so the client
 * doesn't have to make a second request.
 */

import {
  AuditAction,
  MediaCategory,
  MediaKind,
  MediaStatus,
  MediaVisibility,
  Prisma,
} from "@prisma/client";
import { createHash, randomBytes } from "node:crypto";
import { auditRepository } from "@/server/repositories/audit.repository";
import { locationRepository } from "@/server/repositories/location.repository";
import { mediaRepository } from "@/server/repositories/media.repository";
import { businessProfileRepository } from "@/server/repositories/businessProfile.repository";
import { prisma } from "@/server/db/prisma";
import { storage } from "@/server/storage";
import { extractRequestContext } from "@/server/middleware/requestContext";
import { env } from "@/server/utils/env";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "@/server/utils/errors";
import { logger } from "@/server/utils/logger";
import {
  ALLOWED_MIME,
  extensionFor,
  isMimeAllowed,
  kindFor,
  normalizeMime,
  sanitizeFilename,
} from "@/server/utils/mime";
import { readImageDimensions } from "@/server/utils/imageInfo";
import {
  buildPagedResult,
  parsePagination,
} from "@/server/utils/pagination";
import type { AuthContext } from "@/server/auth/requireSession";
import type {
  BulkDeleteInput,
  ListMediaQuery,
  UpdateMediaInput,
  UploadMediaInput,
} from "@/server/validators/media.schema";

const BYTES_PER_MB = 1024 * 1024;
const BYTES_PER_GB = 1024 * 1024 * 1024;
const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1h — public preview links
// Website-builder images are embedded directly into persisted page JSON
// (SitePage.document), not re-fetched through the API before display, so a
// short-lived preview URL would silently break every image on the site an
// hour after upload. Sign these for effectively the life of the asset instead.
const WEBSITE_MEDIA_SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 365 * 10; // 10 years

function limitForKind(kind: MediaKind): number {
  switch (kind) {
    case MediaKind.IMAGE:
      return env.MEDIA_MAX_IMAGE_MB * BYTES_PER_MB;
    case MediaKind.VIDEO:
      return env.MEDIA_MAX_VIDEO_MB * BYTES_PER_MB;
    case MediaKind.AUDIO:
      return env.MEDIA_MAX_AUDIO_MB * BYTES_PER_MB;
    case MediaKind.DOCUMENT:
    default:
      return env.MEDIA_MAX_DOCUMENT_MB * BYTES_PER_MB;
  }
}

// Categories that must contain images only.
const IMAGE_ONLY_CATEGORIES = new Set<MediaCategory>([
  MediaCategory.LOGO,
  MediaCategory.COVER,
  MediaCategory.AVATAR,
  MediaCategory.GALLERY,
  MediaCategory.BUSINESS_PHOTO,
  MediaCategory.QR_ASSET,
  MediaCategory.WEBSITE_MEDIA,
]);

interface UploadArgs {
  ctx: AuthContext;
  file: File;
  meta: UploadMediaInput;
  req: Request;
}

export const mediaService = {
  // ============================================================
  // UPLOAD
  // ============================================================
  async upload({ ctx, file, meta, req }: UploadArgs) {
    if (!file || typeof file.size !== "number" || file.size === 0) {
      throw new ValidationError("A non-empty file is required");
    }

    // Content-type check.
    const mime = normalizeMime(file.type);
    if (!mime || !isMimeAllowed(mime)) {
      throw new ValidationError(
        `Unsupported file type: ${file.type || "unknown"}`,
      );
    }
    const kind = kindFor(mime);

    // Category constraints.
    if (IMAGE_ONLY_CATEGORIES.has(meta.category) && kind !== MediaKind.IMAGE) {
      throw new ValidationError(
        `Category ${meta.category} only accepts image uploads`,
      );
    }
    if (meta.category === MediaCategory.DOCUMENT && kind !== MediaKind.DOCUMENT) {
      throw new ValidationError("DOCUMENT category only accepts document files");
    }

    // Per-file size cap.
    const perFileCap = limitForKind(kind);
    if (file.size > perFileCap) {
      throw new ValidationError(
        `File exceeds the ${(perFileCap / BYTES_PER_MB) | 0}MB limit for ${kind.toLowerCase()} uploads`,
      );
    }

    // Optional location must belong to this tenant.
    if (meta.locationId) {
      const loc = await locationRepository.findByIdForTenant(
        meta.locationId,
        ctx.tenantId,
      );
      if (!loc) throw new ValidationError("Location not found in this workspace");
    }

    // Read into memory. For very large files this should be streamed,
    // but the current cap (~200MB video) is fine for the local-disk
    // dev provider. S3/Cloudinary implementations will stream.
    const arrayBuf = await file.arrayBuffer();
    const bytes = Buffer.from(arrayBuf);
    const sha256 = createHash("sha256").update(bytes).digest("hex");

    // Deduplication: reuse existing row if same tenant + content.
    const existing = await mediaRepository.findExisting(ctx.tenantId, sha256);
    if (existing && !existing.deletedAt) {
      const updated = await mediaRepository.update(existing.id, {
        altText: meta.altText ?? existing.altText,
        caption: meta.caption ?? existing.caption,
        category: meta.category ?? existing.category,
        visibility: meta.visibility ?? existing.visibility,
        ...(meta.locationId !== undefined
          ? meta.locationId === null
            ? { location: { disconnect: true } }
            : { location: { connect: { id: meta.locationId } } }
          : {}),
      });

      await applyAttachHook(ctx, updated.id, meta, updated.storageKey, req);
      await recordAudit(AuditAction.MEDIA_UPLOADED, ctx, req, {
        mediaId: updated.id,
        deduped: true,
        sha256,
        size: Number(updated.sizeBytes),
      });
      return withSignedUrl(updated);
    }

    // Enforce per-tenant total storage cap.
    const totalNow = await mediaRepository.totalActiveBytes(ctx.tenantId);
    const projected = totalNow + BigInt(bytes.length);
    const capBytes = BigInt(env.MEDIA_MAX_TENANT_GB) * BigInt(BYTES_PER_GB);
    if (projected > capBytes) {
      throw new ConflictError(
        "CONFLICT",
        `Storage limit reached (${env.MEDIA_MAX_TENANT_GB}GB). Delete unused media or upgrade your plan.`,
      );
    }

    // Optional: extract image dimensions from the raw header. Non-fatal.
    let width: number | null = null;
    let height: number | null = null;
    if (kind === MediaKind.IMAGE) {
      const dims = readImageDimensions(bytes, mime);
      if (dims) {
        width = dims.width;
        height = dims.height;
      }
    }

    // Build content-addressable key. Website-builder uploads get a
    // `website-media/` prefix so LocalDiskStorage routes them onto the
    // dedicated WEBSITE_MEDIA_PATH root instead of the shared media root.
    const ext = extensionFor(mime) ?? "bin";
    const nonce = randomBytes(4).toString("hex");
    const yyyymm = new Date().toISOString().slice(0, 7).replace("-", "");
    const keyPrefix = meta.category === MediaCategory.WEBSITE_MEDIA ? "website-media/" : "";
    const storageKey = `${keyPrefix}tenants/${ctx.tenantId}/${meta.category.toLowerCase()}/${yyyymm}/${sha256}-${nonce}.${ext}`;

    // Store bytes.
    await storage.put({
      key: storageKey,
      body: bytes,
      contentType: mime,
      cacheControl:
        meta.visibility === MediaVisibility.PUBLIC
          ? "public, max-age=31536000, immutable"
          : "private, max-age=31536000, immutable",
      metadata: {
        tenantId: ctx.tenantId,
        uploadedById: ctx.userId,
        category: meta.category,
        sha256,
      },
    });

    // Persist row. If DB write fails, best-effort remove the file.
    let created;
    try {
      created = await mediaRepository.create({
        tenant: { connect: { id: ctx.tenantId } },
        storageKey,
        filename: sanitizeFilename(file.name || "file"),
        mimeType: mime,
        kind,
        category: meta.category,
        sizeBytes: BigInt(bytes.length),
        sha256,
        width,
        height,
        altText: meta.altText,
        caption: meta.caption,
        visibility: meta.visibility,
        status: MediaStatus.READY,
        ...(meta.locationId
          ? { location: { connect: { id: meta.locationId } } }
          : {}),
        uploadedBy: { connect: { id: ctx.userId } },
      });
    } catch (err) {
      await storage
        .delete(storageKey)
        .catch((e) => logger.warn("Rollback storage delete failed", { key: storageKey, err: String(e) }));
      throw err;
    }

    await applyAttachHook(ctx, created.id, meta, storageKey, req);
    await recordAudit(AuditAction.MEDIA_UPLOADED, ctx, req, {
      mediaId: created.id,
      size: bytes.length,
      category: meta.category,
      kind,
    });

    return withSignedUrl(created);
  },

  // ============================================================
  // LIST
  // ============================================================
  async list(ctx: AuthContext, req: Request, filter: ListMediaQuery) {
    const url = new URL(req.url);
    const pagination = parsePagination(url.searchParams);
    const { items, total } = await mediaRepository.list({
      tenantId: ctx.tenantId,
      filter,
      pagination,
    });
    const signed = await Promise.all(items.map((it) => withSignedUrl(it)));
    return buildPagedResult(signed, total, pagination);
  },

  async getById(ctx: AuthContext, id: string) {
    const asset = await mediaRepository.findByIdForTenant(id, ctx.tenantId);
    if (!asset) throw new NotFoundError("Media not found");
    return withSignedUrl(asset);
  },

  // ============================================================
  // UPDATE
  // ============================================================
  async update(
    ctx: AuthContext,
    id: string,
    input: UpdateMediaInput,
    req: Request,
  ) {
    const existing = await mediaRepository.findByIdForTenant(id, ctx.tenantId);
    if (!existing) throw new NotFoundError("Media not found");
    if (existing.deletedAt) {
      throw new ForbiddenError("Cannot update a deleted asset");
    }

    if (input.locationId) {
      const loc = await locationRepository.findByIdForTenant(
        input.locationId,
        ctx.tenantId,
      );
      if (!loc) throw new ValidationError("Location not found in this workspace");
    }

    const data: Prisma.MediaAssetUpdateInput = {
      altText: input.altText,
      caption: input.caption,
      category: input.category,
      visibility: input.visibility,
      ...(input.locationId !== undefined
        ? input.locationId === null
          ? { location: { disconnect: true } }
          : { location: { connect: { id: input.locationId } } }
        : {}),
    };

    const updated = await mediaRepository.update(id, data);
    await recordAudit(AuditAction.MEDIA_UPDATED, ctx, req, {
      mediaId: id,
      fields: Object.keys(input).filter(
        (k) => input[k as keyof typeof input] !== undefined,
      ),
    });
    return withSignedUrl(updated);
  },

  // ============================================================
  // DELETE (soft)
  // ============================================================
  async remove(ctx: AuthContext, id: string, req: Request) {
    const existing = await mediaRepository.findByIdForTenant(id, ctx.tenantId);
    if (!existing) throw new NotFoundError("Media not found");
    if (existing.deletedAt) return { removed: id };

    await mediaRepository.softDelete(id);
    // If this asset was pinned to Tenant.logo / Profile.cover, clear.
    await unpinIfAttached(ctx.tenantId, existing.id);

    await recordAudit(AuditAction.MEDIA_DELETED, ctx, req, {
      mediaId: id,
      category: existing.category,
    });
    return { removed: id };
  },

  async bulkRemove(ctx: AuthContext, input: BulkDeleteInput, req: Request) {
    const result = await mediaRepository.softDeleteMany(ctx.tenantId, input.ids);
    // Unpin any attached references.
    await Promise.all(input.ids.map((id) => unpinIfAttached(ctx.tenantId, id)));
    await recordAudit(AuditAction.MEDIA_BULK_DELETED, ctx, req, {
      count: result.count,
      ids: input.ids,
    });
    return { removedCount: result.count };
  },

  // ============================================================
  // STATS
  // ============================================================
  async stats(ctx: AuthContext) {
    const [byCategory, totalBytes] = await Promise.all([
      mediaRepository.statsByCategory(ctx.tenantId),
      mediaRepository.totalActiveBytes(ctx.tenantId),
    ]);
    const capBytes = BigInt(env.MEDIA_MAX_TENANT_GB) * BigInt(BYTES_PER_GB);
    return {
      totalBytes: totalBytes.toString(),
      capBytes: capBytes.toString(),
      usagePercent:
        capBytes > 0n
          ? Number((totalBytes * 10000n) / capBytes) / 100
          : 0,
      byCategory: byCategory.map((r) => ({
        ...r,
        sizeBytes: r.sizeBytes.toString(),
      })),
    };
  },

  // ============================================================
  // INTERNAL — used by other modules to get a signed URL by id.
  // ============================================================
  async signedUrlForId(
    tenantId: string,
    id: string,
    opts?: { expiresIn?: number; disposition?: "inline" | "attachment" },
  ): Promise<string | null> {
    const asset = await mediaRepository.findByIdForTenant(id, tenantId);
    if (!asset || asset.deletedAt) return null;
    return storage.getSignedUrl({
      key: asset.storageKey,
      expiresIn: opts?.expiresIn ?? SIGNED_URL_TTL_SECONDS,
      disposition: opts?.disposition ?? "inline",
      filename: asset.filename,
    });
  },
};

// ---------- helpers ----------

/** Attach a signed download URL + typed sizeBytes to a repo row. */
async function withSignedUrl<
  T extends {
    storageKey: string;
    sizeBytes: bigint;
    filename: string;
    visibility: MediaVisibility;
    category: MediaCategory;
  },
>(asset: T) {
  const url = await storage.getSignedUrl({
    key: asset.storageKey,
    expiresIn:
      asset.category === MediaCategory.WEBSITE_MEDIA
        ? WEBSITE_MEDIA_SIGNED_URL_TTL_SECONDS
        : SIGNED_URL_TTL_SECONDS,
    disposition: "inline",
    filename: asset.filename,
  });
  return {
    ...asset,
    sizeBytes: asset.sizeBytes.toString(),
    url,
  };
}

/**
 * If an upload was flagged with attachTo, wire it into the target
 * entity's pointer field.
 */
async function applyAttachHook(
  ctx: AuthContext,
  mediaId: string,
  meta: UploadMediaInput,
  storageKey: string,
  _req: Request,
) {
  if (!meta.attachTo) return;
  switch (meta.attachTo) {
    case "tenantLogo":
      if (meta.category !== MediaCategory.LOGO) {
        throw new ValidationError(
          "attachTo=tenantLogo requires category=LOGO",
        );
      }
      await prisma.tenant.update({
        where: { id: ctx.tenantId },
        data: { logo: mediaId },
      });
      return;
    case "profileCover":
      if (meta.category !== MediaCategory.COVER) {
        throw new ValidationError(
          "attachTo=profileCover requires category=COVER",
        );
      }
      // Ensure a profile row exists.
      const existing = await businessProfileRepository.findByTenantId(
        ctx.tenantId,
      );
      if (existing) {
        await businessProfileRepository.update(existing.id, {
          coverImage: mediaId,
        });
      } else {
        await businessProfileRepository.create(ctx.tenantId, {
          coverImage: mediaId,
        });
      }
      return;
    case "userAvatar":
      if (meta.category !== MediaCategory.AVATAR) {
        throw new ValidationError(
          "attachTo=userAvatar requires category=AVATAR",
        );
      }
      await prisma.user.update({
        where: { id: ctx.userId },
        data: { avatar: mediaId },
      });
      return;
  }
}

/**
 * Clear pointer fields that referenced this media asset. Called when
 * an asset is soft-deleted so we don't leave dangling references.
 */
async function unpinIfAttached(tenantId: string, mediaId: string) {
  await prisma.$transaction([
    prisma.tenant.updateMany({
      where: { id: tenantId, logo: mediaId },
      data: { logo: null },
    }),
    prisma.businessProfile.updateMany({
      where: { tenantId, coverImage: mediaId },
      data: { coverImage: null },
    }),
    prisma.user.updateMany({
      where: { tenantId, avatar: mediaId },
      data: { avatar: null },
    }),
  ]);
}

async function recordAudit(
  action: AuditAction,
  ctx: AuthContext,
  req: Request,
  meta: Record<string, unknown>,
) {
  const rc = extractRequestContext(req);
  await auditRepository.record({
    action,
    userId: ctx.userId,
    tenantId: ctx.tenantId,
    ipAddress: rc.ipAddress,
    userAgent: rc.userAgent,
    browser: rc.browser,
    device: rc.device,
    metadata: meta as Prisma.InputJsonValue,
  });
}
