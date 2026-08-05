/**
 * Invitation service.
 *
 * Sends, resends, revokes, and accepts team invitations.
 *
 * Security invariants:
 *   - Only role hierarchy-appropriate invites are permitted (a
 *     non-owner cannot invite a TENANT_OWNER).
 *   - Cannot invite an email that already belongs to any User row
 *     (email is globally unique) — response shape is uniform to avoid
 *     enumeration.
 *   - Raw token is generated once, hashed with SHA-256 for storage,
 *     and only the raw value is emailed.
 *   - Only PENDING invites are actionable; the service refuses to
 *     resend/revoke terminal-state records.
 *   - Rate-limited per inviter (20/hour) and per tenant (100/hour).
 */

import {
  AuditAction,
  InvitationStatus,
  Prisma,
  UserRole,
  UserStatus,
} from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import { invitationRepository } from "@/server/repositories/invitation.repository";
import { userRepository } from "@/server/repositories/user.repository";
import { tenantRepository } from "@/server/repositories/tenant.repository";
import { auditRepository } from "@/server/repositories/audit.repository";
import { locationRepository } from "@/server/repositories/location.repository";
import { locationAssignmentRepository } from "@/server/repositories/locationAssignment.repository";
import { emailService } from "@/server/email/email.service";
import { extractRequestContext } from "@/server/middleware/requestContext";
import { checkRateLimit } from "@/server/middleware/rateLimit";
import { hashPassword } from "@/server/utils/hash";
import { generateToken } from "@/server/utils/tokens";
import { sha256 } from "@/server/utils/hash";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  RateLimitError,
  ValidationError,
} from "@/server/utils/errors";
import { logger } from "@/server/utils/logger";
import {
  buildPagedResult,
  parsePagination,
} from "@/server/utils/pagination";
import type { AuthContext } from "@/server/auth/requireSession";
import type {
  AcceptInvitationInput,
  CreateInvitationInput,
  ListInvitationsQuery,
} from "@/server/validators/team.schema";

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const INVITATION_TTL_HOURS = 168;

// Role hierarchy: higher index = more privileged.
const ROLE_LEVEL: Record<UserRole, number> = {
  [UserRole.VIEWER]: 0,
  [UserRole.STAFF]: 1,
  [UserRole.MANAGER]: 2,
  [UserRole.ADMIN]: 3,
  [UserRole.TENANT_OWNER]: 4,
  [UserRole.SUPER_ADMIN]: 5,
};

function assertRoleAssignable(actorRole: UserRole, targetRole: UserRole) {
  if (targetRole === UserRole.SUPER_ADMIN) {
    throw new ForbiddenError("SUPER_ADMIN role cannot be assigned via API");
  }
  if (
    targetRole === UserRole.TENANT_OWNER &&
    actorRole !== UserRole.TENANT_OWNER &&
    actorRole !== UserRole.SUPER_ADMIN
  ) {
    throw new ForbiddenError("Only a workspace owner can grant owner role");
  }
  // Actor must be at or above the target role level (except OWNER special-case above).
  if (ROLE_LEVEL[actorRole] < ROLE_LEVEL[targetRole]) {
    throw new ForbiddenError("You cannot assign a role higher than your own");
  }
}

async function assertLocationsBelongToTenant(
  locationIds: string[] | undefined,
  tenantId: string,
) {
  if (!locationIds?.length) return;
  const rows = await Promise.all(
    locationIds.map((id) => locationRepository.findByIdForTenant(id, tenantId)),
  );
  const missing = rows.findIndex((r) => !r);
  if (missing >= 0) {
    throw new ValidationError(
      `Location not found in this workspace: ${locationIds[missing]}`,
    );
  }
}

export const invitationService = {
  // ============================================================
  // CREATE
  // ============================================================
  async create(
    ctx: AuthContext,
    input: CreateInvitationInput,
    req: Request,
  ) {
    assertRoleAssignable(ctx.role, input.role);

    if (input.email === ctx.email.toLowerCase()) {
      throw new ValidationError("You cannot invite yourself");
    }

    // Rate limits — per inviter + per tenant.
    checkRateLimit({
      key: `invite:user:${ctx.userId}`,
      max: 20,
      windowMs: 60 * 60 * 1000,
    });
    checkRateLimit({
      key: `invite:tenant:${ctx.tenantId}`,
      max: 100,
      windowMs: 60 * 60 * 1000,
    });

    await assertLocationsBelongToTenant(input.locationIds, ctx.tenantId);

    // Global email uniqueness — Users.email is UNIQUE. If a User exists
    // with this email in ANY tenant, reject with a uniform message.
    const existingUser = await userRepository.findByEmail(input.email);
    if (existingUser) {
      throw new ConflictError(
        "EMAIL_ALREADY_EXISTS",
        "That email is already registered",
      );
    }

    // Revoke any prior PENDING invite so only one active invite per email/tenant.
    const existingPending = await invitationRepository.findPendingByEmail(
      ctx.tenantId,
      input.email,
    );
    if (existingPending) {
      await invitationRepository.updateById(existingPending.id, {
        status: InvitationStatus.REVOKED,
        revokedAt: new Date(),
        revokedById: ctx.userId,
      });
    }

    const { raw, hash } = generateToken();

    const tenant = await tenantRepository.findById(ctx.tenantId);
    if (!tenant) throw new NotFoundError("Workspace not found");

    const invitation = await invitationRepository.create({
      tenant: { connect: { id: ctx.tenantId } },
      email: input.email,
      firstName: input.firstName ?? null,
      lastName: input.lastName ?? null,
      role: input.role,
      message: input.message ?? null,
      tokenHash: hash,
      expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
      invitedBy: { connect: { id: ctx.userId } },
      metadata: input.locationIds
        ? ({ locationIds: input.locationIds } as Prisma.InputJsonValue)
        : Prisma.JsonNull,
    });

    // Fire audit + email in parallel; email is safe-send (won't throw).
    const rc = extractRequestContext(req);
    await Promise.all([
      auditRepository.record({
        action: AuditAction.USER_INVITED,
        userId: ctx.userId,
        tenantId: ctx.tenantId,
        ipAddress: rc.ipAddress,
        userAgent: rc.userAgent,
        browser: rc.browser,
        device: rc.device,
        metadata: {
          invitationId: invitation.id,
          email: input.email,
          role: input.role,
          locationIds: input.locationIds ?? [],
        },
      }),
      emailService.sendInvitationEmail({
        to: input.email,
        firstName: input.firstName,
        inviterName: `${ctx.firstName} ${ctx.lastName}`.trim() || undefined,
        tenantName: tenant.name,
        role: input.role,
        token: raw,
        message: input.message,
        expiresInHours: INVITATION_TTL_HOURS,
      }),
    ]);

    return invitation;
  },

  // ============================================================
  // LIST
  // ============================================================
  async list(ctx: AuthContext, req: Request, filter: ListInvitationsQuery) {
    // Opportunistic sweep of stale PENDING rows so listings are honest.
    await invitationRepository.markExpired();

    const url = new URL(req.url);
    const pagination = parsePagination(url.searchParams);
    const { items, total } = await invitationRepository.list({
      tenantId: ctx.tenantId,
      filter,
      pagination,
    });
    return buildPagedResult(items, total, pagination);
  },

  async getById(ctx: AuthContext, id: string) {
    const inv = await invitationRepository.findByIdForTenant(id, ctx.tenantId);
    if (!inv) throw new NotFoundError("Invitation not found");
    return inv;
  },

  // ============================================================
  // RESEND
  // ============================================================
  async resend(ctx: AuthContext, id: string, req: Request) {
    const inv = await invitationRepository.findByIdForTenant(id, ctx.tenantId);
    if (!inv) throw new NotFoundError("Invitation not found");
    if (inv.status !== InvitationStatus.PENDING) {
      throw new ValidationError(
        `Cannot resend a ${inv.status.toLowerCase()} invitation`,
      );
    }

    checkRateLimit({
      key: `invite-resend:${id}`,
      max: 5,
      windowMs: 60 * 60 * 1000,
    });

    const { raw, hash } = generateToken();
    const updated = await invitationRepository.updateById(id, {
      tokenHash: hash,
      expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
    });

    const tenant = await tenantRepository.findById(ctx.tenantId);

    const rc = extractRequestContext(req);
    await Promise.all([
      auditRepository.record({
        action: AuditAction.INVITATION_RESENT,
        userId: ctx.userId,
        tenantId: ctx.tenantId,
        ipAddress: rc.ipAddress,
        userAgent: rc.userAgent,
        browser: rc.browser,
        device: rc.device,
        metadata: { invitationId: id, email: inv.email },
      }),
      emailService.sendInvitationEmail({
        to: inv.email,
        firstName: inv.firstName ?? undefined,
        inviterName: `${ctx.firstName} ${ctx.lastName}`.trim() || undefined,
        tenantName: tenant?.name ?? "Workspace",
        role: inv.role,
        token: raw,
        message: inv.message ?? undefined,
        expiresInHours: INVITATION_TTL_HOURS,
      }),
    ]);

    return updated;
  },

  // ============================================================
  // REVOKE
  // ============================================================
  async revoke(ctx: AuthContext, id: string, req: Request) {
    const inv = await invitationRepository.findByIdForTenant(id, ctx.tenantId);
    if (!inv) throw new NotFoundError("Invitation not found");
    if (inv.status !== InvitationStatus.PENDING) {
      throw new ValidationError(
        `Cannot revoke a ${inv.status.toLowerCase()} invitation`,
      );
    }

    const updated = await invitationRepository.updateById(id, {
      status: InvitationStatus.REVOKED,
      revokedAt: new Date(),
      revokedById: ctx.userId,
    });

    const rc = extractRequestContext(req);
    await auditRepository.record({
      action: AuditAction.INVITATION_REVOKED,
      userId: ctx.userId,
      tenantId: ctx.tenantId,
      ipAddress: rc.ipAddress,
      userAgent: rc.userAgent,
      browser: rc.browser,
      device: rc.device,
      metadata: { invitationId: id, email: inv.email },
    });

    return updated;
  },

  // ============================================================
  // PREVIEW (public)
  // ============================================================
  async preview(rawToken: string) {
    const inv = await invitationRepository.findByTokenHash(sha256(rawToken));
    if (!inv) throw new NotFoundError("Invitation not found or invalid");

    if (inv.status === InvitationStatus.ACCEPTED) {
      throw new ValidationError("This invitation was already accepted");
    }
    if (inv.status === InvitationStatus.REVOKED) {
      throw new ValidationError("This invitation was revoked");
    }
    if (inv.expiresAt < new Date()) {
      // Best-effort update to EXPIRED so listings stay honest.
      if (inv.status === InvitationStatus.PENDING) {
        await invitationRepository.updateById(inv.id, {
          status: InvitationStatus.EXPIRED,
        });
      }
      throw new ValidationError("This invitation has expired");
    }

    return {
      email: inv.email,
      firstName: inv.firstName,
      lastName: inv.lastName,
      role: inv.role,
      message: inv.message,
      tenant: inv.tenant,
      invitedBy: inv.invitedBy,
      expiresAt: inv.expiresAt,
    };
  },

  // ============================================================
  // ACCEPT (public)
  // ============================================================
  async accept(input: AcceptInvitationInput, req: Request) {
    const inv = await invitationRepository.findByTokenHash(sha256(input.token));
    if (!inv) throw new NotFoundError("Invitation not found or invalid");

    if (inv.status !== InvitationStatus.PENDING) {
      throw new ValidationError(
        `This invitation is ${inv.status.toLowerCase()}`,
      );
    }
    if (inv.expiresAt < new Date()) {
      await invitationRepository.updateById(inv.id, {
        status: InvitationStatus.EXPIRED,
      });
      throw new ValidationError("This invitation has expired");
    }

    // Someone else may have registered this email in the meantime.
    const clash = await userRepository.findByEmail(inv.email);
    if (clash) {
      throw new ConflictError(
        "EMAIL_ALREADY_EXISTS",
        "That email is already registered",
      );
    }

    const passwordHash = await hashPassword(input.password);
    const firstName = input.firstName ?? inv.firstName ?? "";
    const lastName = input.lastName ?? inv.lastName ?? "";
    if (!firstName || !lastName) {
      throw new ValidationError("First name and last name are required");
    }

    const preselectedLocationIds = extractLocationIds(inv.metadata);

    // Atomically: create user, mark invitation accepted, create assignments.
    const created = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          tenantId: inv.tenantId,
          firstName,
          lastName,
          email: inv.email,
          passwordHash,
          role: inv.role,
          status: UserStatus.ACTIVE,
          emailVerified: new Date(),
        },
      });

      await tx.invitation.update({
        where: { id: inv.id },
        data: {
          status: InvitationStatus.ACCEPTED,
          acceptedAt: new Date(),
          acceptedBy: { connect: { id: user.id } },
        },
      });

      if (preselectedLocationIds.length > 0) {
        await tx.locationAssignment.createMany({
          data: preselectedLocationIds.map((locationId) => ({
            tenantId: inv.tenantId,
            locationId,
            userId: user.id,
            assignedById: inv.invitedById ?? null,
          })),
          skipDuplicates: true,
        });
      }

      return user;
    });

    const rc = extractRequestContext(req);
    await auditRepository.record({
      action: AuditAction.INVITATION_ACCEPTED,
      userId: created.id,
      tenantId: inv.tenantId,
      ipAddress: rc.ipAddress,
      userAgent: rc.userAgent,
      browser: rc.browser,
      device: rc.device,
      metadata: {
        invitationId: inv.id,
        email: inv.email,
        role: inv.role,
        locationIds: preselectedLocationIds,
      },
    });

    // Best-effort welcome mail; failures don't fail the accept.
    emailService
      .sendWelcomeEmail({ to: created.email, firstName: created.firstName })
      .catch((err) =>
        logger.warn("Welcome email send failed", {
          err: err instanceof Error ? err.message : String(err),
        }),
      );

    return {
      userId: created.id,
      tenantId: created.tenantId,
      email: created.email,
      role: created.role,
    };
  },
};

function extractLocationIds(metadata: Prisma.JsonValue | null): string[] {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return [];
  }
  const value = (metadata as Record<string, unknown>).locationIds;
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string");
}
