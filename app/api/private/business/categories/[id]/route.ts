/**
 * DELETE /api/private/business/categories/[id]        — remove a selection
 * PATCH  /api/private/business/categories/[id]/primary — set as primary (see nested route)
 *
 * [id] is the BusinessCategory id, not the join-row id.
 */

import type { NextRequest } from "next/server";
import { requireSession } from "@/server/auth/requireSession";
import { requirePermission } from "@/server/permissions/permissions";
import { businessCategoryService } from "@/server/services/businessCategory.service";
import { handleError, ok } from "@/server/utils/response";

export const runtime = "nodejs";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "category:manage");
    const { id } = await params;
    const data = await businessCategoryService.removeSelection(ctx, id);
    return ok(data, { message: "Category removed" });
  } catch (err) {
    return handleError(err);
  }
}
