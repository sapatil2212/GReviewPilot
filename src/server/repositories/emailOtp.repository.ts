/**
 * EmailOtp persistence.
 *
 * OTPs are 6-digit numeric codes stored as SHA-256 digests. Each
 * request invalidates prior unconsumed OTPs for the same
 * (email, purpose) pair so a stale code can't be reused.
 */

import { prisma } from "@/server/db/prisma";

export type OtpPurpose = "signup" | "change_email";

export const emailOtpRepository = {
  create(input: {
    email: string;
    codeHash: string;
    purpose: OtpPurpose;
    expiresAt: Date;
    ipAddress?: string | null;
  }) {
    return prisma.emailOtp.create({
      data: {
        email: input.email.toLowerCase(),
        codeHash: input.codeHash,
        purpose: input.purpose,
        expiresAt: input.expiresAt,
        ipAddress: input.ipAddress ?? null,
      },
    });
  },

  /** The most recent unconsumed OTP for the (email, purpose) pair. */
  findLatestActive(email: string, purpose: OtpPurpose) {
    return prisma.emailOtp.findFirst({
      where: {
        email: email.toLowerCase(),
        purpose,
        consumedAt: null,
      },
      orderBy: { createdAt: "desc" },
    });
  },

  incrementAttempts(id: string) {
    return prisma.emailOtp.update({
      where: { id },
      data: { attempts: { increment: 1 } },
    });
  },

  consume(id: string) {
    return prisma.emailOtp.update({
      where: { id },
      data: { consumedAt: new Date() },
    });
  },

  invalidateAll(email: string, purpose: OtpPurpose) {
    return prisma.emailOtp.updateMany({
      where: {
        email: email.toLowerCase(),
        purpose,
        consumedAt: null,
      },
      data: { consumedAt: new Date() },
    });
  },
};
