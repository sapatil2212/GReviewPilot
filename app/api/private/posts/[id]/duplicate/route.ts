/**
 * POST /api/private/posts/[id]/duplicate
 */

import type { NextRequest } from "next/server";
import { requireSession } from "@/server/auth/requireSession";
import { requirePermission } from "@/server/permissions/permissions";
import { postService } from "@/server/services/post.service";
import { handleError, ok } from "@/server/utils/response";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "post:create");
    const { id } = await params;
    const dup = await postService.duplicate(ctx, id, req);
    return ok(dup, { message: "Post duplicated", status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
