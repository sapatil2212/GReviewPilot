/**
 * Location (branch) service.
 *
 * Enforces:
 *   - tenant-scoped access on every read/write
 *   - slug uniqueness within tenant (auto-generated if not supplied)
 *   - assigned manager belongs to the same tenant and is not deleted
 *   - working hours validated via Zod at the route level
 *   - soft delete via status = DELETED + deletedAt (recoverable)
 */

import { AuditAction, LocationStatus, Prisma, UserStatus } from "@prisma/client";
import { auditRepository } from "@/server/repositories/audit.repository";
import { locationRepository } from "@/server/repositories/location.repository";
import { userRepository } from "@/server/repositories/user.repository";
import { extractRequestContext } from "@/server/middleware/requestContext";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "@/server/utils/errors";
import { slugify } from "@/server/utils/tokens";
import type { AuthContext } from "@/server/auth/requireSession";
import type {
  CreateLocationInput,
  ListLocationsQuery,
  UpdateLocationInput,
  WorkingHours,
} from "@/server/validators/business.schema";
import { parsePagination } from "@/server/utils/pagination";
import { randomBytes } from "node:crypto";

async function ensureUniqueSlug(
  tenantId: string,
  desired: string,
): Promise<string> {
  const base = slugify(desired);
  let candidate = base;
  for (let attempt = 0; attempt < 8; attempt++) {
    const existing = await locationRepository.findBySlugForTenant(
      tenantId,
      candidate,
    );
    if (!existing) return candidate;
    candidate = `${base}-${randomBytes(3).toString("hex").slice(0, 5)}`;
  }
  return `${base}-${randomBytes(4).toString("hex")}`;
}

async function assertManagerBelongsToTenant(
  managerId: string,
  tenantId: string,
) {
  const user = await userRepository.findById(managerId);
  if (!user || user.tenantId !== tenantId) {
    throw new ValidationError("Assigned manager does not belong to this workspace");
  }
  if (user.status !== UserStatus.ACTIVE) {
    throw new ValidationError("Assigned manager is not an active team member");
  }
  return user;
}

export const locationService = {
  async list(
    ctx: AuthContext,
    req: Request,
    filter: ListLocationsQuery,
  ) {
    const url = new URL(req.url);
    const pagination = parsePagination(url.searchParams);
    return locationRepository.list({
      tenantId: ctx.tenantId,
      filter: {
        status: filter.status,
        managerId: filter.managerId,
        includeDeleted: filter.includeDeleted,
      },
      pagination,
    });
  },

  async getById(ctx: AuthContext, id: string) {
    const location = await locationRepository.findByIdForTenant(id, ctx.tenantId);
    if (!location) throw new NotFoundError("Location not found");
    return location;
  },

  async create(ctx: AuthContext, input: CreateLocationInput, req: Request) {
    if (input.assignedManagerId) {
      await assertManagerBelongsToTenant(input.assignedManagerId, ctx.tenantId);
    }
    if (input.googleLocationId) {
      const clash = await locationRepository.findByGoogleLocationId(
        input.googleLocationId,
      );
      if (clash) {
        throw new ConflictError(
          "CONFLICT",
          "This Google location is already linked to another workspace",
        );
      }
    }

    const slug = await ensureUniqueSlug(
      ctx.tenantId,
      input.slug ?? input.name,
    );

    const data: Prisma.LocationCreateInput = {
      tenant: { connect: { id: ctx.tenantId } },
      name: input.name,
      slug,
      storeCode: input.storeCode,
      addressLine1: input.addressLine1,
      addressLine2: input.addressLine2,
      city: input.city,
      state: input.state,
      postalCode: input.postalCode,
      country: input.country,
      latitude: input.latitude,
      longitude: input.longitude,
      googleLocationId: input.googleLocationId,
      googlePlaceId: input.googlePlaceId,
      phone: input.phone,
      email: input.email,
      website: input.website,
      timezone: input.timezone,
      workingHours: input.workingHours
        ? (input.workingHours as unknown as Prisma.InputJsonValue)
        : Prisma.JsonNull,
      ...(input.assignedManagerId
        ? { assignedManager: { connect: { id: input.assignedManagerId } } }
        : {}),
    };

    const location = await locationRepository.create(data);

    const rc = extractRequestContext(req);
    await auditRepository.record({
      action: AuditAction.LOCATION_CREATED,
      userId: ctx.userId,
      tenantId: ctx.tenantId,
      ipAddress: rc.ipAddress,
      userAgent: rc.userAgent,
      browser: rc.browser,
      device: rc.device,
      metadata: { locationId: location.id, name: location.name, slug: location.slug },
    });

    return location;
  },

  async update(
    ctx: AuthContext,
    id: string,
    input: UpdateLocationInput,
    req: Request,
  ) {
    const existing = await locationRepository.findByIdForTenant(id, ctx.tenantId);
    if (!existing) throw new NotFoundError("Location not found");
    if (existing.deletedAt) {
      throw new ForbiddenError(
        "Location is deleted. Restore it before updating.",
      );
    }

    if (input.assignedManagerId) {
      await assertManagerBelongsToTenant(input.assignedManagerId, ctx.tenantId);
    }
    if (
      input.googleLocationId &&
      input.googleLocationId !== existing.googleLocationId
    ) {
      const clash = await locationRepository.findByGoogleLocationId(
        input.googleLocationId,
      );
      if (clash && clash.id !== id) {
        throw new ConflictError(
          "CONFLICT",
          "This Google location is already linked to another workspace",
        );
      }
    }

    let slug = existing.slug;
    if (input.slug && input.slug !== existing.slug) {
      slug = await ensureUniqueSlug(ctx.tenantId, input.slug);
    }

    const data: Prisma.LocationUpdateInput = {
      name: input.name,
      slug: slug === existing.slug ? undefined : slug,
      storeCode: input.storeCode,
      addressLine1: input.addressLine1,
      addressLine2: input.addressLine2,
      city: input.city,
      state: input.state,
      postalCode: input.postalCode,
      country: input.country,
      latitude: input.latitude,
      longitude: input.longitude,
      googleLocationId: input.googleLocationId,
      googlePlaceId: input.googlePlaceId,
      phone: input.phone,
      email: input.email,
      website: input.website,
      timezone: input.timezone,
      ...(input.workingHours !== undefined
        ? {
            workingHours:
              input.workingHours === null
                ? Prisma.JsonNull
                : (input.workingHours as unknown as Prisma.InputJsonValue),
          }
        : {}),
      ...(input.assignedManagerId !== undefined
        ? input.assignedManagerId === null
          ? { assignedManager: { disconnect: true } }
          : { assignedManager: { connect: { id: input.assignedManagerId } } }
        : {}),
    };

    const updated = await locationRepository.update(id, data);

    const rc = extractRequestContext(req);
    await auditRepository.record({
      action: AuditAction.LOCATION_UPDATED,
      userId: ctx.userId,
      tenantId: ctx.tenantId,
      ipAddress: rc.ipAddress,
      userAgent: rc.userAgent,
      browser: rc.browser,
      device: rc.device,
      metadata: {
        locationId: id,
        fields: Object.keys(input).filter(
          (k) => input[k as keyof typeof input] !== undefined,
        ),
      },
    });

    return updated;
  },

  async updateWorkingHours(
    ctx: AuthContext,
    id: string,
    workingHours: WorkingHours,
    req: Request,
  ) {
    const existing = await locationRepository.findByIdForTenant(id, ctx.tenantId);
    if (!existing) throw new NotFoundError("Location not found");

    const updated = await locationRepository.update(id, {
      workingHours: workingHours as unknown as Prisma.InputJsonValue,
    });

    const rc = extractRequestContext(req);
    await auditRepository.record({
      action: AuditAction.LOCATION_HOURS_UPDATED,
      userId: ctx.userId,
      tenantId: ctx.tenantId,
      ipAddress: rc.ipAddress,
      userAgent: rc.userAgent,
      browser: rc.browser,
      device: rc.device,
      metadata: { locationId: id },
    });

    return updated;
  },

  async assignManager(
    ctx: AuthContext,
    id: string,
    managerId: string | null,
    req: Request,
  ) {
    const existing = await locationRepository.findByIdForTenant(id, ctx.tenantId);
    if (!existing) throw new NotFoundError("Location not found");

    if (managerId) {
      await assertManagerBelongsToTenant(managerId, ctx.tenantId);
    }

    const updated = await locationRepository.update(id, {
      assignedManager: managerId
        ? { connect: { id: managerId } }
        : { disconnect: true },
    });

    const rc = extractRequestContext(req);
    await auditRepository.record({
      action: AuditAction.LOCATION_MANAGER_ASSIGNED,
      userId: ctx.userId,
      tenantId: ctx.tenantId,
      ipAddress: rc.ipAddress,
      userAgent: rc.userAgent,
      browser: rc.browser,
      device: rc.device,
      metadata: { locationId: id, managerId: managerId ?? null },
    });

    return updated;
  },

  async archive(ctx: AuthContext, id: string, req: Request) {
    const existing = await locationRepository.findByIdForTenant(id, ctx.tenantId);
    if (!existing) throw new NotFoundError("Location not found");
    if (existing.deletedAt) {
      throw new ForbiddenError("Cannot archive a deleted location");
    }
    if (existing.status === LocationStatus.ARCHIVED) {
      return existing; // idempotent
    }

    const archived = await locationRepository.archive(id);

    const rc = extractRequestContext(req);
    await auditRepository.record({
      action: AuditAction.LOCATION_ARCHIVED,
      userId: ctx.userId,
      tenantId: ctx.tenantId,
      ipAddress: rc.ipAddress,
      userAgent: rc.userAgent,
      browser: rc.browser,
      device: rc.device,
      metadata: { locationId: id, name: existing.name },
    });

    return archived;
  },

  async restore(ctx: AuthContext, id: string, req: Request) {
    const existing = await locationRepository.findByIdForTenant(id, ctx.tenantId);
    if (!existing) throw new NotFoundError("Location not found");
    if (
      existing.status !== LocationStatus.ARCHIVED &&
      existing.status !== LocationStatus.DELETED
    ) {
      return existing; // idempotent
    }

    const restored = await locationRepository.restore(id);

    const rc = extractRequestContext(req);
    await auditRepository.record({
      action: AuditAction.LOCATION_RESTORED,
      userId: ctx.userId,
      tenantId: ctx.tenantId,
      ipAddress: rc.ipAddress,
      userAgent: rc.userAgent,
      browser: rc.browser,
      device: rc.device,
      metadata: { locationId: id, name: existing.name },
    });

    return restored;
  },

  async softDelete(ctx: AuthContext, id: string, req: Request) {
    const existing = await locationRepository.findByIdForTenant(id, ctx.tenantId);
    if (!existing) throw new NotFoundError("Location not found");
    if (existing.deletedAt) {
      return existing;
    }

    const deleted = await locationRepository.softDelete(id);

    const rc = extractRequestContext(req);
    await auditRepository.record({
      action: AuditAction.LOCATION_DELETED,
      userId: ctx.userId,
      tenantId: ctx.tenantId,
      ipAddress: rc.ipAddress,
      userAgent: rc.userAgent,
      browser: rc.browser,
      device: rc.device,
      metadata: { locationId: id, name: existing.name },
    });

    return deleted;
  },

  countActiveForTenant(tenantId: string) {
    return locationRepository.countActiveForTenant(tenantId);
  },
};
