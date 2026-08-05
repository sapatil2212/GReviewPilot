/**
 * GET    /api/private/posts/[id]  — single post detail
 * PATCH  /api/private/posts/[id]  — update draft/scheduled post
 * DELETE /api/private/posts/[id]  — soft delete
 */

import type { NextRequest } from "next/server";
import { requireSession } from "@/server/auth/requireSession";
import { requirePermission } from "@/server/permissions/permissions";
import { postService } from "@/server/services/post.service";
import { updatePostSchema } from "@/server/validators/post.schema";
import { handleError, ok } from "@/server/utils/response";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "post:read");
    const { id } = await params;
    const post = await postService.getById(ctx, id);
    return ok(post);
  } catch (err) {
    return handleError(err);
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "post:create");
    const { id } = await params;
    const body = await req.json().catch(() => null);
    const input = updatePostSchema.parse(body);
    const post = await postService.update(ctx, id, input, req);
    return ok(post, { message: "Post updated" });
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "post:delete");
    const { id } = await params;
    const result = await postService.remove(ctx, id, req);
    return ok(result, { message: "Post deleted" });
  } catch (err) {
    return handleError(err);
  }
}
