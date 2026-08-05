/**
 * BusinessAttribute repository — key/value attributes on the tenant's
 * business profile. Uniqueness is enforced at `(profileId, key)`.
 */

import { BusinessAttributeType, Prisma } from "@prisma/client";
import { prisma } from "@/server/db/prisma";

export const businessAttributeRepository = {
  listForProfile(profileId: string) {
    return prisma.businessAttribute.findMany({
      where: { profileId },
      orderBy: { key: "asc" },
    });
  },

  findByKey(profileId: string, key: string) {
    return prisma.businessAttribute.findUnique({
      where: { profileId_key: { profileId, key } },
    });
  },

  findByIdInProfile(profileId: string, id: string) {
    return prisma.businessAttribute.findFirst({ where: { id, profileId } });
  },

  upsert(input: {
    profileId: string;
    key: string;
    value: string;
    type: BusinessAttributeType;
  }) {
    return prisma.businessAttribute.upsert({
      where: {
        profileId_key: { profileId: input.profileId, key: input.key },
      },
      create: {
        profileId: input.profileId,
        key: input.key,
        value: input.value,
        type: input.type,
      },
      update: { value: input.value, type: input.type },
    });
  },

  bulkUpsert(
    profileId: string,
    entries: Array<{ key: string; value: string; type: BusinessAttributeType }>,
  ) {
    return prisma.$transaction(
      entries.map((e) =>
        prisma.businessAttribute.upsert({
          where: { profileId_key: { profileId, key: e.key } },
          create: {
            profileId,
            key: e.key,
            value: e.value,
            type: e.type,
          },
          update: { value: e.value, type: e.type },
        }),
      ),
    );
  },

  deleteById(profileId: string, id: string) {
    return prisma.businessAttribute.deleteMany({ where: { id, profileId } });
  },

  deleteByKey(profileId: string, key: string) {
    return prisma.businessAttribute.deleteMany({ where: { profileId, key } });
  },

  countForProfile(profileId: string, where?: Prisma.BusinessAttributeWhereInput) {
    return prisma.businessAttribute.count({
      where: { profileId, ...(where ?? {}) },
    });
  },
};
