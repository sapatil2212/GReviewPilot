/**
 * POST /api/private/posts/[id]/publish
 * Body: { publishNow: boolean, scheduledAt?: string }
 */

import type { NextRequest } from "next/server";
import { requireSession } from "@/server/auth/requireSession";
import { requirePermission } from "@/server/permissions/permissions";
import { postService } from "@/server/services/post.service";
import { publishPostSchema } from "@/server/validators/post.schema";
import { handleError, ok } from "@/server/utils/response";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "post:publish");
    const { id } = await params;
    const body = await req.json().catch(() => null);
    const input = publishPostSchema.parse(body);
    const post = await postService.publish(ctx, id, input, req);
    return ok(post, { message: "Post published" });
  } catch (err) {
    return handleError(err);
  }
}
