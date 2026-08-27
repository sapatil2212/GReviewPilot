/**
 * Super Admin Service — Complete Database Analytics & Telemetry Engine.
 *
 * Provides database queries across all tenants, users, locations, reviews,
 * integrations, AI usage, sites, and audit logs.
 */

import { prisma } from "@/server/db/prisma";
import { TenantStatus, TenantPlan, UserStatus, UserRole, AuditAction, ReviewStatus } from "@prisma/client";
import { auditRepository } from "@/server/repositories/audit.repository";
import { env } from "@/server/utils/env";

export interface TenantQuery {
  search?: string;
  status?: TenantStatus;
  plan?: TenantPlan;
  page?: number;
  limit?: number;
}

export interface UserQuery {
  search?: string;
  status?: UserStatus;
  role?: UserRole;
  page?: number;
  limit?: number;
}

export const superAdminService = {
  // ============================================================
  // GLOBAL PLATFORM STATS & SYSTEM HEALTH
  // ============================================================
  async getPlatformStats() {
    const startTime = Date.now();

    const [
      totalTenants,
      tenantsByStatus,
      tenantsByPlan,
      totalUsers,
      usersByStatus,
      usersByRole,
      totalLocations,
      totalReviews,
      reviewsBySentiment,
      repliedReviewsCount,
      totalGoogleAccounts,
      googleAccountsByStatus,
      totalPosts,
      totalQrCodes,
      totalQrScans,
      totalSites,
      sitesBySslStatus,
      aiReplyCount,
    ] = await Promise.all([
      prisma.tenant.count(),
      prisma.tenant.groupBy({
        by: ["status"],
        _count: { _all: true },
      }),
      prisma.tenant.groupBy({
        by: ["plan"],
        _count: { _all: true },
      }),
      prisma.user.count(),
      prisma.user.groupBy({
        by: ["status"],
        _count: { _all: true },
      }),
      prisma.user.groupBy({
        by: ["role"],
        _count: { _all: true },
      }),
      prisma.location.count(),
      prisma.review.count(),
      prisma.review.groupBy({
        by: ["sentiment"],
        _count: { _all: true },
      }),
      prisma.review.count({
        where: { status: ReviewStatus.REPLIED },
      }),
      prisma.googleAccount.count(),
      prisma.googleAccount.groupBy({
        by: ["status"],
        _count: { _all: true },
      }),
      prisma.googlePost.count(),
      prisma.qrCode.count(),
      prisma.qrScan.count(),
      prisma.site.count(),
      prisma.siteDomain.groupBy({
        by: ["sslStatus"],
        _count: { _all: true },
      }),
      prisma.aiReplyDraft.count(),
    ]);

    const dbLatencyMs = Date.now() - startTime;

    // Rating breakdown (1-5 stars)
    const ratingBreakdown = await prisma.review.groupBy({
      by: ["starRating"],
      _count: { _all: true },
    });

    return {
      dbLatencyMs,
      overview: {
        totalTenants,
        totalUsers,
        totalLocations,
        totalReviews,
        repliedReviewsCount,
        totalGoogleAccounts,
        totalPosts,
        totalQrCodes,
        totalQrScans,
        totalSites,
        totalAiReplies: aiReplyCount,
      },
      tenantsByStatus: tenantsByStatus.reduce((acc, curr) => {
        acc[curr.status] = curr._count._all;
        return acc;
      }, {} as Record<string, number>),
      tenantsByPlan: tenantsByPlan.reduce((acc, curr) => {
        acc[curr.plan] = curr._count._all;
        return acc;
      }, {} as Record<string, number>),
      usersByStatus: usersByStatus.reduce((acc, curr) => {
        acc[curr.status] = curr._count._all;
        return acc;
      }, {} as Record<string, number>),
      usersByRole: usersByRole.reduce((acc, curr) => {
        acc[curr.role] = curr._count._all;
        return acc;
      }, {} as Record<string, number>),
      reviewsBySentiment: reviewsBySentiment.reduce((acc, curr) => {
        acc[curr.sentiment || "NEUTRAL"] = curr._count._all;
        return acc;
      }, {} as Record<string, number>),
      googleAccountsByStatus: googleAccountsByStatus.reduce((acc, curr) => {
        acc[curr.status] = curr._count._all;
        return acc;
      }, {} as Record<string, number>),
      ratingBreakdown: ratingBreakdown.map((r) => ({
        stars: r.starRating,
        count: r._count._all,
      })),
      sslStatusBreakdown: sitesBySslStatus.reduce((acc, curr) => {
        acc[curr.sslStatus] = curr._count._all;
        return acc;
      }, {} as Record<string, number>),
      systemServices: {
        database: { status: "OPERATIONAL", latencyMs: dbLatencyMs },
        smtp: { status: env.EMAIL_HOST ? "CONFIGURED" : "NOT_CONFIGURED", host: env.EMAIL_HOST },
        geminiAi: { status: env.GEMINI_API_KEY ? "OPERATIONAL" : "DISABLED", model: env.GEMINI_MODEL },
        googleOauth: { status: env.GOOGLE_CLIENT_ID ? "CONFIGURED" : "NOT_CONFIGURED" },
        sslProvisioning: { mode: env.SSL_PROVISIONING },
      },
    };
  },

  // ============================================================
  // WORKSPACE (TENANT) MANAGEMENT
  // ============================================================
  async getTenants(query: TenantQuery = {}) {
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 15));
    const skip = (page - 1) * limit;

    const where: any = {};

    if (query.status) {
      where.status = query.status;
    }
    if (query.plan) {
      where.plan = query.plan;
    }
    if (query.search) {
      const q = query.search.trim();
      where.OR = [
        { name: { contains: q } },
        { slug: { contains: q } },
        { businessEmail: { contains: q } },
        { users: { some: { email: { contains: q } } } },
      ];
    }

    const [items, total] = await Promise.all([
      prisma.tenant.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          users: {
            where: { role: UserRole.TENANT_OWNER },
            take: 1,
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              lastLoginAt: true,
            },
          },
          _count: {
            select: {
              users: true,
              locations: true,
              reviews: true,
              googleAccounts: true,
            },
          },
        },
      }),
      prisma.tenant.count({ where }),
    ]);

    return {
      items: items.map((tenant) => ({
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        status: tenant.status,
        plan: tenant.plan,
        billingStatus: tenant.billingStatus,
        createdAt: tenant.createdAt,
        owner: tenant.users[0]
          ? {
              name: `${tenant.users[0].firstName} ${tenant.users[0].lastName}`.trim(),
              email: tenant.users[0].email,
              lastLoginAt: tenant.users[0].lastLoginAt,
            }
          : null,
        counts: tenant._count,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  },

  async updateTenantStatus(tenantId: string, status: TenantStatus, actorUserId: string) {
    const updated = await prisma.tenant.update({
      where: { id: tenantId },
      data: {
        status,
        ...(status === TenantStatus.SUSPENDED ? { suspendedAt: new Date() } : {}),
        ...(status === TenantStatus.ACTIVE ? { reactivatedAt: new Date() } : {}),
      },
    });

    await auditRepository.record({
      action: status === TenantStatus.SUSPENDED ? AuditAction.TENANT_SUSPENDED : AuditAction.WORKSPACE_UPDATED,
      userId: actorUserId,
      tenantId,
      metadata: { statusChange: status },
    });

    return updated;
  },

  async updateTenantPlan(tenantId: string, plan: TenantPlan, actorUserId: string) {
    const updated = await prisma.tenant.update({
      where: { id: tenantId },
      data: {
        plan,
        ...(plan !== TenantPlan.TRIAL ? { status: TenantStatus.ACTIVE } : {}),
      },
    });

    await auditRepository.record({
      action: AuditAction.WORKSPACE_UPDATED,
      userId: actorUserId,
      tenantId,
      metadata: { planChange: plan },
    });

    return updated;
  },

  // ============================================================
  // USER DIRECTORY
  // ============================================================
  async getUsers(query: UserQuery = {}) {
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 15));
    const skip = (page - 1) * limit;

    const where: any = {};

    if (query.status) {
      where.status = query.status;
    }
    if (query.role) {
      where.role = query.role;
    }
    if (query.search) {
      const q = query.search.trim();
      where.OR = [
        { firstName: { contains: q } },
        { lastName: { contains: q } },
        { email: { contains: q } },
        { tenant: { name: { contains: q } } },
      ];
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          tenant: {
            select: {
              id: true,
              name: true,
              slug: true,
              plan: true,
              status: true,
            },
          },
        },
      }),
      prisma.user.count({ where }),
    ]);

    return {
      items: users.map((u) => ({
        id: u.id,
        firstName: u.firstName,
        lastName: u.lastName,
        name: `${u.firstName} ${u.lastName}`.trim(),
        email: u.email,
        role: u.role,
        status: u.status,
        emailVerified: u.emailVerified,
        lastLoginAt: u.lastLoginAt,
        failedLoginCount: u.failedLoginCount,
        lockedUntil: u.lockedUntil,
        createdAt: u.createdAt,
        tenant: u.tenant,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  },

  async updateUserStatus(userId: string, status: UserStatus, actorUserId: string) {
    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        status,
        ...(status === UserStatus.ACTIVE ? { failedLoginCount: 0, lockedUntil: null } : {}),
      },
    });

    await auditRepository.record({
      action: status === UserStatus.BLOCKED ? AuditAction.USER_BLOCKED : AuditAction.USER_UPDATED,
      userId: actorUserId,
      tenantId: user.tenantId,
      metadata: { targetUserId: userId, statusChange: status },
    });

    return user;
  },

  // ============================================================
  // AUDIT LOGS
  // ============================================================
  async getAuditLogs(query: { search?: string; action?: string; limit?: number } = {}) {
    const limit = Math.min(100, Math.max(1, query.limit || 30));
    const where: any = {};

    if (query.action) {
      where.action = query.action as AuditAction;
    }
    if (query.search) {
      const q = query.search.trim();
      where.OR = [
        { user: { email: { contains: q } } },
        { tenant: { name: { contains: q } } },
        { ipAddress: { contains: q } },
      ];
    }

    const logs = await prisma.auditLog.findMany({
      where,
      take: limit,
      orderBy: { createdAt: "desc" },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
        tenant: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
    });

    return logs;
  },

  // ============================================================
  // TIME SERIES ANALYTICS & GROWTH TRENDS
  // ============================================================
  async getAnalyticsTrends() {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [recentTenants, recentReviews, recentSignups] = await Promise.all([
      prisma.tenant.findMany({
        where: { createdAt: { gte: thirtyDaysAgo } },
        select: { createdAt: true, plan: true },
        orderBy: { createdAt: "asc" },
      }),
      prisma.review.findMany({
        where: { createdAt: { gte: thirtyDaysAgo } },
        select: { createdAt: true, starRating: true, status: true },
        orderBy: { createdAt: "asc" },
      }),
      prisma.user.findMany({
        where: { createdAt: { gte: thirtyDaysAgo } },
        select: { createdAt: true },
        orderBy: { createdAt: "asc" },
      }),
    ]);

    // Group items by date string YYYY-MM-DD
    const dateMap = new Map<string, { tenants: number; reviews: number; users: number }>();

    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().split("T")[0]!;
      dateMap.set(key, { tenants: 0, reviews: 0, users: 0 });
    }

    recentTenants.forEach((t) => {
      const key = t.createdAt.toISOString().split("T")[0]!;
      if (dateMap.has(key)) {
        dateMap.get(key)!.tenants += 1;
      }
    });

    recentReviews.forEach((r) => {
      const key = r.createdAt.toISOString().split("T")[0]!;
      if (dateMap.has(key)) {
        dateMap.get(key)!.reviews += 1;
      }
    });

    recentSignups.forEach((u) => {
      const key = u.createdAt.toISOString().split("T")[0]!;
      if (dateMap.has(key)) {
        dateMap.get(key)!.users += 1;
      }
    });

    const timeSeries = Array.from(dateMap.entries()).map(([date, counts]) => ({
      date,
      tenants: counts.tenants,
      reviews: counts.reviews,
      users: counts.users,
    }));

    return {
      timeSeries,
      totals30Days: {
        newTenants: recentTenants.length,
        newReviews: recentReviews.length,
        newUsers: recentSignups.length,
      },
    };
  },
};
