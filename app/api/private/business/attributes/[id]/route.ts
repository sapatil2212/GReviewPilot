/**
 * DELETE /api/private/business/attributes/[id]  — remove a single attribute
 */

import type { NextRequest } from "next/server";
import { requireSession } from "@/server/auth/requireSession";
import { requirePermission } from "@/server/permissions/permissions";
import { businessAttributeService } from "@/server/services/businessAttribute.service";
import { handleError, ok } from "@/server/utils/response";

export const runtime = "nodejs";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "attribute:manage");
    const { id } = await params;
    const data = await businessAttributeService.remove(ctx, id);
    return ok(data, { message: "Attribute removed" });
  } catch (err) {
    return handleError(err);
  }
}
