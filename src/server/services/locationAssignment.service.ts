/**
 * Location Assignment service — many-to-many User ↔ Location.
 *
 * Enforces tenant isolation on both sides of the join (user and
 * location must belong to the caller's tenant) and prevents
 * duplicate assignments.
 */

import { AuditAction, UserStatus } from "@prisma/client";
import { locationAssignmentRepository } from "@/server/repositories/locationAssignment.repository";
import { locationRepository } from "@/server/repositories/location.repository";
import { userRepository } from "@/server/repositories/user.repository";
import { auditRepository } from "@/server/repositories/audit.repository";
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from "@/server/utils/errors";
import { extractRequestContext } from "@/server/middleware/requestContext";
import type { AuthContext } from "@/server/auth/requireSession";

async function assertUserInTenant(userId: string, tenantId: string) {
  const user = await userRepository.findByIdInTenant(userId, tenantId);
  if (!user) throw new NotFoundError("User not found in this workspace");
  if (user.status === UserStatus.DELETED) {
    throw new ValidationError("User has been removed from the workspace");
  }
  return user;
}

async function assertLocationInTenant(locationId: string, tenantId: string) {
  const loc = await locationRepository.findByIdForTenant(locationId, tenantId);
  if (!loc) throw new NotFoundError("Location not found in this workspace");
  if (loc.deletedAt) {
    throw new ValidationError("Cannot assign to a deleted location");
  }
  return loc;
}

export const locationAssignmentService = {
  async listForUser(ctx: AuthContext, userId: string) {
    await assertUserInTenant(userId, ctx.tenantId);
    return locationAssignmentRepository.listForUser(userId, ctx.tenantId);
  },

  async listForLocation(ctx: AuthContext, locationId: string) {
    await assertLocationInTenant(locationId, ctx.tenantId);
    return locationAssignmentRepository.listForLocation(
      locationId,
      ctx.tenantId,
    );
  },

  async assign(
    ctx: AuthContext,
    { userId, locationId }: { userId: string; locationId: string },
    req: Request,
  ) {
    await assertUserInTenant(userId, ctx.tenantId);
    await assertLocationInTenant(locationId, ctx.tenantId);

    const existing = await locationAssignmentRepository.findByPair(
      locationId,
      userId,
    );
    if (existing) {
      throw new ConflictError(
        "CONFLICT",
        "User is already assigned to this location",
      );
    }

    const created = await locationAssignmentRepository.create({
      tenantId: ctx.tenantId,
      locationId,
      userId,
      assignedById: ctx.userId,
    });

    const rc = extractRequestContext(req);
    await auditRepository.record({
      action: AuditAction.USER_LOCATION_ASSIGNED,
      userId: ctx.userId,
      tenantId: ctx.tenantId,
      ipAddress: rc.ipAddress,
      userAgent: rc.userAgent,
      browser: rc.browser,
      device: rc.device,
      metadata: { targetUserId: userId, locationId },
    });

    return created;
  },

  async unassign(
    ctx: AuthContext,
    { userId, locationId }: { userId: string; locationId: string },
    req: Request,
  ) {
    await assertUserInTenant(userId, ctx.tenantId);
    await assertLocationInTenant(locationId, ctx.tenantId);

    const existing = await locationAssignmentRepository.findByPair(
      locationId,
      userId,
    );
    if (!existing) throw new NotFoundError("Assignment not found");

    await locationAssignmentRepository.removeByPair(locationId, userId);

    const rc = extractRequestContext(req);
    await auditRepository.record({
      action: AuditAction.USER_LOCATION_UNASSIGNED,
      userId: ctx.userId,
      tenantId: ctx.tenantId,
      ipAddress: rc.ipAddress,
      userAgent: rc.userAgent,
      browser: rc.browser,
      device: rc.device,
      metadata: { targetUserId: userId, locationId },
    });

    return { removed: existing.id, locationId, userId };
  },
};
