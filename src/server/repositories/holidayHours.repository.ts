/**
 * HolidayHours repository — per-location, per-date overrides of the
 * regular working schedule.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/server/db/prisma";

export const holidayHoursRepository = {
  listForLocation(locationId: string, args?: { from?: Date; to?: Date }) {
    return prisma.holidayHours.findMany({
      where: {
        locationId,
        ...(args?.from || args?.to
          ? {
              date: {
                ...(args.from ? { gte: args.from } : {}),
                ...(args.to ? { lte: args.to } : {}),
              },
            }
          : {}),
      },
      orderBy: { date: "asc" },
    });
  },

  findById(id: string) {
    return prisma.holidayHours.findUnique({ where: { id } });
  },

  findByIdForLocation(id: string, locationId: string) {
    return prisma.holidayHours.findFirst({ where: { id, locationId } });
  },

  upsert(input: {
    locationId: string;
    date: Date;
    isClosed: boolean;
    openTime: string | null;
    closeTime: string | null;
    note: string | null;
  }) {
    return prisma.holidayHours.upsert({
      where: {
        locationId_date: { locationId: input.locationId, date: input.date },
      },
      create: input,
      update: {
        isClosed: input.isClosed,
        openTime: input.openTime,
        closeTime: input.closeTime,
        note: input.note,
      },
    });
  },

  update(id: string, data: Prisma.HolidayHoursUpdateInput) {
    return prisma.holidayHours.update({ where: { id }, data });
  },

  deleteById(id: string) {
    return prisma.holidayHours.delete({ where: { id } });
  },
};
