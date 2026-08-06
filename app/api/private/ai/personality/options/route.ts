/**
 * GET /api/private/ai/personality/options
 *
 * The wizard's step definitions and option catalogs.
 *
 * Served from the server rather than imported into the client so there is one
 * source of truth: the same catalog that the Zod validators derive from is the
 * one the form renders. A client-side copy would eventually offer an option the
 * API rejects.
 *
 * The payload only changes on deploy, but the route is still dynamic: it is
 * session-gated, and reading the session reads headers. Declared explicitly so
 * Next does not attempt static rendering and log a dynamic-usage error.
 */

import {
  APPRECIATION_OPTIONS,
  APPROVAL_OPTIONS,
  BUSINESS_VALUES,
  COMMON_NEVER_SAY,
  COMMUNICATION_STYLES,
  COMPLIANCE_SECTORS,
  CONFIDENCE_OPTIONS,
  EMOJI_USAGE_OPTIONS,
  GREETING_STYLES,
  NEGATIVE_STRATEGY_OPTIONS,
  POSITIVE_STRATEGY_OPTIONS,
  REPLY_LENGTH_OPTIONS,
  WIZARD_STEPS,
} from "@/server/ai/personality.types";
import { requireSession } from "@/server/auth/requireSession";
import { requirePermission } from "@/server/permissions/permissions";
import { handleError, ok } from "@/server/utils/response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "ai:personality:read");

    return ok({
      steps: WIZARD_STEPS,
      values: BUSINESS_VALUES,
      communicationStyles: COMMUNICATION_STYLES,
      greetings: GREETING_STYLES,
      emojiUsage: EMOJI_USAGE_OPTIONS,
      replyLength: REPLY_LENGTH_OPTIONS,
      appreciation: APPRECIATION_OPTIONS,
      negativeStrategies: NEGATIVE_STRATEGY_OPTIONS,
      positiveStrategies: POSITIVE_STRATEGY_OPTIONS,
      approvalModes: APPROVAL_OPTIONS,
      confidenceLevels: CONFIDENCE_OPTIONS,
      commonNeverSay: COMMON_NEVER_SAY,
      complianceSectors: COMPLIANCE_SECTORS,
    });
  } catch (err) {
    return handleError(err);
  }
}
