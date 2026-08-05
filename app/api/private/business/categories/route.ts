/**
 * GET  /api/private/business/categories        — list categories chosen by the tenant
 * POST /api/private/business/categories        — add a category (optionally as primary)
 *
 * Removing / setting-primary happen at /api/private/business/categories/[id].
 */

import type { NextRequest } from "next/server";
import { requireSession } from "@/server/auth/requireSession";
import { requirePermission } from "@/server/permissions/permissions";
import { businessCategoryService } from "@/server/services/businessCategory.service";
import { addCategorySchema } from "@/server/validators/business.schema";
import { handleError, ok } from "@/server/utils/response";

export const runtime = "nodejs";

export async function GET() {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "category:read");
    const data = await businessCategoryService.listSelections(ctx);
    return ok(data);
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "category:manage");
    const body = await req.json().catch(() => null);
    const input = addCategorySchema.parse(body);
    const data = await businessCategoryService.addSelection(ctx, input);
    return ok(data, { message: "Category added", status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
