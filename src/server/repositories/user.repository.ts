/**
 * User repository — thin persistence layer.
 * All queries go through Prisma (parameterized). Services never touch
 * Prisma directly.
 */

import { Prisma, User, UserRole, UserStatus } from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import { buildOrderBy, type PaginationQuery } from "@/server/utils/pagination";

export type UserSafe = Omit<User, "passwordHash">;

const MEMBER_SORTABLE = [
  "createdAt",
  "updatedAt",
  "firstName",
  "lastName",
  "email",
  "role",
  "status",
  "lastLoginAt",
] as const;

const SAFE_SELECT = {
  id: true,
  tenantId: true,
  firstName: true,
  lastName: true,
  email: true,
  avatar: true,
  phone: true,
  role: true,
  status: true,
  emailVerified: true,
  lastLoginAt: true,
  failedLoginCount: true,
  lockedUntil: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

export const userRepository = {
  findById(id: string) {
    return prisma.user.findUnique({ where: { id } });
  },

  findByIdSafe(id: string): Promise<UserSafe | null> {
    return prisma.user.findUnique({ where: { id }, select: SAFE_SELECT });
  },

  findByEmail(email: string) {
    return prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  },

  findByEmailSafe(email: string): Promise<UserSafe | null> {
    return prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      select: SAFE_SELECT,
    });
  },

  create(data: Prisma.UserCreateInput) {
    return prisma.user.create({ data });
  },

  updateById(id: string, data: Prisma.UserUpdateInput) {
    return prisma.user.update({ where: { id }, data });
  },

  markEmailVerified(id: string) {
    return prisma.user.update({
      where: { id },
      data: {
        emailVerified: new Date(),
        status: UserStatus.ACTIVE,
      },
    });
  },

  updatePassword(id: string, passwordHash: string) {
    return prisma.user.update({
      where: { id },
      data: {
        passwordHash,
        failedLoginCount: 0,
        lockedUntil: null,
      },
    });
  },

  recordSuccessfulLogin(id: string) {
    return prisma.user.update({
      where: { id },
      data: {
        lastLoginAt: new Date(),
        failedLoginCount: 0,
        lockedUntil: null,
      },
    });
  },

  recordFailedLogin(id: string, lockedUntil: Date | null) {
    return prisma.user.update({
      where: { id },
      data: {
        failedLoginCount: { increment: 1 },
        ...(lockedUntil ? { lockedUntil } : {}),
      },
    });
  },

  changeRole(id: string, role: UserRole) {
    return prisma.user.update({ where: { id }, data: { role } });
  },

  // ---- Team management additions ----

  findByIdInTenant(id: string, tenantId: string) {
    return prisma.user.findFirst({
      where: { id, tenantId },
      select: SAFE_SELECT,
    });
  },

  countActiveOwnersInTenant(tenantId: string, excludeUserId?: string) {
    return prisma.user.count({
      where: {
        tenantId,
        role: UserRole.TENANT_OWNER,
        status: UserStatus.ACTIVE,
        ...(excludeUserId ? { NOT: { id: excludeUserId } } : {}),
      },
    });
  },

  listInTenant(args: {
    tenantId: string;
    filter: {
      role?: UserRole;
      status?: UserStatus;
      userIdIn?: string[];
    };
    pagination: PaginationQuery;
  }): Promise<{ items: UserSafe[]; total: number }> {
    const where: Prisma.UserWhereInput = {
      tenantId: args.tenantId,
      // Never return soft-deleted users by default.
      status: args.filter.status ?? { not: UserStatus.DELETED },
      ...(args.filter.role ? { role: args.filter.role } : {}),
      ...(args.filter.userIdIn ? { id: { in: args.filter.userIdIn } } : {}),
      ...(args.pagination.search
        ? {
            OR: [
              { firstName: { contains: args.pagination.search } },
              { lastName: { contains: args.pagination.search } },
              { email: { contains: args.pagination.search } },
              { phone: { contains: args.pagination.search } },
            ],
          }
        : {}),
    };

    const orderBy = buildOrderBy(args.pagination, MEMBER_SORTABLE, "createdAt");
    const skip = (args.pagination.page - 1) * args.pagination.pageSize;
    const take = args.pagination.pageSize;

    return prisma
      .$transaction([
        prisma.user.findMany({
          where,
          select: SAFE_SELECT,
          orderBy,
          skip,
          take,
        }),
        prisma.user.count({ where }),
      ])
      .then(([items, total]) => ({ items, total }));
  },

  updateProfile(
    id: string,
    data: Pick<Prisma.UserUpdateInput, "firstName" | "lastName" | "phone" | "avatar">,
  ) {
    return prisma.user.update({
      where: { id },
      data,
      select: SAFE_SELECT,
    });
  },

  updateStatus(id: string, status: UserStatus) {
    return prisma.user.update({
      where: { id },
      data: { status },
      select: SAFE_SELECT,
    });
  },

  softDelete(id: string) {
    return prisma.user.update({
      where: { id },
      data: { status: UserStatus.DELETED },
      select: SAFE_SELECT,
    });
  },
};
