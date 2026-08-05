/**
 * Team (member) service.
 *
 * Read + mutate users within the caller's tenant. Enforces:
 *   - Tenant scope (never sees other tenants' users)
 *   - Cannot demote / block / delete the last active TENANT_OWNER
 *   - Cannot escalate a role above the actor's own
 *   - Actor cannot demote themselves below TENANT_OWNER if they are the last one
 *   - Actor cannot delete themselves via this API
 *   - When a member is removed, their sessions are revoked
 */

import {
  AuditAction,
  Prisma,
  UserRole,
  UserStatus,
} from "@prisma/client";
import { userRepository } from "@/server/repositories/user.repository";
import { auditRepository } from "@/server/repositories/audit.repository";
import { locationAssignmentRepository } from "@/server/repositories/locationAssignment.repository";
import { sessionService } from "@/server/services/session.service";
import { extractRequestContext } from "@/server/middleware/requestContext";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "@/server/utils/errors";
import type { AuthContext } from "@/server/auth/requireSession";
import {
  buildPagedResult,
  parsePagination,
} from "@/server/utils/pagination";
import type {
  ChangeRoleInput,
  ChangeStatusInput,
  ListMembersQuery,
  UpdateMemberInput,
} from "@/server/validators/team.schema";
import { prisma } from "@/server/db/prisma";

const ROLE_LEVEL: Record<UserRole, number> = {
  [UserRole.VIEWER]: 0,
  [UserRole.STAFF]: 1,
  [UserRole.MANAGER]: 2,
  [UserRole.ADMIN]: 3,
  [UserRole.TENANT_OWNER]: 4,
  [UserRole.SUPER_ADMIN]: 5,
};

function assertActorAtLeastAsHigh(actor: UserRole, target: UserRole) {
  if (target === UserRole.SUPER_ADMIN) {
    throw new ForbiddenError("SUPER_ADMIN role cannot be assigned via API");
  }
  if (ROLE_LEVEL[actor] < ROLE_LEVEL[target]) {
    throw new ForbiddenError(
      "You cannot manage a user with a higher role than your own",
    );
  }
}

async function assertNotLastOwner(userId: string, tenantId: string) {
  const target = await userRepository.findByIdInTenant(userId, tenantId);
  if (target?.role !== UserRole.TENANT_OWNER) return;
  const remaining = await userRepository.countActiveOwnersInTenant(
    tenantId,
    userId,
  );
  if (remaining === 0) {
    throw new ConflictError(
      "CONFLICT",
      "This is the last active workspace owner and cannot be demoted, blocked, or removed",
    );
  }
}

export const teamService = {
  // ============================================================
  // LIST
  // ============================================================
  async list(ctx: AuthContext, req: Request, filter: ListMembersQuery) {
    const url = new URL(req.url);
    const pagination = parsePagination(url.searchParams);

    // If filtering by location, resolve to user IDs first.
    let userIdIn: string[] | undefined;
    if (filter.locationId) {
      const assignments = await locationAssignmentRepository.listForLocation(
        filter.locationId,
        ctx.tenantId,
      );
      userIdIn = assignments.map((a) => a.user.id);
      if (userIdIn.length === 0) {
        // No users assigned → return empty page.
        return buildPagedResult([], 0, pagination);
      }
    }

    const { items, total } = await userRepository.listInTenant({
      tenantId: ctx.tenantId,
      filter: { role: filter.role, status: filter.status, userIdIn },
      pagination,
    });

    // Hydrate location assignments in a single query.
    const assignments = await locationAssignmentRepository.listForUsers(
      items.map((u) => u.id),
      ctx.tenantId,
    );
    const byUser = new Map<string, typeof assignments>();
    for (const a of assignments) {
      const bucket = byUser.get(a.userId) ?? [];
      bucket.push(a);
      byUser.set(a.userId, bucket);
    }

    const hydrated = items.map((u) => ({
      ...u,
      assignments: byUser.get(u.id) ?? [],
    }));

    return buildPagedResult(hydrated, total, pagination);
  },

  async getById(ctx: AuthContext, id: string) {
    const user = await userRepository.findByIdInTenant(id, ctx.tenantId);
    if (!user) throw new NotFoundError("Member not found");
    const assignments = await locationAssignmentRepository.listForUser(
      id,
      ctx.tenantId,
    );
    return { ...user, assignments };
  },

  // ============================================================
  // UPDATE PROFILE
  // ============================================================
  async updateProfile(
    ctx: AuthContext,
    id: string,
    input: UpdateMemberInput,
    req: Request,
  ) {
    const target = await userRepository.findByIdInTenant(id, ctx.tenantId);
    if (!target) throw new NotFoundError("Member not found");

    // Members can always edit their own basic profile; otherwise the
    // route guards enforced "user:update".
    if (target.id !== ctx.userId) {
      assertActorAtLeastAsHigh(ctx.role, target.role);
    }

    const updated = await userRepository.updateProfile(id, {
      firstName: input.firstName,
      lastName: input.lastName,
      phone: input.phone,
      avatar: input.avatar,
    });

    const rc = extractRequestContext(req);
    await auditRepository.record({
      action: AuditAction.USER_UPDATED,
      userId: ctx.userId,
      tenantId: ctx.tenantId,
      ipAddress: rc.ipAddress,
      userAgent: rc.userAgent,
      browser: rc.browser,
      device: rc.device,
      metadata: {
        targetUserId: id,
        fields: Object.keys(input).filter(
          (k) => input[k as keyof typeof input] !== undefined,
        ),
      },
    });

    return updated;
  },

  // ============================================================
  // CHANGE ROLE
  // ============================================================
  async changeRole(
    ctx: AuthContext,
    id: string,
    input: ChangeRoleInput,
    req: Request,
  ) {
    if (id === ctx.userId && input.role !== ctx.role) {
      throw new ForbiddenError("You cannot change your own role");
    }
    const target = await userRepository.findByIdInTenant(id, ctx.tenantId);
    if (!target) throw new NotFoundError("Member not found");

    assertActorAtLeastAsHigh(ctx.role, target.role);
    assertActorAtLeastAsHigh(ctx.role, input.role);

    // If demoting an OWNER, ensure at least one other active OWNER remains.
    if (target.role === UserRole.TENANT_OWNER && input.role !== UserRole.TENANT_OWNER) {
      await assertNotLastOwner(id, ctx.tenantId);
    }

    const previousRole = target.role;
    const updated = await userRepository.changeRole(id, input.role);

    const rc = extractRequestContext(req);
    await auditRepository.record({
      action: AuditAction.ROLE_CHANGED,
      userId: ctx.userId,
      tenantId: ctx.tenantId,
      ipAddress: rc.ipAddress,
      userAgent: rc.userAgent,
      browser: rc.browser,
      device: rc.device,
      metadata: { targetUserId: id, from: previousRole, to: input.role },
    });

    return updated;
  },

  // ============================================================
  // CHANGE STATUS (block / unblock)
  // ============================================================
  async changeStatus(
    ctx: AuthContext,
    id: string,
    input: ChangeStatusInput,
    req: Request,
  ) {
    if (id === ctx.userId) {
      throw new ForbiddenError("You cannot change your own status");
    }
    const target = await userRepository.findByIdInTenant(id, ctx.tenantId);
    if (!target) throw new NotFoundError("Member not found");

    assertActorAtLeastAsHigh(ctx.role, target.role);

    if (input.status === UserStatus.BLOCKED) {
      await assertNotLastOwner(id, ctx.tenantId);
    }

    // No-op if the status already matches.
    if (target.status === input.status) return target;

    const updated = await userRepository.updateStatus(id, input.status);

    // Blocking → revoke every session for that user.
    if (input.status === UserStatus.BLOCKED) {
      await sessionService.revokeAllForUser(id, "USER_BLOCKED");
    }

    const rc = extractRequestContext(req);
    await auditRepository.record({
      action:
        input.status === UserStatus.BLOCKED
          ? AuditAction.USER_BLOCKED
          : AuditAction.USER_STATUS_CHANGED,
      userId: ctx.userId,
      tenantId: ctx.tenantId,
      ipAddress: rc.ipAddress,
      userAgent: rc.userAgent,
      browser: rc.browser,
      device: rc.device,
      metadata: {
        targetUserId: id,
        from: target.status,
        to: input.status,
        reason: input.reason ?? null,
      },
    });

    return updated;
  },

  // ============================================================
  // REMOVE (soft delete)
  // ============================================================
  async remove(ctx: AuthContext, id: string, req: Request) {
    if (id === ctx.userId) {
      throw new ForbiddenError("You cannot remove yourself");
    }
    const target = await userRepository.findByIdInTenant(id, ctx.tenantId);
    if (!target) throw new NotFoundError("Member not found");

    assertActorAtLeastAsHigh(ctx.role, target.role);
    await assertNotLastOwner(id, ctx.tenantId);

    // Soft-delete + revoke sessions + drop location assignments.
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id },
        data: { status: UserStatus.DELETED },
      });
      await tx.locationAssignment.deleteMany({ where: { userId: id } });
      // Clear the "assignedManager" pointer on any locations they owned.
      await tx.location.updateMany({
        where: { tenantId: ctx.tenantId, assignedManagerId: id },
        data: { assignedManagerId: null },
      });
    });

    await sessionService.revokeAllForUser(id, "USER_REMOVED");

    const rc = extractRequestContext(req);
    await auditRepository.record({
      action: AuditAction.USER_REMOVED,
      userId: ctx.userId,
      tenantId: ctx.tenantId,
      ipAddress: rc.ipAddress,
      userAgent: rc.userAgent,
      browser: rc.browser,
      device: rc.device,
      metadata: {
        targetUserId: id,
        targetEmail: target.email,
        priorRole: target.role,
      },
    });

    return { removed: id };
  },
};
