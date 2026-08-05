/**
 * QR Code service.
 *
 * Owns creation (with target-URL construction per type), updates,
 * deletion, listing, analytics, and the public scan-recording path.
 *
 * Every QR encodes {APP_URL}/q/{shortCode} so it's dynamic + trackable.
 */

import { AuditAction, Prisma, QrStatus, QrType } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { auditRepository } from "@/server/repositories/audit.repository";
import { locationRepository } from "@/server/repositories/location.repository";
import { qrRepository } from "@/server/repositories/qr.repository";
import { tenantRepository } from "@/server/repositories/tenant.repository";
import { buildGoogleReviewUrl } from "@/server/services/reviewGenerator.service";
import { extractRequestContext } from "@/server/middleware/requestContext";
import { env } from "@/server/utils/env";
import {
  buildPagedResult,
  parsePagination,
} from "@/server/utils/pagination";
import {
  NotFoundError,
  ValidationError,
} from "@/server/utils/errors";
import type { AuthContext } from "@/server/auth/requireSession";
import type {
  CreateQrInput,
  ListQrQuery,
  UpdateQrInput,
} from "@/server/validators/qr.schema";

const SHORT_CODE_ALPHABET =
  "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789"; // no ambiguous chars

function makeShortCode(len = 7): string {
  const bytes = randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i++) {
    out += SHORT_CODE_ALPHABET[bytes[i]! % SHORT_CODE_ALPHABET.length];
  }
  return out;
}

async function uniqueShortCode(): Promise<string> {
  for (let i = 0; i < 10; i++) {
    const code = makeShortCode();
    if (!(await qrRepository.shortCodeExists(code))) return code;
  }
  return makeShortCode(10);
}

function normalizeUrl(url: string): string {
  const trimmed = url.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

export const qrCodeService = {
  publicUrlFor(shortCode: string): string {
    return `${env.APP_URL}/q/${shortCode}`;
  },

  async list(ctx: AuthContext, req: Request, filter: ListQrQuery) {
    const url = new URL(req.url);
    const pagination = parsePagination(url.searchParams);
    const { items, total } = await qrRepository.list({
      tenantId: ctx.tenantId,
      filter,
      pagination,
    });
    return buildPagedResult(
      items.map((q) => ({ ...q, publicUrl: this.publicUrlFor(q.shortCode) })),
      total,
      pagination,
    );
  },

  async getById(ctx: AuthContext, id: string) {
    const qr = await qrRepository.findByIdForTenant(id, ctx.tenantId);
    if (!qr) throw new NotFoundError("QR code not found");
    return { ...qr, publicUrl: this.publicUrlFor(qr.shortCode) };
  },

  async stats(ctx: AuthContext) {
    const [count, agg] = await qrRepository.statsForTenant(ctx.tenantId);
    return {
      totalCodes: count,
      totalScans: agg._sum.scanCount ?? 0,
      totalUniqueScans: agg._sum.uniqueScanCount ?? 0,
    };
  },

  async analytics(ctx: AuthContext, id: string) {
    const qr = await qrRepository.findByIdForTenant(id, ctx.tenantId);
    if (!qr) throw new NotFoundError("QR code not found");
    const data = await qrRepository.analytics(id, ctx.tenantId);
    return {
      qr: {
        id: qr.id,
        label: qr.label,
        type: qr.type,
        scanCount: qr.scanCount,
        uniqueScanCount: qr.uniqueScanCount,
        lastScannedAt: qr.lastScannedAt,
      },
      ...data,
    };
  },

  /**
   * Resolve the final target URL for a QR based on its type + inputs.
   */
  async resolveTargetUrl(
    ctx: AuthContext,
    input: CreateQrInput,
  ): Promise<string> {
    switch (input.type) {
      case QrType.GOOGLE_REVIEW: {
        const loc = await locationRepository.findByIdForTenant(
          input.locationId!,
          ctx.tenantId,
        );
        if (!loc) throw new ValidationError("Location not found");
        if (loc.googlePlaceId) {
          return buildGoogleReviewUrl(loc.googlePlaceId);
        }
        // Fall back to our review funnel URL when no Place ID yet.
        const tenant = await tenantRepository.findById(ctx.tenantId);
        return `${env.APP_URL}/review/${tenant?.slug}/${loc.slug}`;
      }
      case QrType.WHATSAPP: {
        const text = input.whatsappMessage
          ? `?text=${encodeURIComponent(input.whatsappMessage)}`
          : "";
        return `https://wa.me/${input.whatsappNumber}${text}`;
      }
      default:
        return normalizeUrl(input.targetUrl!);
    }
  },

  async create(ctx: AuthContext, input: CreateQrInput, req: Request) {
    if (input.locationId) {
      const loc = await locationRepository.findByIdForTenant(
        input.locationId,
        ctx.tenantId,
      );
      if (!loc) throw new ValidationError("Location not found");
    }
    const targetUrl = await this.resolveTargetUrl(ctx, input);
    const shortCode = await uniqueShortCode();

    const qr = await qrRepository.create({
      tenant: { connect: { id: ctx.tenantId } },
      ...(input.locationId
        ? { location: { connect: { id: input.locationId } } }
        : {}),
      type: input.type,
      label: input.label,
      targetUrl,
      shortCode,
      darkColor: input.darkColor ?? null,
      lightColor: input.lightColor ?? null,
      createdBy: { connect: { id: ctx.userId } },
    });

    const rc = extractRequestContext(req);
    await auditRepository.record({
      action: AuditAction.QR_CREATED,
      userId: ctx.userId,
      tenantId: ctx.tenantId,
      ipAddress: rc.ipAddress,
      metadata: { qrId: qr.id, type: input.type, shortCode },
    });

    return { ...qr, publicUrl: this.publicUrlFor(qr.shortCode) };
  },

  async update(ctx: AuthContext, id: string, input: UpdateQrInput, req: Request) {
    const existing = await qrRepository.findByIdForTenant(id, ctx.tenantId);
    if (!existing) throw new NotFoundError("QR code not found");

    if (input.locationId) {
      const loc = await locationRepository.findByIdForTenant(
        input.locationId,
        ctx.tenantId,
      );
      if (!loc) throw new ValidationError("Location not found");
    }

    const data: Prisma.QrCodeUpdateInput = {
      label: input.label,
      status: input.status,
      darkColor: input.darkColor,
      lightColor: input.lightColor,
      ...(input.targetUrl !== undefined
        ? { targetUrl: normalizeUrl(input.targetUrl) }
        : {}),
      ...(input.locationId !== undefined
        ? input.locationId === null
          ? { location: { disconnect: true } }
          : { location: { connect: { id: input.locationId } } }
        : {}),
    };

    const updated = await qrRepository.update(id, data);
    const rc = extractRequestContext(req);
    await auditRepository.record({
      action: AuditAction.QR_UPDATED,
      userId: ctx.userId,
      tenantId: ctx.tenantId,
      ipAddress: rc.ipAddress,
      metadata: { qrId: id },
    });
    return { ...updated, publicUrl: this.publicUrlFor(updated.shortCode) };
  },

  async remove(ctx: AuthContext, id: string, req: Request) {
    const existing = await qrRepository.findByIdForTenant(id, ctx.tenantId);
    if (!existing) throw new NotFoundError("QR code not found");
    await qrRepository.delete(id);
    const rc = extractRequestContext(req);
    await auditRepository.record({
      action: AuditAction.QR_DELETED,
      userId: ctx.userId,
      tenantId: ctx.tenantId,
      ipAddress: rc.ipAddress,
      metadata: { qrId: id, label: existing.label },
    });
    return { deleted: id };
  },

  /**
   * Public scan handler. Returns the redirect target (or null if the QR
   * is missing/paused). Records the scan with device/country metadata.
   */
  async handleScan(
    shortCode: string,
    req: Request,
    sessionId: string | null,
  ): Promise<{ targetUrl: string } | null> {
    const qr = await qrRepository.findByShortCode(shortCode);
    if (!qr || qr.status !== QrStatus.ACTIVE) return null;

    const rc = extractRequestContext(req);
    const country = readCountry(req);
    let isUnique = true;
    if (sessionId) {
      isUnique = !(await qrRepository.sessionHasScanned(qr.id, sessionId));
    }

    // Best-effort — never block the redirect on a logging failure.
    try {
      await qrRepository.recordScan({
        qrCodeId: qr.id,
        tenantId: qr.tenantId,
        sessionId,
        isUnique,
        ipAddress: rc.ipAddress,
        userAgent: rc.userAgent,
        browser: rc.browser,
        os: rc.os,
        device: rc.device,
        country,
        referrer: req.headers.get("referer") ?? null,
      });
    } catch {
      /* swallow */
    }

    return { targetUrl: qr.targetUrl };
  },
};

/** ISO-2 country from common edge/CDN headers. */
function readCountry(req: Request): string | null {
  return (
    req.headers.get("cf-ipcountry") ||
    req.headers.get("x-vercel-ip-country") ||
    req.headers.get("x-country-code") ||
    null
  );
}
