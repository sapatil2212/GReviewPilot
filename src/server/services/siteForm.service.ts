/**
 * Forms and leads.
 *
 * Two responsibilities that belong together: the form definition determines the
 * shape of the submissions, so rendering a lead correctly requires knowing which
 * fields its form declared at the time.
 */

import { AuditAction, Prisma, SiteFormSubmissionStatus, type SiteForm } from "@prisma/client";
import type { AuthContext } from "@/server/auth/requireSession";
import { auditRepository } from "@/server/repositories/audit.repository";
import { siteFormRepository } from "@/server/repositories/siteForm.repository";
import { siteRepository } from "@/server/repositories/site.repository";
import { extractRequestContext } from "@/server/middleware/requestContext";
import { ConflictError, NotFoundError, ValidationError } from "@/server/utils/errors";
import {
  buildPagedResult,
  parsePagination,
  type PagedResult,
} from "@/server/utils/pagination";
import { slugify } from "./site.service";

function toJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

export interface SiteFormFieldDto {
  key: string;
  label: string;
  kind: string;
  required?: boolean;
  placeholder?: string;
  helpText?: string;
  options?: string[];
}

function readFields(form: SiteForm): SiteFormFieldDto[] {
  const value = form.fields;
  return Array.isArray(value) ? (value as unknown as SiteFormFieldDto[]) : [];
}

function readNotify(form: SiteForm): string[] {
  const value = form.notifyEmails;
  return Array.isArray(value) ? (value as unknown[]).filter((v): v is string => typeof v === "string") : [];
}

export interface LeadDto {
  id: string;
  formId: string;
  formName: string | null;
  name: string | null;
  email: string | null;
  phone: string | null;
  status: SiteFormSubmissionStatus;
  /** Field values, ordered to match the form definition. */
  fields: Array<{ key: string; label: string; value: string }>;
  pagePath: string | null;
  referrer: string | null;
  spamScore: number | null;
  createdAt: Date;
  readAt: Date | null;
}

/**
 * Pair stored values with their form's labels.
 *
 * Submissions store raw `{ key: value }`, so without this the inbox would show
 * machine keys. Fields the form no longer declares are still shown (appended
 * with their raw key) rather than silently dropped — a lead's content must never
 * disappear because someone later edited the form.
 */
function presentFields(
  data: Prisma.JsonValue,
  definition: SiteFormFieldDto[],
): Array<{ key: string; label: string; value: string }> {
  const values =
    data && typeof data === "object" && !Array.isArray(data)
      ? (data as Record<string, unknown>)
      : {};

  const out: Array<{ key: string; label: string; value: string }> = [];
  const seen = new Set<string>();

  for (const field of definition) {
    if (!(field.key in values)) continue;
    seen.add(field.key);
    out.push({ key: field.key, label: field.label, value: stringify(values[field.key]) });
  }
  for (const [key, value] of Object.entries(values)) {
    if (seen.has(key)) continue;
    out.push({ key, label: humanise(key), value: stringify(value) });
  }
  return out;
}

function stringify(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function humanise(key: string): string {
  return key.replace(/[_-]+/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

async function requireSite(ctx: AuthContext, siteId: string) {
  const site = await siteRepository.findById(ctx.tenantId, siteId);
  if (!site) throw new NotFoundError("Website not found");
  return site;
}

export const siteFormService = {
  // -------------------------------------------------------------------
  // Forms
  // -------------------------------------------------------------------

  async list(ctx: AuthContext, siteId: string) {
    const site = await requireSite(ctx, siteId);
    const forms = await siteFormRepository.listWithCounts(site.id);
    return forms.map((form) => ({
      id: form.id,
      name: form.name,
      slug: form.slug,
      fields: readFields(form),
      notifyEmails: readNotify(form),
      successMessage: form.successMessage,
      redirectUrl: form.redirectUrl,
      submissionCount: form.submissionCount,
      unreadCount: form.unreadCount,
      createdAt: form.createdAt,
      updatedAt: form.updatedAt,
    }));
  },

  async create(
    ctx: AuthContext,
    siteId: string,
    input: {
      name: string;
      slug?: string;
      fields: SiteFormFieldDto[];
      notifyEmails?: string[];
      successMessage?: string;
      redirectUrl?: string;
    },
    req?: Request,
  ) {
    const site = await requireSite(ctx, siteId);

    const slug = input.slug ?? slugify(input.name) ?? "form";
    if (await siteFormRepository.slugExists(site.id, slug)) {
      throw new ConflictError("CONFLICT", `A form with the address "${slug}" already exists`);
    }
    assertUniqueKeys(input.fields);

    const form = await siteFormRepository.create({
      siteId: site.id,
      tenantId: ctx.tenantId,
      name: input.name,
      slug,
      fields: toJson(input.fields),
      notifyEmails: toJson(input.notifyEmails ?? []),
      successMessage: input.successMessage ?? null,
      redirectUrl: input.redirectUrl ?? null,
    });

    await auditRepository.record({
      action: AuditAction.SITE_FORM_CREATED,
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      metadata: { siteId: site.id, formId: form.id, name: form.name },
      ...(req ? extractRequestContext(req) : {}),
    });

    return form;
  },

  async update(
    ctx: AuthContext,
    siteId: string,
    formId: string,
    input: {
      name?: string;
      fields?: SiteFormFieldDto[];
      notifyEmails?: string[];
      successMessage?: string | null;
      redirectUrl?: string | null;
    },
    req?: Request,
  ) {
    await requireSite(ctx, siteId);
    const form = await siteFormRepository.findById(ctx.tenantId, formId);
    if (!form || form.siteId !== siteId) throw new NotFoundError("Form not found");

    if (input.fields) assertUniqueKeys(input.fields);

    const updated = await siteFormRepository.update(form.id, {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.fields !== undefined ? { fields: toJson(input.fields) } : {}),
      ...(input.notifyEmails !== undefined ? { notifyEmails: toJson(input.notifyEmails) } : {}),
      ...(input.successMessage !== undefined ? { successMessage: input.successMessage } : {}),
      ...(input.redirectUrl !== undefined ? { redirectUrl: input.redirectUrl } : {}),
    });

    await auditRepository.record({
      action: AuditAction.SITE_FORM_UPDATED,
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      metadata: { siteId, formId: form.id },
      ...(req ? extractRequestContext(req) : {}),
    });

    return updated;
  },

  async remove(ctx: AuthContext, siteId: string, formId: string, req?: Request) {
    await requireSite(ctx, siteId);
    const form = await siteFormRepository.findById(ctx.tenantId, formId);
    if (!form || form.siteId !== siteId) throw new NotFoundError("Form not found");

    // Soft delete keeps the submissions readable: a lead whose form vanished
    // would otherwise lose its field labels and its name in the inbox.
    await siteFormRepository.softDelete(form.id);

    await auditRepository.record({
      action: AuditAction.SITE_FORM_DELETED,
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      metadata: { siteId, formId: form.id, submissions: form.submissionCount },
      ...(req ? extractRequestContext(req) : {}),
    });
  },

  // -------------------------------------------------------------------
  // Leads
  // -------------------------------------------------------------------

  async listLeads(
    ctx: AuthContext,
    siteId: string,
    req: Request,
    filter: {
      formId?: string;
      status?: SiteFormSubmissionStatus;
      includeSpam: boolean;
      from?: Date;
      to?: Date;
    },
  ): Promise<PagedResult<LeadDto> & { counts: Record<SiteFormSubmissionStatus, number> }> {
    const site = await requireSite(ctx, siteId);
    const pagination = parsePagination(req);

    const [{ items, total, counts }, forms] = await Promise.all([
      siteFormRepository.listSubmissions({
        tenantId: ctx.tenantId,
        siteId: site.id,
        filter,
        pagination,
      }),
      // Loaded once and indexed, so presenting N leads is not N form lookups.
      siteFormRepository.listForSite(site.id),
    ]);

    const byId = new Map(forms.map((f) => [f.id, f]));

    const leads: LeadDto[] = items.map((submission) => {
      const form = byId.get(submission.formId);
      return {
        id: submission.id,
        formId: submission.formId,
        formName: form?.name ?? null,
        name: submission.name,
        email: submission.email,
        phone: submission.phone,
        status: submission.status,
        fields: presentFields(submission.data, form ? readFields(form) : []),
        pagePath: submission.pagePath,
        referrer: submission.referrer,
        spamScore: submission.spamScore,
        createdAt: submission.createdAt,
        readAt: submission.readAt,
      };
    });

    return { ...buildPagedResult(leads, total, pagination), counts };
  },

  async getLead(ctx: AuthContext, siteId: string, leadId: string): Promise<LeadDto> {
    await requireSite(ctx, siteId);
    const submission = await siteFormRepository.findSubmission(ctx.tenantId, leadId);
    if (!submission || submission.siteId !== siteId) throw new NotFoundError("Lead not found");

    const form = await siteFormRepository.findById(ctx.tenantId, submission.formId);

    // Opening a lead marks it read. Doing it here rather than requiring an
    // explicit call means the unread badge always reflects reality.
    const updated =
      submission.status === SiteFormSubmissionStatus.NEW
        ? await siteFormRepository.updateSubmission(submission.id, {
            status: SiteFormSubmissionStatus.READ,
            readAt: new Date(),
          })
        : submission;

    return {
      id: updated.id,
      formId: updated.formId,
      formName: form?.name ?? null,
      name: updated.name,
      email: updated.email,
      phone: updated.phone,
      status: updated.status,
      fields: presentFields(updated.data, form ? readFields(form) : []),
      pagePath: updated.pagePath,
      referrer: updated.referrer,
      spamScore: updated.spamScore,
      createdAt: updated.createdAt,
      readAt: updated.readAt,
    };
  },

  async setLeadStatus(
    ctx: AuthContext,
    siteId: string,
    ids: string[],
    status: SiteFormSubmissionStatus,
  ) {
    await requireSite(ctx, siteId);
    const result = await siteFormRepository.updateManyStatus({
      tenantId: ctx.tenantId,
      siteId,
      ids,
      status,
    });
    return { updated: result.count };
  },

  async removeLead(ctx: AuthContext, siteId: string, leadId: string) {
    await requireSite(ctx, siteId);
    const submission = await siteFormRepository.findSubmission(ctx.tenantId, leadId);
    if (!submission || submission.siteId !== siteId) throw new NotFoundError("Lead not found");
    await siteFormRepository.deleteSubmission(submission.id);
  },

  async stats(ctx: AuthContext, siteId: string, days = 30) {
    await requireSite(ctx, siteId);
    return siteFormRepository.dailyCounts(ctx.tenantId, siteId, days);
  },

  /**
   * CSV export.
   *
   * Columns are the union of every field key present in the exported rows, so a
   * form whose fields changed over time still exports completely rather than
   * truncating older submissions to the current schema.
   */
  async exportCsv(
    ctx: AuthContext,
    siteId: string,
    options: { formId?: string; includeSpam: boolean },
  ): Promise<{ filename: string; csv: string }> {
    const site = await requireSite(ctx, siteId);

    const [submissions, forms] = await Promise.all([
      siteFormRepository.listForExport({
        tenantId: ctx.tenantId,
        siteId: site.id,
        formId: options.formId,
        includeSpam: options.includeSpam,
        // Bounded so an export cannot exhaust memory on a busy site.
        limit: 5000,
      }),
      siteFormRepository.listForSite(site.id),
    ]);

    const byId = new Map(forms.map((f) => [f.id, f]));

    const dynamicColumns: string[] = [];
    const rows = submissions.map((submission) => {
      const form = byId.get(submission.formId);
      const fields = presentFields(submission.data, form ? readFields(form) : []);
      for (const field of fields) {
        if (!dynamicColumns.includes(field.label)) dynamicColumns.push(field.label);
      }
      return {
        submission,
        formName: form?.name ?? "",
        values: new Map(fields.map((f) => [f.label, f.value])),
      };
    });

    const header = ["Received", "Form", "Status", "Page", "Source", ...dynamicColumns];
    const lines = [header.map(csvCell).join(",")];

    for (const row of rows) {
      lines.push(
        [
          row.submission.createdAt.toISOString(),
          row.formName,
          row.submission.status,
          row.submission.pagePath ?? "",
          row.submission.referrer ?? "",
          ...dynamicColumns.map((column) => row.values.get(column) ?? ""),
        ]
          .map(csvCell)
          .join(","),
      );
    }

    const date = new Date().toISOString().slice(0, 10);
    return {
      filename: `${site.slug}-leads-${date}.csv`,
      csv: lines.join("\r\n"),
    };
  },
};

/**
 * Escape a CSV cell.
 *
 * The leading-character guard is a formula-injection defence: Excel and Sheets
 * evaluate a cell beginning with =, +, -, or @, so an attacker could submit
 * `=HYPERLINK(...)` through a public form and have it execute when the tenant
 * opens the export. Prefixing a tab neutralises it while keeping the text
 * readable.
 */
function csvCell(value: string): string {
  const text = String(value ?? "");
  const guarded = /^[=+\-@\t\r]/.test(text) ? `\t${text}` : text;
  return `"${guarded.replace(/"/g, '""')}"`;
}

/** Duplicate keys would make one field silently overwrite another on submit. */
function assertUniqueKeys(fields: SiteFormFieldDto[]): void {
  const seen = new Set<string>();
  for (const field of fields) {
    if (seen.has(field.key)) {
      throw new ValidationError(`Duplicate field key "${field.key}"`);
    }
    seen.add(field.key);
  }
}
