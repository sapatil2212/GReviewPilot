/**
 * GET /api/private/business/categories/catalog
 *
 * Search the global business-category catalog. Supports pagination,
 * search (name/slug), and parent filtering.
 * Query: ?page=1&pageSize=20&search=&parentId=<id|root>&activeOnly=true
 */

import type { NextRequest } from "next/server";
import { requireSession } from "@/server/auth/requireSession";
import { requirePermission } from "@/server/permissions/permissions";
import { businessCategoryService } from "@/server/services/businessCategory.service";
import { handleError, ok } from "@/server/utils/response";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "category:read");
    const page = await businessCategoryService.listCatalog(req);
    return ok(page);
  } catch (err) {
    return handleError(err);
  }
}
