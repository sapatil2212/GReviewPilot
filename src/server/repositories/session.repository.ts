import { Prisma, UserSession } from "@prisma/client";
import { prisma } from "@/server/db/prisma";

export const sessionRepository = {
  create(data: Prisma.UserSessionCreateInput): Promise<UserSession> {
    return prisma.userSession.create({ data });
  },

  findByTokenHash(sessionTokenHash: string) {
    return prisma.userSession.findUnique({ where: { sessionTokenHash } });
  },

  listActiveForUser(userId: string) {
    return prisma.userSession.findMany({
      where: { userId, isActive: true, expiresAt: { gt: new Date() } },
      orderBy: { lastActivityAt: "desc" },
    });
  },

  touchActivity(id: string) {
    return prisma.userSession.update({
      where: { id },
      data: { lastActivityAt: new Date() },
    });
  },

  rotate(
    id: string,
    newSessionTokenHash: string,
    newExpiresAt: Date,
  ) {
    return prisma.userSession.update({
      where: { id },
      data: {
        sessionTokenHash: newSessionTokenHash,
        expiresAt: newExpiresAt,
        lastActivityAt: new Date(),
      },
    });
  },

  revoke(id: string, reason: string) {
    return prisma.userSession.update({
      where: { id },
      data: { isActive: false, revokedAt: new Date(), revokedReason: reason },
    });
  },

  revokeAllForUser(userId: string, reason: string, exceptId?: string) {
    return prisma.userSession.updateMany({
      where: {
        userId,
        isActive: true,
        ...(exceptId ? { NOT: { id: exceptId } } : {}),
      },
      data: { isActive: false, revokedAt: new Date(), revokedReason: reason },
    });
  },

  cleanupExpired() {
    return prisma.userSession.updateMany({
      where: {
        isActive: true,
        expiresAt: { lt: new Date() },
      },
      data: { isActive: false, revokedAt: new Date(), revokedReason: "EXPIRED" },
    });
  },
};
