/**
 * LocationAssignment repository — many-to-many User ↔ Location.
 *
 * Distinct from Location.assignedManagerId (single primary manager).
 * Uniqueness is (locationId, userId).
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/server/db/prisma";

const ASSIGNMENT_INCLUDE_LOCATION = {
  location: {
    select: {
      id: true,
      name: true,
      slug: true,
      city: true,
      status: true,
      country: true,
    },
  },
} satisfies Prisma.LocationAssignmentInclude;

const ASSIGNMENT_INCLUDE_USER = {
  user: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      avatar: true,
      role: true,
      status: true,
    },
  },
} satisfies Prisma.LocationAssignmentInclude;

export type AssignmentWithLocation = Prisma.LocationAssignmentGetPayload<{
  include: typeof ASSIGNMENT_INCLUDE_LOCATION;
}>;

export type AssignmentWithUser = Prisma.LocationAssignmentGetPayload<{
  include: typeof ASSIGNMENT_INCLUDE_USER;
}>;

export const locationAssignmentRepository = {
  findByPair(locationId: string, userId: string) {
    return prisma.locationAssignment.findUnique({
      where: { locationId_userId: { locationId, userId } },
    });
  },

  listForUser(userId: string, tenantId: string): Promise<AssignmentWithLocation[]> {
    return prisma.locationAssignment.findMany({
      where: { userId, tenantId },
      include: ASSIGNMENT_INCLUDE_LOCATION,
      orderBy: { assignedAt: "desc" },
    });
  },

  listForLocation(
    locationId: string,
    tenantId: string,
  ): Promise<AssignmentWithUser[]> {
    return prisma.locationAssignment.findMany({
      where: { locationId, tenantId },
      include: ASSIGNMENT_INCLUDE_USER,
      orderBy: { assignedAt: "desc" },
    });
  },

  listForUsers(userIds: string[], tenantId: string) {
    if (userIds.length === 0) return Promise.resolve([]);
    return prisma.locationAssignment.findMany({
      where: { userId: { in: userIds }, tenantId },
      include: ASSIGNMENT_INCLUDE_LOCATION,
    });
  },

  create(data: {
    tenantId: string;
    locationId: string;
    userId: string;
    assignedById: string | null;
  }) {
    return prisma.locationAssignment.create({
      data: {
        tenant: { connect: { id: data.tenantId } },
        location: { connect: { id: data.locationId } },
        user: { connect: { id: data.userId } },
        ...(data.assignedById
          ? { assignedBy: { connect: { id: data.assignedById } } }
          : {}),
      },
      include: { ...ASSIGNMENT_INCLUDE_LOCATION, ...ASSIGNMENT_INCLUDE_USER },
    });
  },

  bulkCreate(
    tenantId: string,
    userId: string,
    locationIds: string[],
    assignedById: string | null,
  ) {
    if (locationIds.length === 0) return Promise.resolve({ count: 0 });
    return prisma.locationAssignment.createMany({
      data: locationIds.map((locationId) => ({
        tenantId,
        locationId,
        userId,
        assignedById,
      })),
      skipDuplicates: true,
    });
  },

  removeByPair(locationId: string, userId: string) {
    return prisma.locationAssignment.deleteMany({
      where: { locationId, userId },
    });
  },
};
