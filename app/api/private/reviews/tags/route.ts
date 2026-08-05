/**
 * GET  /api/private/reviews/tags        — list all tags for the tenant
 * POST /api/private/reviews/tags        — create tag { name, color? }
 */

import type { NextRequest } from "next/server";
import { requireSession } from "@/server/auth/requireSession";
import { requirePermission } from "@/server/permissions/permissions";
import { reviewService } from "@/server/services/review.service";
import { createTagSchema } from "@/server/validators/review.schema";
import { handleError, ok } from "@/server/utils/response";

export const runtime = "nodejs";

export async function GET() {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "review:read");
    const tags = await reviewService.listTags(ctx);
    return ok({ items: tags, total: tags.length });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "review:tag:manage");
    const body = await req.json().catch(() => null);
    const input = createTagSchema.parse(body);
    const tag = await reviewService.createTag(ctx, input);
    return ok(tag, { message: "Tag created", status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
