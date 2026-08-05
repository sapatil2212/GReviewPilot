/**
 * PATCH /api/private/reviews/feedback/[id]
 * Update status / internal note on a private feedback item.
 * Body: { status?, internalNote? }
 */

import type { NextRequest } from "next/server";
import { FeedbackStatus } from "@prisma/client";
import { z } from "zod";
import { requireSession } from "@/server/auth/requireSession";
import { requirePermission } from "@/server/permissions/permissions";
import { privateFeedbackRepository } from "@/server/repositories/privateFeedback.repository";
import { handleError, ok } from "@/server/utils/response";
import { NotFoundError } from "@/server/utils/errors";

export const runtime = "nodejs";

const bodySchema = z.object({
  status: z.nativeEnum(FeedbackStatus).optional(),
  internalNote: z.string().trim().max(5000).optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "review:manage");
    const { id } = await params;
    const existing = await privateFeedbackRepository.findByIdForTenant(
      id,
      ctx.tenantId,
    );
    if (!existing) throw new NotFoundError("Feedback not found");
    const input = bodySchema.parse(await req.json().catch(() => null));
    const updated = await privateFeedbackRepository.update(id, {
      ...(input.status
        ? {
            status: input.status,
            resolvedAt:
              input.status === FeedbackStatus.RESOLVED ? new Date() : null,
            resolvedById:
              input.status === FeedbackStatus.RESOLVED ? ctx.userId : null,
          }
        : {}),
      ...(input.internalNote !== undefined
        ? { internalNote: input.internalNote }
        : {}),
    });
    return ok(updated, { message: "Feedback updated" });
  } catch (err) {
    return handleError(err);
  }
}
