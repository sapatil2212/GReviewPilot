import { Prisma, TenantStatus } from "@prisma/client";
import { prisma } from "@/server/db/prisma";

export const tenantRepository = {
  findById(id: string) {
    return prisma.tenant.findUnique({ where: { id } });
  },

  findBySlug(slug: string) {
    return prisma.tenant.findUnique({ where: { slug } });
  },

  create(data: Prisma.TenantCreateInput) {
    return prisma.tenant.create({ data });
  },

  updateStatus(id: string, status: TenantStatus) {
    return prisma.tenant.update({ where: { id }, data: { status } });
  },

  update(id: string, data: Prisma.TenantUpdateInput) {
    return prisma.tenant.update({ where: { id }, data });
  },
};
