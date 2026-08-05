/**
 * PATCH /api/private/business/categories/[id]/primary
 *
 * Promote a category to primary. Auto-selects it first if the tenant
 * hadn't picked it yet (subject to the 10-category cap).
 */

import type { NextRequest } from "next/server";
import { requireSession } from "@/server/auth/requireSession";
import { requirePermission } from "@/server/permissions/permissions";
import { businessCategoryService } from "@/server/services/businessCategory.service";
import { handleError, ok } from "@/server/utils/response";

export const runtime = "nodejs";

export async function PATCH(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "category:manage");
    const { id } = await params;
    const data = await businessCategoryService.setPrimary(ctx, id);
    return ok(data, { message: "Primary category updated" });
  } catch (err) {
    return handleError(err);
  }
}
