/**
 * GET /api/private/sites/[siteId]/leads/export — CSV download
 *
 * Returns a file rather than the standard JSON envelope, because the browser
 * needs to download it directly. Errors still go through `handleError` so a
 * failure is a normal JSON error response.
 */

import type { NextRequest } from "next/server";
import { requireSession } from "@/server/auth/requireSession";
import { requirePermission } from "@/server/permissions/permissions";
import { siteFormService } from "@/server/services/siteForm.service";
import { exportLeadsSchema } from "@/server/validators/site.schema";
import { handleError } from "@/server/utils/response";

export const runtime = "nodejs";

type Params = { params: Promise<{ siteId: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "site:lead:read");
    const { siteId } = await params;

    const search = new URL(req.url).searchParams;
    const options = exportLeadsSchema.parse({
      formId: search.get("formId") ?? undefined,
      includeSpam: search.get("includeSpam") ?? undefined,
    });

    const { filename, csv } = await siteFormService.exportCsv(ctx, siteId, options);

    return new Response(
      // A UTF-8 BOM so Excel renders accented names and non-Latin scripts
      // correctly instead of mojibake — without it, exports of real customer
      // names are frequently unreadable.
      `\uFEFF${csv}`,
      {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${filename}"`,
          // Leads change constantly and the file contains personal data.
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (err) {
    return handleError(err);
  }
}
