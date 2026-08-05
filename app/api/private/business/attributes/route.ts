/**
 * GET  /api/private/business/attributes  — list attributes
 * POST /api/private/business/attributes  — bulk upsert (attributes: [{key,value,type}])
 * PUT  /api/private/business/attributes  — single upsert (key,value,type)
 */

import type { NextRequest } from "next/server";
import { requireSession } from "@/server/auth/requireSession";
import { requirePermission } from "@/server/permissions/permissions";
import { businessAttributeService } from "@/server/services/businessAttribute.service";
import {
  bulkSetAttributesSchema,
  setAttributeSchema,
} from "@/server/validators/business.schema";
import { handleError, ok } from "@/server/utils/response";

export const runtime = "nodejs";

export async function GET() {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "attribute:read");
    const data = await businessAttributeService.list(ctx);
    return ok({ items: data, total: data.length });
  } catch (err) {
    return handleError(err);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "attribute:manage");
    const body = await req.json().catch(() => null);
    const input = setAttributeSchema.parse(body);
    const data = await businessAttributeService.set(ctx, input);
    return ok(data, { message: "Attribute saved" });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "attribute:manage");
    const body = await req.json().catch(() => null);
    const input = bulkSetAttributesSchema.parse(body);
    const data = await businessAttributeService.bulkSet(ctx, input);
    return ok({ items: data, total: data.length }, { message: "Attributes saved" });
  } catch (err) {
    return handleError(err);
  }
}
