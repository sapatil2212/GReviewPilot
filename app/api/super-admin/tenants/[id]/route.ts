/**
 * PATCH /api/super-admin/tenants/[id]
 * Update tenant status or plan.
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { requireSuperAdminSession } from "@/server/auth/requireSuperAdmin";
import { superAdminService } from "@/server/services/superAdmin.service";
import { ok, handleError } from "@/server/utils/response";
import { TenantStatus, TenantPlan } from "@prisma/client";

export const runtime = "nodejs";

const updateTenantSchema = z.object({
  status: z.nativeEnum(TenantStatus).optional(),
  plan: z.nativeEnum(TenantPlan).optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireSuperAdminSession();
    const { id: tenantId } = await params;
    const body = await req.json();
    const parsed = updateTenantSchema.parse(body);

    // Derived from the service so this stays correct if either return type
    // changes. Both branches are optional, hence the null.
    let updatedTenant:
      | Awaited<ReturnType<typeof superAdminService.updateTenantStatus>>
      | Awaited<ReturnType<typeof superAdminService.updateTenantPlan>>
      | null = null;

    if (parsed.status) {
      updatedTenant = await superAdminService.updateTenantStatus(
        tenantId,
        parsed.status,
        ctx.userId
      );
    }

    if (parsed.plan) {
      updatedTenant = await superAdminService.updateTenantPlan(
        tenantId,
        parsed.plan,
        ctx.userId
      );
    }

    return ok(updatedTenant, { message: "Tenant updated successfully" });
  } catch (err) {
    return handleError(err);
  }
}
