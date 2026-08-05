/**
 * GoogleAccount repository — tenant-scoped storage for a connected
 * Google Business Profile OAuth account. Tokens are already encrypted
 * by the service layer before landing here.
 */

import { GoogleAccountStatus, Prisma } from "@prisma/client";
import { prisma } from "@/server/db/prisma";

const INCLUDE = {
  connectedBy: {
    select: { id: true, firstName: true, lastName: true, email: true },
  },
} satisfies Prisma.GoogleAccountInclude;

export type GoogleAccountWithRelations = Prisma.GoogleAccountGetPayload<{
  include: typeof INCLUDE;
}>;

export const googleAccountRepository = {
  findByTenantId(tenantId: string) {
    return prisma.googleAccount.findFirst({
      where: { tenantId },
      include: INCLUDE,
      orderBy: { createdAt: "desc" },
    });
  },

  findConnectedByTenantId(tenantId: string) {
    return prisma.googleAccount.findFirst({
      where: { tenantId, status: GoogleAccountStatus.CONNECTED },
      include: INCLUDE,
      orderBy: { createdAt: "desc" },
    });
  },

  findByTenantAndEmail(tenantId: string, email: string) {
    return prisma.googleAccount.findUnique({
      where: { tenantId_email: { tenantId, email: email.toLowerCase() } },
      include: INCLUDE,
    });
  },

  findById(id: string) {
    return prisma.googleAccount.findUnique({
      where: { id },
      include: INCLUDE,
    });
  },

  upsert(input: {
    tenantId: string;
    email: string;
    accessToken: string;
    refreshToken: string;
    expiresAt: Date;
    scopes: string;
    connectedById: string | null;
    googleAccountId?: string | null;
    googleAccountName?: string | null;
  }) {
    return prisma.googleAccount.upsert({
      where: {
        tenantId_email: {
          tenantId: input.tenantId,
          email: input.email.toLowerCase(),
        },
      },
      create: {
        tenant: { connect: { id: input.tenantId } },
        email: input.email.toLowerCase(),
        accessToken: input.accessToken,
        refreshToken: input.refreshToken,
        expiresAt: input.expiresAt,
        scopes: input.scopes,
        status: GoogleAccountStatus.CONNECTED,
        googleAccountId: input.googleAccountId ?? null,
        googleAccountName: input.googleAccountName ?? null,
        ...(input.connectedById
          ? { connectedBy: { connect: { id: input.connectedById } } }
          : {}),
      },
      update: {
        accessToken: input.accessToken,
        refreshToken: input.refreshToken,
        expiresAt: input.expiresAt,
        scopes: input.scopes,
        status: GoogleAccountStatus.CONNECTED,
        googleAccountId: input.googleAccountId ?? undefined,
        googleAccountName: input.googleAccountName ?? undefined,
        ...(input.connectedById
          ? { connectedBy: { connect: { id: input.connectedById } } }
          : {}),
      },
      include: INCLUDE,
    });
  },

  updateTokens(
    id: string,
    data: { accessToken: string; refreshToken?: string; expiresAt: Date; scopes?: string },
  ) {
    return prisma.googleAccount.update({
      where: { id },
      data: {
        accessToken: data.accessToken,
        ...(data.refreshToken ? { refreshToken: data.refreshToken } : {}),
        expiresAt: data.expiresAt,
        ...(data.scopes ? { scopes: data.scopes } : {}),
        status: GoogleAccountStatus.CONNECTED,
      },
    });
  },

  updateStatus(id: string, status: GoogleAccountStatus, error?: string) {
    return prisma.googleAccount.update({
      where: { id },
      data: {
        status,
        lastSyncError: error ?? null,
      },
    });
  },

  updateSyncTimestamp(id: string, at: Date, error?: string | null) {
    return prisma.googleAccount.update({
      where: { id },
      data: {
        lastSyncedAt: at,
        lastSyncError: error ?? null,
      },
    });
  },

  updateAccountIds(
    id: string,
    data: { googleAccountId: string | null; googleAccountName: string | null },
  ) {
    return prisma.googleAccount.update({
      where: { id },
      data: {
        googleAccountId: data.googleAccountId,
        googleAccountName: data.googleAccountName,
      },
    });
  },

  disconnect(id: string) {
    return prisma.googleAccount.delete({ where: { id } });
  },
};
