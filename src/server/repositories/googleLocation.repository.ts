/**
 * GoogleLocation repository — one row per location surfaced by the
 * Google Business Profile API. Rows are (idempotently) upserted by
 * the location sync job; links to our own Location table are set by
 * users via the linking endpoints.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/server/db/prisma";

const INCLUDE = {
  localLocation: {
    select: { id: true, name: true, slug: true, city: true, country: true },
  },
} satisfies Prisma.GoogleLocationInclude;

export type GoogleLocationWithRelations = Prisma.GoogleLocationGetPayload<{
  include: typeof INCLUDE;
}>;

export const googleLocationRepository = {
  listForTenant(tenantId: string) {
    return prisma.googleLocation.findMany({
      where: { tenantId },
      include: INCLUDE,
      orderBy: { title: "asc" },
    });
  },

  findById(id: string) {
    return prisma.googleLocation.findUnique({
      where: { id },
      include: INCLUDE,
    });
  },

  findByIdForTenant(id: string, tenantId: string) {
    return prisma.googleLocation.findFirst({
      where: { id, tenantId },
      include: INCLUDE,
    });
  },

  findByResourceName(googleAccountId: string, googleLocationName: string) {
    return prisma.googleLocation.findUnique({
      where: {
        googleAccountId_googleLocationName: {
          googleAccountId,
          googleLocationName,
        },
      },
    });
  },

  upsert(input: {
    tenantId: string;
    googleAccountId: string;
    googleLocationName: string;
    googleLocationId: string;
    googlePlaceId?: string | null;
    title: string;
    storeCode?: string | null;
    primaryCategory?: string | null;
    addressLine?: string | null;
    city?: string | null;
    state?: string | null;
    postalCode?: string | null;
    country?: string | null;
    phone?: string | null;
    websiteUri?: string | null;
    raw: Prisma.InputJsonValue;
    dataHash: string;
  }) {
    return prisma.googleLocation.upsert({
      where: {
        googleAccountId_googleLocationName: {
          googleAccountId: input.googleAccountId,
          googleLocationName: input.googleLocationName,
        },
      },
      create: {
        tenant: { connect: { id: input.tenantId } },
        googleAccount: { connect: { id: input.googleAccountId } },
        googleLocationName: input.googleLocationName,
        googleLocationId: input.googleLocationId,
        googlePlaceId: input.googlePlaceId ?? null,
        title: input.title,
        storeCode: input.storeCode ?? null,
        primaryCategory: input.primaryCategory ?? null,
        addressLine: input.addressLine ?? null,
        city: input.city ?? null,
        state: input.state ?? null,
        postalCode: input.postalCode ?? null,
        country: input.country ?? null,
        phone: input.phone ?? null,
        websiteUri: input.websiteUri ?? null,
        raw: input.raw,
        dataHash: input.dataHash,
      },
      update: {
        googleLocationId: input.googleLocationId,
        googlePlaceId: input.googlePlaceId ?? null,
        title: input.title,
        storeCode: input.storeCode ?? null,
        primaryCategory: input.primaryCategory ?? null,
        addressLine: input.addressLine ?? null,
        city: input.city ?? null,
        state: input.state ?? null,
        postalCode: input.postalCode ?? null,
        country: input.country ?? null,
        phone: input.phone ?? null,
        websiteUri: input.websiteUri ?? null,
        raw: input.raw,
        dataHash: input.dataHash,
        syncedAt: new Date(),
      },
      include: INCLUDE,
    });
  },

  updateLink(id: string, localLocationId: string | null) {
    return prisma.googleLocation.update({
      where: { id },
      data: { localLocationId },
      include: INCLUDE,
    });
  },

  deleteMissing(googleAccountId: string, resourceNamesKept: string[]) {
    return prisma.googleLocation.deleteMany({
      where: {
        googleAccountId,
        googleLocationName:
          resourceNamesKept.length > 0
            ? { notIn: resourceNamesKept }
            : undefined,
      },
    });
  },
};
