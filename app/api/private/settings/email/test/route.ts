/**
 * POST /api/private/settings/email/test — send a test email through the
 * tenant's connected SMTP server to confirm the credentials work.
 */

import type { NextRequest } from "next/server";
import { requireSession } from "@/server/auth/requireSession";
import { requirePermission } from "@/server/permissions/permissions";
import { emailSettingsService } from "@/server/services/emailSettings.service";
import { testSmtpSchema } from "@/server/validators/settings.schema";
import { handleError, ok } from "@/server/utils/response";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "tenant:update");
    const body = await req.json().catch(() => ({}));
    const input = testSmtpSchema.parse(body ?? {});
    const data = await emailSettingsService.test(ctx, input);
    return ok(data, { message: `Test email sent to ${data.sentTo}` });
  } catch (err) {
    return handleError(err);
  }
}
