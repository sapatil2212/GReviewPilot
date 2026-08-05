/**
 * Invitation repository.
 *
 * Persistence for team invitations. Only PENDING invitations are
 * actionable; ACCEPTED / REVOKED / EXPIRED are kept for history and
 * audit only. Uniqueness is enforced at the service layer (at most
 * one PENDING per tenant+email).
 */

import { InvitationStatus, Prisma, UserRole } from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import { buildOrderBy, type PaginationQuery } from "@/server/utils/pagination";

const INVITE_INCLUDE = {
  invitedBy: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      avatar: true,
    },
  },
  acceptedBy: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      avatar: true,
    },
  },
  tenant: { select: { id: true, name: true, slug: true } },
} satisfies Prisma.InvitationInclude;

export type InvitationWithRelations = Prisma.InvitationGetPayload<{
  include: typeof INVITE_INCLUDE;
}>;

const SORTABLE = ["createdAt", "expiresAt", "status", "email"] as const;

export const invitationRepository = {
  findById(id: string) {
    return prisma.invitation.findUnique({
      where: { id },
      include: INVITE_INCLUDE,
    });
  },

  findByIdForTenant(id: string, tenantId: string) {
    return prisma.invitation.findFirst({
      where: { id, tenantId },
      include: INVITE_INCLUDE,
    });
  },

  findByTokenHash(tokenHash: string) {
    return prisma.invitation.findUnique({
      where: { tokenHash },
      include: INVITE_INCLUDE,
    });
  },

  findPendingByEmail(tenantId: string, email: string) {
    return prisma.invitation.findFirst({
      where: {
        tenantId,
        email: email.toLowerCase(),
        status: InvitationStatus.PENDING,
      },
      include: INVITE_INCLUDE,
    });
  },

  create(data: Prisma.InvitationCreateInput) {
    return prisma.invitation.create({ data, include: INVITE_INCLUDE });
  },

  updateById(id: string, data: Prisma.InvitationUpdateInput) {
    return prisma.invitation.update({
      where: { id },
      data,
      include: INVITE_INCLUDE,
    });
  },

  list(args: {
    tenantId: string;
    filter: { status?: InvitationStatus; role?: UserRole };
    pagination: PaginationQuery;
  }) {
    const where: Prisma.InvitationWhereInput = {
      tenantId: args.tenantId,
      ...(args.filter.status ? { status: args.filter.status } : {}),
      ...(args.filter.role ? { role: args.filter.role } : {}),
      ...(args.pagination.search
        ? {
            OR: [
              { email: { contains: args.pagination.search } },
              { firstName: { contains: args.pagination.search } },
              { lastName: { contains: args.pagination.search } },
            ],
          }
        : {}),
    };

    const orderBy = buildOrderBy(args.pagination, SORTABLE, "createdAt");
    const skip = (args.pagination.page - 1) * args.pagination.pageSize;
    const take = args.pagination.pageSize;

    return prisma
      .$transaction([
        prisma.invitation.findMany({
          where,
          include: INVITE_INCLUDE,
          orderBy,
          skip,
          take,
        }),
        prisma.invitation.count({ where }),
      ])
      .then(([items, total]) => ({ items, total }));
  },

  countPendingForTenant(tenantId: string) {
    return prisma.invitation.count({
      where: { tenantId, status: InvitationStatus.PENDING },
    });
  },

  countRecentByInviter(inviterId: string, sinceMs: number) {
    return prisma.invitation.count({
      where: {
        invitedById: inviterId,
        createdAt: { gte: new Date(Date.now() - sinceMs) },
      },
    });
  },

  /**
   * Sweep expired PENDING invitations. Called from the invite/list
   * services opportunistically; also safe to schedule as a cron job.
   */
  async markExpired() {
    const result = await prisma.invitation.updateMany({
      where: {
        status: InvitationStatus.PENDING,
        expiresAt: { lt: new Date() },
      },
      data: { status: InvitationStatus.EXPIRED },
    });
    return result.count;
  },
};
