/**
 * Quick Connect service.
 *
 * The "non-official" connection path: instead of OAuth, the business
 * (or a tester) supplies a Google Maps URL or Place ID for a location.
 * We resolve it to a Place ID (optionally verified via Places API),
 * then either attach it to an existing Location or create a new
 * lightweight one. The review funnel works immediately — no Google
 * Business ownership required.
 *
 * This is ideal for:
 *   - Testing the AI review funnel against any real business
 *   - Businesses that haven't/can't grant Business Profile OAuth
 *   - Multi-location brands managing listings they don't own via OAuth
 */

import { AuditAction, LocationStatus, Prisma } from "@prisma/client";
import { auditRepository } from "@/server/repositories/audit.repository";
import { locationRepository } from "@/server/repositories/location.repository";
import { resolvePlace } from "./placeId.service";
import { reviewContextService } from "@/server/services/reviewContext.service";
import { extractRequestContext } from "@/server/middleware/requestContext";
import { slugify } from "@/server/utils/tokens";
import { ConflictError, NotFoundError, ValidationError } from "@/server/utils/errors";
import { logger } from "@/server/utils/logger";
import { randomBytes } from "node:crypto";
import type { AuthContext } from "@/server/auth/requireSession";
import type { QuickConnectInput } from "@/server/validators/google.schema";

async function ensureUniqueSlug(tenantId: string, desired: string): Promise<string> {
  const base = slugify(desired);
  let candidate = base;
  for (let i = 0; i < 8; i++) {
    const existing = await locationRepository.findBySlugForTenant(tenantId, candidate);
    if (!existing) return candidate;
    candidate = `${base}-${randomBytes(3).toString("hex").slice(0, 5)}`;
  }
  return `${base}-${randomBytes(4).toString("hex")}`;
}

export const quickConnectService = {
  /** Preview only — resolve + verify without persisting. */
  async preview(input: string) {
    return resolvePlace(input);
  },

  async connect(ctx: AuthContext, input: QuickConnectInput, req: Request) {
    const resolved = await resolvePlace(input.input);

    // Guard: same Place ID can't be linked to two locations in the tenant.
    const clash = await locationRepository.findByGooglePlaceIdForTenant(
      resolved.placeId,
      ctx.tenantId,
    );

    if (input.mode === "existing") {
      if (!input.locationId) {
        throw new ValidationError("locationId is required when mode is 'existing'");
      }
      if (clash && clash.id !== input.locationId) {
        throw new ConflictError(
          "CONFLICT",
          "That Place ID is already linked to another location in this workspace",
        );
      }
      const loc = await locationRepository.findByIdForTenant(
        input.locationId,
        ctx.tenantId,
      );
      if (!loc) throw new NotFoundError("Location not found");

      const updated = await locationRepository.update(input.locationId, {
        googlePlaceId: resolved.placeId,
        placeIdSource: "manual",
      });

      await synthesizeContext(ctx, updated.id, updated.name, updated.city, resolved.placeId, input);
      await recordAudit(ctx, req, resolved.placeId, updated.id, resolved.verified);
      return { location: updated, resolved };
    }

    // mode === "new"
    if (clash) {
      throw new ConflictError(
        "CONFLICT",
        "That Place ID is already linked to a location in this workspace",
      );
    }

    const name =
      input.name?.trim() ||
      resolved.name?.trim() ||
      "New location";
    const city = input.city?.trim() || resolved.city?.trim() || "";
    const country =
      input.country?.trim() ||
      countryNameToIso(resolved.country) ||
      "IN";

    const slug = await ensureUniqueSlug(ctx.tenantId, name);

    const created = await locationRepository.create({
      tenant: { connect: { id: ctx.tenantId } },
      name,
      slug,
      addressLine1: resolved.formattedAddress ?? name,
      city: city || "Unknown",
      country,
      googlePlaceId: resolved.placeId,
      placeIdSource: "manual",
      status: LocationStatus.ACTIVE,
    } satisfies Prisma.LocationCreateInput);

    await synthesizeContext(ctx, created.id, created.name, created.city, resolved.placeId, input);
    await recordAudit(ctx, req, resolved.placeId, created.id, resolved.verified);
    return { location: created, resolved };
  },
};

/**
 * Build + persist the AI review context for the location. Best-effort:
 * a failure here must not fail the connection.
 */
async function synthesizeContext(
  ctx: AuthContext,
  locationId: string,
  name: string,
  city: string | null,
  placeId: string | null,
  input: QuickConnectInput,
) {
  // Always synthesize — even with no manual input, Gemini + Places data
  // infer a category-specific brief (e.g. hospital → cleanliness, doctors)
  // so reviews are never generic.
  try {
    await reviewContextService.synthesizeAndSave(
      locationId,
      ctx.tenantId,
      name,
      city,
      placeId,
      {
        gmbProfileUrl: input.gmbProfileUrl ?? null,
        businessType: input.businessType ?? null,
        description: input.description ?? null,
        highlights: input.highlights ?? null,
        keywords: input.keywords ?? null,
        tone: input.tone ?? "warm",
      },
    );
  } catch (err) {
    logger.warn("Review context synthesis failed at connect", {
      err: err instanceof Error ? err.message : String(err),
    });
  }
}

async function recordAudit(
  ctx: AuthContext,
  req: Request,
  placeId: string,
  locationId: string,
  verified: boolean,
) {
  const rc = extractRequestContext(req);
  await auditRepository.record({
    action: AuditAction.GOOGLE_LOCATION_LINKED,
    userId: ctx.userId,
    tenantId: ctx.tenantId,
    ipAddress: rc.ipAddress,
    userAgent: rc.userAgent,
    browser: rc.browser,
    device: rc.device,
    metadata: { placeId, locationId, method: "quick_connect", verified },
  });
}

// Places API returns full country names; our schema stores ISO-2.
// Best-effort map for common cases; falls through to first 2 chars.
function countryNameToIso(name: string | null | undefined): string | null {
  if (!name) return null;
  const raw = name.trim();
  // Already an ISO-2 code.
  if (/^[A-Za-z]{2}$/.test(raw)) return raw.toUpperCase();
  const map: Record<string, string> = {
    india: "IN",
    "united states": "US",
    usa: "US",
    "united kingdom": "GB",
    uk: "GB",
    canada: "CA",
    australia: "AU",
    germany: "DE",
    france: "FR",
    singapore: "SG",
    "united arab emirates": "AE",
    uae: "AE",
    "sri lanka": "LK",
    nepal: "NP",
    bangladesh: "BD",
    pakistan: "PK",
  };
  return map[raw.toLowerCase()] ?? null;
}
