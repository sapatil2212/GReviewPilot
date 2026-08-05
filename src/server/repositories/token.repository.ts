/**
 * Verification-token and password-reset-token persistence.
 * Both are single-use, short-lived, and only stored as SHA-256 digests.
 */

import { prisma } from "@/server/db/prisma";

export const verificationTokenRepository = {
  create(userId: string, email: string, tokenHash: string, expiresAt: Date) {
    return prisma.verificationToken.create({
      data: { userId, email, tokenHash, expiresAt },
    });
  },

  findByHash(tokenHash: string) {
    return prisma.verificationToken.findUnique({ where: { tokenHash } });
  },

  consume(id: string) {
    return prisma.verificationToken.update({
      where: { id },
      data: { consumedAt: new Date() },
    });
  },

  /** Invalidate every outstanding token for a user (e.g. after successful verify). */
  invalidateAllForUser(userId: string) {
    return prisma.verificationToken.updateMany({
      where: { userId, consumedAt: null },
      data: { consumedAt: new Date() },
    });
  },
};

export const passwordResetTokenRepository = {
  create(
    userId: string,
    tokenHash: string,
    expiresAt: Date,
    ipAddress: string | null,
  ) {
    return prisma.passwordResetToken.create({
      data: { userId, tokenHash, expiresAt, ipAddress },
    });
  },

  findByHash(tokenHash: string) {
    return prisma.passwordResetToken.findUnique({ where: { tokenHash } });
  },

  consume(id: string) {
    return prisma.passwordResetToken.update({
      where: { id },
      data: { consumedAt: new Date() },
    });
  },

  invalidateAllForUser(userId: string) {
    return prisma.passwordResetToken.updateMany({
      where: { userId, consumedAt: null },
      data: { consumedAt: new Date() },
    });
  },
};
