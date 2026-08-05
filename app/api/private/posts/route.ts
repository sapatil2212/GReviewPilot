/**
 * GET  /api/private/posts   — list posts (paginated, filterable)
 * POST /api/private/posts   — create a draft/scheduled post
 */

import type { NextRequest } from "next/server";
import { requireSession } from "@/server/auth/requireSession";
import { requirePermission } from "@/server/permissions/permissions";
import { postService } from "@/server/services/post.service";
import { createPostSchema, listPostsQuerySchema } from "@/server/validators/post.schema";
import { handleError, ok } from "@/server/utils/response";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "post:read");
    const url = new URL(req.url);
    const filter = listPostsQuerySchema.parse({
      locationId: url.searchParams.get("locationId") ?? undefined,
      status: url.searchParams.get("status") ?? undefined,
      type: url.searchParams.get("type") ?? undefined,
      includeDeleted: url.searchParams.get("includeDeleted") ?? undefined,
    });
    const page = await postService.list(ctx, req, filter);
    return ok(page);
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "post:create");
    const body = await req.json().catch(() => null);
    const input = createPostSchema.parse(body);
    const post = await postService.create(ctx, input, req);
    return ok(post, { message: "Post created", status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
