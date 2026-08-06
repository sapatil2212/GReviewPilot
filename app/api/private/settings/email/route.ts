/**
 * GET    /api/private/settings/email  — read email/SMTP settings (no secrets)
 * PUT    /api/private/settings/email  — connect / update SMTP
 * PATCH  /api/private/settings/email  — set the lead notification address
 * DELETE /api/private/settings/email  — disconnect SMTP
 */

import type { NextRequest } from "next/server";
import { requireSession } from "@/server/auth/requireSession";
import { requirePermission } from "@/server/permissions/permissions";
import { emailSettingsService } from "@/server/services/emailSettings.service";
import {
  updateLeadNotificationSchema,
  updateSmtpSchema,
} from "@/server/validators/settings.schema";
import { handleError, ok } from "@/server/utils/response";

export const runtime = "nodejs";

export async function GET() {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "tenant:read");
    const data = await emailSettingsService.get(ctx);
    return ok(data);
  } catch (err) {
    return handleError(err);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "tenant:update");
    const body = await req.json().catch(() => null);
    const input = updateSmtpSchema.parse(body);
    const data = await emailSettingsService.updateSmtp(ctx, input);
    return ok(data, { message: "SMTP connected" });
  } catch (err) {
    return handleError(err);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "tenant:update");
    const body = await req.json().catch(() => null);
    const input = updateLeadNotificationSchema.parse(body);
    const data = await emailSettingsService.updateLeadNotification(ctx, input);
    return ok(data, { message: "Notification email updated" });
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE() {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "tenant:update");
    const data = await emailSettingsService.clearSmtp(ctx);
    return ok(data, { message: "SMTP disconnected" });
  } catch (err) {
    return handleError(err);
  }
}
