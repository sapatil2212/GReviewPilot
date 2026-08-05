/**
 * Typed client for the website builder API.
 *
 * Kept in its own module rather than appended to lib/api/index.ts because the
 * builder's surface is large enough that mixing it in would make that file
 * hard to navigate. Same conventions: one method per route, every request
 * through `apiFetch`, no hand-built URLs in components.
 */

import { apiFetch } from "@/lib/fetcher";
import type { SiteDocument, ThemeTokens, SeoMeta, BrandContext } from "@/site/document/types";

// =====================================================================
// DTOs
// =====================================================================

export type SiteStatusDto = "DRAFT" | "PUBLISHED" | "ARCHIVED" | "DELETED";
export type SitePageStatusDto = "DRAFT" | "PUBLISHED";
export type DomainStatusDto = "PENDING" | "VERIFYING" | "CONNECTED" | "FAILED" | "REMOVED";
export type SslStatusDto = "NONE" | "PENDING" | "ACTIVE" | "FAILED" | "EXPIRED";

export interface SiteListItemDto {
  id: string;
  name: string;
  slug: string;
  status: SiteStatusDto;
  industry: string | null;
  locationId: string | null;
  logoUrl: string | null;
  faviconUrl: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** `<slug>.SITES_ROOT_DOMAIN`, or null when the platform has none configured. */
  subdomain: string | null;
  _count: { pages: number; domains: number };
  domains: Array<{
    hostname: string;
    isPrimary: boolean;
    status: DomainStatusDto;
    sslStatus: SslStatusDto;
  }>;
}

export interface SitePageMetaDto {
  id: string;
  siteId: string;
  title: string;
  path: string;
  status: SitePageStatusDto;
  isHome: boolean;
  seo: SeoMeta | null;
  sortOrder: number;
  hiddenInNav: boolean;
  noIndex: boolean;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SiteDetailDto {
  id: string;
  name: string;
  slug: string;
  status: SiteStatusDto;
  industry: string | null;
  locationId: string | null;
  logoUrl: string | null;
  faviconUrl: string | null;
  theme: ThemeTokens;
  brand: BrandContext;
  seo: SeoMeta;
  settings: Record<string, unknown>;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  previewPath: string;
  /** `<slug>.SITES_ROOT_DOMAIN`, or null when the platform has none configured. */
  subdomain: string | null;
  publicUrl: string;
  pages: SitePageMetaDto[];
  domains: SiteDomainDto[];
}

export interface SitePageDto {
  id: string;
  siteId: string;
  title: string;
  path: string;
  status: SitePageStatusDto;
  isHome: boolean;
  hiddenInNav: boolean;
  noIndex: boolean;
  sortOrder: number;
  seo: SeoMeta;
  document: SiteDocument;
  publishedAt: string | null;
  /** Echoed back on save for optimistic concurrency. */
  version: string;
  createdAt: string;
  updatedAt: string;
}

export interface DnsRecordDtoObservation {
  /** Values last seen in DNS for this record. */
  found?: string[];
  /** null when the record has never been checked. */
  matched?: boolean | null;
  /** True for records that are not required in the normal flow. */
  optional?: boolean;
}

export interface DnsRecordDto extends DnsRecordDtoObservation {
  type: "A" | "CNAME" | "TXT";
  name: string;
  value: string;
  ttl: number;
  purpose: "routing" | "verification";
  note?: string;
}

export interface SiteDomainDto {
  id: string;
  hostname: string;
  isPrimary: boolean;
  redirectToPrimary: boolean;
  status: DomainStatusDto;
  sslStatus: SslStatusDto;
  verifiedAt: string | null;
  sslExpiresAt: string | null;
  lastCheckedAt: string | null;
  lastError: string | null;
  isApex: boolean;
  dnsRecords: DnsRecordDto[];
  createdAt: string;
}

export interface CaaCheckDto {
  present: boolean;
  permitted: boolean;
  foundAt: string | null;
  authorised: string[];
  message: string | null;
}

/** Result of inspecting the live certificate for a domain. */
export interface SslSummaryDto {
  sslStatus: SslStatusDto;
  valid: boolean;
  issuer: string | null;
  validFrom: string | null;
  expiresAt: string | null;
  daysUntilExpiry: number | null;
  renewalDue: boolean;
  problems: string[];
  summary: string;
  caa: CaaCheckDto | null;
  checkedAt: string;
}

export interface DomainVerifyResultDto {
  status: DomainStatusDto;
  sslStatus: SslStatusDto;
  connected: boolean;
  routingOk: boolean;
  ownershipOk: boolean;
  verifiedAt: string | null;
  lastError: string | null;
  /** Present once routing resolves, or when CAA would block issuance. */
  ssl: SslSummaryDto | null;
  /**
   * How routing was proven. `recordMatches` false with `reachable` true is a
   * normal, working state — typical of Cloudflare-proxied domains, whose address
   * can never equal our own.
   */
  routing: {
    recordMatches: boolean;
    reachable: boolean;
    detail: string | null;
  };
  checks: Array<{
    type: string;
    name: string;
    expected: string;
    found: string[];
    matched: boolean;
    purpose: string;
  }>;
}

export interface AiGenerateResultDto {
  message: string;
  source: "ai" | "blueprint";
  conversationId: string;
  pages: Array<{ id: string; title: string; path: string; isHome: boolean }>;
  theme: ThemeTokens;
}

export interface AiEditResultDto {
  message: string;
  conversationId: string;
  revisionId: string | null;
  applied: string[];
  skipped: string[];
  /** Null when the edit did not touch the document. */
  document: SiteDocument | null;
  theme: ThemeTokens | null;
  version: string | null;
  source: "ai" | "local";
}

export interface AiMessageDto {
  id: string;
  role: "USER" | "ASSISTANT" | "SYSTEM";
  content: string;
  revisionId: string | null;
  createdAt: string;
}

export interface RevisionDto {
  id: string;
  pageId: string | null;
  kind: "AUTOSAVE" | "MANUAL" | "AI_EDIT" | "PUBLISH" | "ROLLBACK" | "TEMPLATE_APPLY";
  label: string | null;
  aiPrompt: string | null;
  createdById: string | null;
  createdAt: string;
}

export interface AuditIssueDto {
  id: string;
  category: "seo" | "accessibility" | "conversion" | "performance" | "content";
  severity: "critical" | "warning" | "suggestion";
  title: string;
  detail: string;
  fix: string;
  nodeIds?: string[];
  autoFixPrompt?: string;
}

export interface AuditResultDto {
  score: number;
  issues: AuditIssueDto[];
  counts: Record<"critical" | "warning" | "suggestion", number>;
  byCategory: Record<string, number>;
  passed: string[];
}

export type LeadStatusDto = "NEW" | "READ" | "REPLIED" | "SPAM" | "ARCHIVED";

export type FormFieldKindDto =
  | "TEXT"
  | "TEXTAREA"
  | "EMAIL"
  | "PHONE"
  | "NUMBER"
  | "DATE"
  | "SELECT"
  | "CHECKBOX";

export interface SiteFormFieldDto {
  key: string;
  label: string;
  kind: FormFieldKindDto;
  required?: boolean;
  placeholder?: string;
  helpText?: string;
  options?: string[];
}

export interface SiteFormDto {
  id: string;
  name: string;
  slug: string;
  fields: SiteFormFieldDto[];
  notifyEmails: string[];
  successMessage: string | null;
  redirectUrl: string | null;
  submissionCount: number;
  /** Leads still marked NEW, for the badge on the forms list. */
  unreadCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface LeadDto {
  id: string;
  formId: string;
  formName: string | null;
  name: string | null;
  email: string | null;
  phone: string | null;
  status: LeadStatusDto;
  /**
   * Values paired with their form's labels, server-side.
   *
   * Not the raw `{ key: value }` map: the label lives on the form definition,
   * so pairing them here means the inbox never has to load form schemas to
   * render a lead, and fields the form no longer declares still appear.
   */
  fields: Array<{ key: string; label: string; value: string }>;
  pagePath: string | null;
  referrer: string | null;
  spamScore: number | null;
  createdAt: string;
  readAt: string | null;
}

export interface PagedDto<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
}

export type LeadsPageDto = PagedDto<LeadDto> & {
  counts: Record<LeadStatusDto, number>;
};

// =====================================================================
// Client
// =====================================================================

function query(params: Record<string, string | number | boolean | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") search.set(key, String(value));
  }
  const s = search.toString();
  return s ? `?${s}` : "";
}

const base = "/api/private/sites";

export const siteApi = {
  list(params: { page?: number; pageSize?: number; search?: string; status?: string } = {}) {
    return apiFetch<PagedDto<SiteListItemDto>>(`${base}${query(params)}`).then((r) => r.data);
  },

  get(siteId: string) {
    return apiFetch<SiteDetailDto>(`${base}/${siteId}`).then((r) => r.data);
  },

  create(input: {
    name: string;
    slug?: string;
    industry?: string;
    locationId?: string;
    templateSlug?: string;
  }) {
    return apiFetch<{ id: string; name: string; slug: string; status: SiteStatusDto }>(base, {
      method: "POST",
      body: JSON.stringify(input),
    }).then((r) => r.data);
  },

  update(
    siteId: string,
    input: Partial<{
      name: string;
      slug: string;
      industry: string;
      locationId: string | null;
      logoUrl: string | null;
      faviconUrl: string | null;
      brand: Partial<BrandContext>;
      seo: Partial<SeoMeta>;
      settings: Record<string, unknown>;
    }>,
  ) {
    return apiFetch<{ id: string; name: string; slug: string }>(`${base}/${siteId}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }).then((r) => r.data);
  },

  remove(siteId: string) {
    return apiFetch<{ deleted: boolean }>(`${base}/${siteId}`, { method: "DELETE" }).then(
      (r) => r.data,
    );
  },

  updateTheme(siteId: string, patch: Record<string, unknown>) {
    return apiFetch<ThemeTokens>(`${base}/${siteId}/theme`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }).then((r) => r.data);
  },

  publish(siteId: string, input: { pageIds?: string[]; label?: string } = {}) {
    return apiFetch<{
      status: SiteStatusDto;
      publishedAt: string | null;
      pagesPublished: number;
      publicUrl: string;
    }>(`${base}/${siteId}/publish`, { method: "POST", body: JSON.stringify(input) }).then(
      (r) => r.data,
    );
  },

  unpublish(siteId: string) {
    return apiFetch<{ status: SiteStatusDto }>(`${base}/${siteId}/publish`, {
      method: "DELETE",
    }).then((r) => r.data);
  },

  // ---- Pages ----

  listPages(siteId: string) {
    return apiFetch<SitePageMetaDto[]>(`${base}/${siteId}/pages`).then((r) => r.data);
  },

  getPage(siteId: string, pageId: string) {
    return apiFetch<SitePageDto>(`${base}/${siteId}/pages/${pageId}`).then((r) => r.data);
  },

  createPage(
    siteId: string,
    input: { title: string; path: string; presets?: string[]; isHome?: boolean; hiddenInNav?: boolean },
  ) {
    return apiFetch<{ id: string; title: string; path: string; isHome: boolean }>(
      `${base}/${siteId}/pages`,
      { method: "POST", body: JSON.stringify(input) },
    ).then((r) => r.data);
  },

  updatePage(
    siteId: string,
    pageId: string,
    input: Partial<{
      title: string;
      path: string;
      seo: Partial<SeoMeta>;
      hiddenInNav: boolean;
      noIndex: boolean;
      sortOrder: number;
      status: SitePageStatusDto;
    }>,
  ) {
    return apiFetch<{ id: string; title: string; path: string }>(
      `${base}/${siteId}/pages/${pageId}`,
      { method: "PATCH", body: JSON.stringify(input) },
    ).then((r) => r.data);
  },

  /**
   * Persist a page document.
   *
   * `expectedVersion` must be the version last received from the server; the
   * API returns a 409 if the page changed elsewhere, which the editor surfaces
   * rather than silently overwriting.
   */
  savePage(
    siteId: string,
    pageId: string,
    input: { document: SiteDocument; expectedVersion?: string; autosave?: boolean },
  ) {
    return apiFetch<{ version: string; nodeCount: number; corrected: string[] }>(
      `${base}/${siteId}/pages/${pageId}`,
      { method: "PUT", body: JSON.stringify({ autosave: false, ...input }) },
    ).then((r) => r.data);
  },

  deletePage(siteId: string, pageId: string) {
    return apiFetch<{ deleted: boolean }>(`${base}/${siteId}/pages/${pageId}`, {
      method: "DELETE",
    }).then((r) => r.data);
  },

  reorderPages(siteId: string, pageIds: string[]) {
    return apiFetch<{ reordered: number }>(`${base}/${siteId}/pages`, {
      method: "PUT",
      body: JSON.stringify({ pageIds }),
    }).then((r) => r.data);
  },

  // ---- AI ----

  generate(
    siteId: string,
    input: {
      prompt: string;
      industry?: string;
      businessName?: string;
      locationId?: string;
      replaceExisting?: boolean;
    },
  ) {
    return apiFetch<AiGenerateResultDto>(`${base}/${siteId}/ai/generate`, {
      method: "POST",
      body: JSON.stringify(input),
    }).then((r) => r.data);
  },

  edit(siteId: string, input: { prompt: string; pageId?: string; conversationId?: string }) {
    return apiFetch<AiEditResultDto>(`${base}/${siteId}/ai/edit`, {
      method: "POST",
      body: JSON.stringify(input),
    }).then((r) => r.data);
  },

  messages(siteId: string, conversationId?: string) {
    return apiFetch<{ conversationId: string | null; messages: AiMessageDto[] }>(
      `${base}/${siteId}/ai/edit${query({ conversationId })}`,
    ).then((r) => r.data);
  },

  audit(siteId: string, pageId?: string) {
    return apiFetch<AuditResultDto>(`${base}/${siteId}/audit${query({ pageId })}`).then(
      (r) => r.data,
    );
  },

  // ---- Revisions ----

  revisions(siteId: string, params: { pageId?: string; page?: number; pageSize?: number } = {}) {
    return apiFetch<PagedDto<RevisionDto>>(`${base}/${siteId}/revisions${query(params)}`).then(
      (r) => r.data,
    );
  },

  rollback(siteId: string, revisionId: string) {
    return apiFetch<{ pagesRestored: number }>(`${base}/${siteId}/revisions`, {
      method: "POST",
      body: JSON.stringify({ revisionId }),
    }).then((r) => r.data);
  },

  // ---- Domains ----

  domains(siteId: string) {
    return apiFetch<{
      domains: SiteDomainDto[];
      wizard: Array<{ step: number; title: string; detail: string }>;
    }>(`${base}/${siteId}/domains`).then((r) => r.data);
  },

  addDomain(
    siteId: string,
    input: { hostname: string; isPrimary?: boolean; addWwwAlias?: boolean },
  ) {
    return apiFetch<{
      id: string;
      hostname: string;
      status: DomainStatusDto;
      isApex: boolean;
      dnsRecords: DnsRecordDto[];
      verificationToken: string;
      /** Set when a www counterpart was created alongside the domain. */
      alias: { hostname: string; dnsRecords: DnsRecordDto[] } | null;
    }>(`${base}/${siteId}/domains`, { method: "POST", body: JSON.stringify(input) }).then(
      (r) => r.data,
    );
  },

  verifyDomain(siteId: string, domainId: string) {
    return apiFetch<DomainVerifyResultDto>(`${base}/${siteId}/domains/${domainId}`, {
      method: "POST",
    }).then((r) => r.data);
  },

  /** Inspect the live certificate without re-running DNS verification. */
  checkDomainSsl(siteId: string, domainId: string) {
    return apiFetch<SslSummaryDto>(`${base}/${siteId}/domains/${domainId}/ssl`, {
      method: "POST",
    }).then((r) => r.data);
  },

  updateDomain(
    siteId: string,
    domainId: string,
    input: { isPrimary?: boolean; redirectToPrimary?: boolean },
  ) {
    return apiFetch<SiteDomainDto>(`${base}/${siteId}/domains/${domainId}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }).then((r) => r.data);
  },

  removeDomain(siteId: string, domainId: string) {
    return apiFetch<{ removed: boolean }>(`${base}/${siteId}/domains/${domainId}`, {
      method: "DELETE",
    }).then((r) => r.data);
  },

  // ---- Forms ----

  forms(siteId: string) {
    return apiFetch<SiteFormDto[]>(`${base}/${siteId}/forms`).then((r) => r.data);
  },

  createForm(
    siteId: string,
    input: {
      name: string;
      fields: SiteFormFieldDto[];
      notifyEmails?: string[];
      successMessage?: string;
      redirectUrl?: string;
    },
  ) {
    return apiFetch<{ id: string; name: string; slug: string }>(`${base}/${siteId}/forms`, {
      method: "POST",
      body: JSON.stringify(input),
    }).then((r) => r.data);
  },

  updateForm(
    siteId: string,
    formId: string,
    input: Partial<{
      name: string;
      fields: SiteFormFieldDto[];
      notifyEmails: string[];
      successMessage: string;
      redirectUrl: string;
    }>,
  ) {
    return apiFetch<{ id: string; name: string }>(`${base}/${siteId}/forms/${formId}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }).then((r) => r.data);
  },

  removeForm(siteId: string, formId: string) {
    return apiFetch<{ deleted: boolean }>(`${base}/${siteId}/forms/${formId}`, {
      method: "DELETE",
    }).then((r) => r.data);
  },

  // ---- Leads ----

  leads(
    siteId: string,
    params: {
      page?: number;
      pageSize?: number;
      search?: string;
      formId?: string;
      status?: LeadStatusDto;
      includeSpam?: boolean;
    } = {},
  ) {
    return apiFetch<LeadsPageDto>(`${base}/${siteId}/leads${query(params)}`).then((r) => r.data);
  },

  lead(siteId: string, leadId: string) {
    return apiFetch<LeadDto>(`${base}/${siteId}/leads/${leadId}`).then((r) => r.data);
  },

  updateLead(siteId: string, leadId: string, status: LeadStatusDto) {
    return apiFetch<LeadDto>(`${base}/${siteId}/leads/${leadId}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }).then((r) => r.data);
  },

  bulkUpdateLeads(siteId: string, ids: string[], status: LeadStatusDto) {
    return apiFetch<{ updated: number }>(`${base}/${siteId}/leads`, {
      method: "PATCH",
      body: JSON.stringify({ ids, status }),
    }).then((r) => r.data);
  },

  removeLead(siteId: string, leadId: string) {
    return apiFetch<{ deleted: boolean }>(`${base}/${siteId}/leads/${leadId}`, {
      method: "DELETE",
    }).then((r) => r.data);
  },

  /** CSV export URL. Returned rather than fetched so the browser downloads it. */
  leadsExportUrl(siteId: string, params: { formId?: string; status?: LeadStatusDto } = {}) {
    return `${base}/${siteId}/leads${query({ ...params, export: "csv" })}`;
  },
};

// =====================================================================
// Templates
// =====================================================================

export interface SiteTemplatePageDto {
  title: string;
  path: string;
  isHome: boolean;
}

export interface SiteTemplateDto {
  id: string;
  name: string;
  slug: string;
  industry: string | null;
  description: string | null;
  thumbnailUrl: string | null;
  isPremium: boolean;
  isGlobal: boolean;
  pageCount: number;
  /** Every page the template ships with, for the preview page switcher. */
  pages: SiteTemplatePageDto[];
  /** Theme palette, shown as swatches on the gallery card. */
  colors: { primary: string; secondary: string; accent: string };
  /** Base path of the live preview route, e.g. "/template-preview/dental". */
  previewUrl: string;
}

export const siteTemplateApi = {
  list(industry?: string) {
    return apiFetch<SiteTemplateDto[]>(`/api/private/site-templates${query({ industry })}`).then(
      (r) => r.data,
    );
  },
};

// =====================================================================
// Forms & leads
// =====================================================================

export const siteFormApi = {
  listForms(siteId: string) {
    return apiFetch<SiteFormDto[]>(`${base}/${siteId}/forms`).then((r) => r.data);
  },

  createForm(
    siteId: string,
    input: {
      name: string;
      slug?: string;
      fields: SiteFormFieldDto[];
      notifyEmails?: string[];
      successMessage?: string;
      redirectUrl?: string;
    },
  ) {
    return apiFetch<{ id: string; name: string; slug: string }>(`${base}/${siteId}/forms`, {
      method: "POST",
      body: JSON.stringify(input),
    }).then((r) => r.data);
  },

  updateForm(
    siteId: string,
    formId: string,
    input: Partial<{
      name: string;
      fields: SiteFormFieldDto[];
      notifyEmails: string[];
      successMessage: string | null;
      redirectUrl: string | null;
    }>,
  ) {
    return apiFetch<{ id: string; name: string }>(`${base}/${siteId}/forms/${formId}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }).then((r) => r.data);
  },

  deleteForm(siteId: string, formId: string) {
    return apiFetch<{ deleted: boolean }>(`${base}/${siteId}/forms/${formId}`, {
      method: "DELETE",
    }).then((r) => r.data);
  },

  listLeads(
    siteId: string,
    params: {
      formId?: string;
      status?: LeadStatusDto;
      includeSpam?: boolean;
      search?: string;
      page?: number;
      pageSize?: number;
    } = {},
  ) {
    return apiFetch<LeadsPageDto>(`${base}/${siteId}/leads${query(params)}`).then((r) => r.data);
  },

  getLead(siteId: string, leadId: string) {
    return apiFetch<LeadDto>(`${base}/${siteId}/leads/${leadId}`).then((r) => r.data);
  },

  setLeadStatus(siteId: string, ids: string[], status: LeadStatusDto) {
    return apiFetch<{ updated: number }>(`${base}/${siteId}/leads`, {
      method: "PATCH",
      body: JSON.stringify({ ids, status }),
    }).then((r) => r.data);
  },

  deleteLead(siteId: string, leadId: string) {
    return apiFetch<{ deleted: boolean }>(`${base}/${siteId}/leads/${leadId}`, {
      method: "DELETE",
    }).then((r) => r.data);
  },

  /** Direct download URL — not fetched through apiFetch, the browser navigates to it. */
  exportUrl(siteId: string, params: { formId?: string; includeSpam?: boolean } = {}) {
    return `${base}/${siteId}/leads/export${query(params)}`;
  },
};
