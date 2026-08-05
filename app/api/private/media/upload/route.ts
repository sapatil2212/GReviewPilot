/**
 * POST /api/private/media/upload
 *
 * Multipart body:
 *   - file:  the binary file (required)
 *   - json:  optional stringified JSON matching uploadMediaSchema
 *   OR any of the following individual fields:
 *     category, visibility, altText, caption, locationId, attachTo
 *
 * Returns the created MediaAsset with a signed URL.
 */

import type { NextRequest } from "next/server";
import { requireSession } from "@/server/auth/requireSession";
import { requirePermission } from "@/server/permissions/permissions";
import { mediaService } from "@/server/services/media.service";
import { uploadMediaSchema } from "@/server/validators/media.schema";
import { handleError, ok } from "@/server/utils/response";
import { ValidationError } from "@/server/utils/errors";

export const runtime = "nodejs";
// Signal to Next.js that this route may receive larger request bodies.
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "media:upload");

    const form = await req.formData().catch(() => null);
    if (!form) throw new ValidationError("Expected multipart/form-data");

    const file = form.get("file");
    if (!(file instanceof File)) {
      throw new ValidationError("A 'file' field is required");
    }

    // Metadata can be passed as one JSON blob under "json" or as
    // individual form fields. JSON wins if both are present.
    const jsonField = form.get("json");
    const raw: Record<string, unknown> =
      typeof jsonField === "string" && jsonField.length > 0
        ? safeJson(jsonField)
        : {
            category: form.get("category") ?? undefined,
            visibility: form.get("visibility") ?? undefined,
            altText: form.get("altText") ?? undefined,
            caption: form.get("caption") ?? undefined,
            locationId: form.get("locationId") ?? undefined,
            attachTo: form.get("attachTo") ?? undefined,
          };

    const meta = uploadMediaSchema.parse(raw);
    const asset = await mediaService.upload({ ctx, file, meta, req });
    return ok(asset, { message: "Uploaded", status: 201 });
  } catch (err) {
    return handleError(err);
  }
}

function safeJson(s: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(s);
    return typeof parsed === "object" && parsed !== null
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    throw new ValidationError("'json' field must be valid JSON");
  }
}
