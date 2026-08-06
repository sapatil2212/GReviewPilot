/**
 * GET /api/private/ai/personality/knowledge
 *
 * The assembled knowledge base, plus the business context prompt composed from
 * it. Exposed read-only for transparency: a business should be able to see
 * exactly what the AI has been told about it, which is the honest counterpart
 * to never showing them a prompt field to edit.
 *
 * Also the reference payload for future AI features, which consume the same
 * `BusinessKnowledge` shape rather than inventing their own context.
 */

import { requireSession } from "@/server/auth/requireSession";
import { requirePermission } from "@/server/permissions/permissions";
import { businessPersonalityService } from "@/server/services/businessPersonality.service";
import { buildBusinessContext } from "@/server/ai/promptBuilder";
import { handleError, ok } from "@/server/utils/response";

export const runtime = "nodejs";

export async function GET() {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "ai:personality:read");

    const knowledge = await businessPersonalityService.getKnowledge(ctx);
    const context = buildBusinessContext(knowledge);

    return ok({
      knowledge,
      /** Sections, so the UI can render this as readable groups. */
      sections: context.sections,
      /** The composed context, shown for transparency rather than editing. */
      contextPreview: context.prompt,
    });
  } catch (err) {
    return handleError(err);
  }
}
