/**
 * SiteForm + SiteFormSubmission data access.
 *
 * Submissions are the tenant's leads, so every read here is tenant-scoped even
 * though they are reached through a site. A lead is the most commercially
 * sensitive row in this module — leaking one across tenants would be worse than
 * leaking a page's markup.
 */

import {
  Prisma,
  SiteFormSubmissionStatus,
  type SiteForm,
  type SiteFormSubmission,
} from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import { buildOrderBy, type PaginationQuery } from "@/server/utils/pagination";

const SORTABLE = ["createdAt", "name", "email", "status"] as const;

/** Slug of the catch-all form every site gets, so it can be found idempotently. */
export const DEFAULT_FORM_SLUG = "contact";

export const siteFormRepository = {
  // -------------------------------------------------------------------
  // Forms
  // -------------------------------------------------------------------

  findById(tenantId: string, id: string): Promise<SiteForm | null> {
    return prisma.siteForm.findFirst({ where: { id, tenantId, deletedAt: null } });
  },

  findBySlug(siteId: string, slug: string): Promise<SiteForm | null> {
    return prisma.siteForm.findFirst({ where: { siteId, slug, deletedAt: null } });
  },

  listForSite(siteId: string): Promise<SiteForm[]> {
    return prisma.siteForm.findMany({
      where: { siteId, deletedAt: null },
      orderBy: { createdAt: "asc" },
    });
  },

  /** Forms plus unread counts, for the inbox filter chips. */
  async listWithCounts(siteId: string): Promise<
    Array<SiteForm & { unreadCount: number }>
  > {
    const forms = await prisma.siteForm.findMany({
      where: { siteId, deletedAt: null },
      orderBy: { createdAt: "asc" },
    });
    if (forms.length === 0) return [];

    // One grouped query rather than a count per form, so the inbox header cost
    // does not scale with the number of forms.
    const grouped = await prisma.siteFormSubmission.groupBy({
      by: ["formId"],
      where: {
        formId: { in: forms.map((f) => f.id) },
        status: SiteFormSubmissionStatus.NEW,
      },
      _count: { _all: true },
    });
    const counts = new Map(grouped.map((g) => [g.formId, g._count._all]));

    return forms.map((form) => ({ ...form, unreadCount: counts.get(form.id) ?? 0 }));
  },

  slugExists(siteId: string, slug: string, excludeId?: string): Promise<boolean> {
    return prisma.siteForm
      .count({ where: { siteId, slug, ...(excludeId ? { id: { not: excludeId } } : {}) } })
      .then((n) => n > 0);
  },

  create(data: Prisma.SiteFormUncheckedCreateInput): Promise<SiteForm> {
    return prisma.siteForm.create({ data });
  },

  update(id: string, data: Prisma.SiteFormUpdateInput): Promise<SiteForm> {
    return prisma.siteForm.update({ where: { id }, data });
  },

  softDelete(id: string): Promise<SiteForm> {
    return prisma.siteForm.update({ where: { id }, data: { deletedAt: new Date() } });
  },

  /**
   * Find or create the site's catch-all form.
   *
   * Idempotent by design: the `@@unique([siteId, slug])` index means a race
   * between two concurrent submissions resolves to one row rather than two. The
   * create is attempted and a P2002 collision falls back to a read, which is
   * cheaper and more correct than a transaction here.
   */
  async ensureDefault(args: {
    siteId: string;
    tenantId: string;
    notifyEmail?: string | null;
  }): Promise<SiteForm> {
    const existing = await prisma.siteForm.findFirst({
      where: { siteId: args.siteId, deletedAt: null },
      orderBy: { createdAt: "asc" },
    });
    if (existing) return existing;

    const data: Prisma.SiteFormUncheckedCreateInput = {
      siteId: args.siteId,
      tenantId: args.tenantId,
      name: "Contact form",
      slug: DEFAULT_FORM_SLUG,
      fields: DEFAULT_FORM_FIELDS as unknown as Prisma.InputJsonValue,
      notifyEmails: (args.notifyEmail ? [args.notifyEmail] : []) as Prisma.InputJsonValue,
      successMessage: "Thank you. We have received your message and will be in touch shortly.",
    };

    try {
      return await prisma.siteForm.create({ data });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        const raced = await prisma.siteForm.findFirst({
          where: { siteId: args.siteId, slug: DEFAULT_FORM_SLUG },
        });
        if (raced) return raced;
      }
      throw err;
    }
  },

  // -------------------------------------------------------------------
  // Submissions
  // -------------------------------------------------------------------

  findSubmission(tenantId: string, id: string): Promise<SiteFormSubmission | null> {
    return prisma.siteFormSubmission.findFirst({ where: { id, tenantId } });
  },

  listSubmissions(args: {
    tenantId: string;
    siteId: string;
    filter: {
      formId?: string;
      status?: SiteFormSubmissionStatus;
      /** Hide spam unless explicitly asked for. */
      includeSpam: boolean;
      from?: Date;
      to?: Date;
    };
    pagination: PaginationQuery;
  }): Promise<{
    items: SiteFormSubmission[];
    total: number;
    counts: Record<SiteFormSubmissionStatus, number>;
  }> {
    const where: Prisma.SiteFormSubmissionWhereInput = {
      tenantId: args.tenantId,
      siteId: args.siteId,
      ...(args.filter.formId ? { formId: args.filter.formId } : {}),
      ...(args.filter.status ? { status: args.filter.status } : {}),
      // Spam is stored rather than discarded (a false positive must be
      // recoverable) but stays out of the default view.
      ...(args.filter.includeSpam || args.filter.status
        ? {}
        : { status: { not: SiteFormSubmissionStatus.SPAM } }),
      ...(args.filter.from || args.filter.to
        ? {
            createdAt: {
              ...(args.filter.from ? { gte: args.filter.from } : {}),
              ...(args.filter.to ? { lte: args.filter.to } : {}),
            },
          }
        : {}),
      ...(args.pagination.search
        ? {
            OR: [
              { name: { contains: args.pagination.search } },
              { email: { contains: args.pagination.search } },
              { phone: { contains: args.pagination.search } },
            ],
          }
        : {}),
    };

    // The page and its total must agree, so they share a transaction. The
    // per-status badge counts are advisory and run alongside it.
    return Promise.all([
      prisma.$transaction([
        prisma.siteFormSubmission.findMany({
          where,
          orderBy: buildOrderBy(args.pagination, SORTABLE, "createdAt"),
          skip: (args.pagination.page - 1) * args.pagination.pageSize,
          take: args.pagination.pageSize,
        }),
        prisma.siteFormSubmission.count({ where }),
      ]),
      // Deliberately NOT filtered by the active status — that would make every
      // tab report only its own selection — but still scoped by form, so
      // switching form updates the badges.
      prisma.siteFormSubmission.groupBy({
        by: ["status"],
        where: {
          tenantId: args.tenantId,
          siteId: args.siteId,
          ...(args.filter.formId ? { formId: args.filter.formId } : {}),
        },
        _count: true,
      }),
    ]).then(([[items, total], grouped]) => {
      const counts: Record<SiteFormSubmissionStatus, number> = {
        NEW: 0,
        READ: 0,
        REPLIED: 0,
        SPAM: 0,
        ARCHIVED: 0,
      };
      for (const row of grouped) counts[row.status] = row._count;
      return { items, total, counts };
    });
  },

  /** Unpaginated export. Capped to bound memory and response size. */
  listForExport(args: {
    tenantId: string;
    siteId: string;
    formId?: string;
    includeSpam: boolean;
    limit: number;
  }): Promise<SiteFormSubmission[]> {
    return prisma.siteFormSubmission.findMany({
      where: {
        tenantId: args.tenantId,
        siteId: args.siteId,
        ...(args.formId ? { formId: args.formId } : {}),
        ...(args.includeSpam ? {} : { status: { not: SiteFormSubmissionStatus.SPAM } }),
      },
      orderBy: { createdAt: "desc" },
      take: args.limit,
    });
  },

  updateSubmission(
    id: string,
    data: Prisma.SiteFormSubmissionUpdateInput,
  ): Promise<SiteFormSubmission> {
    return prisma.siteFormSubmission.update({ where: { id }, data });
  },

  deleteSubmission(id: string): Promise<SiteFormSubmission> {
    return prisma.siteFormSubmission.delete({ where: { id } });
  },

  /** Bulk status change from the inbox toolbar. */
  updateManyStatus(args: {
    tenantId: string;
    siteId: string;
    ids: string[];
    status: SiteFormSubmissionStatus;
  }): Promise<Prisma.BatchPayload> {
    return prisma.siteFormSubmission.updateMany({
      // Scoped by tenant AND site so foreign ids in the payload are no-ops.
      where: { id: { in: args.ids }, tenantId: args.tenantId, siteId: args.siteId },
      data: {
        status: args.status,
        ...(args.status === SiteFormSubmissionStatus.READ ? { readAt: new Date() } : {}),
      },
    });
  },

  /** Daily counts for the leads sparkline. */
  async dailyCounts(
    tenantId: string,
    siteId: string,
    days: number,
  ): Promise<Array<{ date: string; count: number }>> {
    const since = new Date();
    since.setUTCHours(0, 0, 0, 0);
    since.setUTCDate(since.getUTCDate() - (days - 1));

    const rows = await prisma.siteFormSubmission.findMany({
      where: {
        tenantId,
        siteId,
        status: { not: SiteFormSubmissionStatus.SPAM },
        createdAt: { gte: since },
      },
      select: { createdAt: true },
    });

    // Bucketed in JS rather than with a raw DATE() GROUP BY, so the query stays
    // portable and the zero-fill below is trivial.
    const buckets = new Map<string, number>();
    for (let i = 0; i < days; i++) {
      const d = new Date(since);
      d.setUTCDate(since.getUTCDate() + i);
      buckets.set(d.toISOString().slice(0, 10), 0);
    }
    for (const row of rows) {
      const key = row.createdAt.toISOString().slice(0, 10);
      if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1);
    }
    return Array.from(buckets, ([date, count]) => ({ date, count }));
  },
};

/**
 * Fields the catch-all form starts with.
 *
 * Mirrors the renderer's DEFAULT_FIELDS so a site that has never had its form
 * customised behaves identically before and after the row exists.
 */
export const DEFAULT_FORM_FIELDS = [
  { key: "name", label: "Your name", kind: "TEXT", required: true },
  { key: "phone", label: "Phone number", kind: "PHONE", required: true },
  { key: "email", label: "Email", kind: "EMAIL", required: false },
  { key: "message", label: "How can we help?", kind: "TEXTAREA", required: false },
] as const;
