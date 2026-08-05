/**
 * Holiday Hours service.
 *
 * Per-location overrides of the regular weekly schedule. Uses upsert
 * on (locationId, date) so setting the same date twice is idempotent.
 */

import { AuditAction } from "@prisma/client";
import { holidayHoursRepository } from "@/server/repositories/holidayHours.repository";
import { locationService } from "@/server/services/location.service";
import { auditRepository } from "@/server/repositories/audit.repository";
import { NotFoundError } from "@/server/utils/errors";
import { extractRequestContext } from "@/server/middleware/requestContext";
import type { AuthContext } from "@/server/auth/requireSession";
import type {
  SetHolidayHoursInput,
  UpdateHolidayHoursInput,
} from "@/server/validators/business.schema";

function parseIsoDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!));
}

export const holidayHoursService = {
  async list(
    ctx: AuthContext,
    locationId: string,
    range?: { from?: string; to?: string },
  ) {
    // Enforces tenant scope by loading the location first.
    await locationService.getById(ctx, locationId);
    return holidayHoursRepository.listForLocation(locationId, {
      from: range?.from ? parseIsoDate(range.from) : undefined,
      to: range?.to ? parseIsoDate(range.to) : undefined,
    });
  },

  async set(
    ctx: AuthContext,
    locationId: string,
    input: SetHolidayHoursInput,
    req: Request,
  ) {
    await locationService.getById(ctx, locationId);

    const entry = await holidayHoursRepository.upsert({
      locationId,
      date: parseIsoDate(input.date),
      isClosed: input.isClosed,
      openTime: input.isClosed ? null : input.openTime ?? null,
      closeTime: input.isClosed ? null : input.closeTime ?? null,
      note: input.note ?? null,
    });

    const rc = extractRequestContext(req);
    await auditRepository.record({
      action: AuditAction.LOCATION_HOLIDAY_SET,
      userId: ctx.userId,
      tenantId: ctx.tenantId,
      ipAddress: rc.ipAddress,
      userAgent: rc.userAgent,
      browser: rc.browser,
      device: rc.device,
      metadata: { locationId, date: input.date, isClosed: input.isClosed },
    });

    return entry;
  },

  async update(
    ctx: AuthContext,
    locationId: string,
    id: string,
    input: UpdateHolidayHoursInput,
    req: Request,
  ) {
    await locationService.getById(ctx, locationId);
    const existing = await holidayHoursRepository.findByIdForLocation(
      id,
      locationId,
    );
    if (!existing) throw new NotFoundError("Holiday hours entry not found");

    const nextClosed = input.isClosed ?? existing.isClosed;
    const entry = await holidayHoursRepository.update(id, {
      isClosed: nextClosed,
      openTime: nextClosed ? null : input.openTime ?? existing.openTime,
      closeTime: nextClosed ? null : input.closeTime ?? existing.closeTime,
      note: input.note ?? existing.note,
    });

    const rc = extractRequestContext(req);
    await auditRepository.record({
      action: AuditAction.LOCATION_HOLIDAY_SET,
      userId: ctx.userId,
      tenantId: ctx.tenantId,
      ipAddress: rc.ipAddress,
      userAgent: rc.userAgent,
      browser: rc.browser,
      device: rc.device,
      metadata: { locationId, id, isClosed: nextClosed },
    });

    return entry;
  },

  async remove(ctx: AuthContext, locationId: string, id: string, req: Request) {
    await locationService.getById(ctx, locationId);
    const existing = await holidayHoursRepository.findByIdForLocation(
      id,
      locationId,
    );
    if (!existing) throw new NotFoundError("Holiday hours entry not found");

    await holidayHoursRepository.deleteById(id);

    const rc = extractRequestContext(req);
    await auditRepository.record({
      action: AuditAction.LOCATION_HOLIDAY_REMOVED,
      userId: ctx.userId,
      tenantId: ctx.tenantId,
      ipAddress: rc.ipAddress,
      userAgent: rc.userAgent,
      browser: rc.browser,
      device: rc.device,
      metadata: { locationId, id },
    });

    return { removed: id };
  },
};
