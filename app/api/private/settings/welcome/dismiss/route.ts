/**
 * POST /api/private/settings/welcome/dismiss
 * Marks the dashboard welcome modal as seen for this workspace.
 */

import { requireSession } from "@/server/auth/requireSession";
import { authService } from "@/server/services/auth.service";
import { ok, handleError } from "@/server/utils/response";

export const runtime = "nodejs";

export async function POST() {
  try {
    const ctx = await requireSession();
    const result = await authService.dismissWelcome(ctx.tenantId);
    return ok(result);
  } catch (err) {
    return handleError(err);
  }
}
