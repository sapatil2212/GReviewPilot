/**
 * Typed API client wrappers.
 *
 * Every module exposes a small object of methods that map 1:1 to
 * server routes. All requests flow through `apiFetch` so the response
 * envelope, error shape, and content-type headers stay consistent.
 *
 * Client components import from `@/lib/api` — never construct fetch
 * URLs by hand.
 */

import { apiFetch, ApiClientError } from "@/lib/fetcher";

export { ApiClientError };

// ------------------------------------------------------------------
// Business Profile
// ------------------------------------------------------------------

export interface BusinessProfileDto {
  profile: {
    id: string;
    tenantId: string;
    legalName: string | null;
    description: string | null;
    shortDescription: string | null;
    coverImage: string | null;
    foundedYear: number | null;
    registrationNumber: string | null;
    gstNumber: string | null;
    taxNumber: string | null;
    primaryCategoryId: string | null;
    primaryCategory: BusinessCategoryDto | null;
    categories: Array<{
      id: string;
      categoryId: string;
      category: BusinessCategoryDto;
    }>;
    attributes: Array<{
      id: string;
      key: string;
      value: string;
      type: "BOOLEAN" | "TEXT" | "URL" | "NUMBER" | "ENUM";
    }>;
  };
  tenant: {
    id: string;
    name: string;
    slug: string;
    logo: string | null;
    businessEmail: string | null;
    phone: string | null;
    website: string | null;
    industry: string | null;
    businessType: string | null;
    employeeCount: string | null;
    country: string | null;
    timezone: string;
    currency: string;
    language: string;
    address: Record<string, unknown> | null;
    socialLinks: Record<string, unknown> | null;
    plan: string;
    status: string;
    trialEndsAt: string | null;
  } | null;
}

export interface BusinessCategoryDto {
  id: string;
  slug: string;
  name: string;
  googleCategoryId: string | null;
  parentId: string | null;
  isActive: boolean;
}

export const businessApi = {
  get: () =>
    apiFetch<BusinessProfileDto>("/api/private/business/profile").then((r) => r.data),

  update: (body: Record<string, unknown>) =>
    apiFetch<BusinessProfileDto>("/api/private/business/profile", {
      method: "PATCH",
      body: JSON.stringify(body),
    }).then((r) => r.data),

  catalog: (q: { search?: string; page?: number; pageSize?: number; parentId?: string }) => {
    const url = new URL("/api/private/business/categories/catalog", window.location.origin);
    if (q.search) url.searchParams.set("search", q.search);
    if (q.page) url.searchParams.set("page", String(q.page));
    if (q.pageSize) url.searchParams.set("pageSize", String(q.pageSize));
    if (q.parentId) url.searchParams.set("parentId", q.parentId);
    return apiFetch<Paged<BusinessCategoryDto>>(url.pathname + url.search).then(
      (r) => r.data,
    );
  },

  listCategories: () =>
    apiFetch<{
      primaryCategoryId: string | null;
      categories: Array<{
        id: string;
        addedAt: string;
        isPrimary: boolean;
        category: BusinessCategoryDto;
      }>;
    }>("/api/private/business/categories").then((r) => r.data),

  addCategory: (categoryId: string, setAsPrimary = false) =>
    apiFetch("/api/private/business/categories", {
      method: "POST",
      body: JSON.stringify({ categoryId, setAsPrimary }),
    }).then((r) => r.data),

  removeCategory: (categoryId: string) =>
    apiFetch(`/api/private/business/categories/${categoryId}`, {
      method: "DELETE",
    }).then((r) => r.data),

  setPrimaryCategory: (categoryId: string) =>
    apiFetch(`/api/private/business/categories/${categoryId}/primary`, {
      method: "PATCH",
    }).then((r) => r.data),

  listAttributes: () =>
    apiFetch<{ items: BusinessProfileDto["profile"]["attributes"]; total: number }>(
      "/api/private/business/attributes",
    ).then((r) => r.data),

  setAttribute: (input: { key: string; value: string; type: string }) =>
    apiFetch("/api/private/business/attributes", {
      method: "PUT",
      body: JSON.stringify(input),
    }).then((r) => r.data),

  removeAttribute: (id: string) =>
    apiFetch(`/api/private/business/attributes/${id}`, { method: "DELETE" }).then(
      (r) => r.data,
    ),
};

// ------------------------------------------------------------------
// Locations
// ------------------------------------------------------------------

export interface Paged<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
}

export interface LocationDto {
  id: string;
  tenantId: string;
  name: string;
  slug: string;
  storeCode: string | null;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  state: string | null;
  postalCode: string | null;
  country: string;
  latitude: string | null;
  longitude: string | null;
  googleLocationId: string | null;
  googlePlaceId: string | null;
  /** "official" | "manual" (Quick Connect) | null */
  placeIdSource?: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  timezone: string | null;
  workingHours: WorkingHours | null;
  status: "ACTIVE" | "INACTIVE" | "ARCHIVED" | "DELETED";
  assignedManagerId: string | null;
  assignedManager: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    avatar: string | null;
    role: string;
  } | null;
  archivedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type DayKey =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";

export type WorkingHours = Record<
  DayKey,
  { isOpen: boolean; ranges: Array<{ open: string; close: string }> }
>;

export interface HolidayHoursDto {
  id: string;
  locationId: string;
  date: string;
  isClosed: boolean;
  openTime: string | null;
  closeTime: string | null;
  note: string | null;
  createdAt: string;
}

export const locationsApi = {
  list: (q: {
    page?: number;
    pageSize?: number;
    search?: string;
    status?: string;
    sortBy?: string;
    sortDir?: "asc" | "desc";
    includeDeleted?: boolean;
  }) => {
    const url = new URL("/api/private/locations", window.location.origin);
    for (const [k, v] of Object.entries(q)) {
      if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
    }
    return apiFetch<Paged<LocationDto>>(url.pathname + url.search).then((r) => r.data);
  },
  get: (id: string) =>
    apiFetch<LocationDto>(`/api/private/locations/${id}`).then((r) => r.data),
  create: (body: Record<string, unknown>) =>
    apiFetch<LocationDto>("/api/private/locations", {
      method: "POST",
      body: JSON.stringify(body),
    }).then((r) => r.data),
  update: (id: string, body: Record<string, unknown>) =>
    apiFetch<LocationDto>(`/api/private/locations/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }).then((r) => r.data),
  remove: (id: string) =>
    apiFetch(`/api/private/locations/${id}`, { method: "DELETE" }).then(
      (r) => r.data,
    ),
  archive: (id: string) =>
    apiFetch(`/api/private/locations/${id}/archive`, { method: "POST" }).then(
      (r) => r.data,
    ),
  restore: (id: string) =>
    apiFetch(`/api/private/locations/${id}/restore`, { method: "POST" }).then(
      (r) => r.data,
    ),
  updateHours: (id: string, workingHours: WorkingHours) =>
    apiFetch<LocationDto>(`/api/private/locations/${id}/hours`, {
      method: "PUT",
      body: JSON.stringify({ workingHours }),
    }).then((r) => r.data),
  assignManager: (id: string, managerId: string | null) =>
    apiFetch<LocationDto>(`/api/private/locations/${id}/manager`, {
      method: "PUT",
      body: JSON.stringify({ managerId }),
    }).then((r) => r.data),

  listHolidays: (id: string, from?: string, to?: string) => {
    const qs = new URLSearchParams();
    if (from) qs.set("from", from);
    if (to) qs.set("to", to);
    const q = qs.toString();
    return apiFetch<{ items: HolidayHoursDto[]; total: number }>(
      `/api/private/locations/${id}/holiday-hours${q ? `?${q}` : ""}`,
    ).then((r) => r.data);
  },
  setHoliday: (
    id: string,
    body: {
      date: string;
      isClosed: boolean;
      openTime?: string;
      closeTime?: string;
      note?: string;
    },
  ) =>
    apiFetch<HolidayHoursDto>(`/api/private/locations/${id}/holiday-hours`, {
      method: "POST",
      body: JSON.stringify(body),
    }).then((r) => r.data),
  updateHoliday: (
    id: string,
    entryId: string,
    body: {
      isClosed?: boolean;
      openTime?: string;
      closeTime?: string;
      note?: string;
    },
  ) =>
    apiFetch<HolidayHoursDto>(
      `/api/private/locations/${id}/holiday-hours/${entryId}`,
      {
        method: "PATCH",
        body: JSON.stringify(body),
      },
    ).then((r) => r.data),
  removeHoliday: (id: string, entryId: string) =>
    apiFetch(`/api/private/locations/${id}/holiday-hours/${entryId}`, {
      method: "DELETE",
    }).then((r) => r.data),

  listAssignments: (id: string) =>
    apiFetch<{ items: LocationAssignmentDto[]; total: number }>(
      `/api/private/locations/${id}/assignments`,
    ).then((r) => r.data),
  assignUser: (id: string, userId: string) =>
    apiFetch(`/api/private/locations/${id}/assignments`, {
      method: "POST",
      body: JSON.stringify({ userId }),
    }).then((r) => r.data),
  unassignUser: (id: string, userId: string) =>
    apiFetch(`/api/private/locations/${id}/assignments/${userId}`, {
      method: "DELETE",
    }).then((r) => r.data),
};

// ------------------------------------------------------------------
// Team
// ------------------------------------------------------------------

export interface UserSummary {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  avatar: string | null;
  role: string;
  status: string;
  phone: string | null;
  emailVerified: string | null;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LocationAssignmentDto {
  id: string;
  locationId: string;
  userId: string;
  assignedAt: string;
  location?: { id: string; name: string; slug: string; city: string; status: string };
  user?: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    avatar: string | null;
    role: string;
    status: string;
  };
}

export interface TeamMemberDto extends UserSummary {
  assignments?: LocationAssignmentDto[];
}

export interface InvitationDto {
  id: string;
  tenantId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: string;
  message: string | null;
  status: "PENDING" | "ACCEPTED" | "REVOKED" | "EXPIRED";
  expiresAt: string;
  createdAt: string;
  invitedBy: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  } | null;
  acceptedBy: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  } | null;
}

export const teamApi = {
  listMembers: (q: {
    page?: number;
    pageSize?: number;
    search?: string;
    role?: string;
    status?: string;
    locationId?: string;
    sortBy?: string;
    sortDir?: "asc" | "desc";
  }) => {
    const url = new URL("/api/private/team/members", window.location.origin);
    for (const [k, v] of Object.entries(q)) {
      if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
    }
    return apiFetch<Paged<TeamMemberDto>>(url.pathname + url.search).then((r) => r.data);
  },
  getMember: (id: string) =>
    apiFetch<TeamMemberDto>(`/api/private/team/members/${id}`).then((r) => r.data),
  updateMember: (id: string, body: Record<string, unknown>) =>
    apiFetch<UserSummary>(`/api/private/team/members/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }).then((r) => r.data),
  removeMember: (id: string) =>
    apiFetch(`/api/private/team/members/${id}`, { method: "DELETE" }).then(
      (r) => r.data,
    ),
  changeRole: (id: string, role: string) =>
    apiFetch<UserSummary>(`/api/private/team/members/${id}/role`, {
      method: "PATCH",
      body: JSON.stringify({ role }),
    }).then((r) => r.data),
  changeStatus: (id: string, status: "ACTIVE" | "BLOCKED", reason?: string) =>
    apiFetch<UserSummary>(`/api/private/team/members/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status, reason }),
    }).then((r) => r.data),

  listInvitations: (q: {
    page?: number;
    pageSize?: number;
    search?: string;
    status?: string;
    role?: string;
    sortBy?: string;
    sortDir?: "asc" | "desc";
  }) => {
    const url = new URL("/api/private/team/invitations", window.location.origin);
    for (const [k, v] of Object.entries(q)) {
      if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
    }
    return apiFetch<Paged<InvitationDto>>(url.pathname + url.search).then((r) => r.data);
  },
  invite: (body: {
    email: string;
    firstName?: string;
    lastName?: string;
    role: string;
    message?: string;
    locationIds?: string[];
  }) =>
    apiFetch<InvitationDto>("/api/private/team/invitations", {
      method: "POST",
      body: JSON.stringify(body),
    }).then((r) => r.data),
  resendInvitation: (id: string) =>
    apiFetch<InvitationDto>(`/api/private/team/invitations/${id}/resend`, {
      method: "POST",
    }).then((r) => r.data),
  revokeInvitation: (id: string) =>
    apiFetch<InvitationDto>(`/api/private/team/invitations/${id}/revoke`, {
      method: "POST",
    }).then((r) => r.data),
};

// ------------------------------------------------------------------
// Reviews
// ------------------------------------------------------------------

export interface ReviewDto {
  id: string;
  tenantId: string;
  locationId: string | null;
  source: "GOOGLE" | "MANUAL" | "IMPORTED";
  status: "NEW" | "REPLIED" | "ARCHIVED" | "FLAGGED";
  googleReviewId: string | null;
  reviewerName: string | null;
  reviewerPhotoUrl: string | null;
  reviewerIsAnonymous: boolean;
  starRating: number;
  comment: string | null;
  reviewCreatedAt: string;
  reviewUpdatedAt: string | null;
  sentiment: "POSITIVE" | "NEUTRAL" | "NEGATIVE" | "MIXED" | null;
  sentimentScore: string | null;
  sentimentKeywords: string[] | null;
  isArchived: boolean;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  location: { id: string; name: string; slug: string; city: string } | null;
  replies: Array<{
    id: string;
    comment: string;
    createdAt: string;
    deletedAt: string | null;
    repliedBy: { id: string; firstName: string; lastName: string; email: string } | null;
  }>;
  tags: Array<{ id: string; tagId: string; tag: ReviewTagDto }>;
}

export interface ReviewTagDto {
  id: string;
  tenantId: string;
  name: string;
  color: string | null;
}

export interface ReviewStatsDto {
  total: number;
  pending: number;
  replied: number;
  archived: number;
  averageRating: number | null;
}

/** Counts from an inline (Quick Connect / Places) review sync. */
export interface ReviewSyncCounts {
  processed: number;
  created: number;
  updated: number;
  failed: number;
  removedSeeds: number;
  placesFetched: number;
  gmbFetched: number;
  placeRatingsTotal: number | null;
  placeAverageRating: number | null;
  placesApiEnabled: boolean;
  warnings: string[];
}

/**
 * Result of POST /api/private/reviews/sync.
 *
 * Discriminated on `queued`: an official Google connection enqueues a
 * background job and has no counts yet, while a Quick Connect tenant syncs
 * inline and does. Reading counts off the queued branch is a type error.
 */
export type ReviewSyncResult =
  | {
      queued: true;
      jobCreated: boolean;
      message: string;
      job: SyncRunDto;
    }
  | ({ queued: false } & ReviewSyncCounts);

export const reviewsApi = {
  list: (q: {
    page?: number;
    pageSize?: number;
    search?: string;
    locationId?: string;
    status?: string;
    source?: string;
    sentiment?: string;
    minRating?: number;
    maxRating?: number;
    hasReply?: string;
    isArchived?: string;
    from?: string;
    to?: string;
    tagId?: string;
    sortBy?: string;
    sortDir?: "asc" | "desc";
  }) => {
    const url = new URL("/api/private/reviews", window.location.origin);
    for (const [k, v] of Object.entries(q)) {
      if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
    }
    return apiFetch<Paged<ReviewDto>>(url.pathname + url.search).then((r) => r.data);
  },
  get: (id: string) =>
    apiFetch<ReviewDto>(`/api/private/reviews/${id}`).then((r) => r.data),
  stats: () =>
    apiFetch<ReviewStatsDto>("/api/private/reviews/stats").then((r) => r.data),
  reply: (id: string, comment: string) =>
    apiFetch(`/api/private/reviews/${id}/reply`, {
      method: "POST",
      body: JSON.stringify({ comment }),
    }).then((r) => r.data),
  editReply: (id: string, replyId: string, comment: string) =>
    apiFetch(`/api/private/reviews/${id}/reply/${replyId}`, {
      method: "PATCH",
      body: JSON.stringify({ comment }),
    }).then((r) => r.data),
  deleteReply: (id: string, replyId: string) =>
    apiFetch(`/api/private/reviews/${id}/reply/${replyId}`, {
      method: "DELETE",
    }).then((r) => r.data),
  /** Backfill sentiment for un-analyzed reviews (batched). */
  analyzeSentiment: (limit = 25) =>
    apiFetch<{ analyzed: number; remaining: number }>(
      "/api/private/reviews/analyze-sentiment",
      { method: "POST", body: JSON.stringify({ limit }) },
    ).then((r) => r.data),
  /**
   * Trigger a review sync from Google Business Profile / Places API.
   *
   * Two genuinely different outcomes, so the result is a discriminated union
   * rather than one wide shape. When an official Google account is connected
   * the work is queued and no counts exist yet — the endpoint used to pad the
   * response with zeros, which the UI rendered as a real "0 reviews synced"
   * result. Narrow on `queued` before reading counts.
   */
  sync: () =>
    apiFetch<ReviewSyncResult>("/api/private/reviews/sync", {
      method: "POST",
    }).then((r) => r.data),
  // AI reply drafting now lives in aiReplyApi (src/lib/api/ai.ts), which uses
  // the Business Personality rather than a per-request tone argument.
  archive: (id: string) =>
    apiFetch(`/api/private/reviews/${id}/archive`, { method: "POST" }).then((r) => r.data),
  unarchive: (id: string) =>
    apiFetch(`/api/private/reviews/${id}/archive`, { method: "DELETE" }).then((r) => r.data),
  addTag: (id: string, tagId: string) =>
    apiFetch(`/api/private/reviews/${id}/tags`, {
      method: "POST",
      body: JSON.stringify({ tagId }),
    }).then((r) => r.data),
  removeTag: (id: string, tagId: string) =>
    apiFetch(`/api/private/reviews/${id}/tags?tagId=${tagId}`, {
      method: "DELETE",
    }).then((r) => r.data),
  bulkReply: (reviewIds: string[], comment: string) =>
    apiFetch<{ replied: number }>("/api/private/reviews/bulk/reply", {
      method: "POST",
      body: JSON.stringify({ reviewIds, comment }),
    }).then((r) => r.data),
  bulkArchive: (reviewIds: string[], archive: boolean) =>
    apiFetch<{ affected: number }>("/api/private/reviews/bulk/archive", {
      method: "POST",
      body: JSON.stringify({ reviewIds, archive }),
    }).then((r) => r.data),
  listTags: () =>
    apiFetch<{ items: ReviewTagDto[]; total: number }>(
      "/api/private/reviews/tags",
    ).then((r) => r.data),
  createTag: (name: string, color?: string) =>
    apiFetch<ReviewTagDto>("/api/private/reviews/tags", {
      method: "POST",
      body: JSON.stringify({ name, color }),
    }).then((r) => r.data),
  deleteTag: (id: string) =>
    apiFetch(`/api/private/reviews/tags/${id}`, { method: "DELETE" }).then(
      (r) => r.data,
    ),
  createManual: (body: {
    locationId?: string;
    reviewerName?: string;
    starRating: number;
    comment?: string;
    reviewCreatedAt?: string;
  }) =>
    apiFetch<ReviewDto>("/api/private/reviews", {
      method: "POST",
      body: JSON.stringify(body),
    }).then((r) => r.data),

  funnelQr: (locationId: string) =>
    apiFetch<{ dataUrl: string; url: string }>(
      `/api/private/reviews/funnel/qr?locationId=${locationId}&format=png`,
    ).then((r) => r.data),

  listFeedback: (q: {
    page?: number;
    pageSize?: number;
    search?: string;
    status?: string;
    locationId?: string;
    sortBy?: string;
    sortDir?: "asc" | "desc";
  }) => {
    const url = new URL(
      "/api/private/reviews/feedback",
      window.location.origin,
    );
    for (const [k, v] of Object.entries(q)) {
      if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
    }
    return apiFetch<Paged<PrivateFeedbackDto>>(url.pathname + url.search).then(
      (r) => r.data,
    );
  },
  updateFeedback: (id: string, body: { status?: string; internalNote?: string }) =>
    apiFetch<PrivateFeedbackDto>(`/api/private/reviews/feedback/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }).then((r) => r.data),
};

export interface PrivateFeedbackDto {
  id: string;
  tenantId: string;
  locationId: string | null;
  rating: number;
  comment: string;
  customerName: string | null;
  customerPhone: string | null;
  customerEmail: string | null;
  status: "NEW" | "IN_PROGRESS" | "RESOLVED" | "DISMISSED";
  internalNote: string | null;
  createdAt: string;
  location: { id: string; name: string; slug: string; city: string } | null;
}

// ------------------------------------------------------------------
// Google Business Integration
// ------------------------------------------------------------------

export interface GoogleAccountStatusDto {
  configured: boolean;
  redirectUri: string;
  account: {
    id: string;
    email: string;
    googleAccountId: string | null;
    googleAccountName: string | null;
    status:
      | "CONNECTED"
      | "SYNCING"
      | "DISCONNECTED"
      | "TOKEN_EXPIRED"
      | "RATE_LIMITED"
      | "REAUTH_REQUIRED"
      | "ERROR";
    scopes: string;
    expiresAt: string;
    lastSyncedAt: string | null;
    lastSyncError: string | null;
    connectedAt: string;
    connectedBy: {
      id: string;
      firstName: string;
      lastName: string;
      email: string;
    } | null;
  } | null;
}

export interface GoogleLocationRowDto {
  id: string;
  tenantId: string;
  googleAccountId: string;
  googleLocationName: string;
  googleLocationId: string;
  googlePlaceId: string | null;
  title: string;
  storeCode: string | null;
  primaryCategory: string | null;
  addressLine: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
  phone: string | null;
  websiteUri: string | null;
  localLocationId: string | null;
  syncedAt: string;
  createdAt: string;
  updatedAt: string;
  localLocation: {
    id: string;
    name: string;
    slug: string;
    city: string;
    country: string;
  } | null;
}

export interface SyncRunDto {
  id: string;
  tenantId: string;
  googleAccountId: string | null;
  googleLocationId?: string | null;
  kind: string;
  status:
    | "PENDING"
    | "QUEUED"
    | "RUNNING"
    | "RETRYING"
    | "SUCCESS"
    | "PARTIAL"
    | "FAILED"
    | "CANCELLED";
  priority?: number;
  startedAt: string;
  finishedAt: string | null;
  lastAttemptAt?: string | null;
  nextRetryAt?: string | null;
  attemptCount?: number;
  totalItems?: number;
  itemsProcessed: number;
  itemsCreated: number;
  itemsUpdated: number;
  itemsFailed: number;
  lastErrorCode?: string | null;
  errorMessage: string | null;
  queued?: boolean;
  created?: boolean;
  message?: string;
  triggeredBy: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  } | null;
}

export const googleApi = {
  status: () =>
    apiFetch<GoogleAccountStatusDto>("/api/private/google/status").then(
      (r) => r.data,
    ),
  connectUrl: () =>
    apiFetch<{ url: string }>("/api/private/google/connect").then((r) => r.data),
  disconnect: () =>
    apiFetch<{ disconnected: string }>("/api/private/google/disconnect", {
      method: "POST",
    }).then((r) => r.data),
  syncLocations: () =>
    apiFetch<SyncRunDto>("/api/private/google/sync/locations", {
      method: "POST",
    }).then((r) => r.data),
  enqueueSync: (kind: "ACCOUNTS" | "LOCATIONS" | "REVIEWS" | "FULL" = "LOCATIONS") =>
    apiFetch<{ job: SyncRunDto; created: boolean; message: string }>(
      "/api/private/google/sync",
      { method: "POST", body: JSON.stringify({ kind }) },
    ).then((r) => r.data),
  getSyncJob: (id: string) =>
    apiFetch<SyncRunDto>(`/api/private/google/sync/${id}`).then((r) => r.data),
  listLocations: () =>
    apiFetch<{ items: GoogleLocationRowDto[]; total: number }>(
      "/api/private/google/locations",
    ).then((r) => r.data),
  link: (googleLocationRowId: string, localLocationId: string) =>
    apiFetch<GoogleLocationRowDto>(
      `/api/private/google/locations/${googleLocationRowId}/link`,
      {
        method: "POST",
        body: JSON.stringify({ localLocationId }),
      },
    ).then((r) => r.data),
  unlink: (googleLocationRowId: string) =>
    apiFetch<GoogleLocationRowDto>(
      `/api/private/google/locations/${googleLocationRowId}/link`,
      { method: "DELETE" },
    ).then((r) => r.data),
  syncRuns: (q: { page?: number; pageSize?: number; kind?: string; status?: string }) => {
    const url = new URL("/api/private/google/sync-runs", window.location.origin);
    for (const [k, v] of Object.entries(q)) {
      if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
    }
    return apiFetch<Paged<SyncRunDto>>(url.pathname + url.search).then((r) => r.data);
  },
  diagnostics: () =>
    apiFetch<{
      queueDepth: number;
      requestsLastHour: number;
      rateLimitErrorsLastHour: number;
      activeJobs: number;
      recentFailures: Array<{
        id: string;
        tenantId: string;
        kind: string;
        lastErrorCode: string | null;
        errorMessage: string | null;
        finishedAt: string | null;
      }>;
      apiBreakdown: Array<{ apiName: string; count: number; errors: number }>;
    }>("/api/private/google/diagnostics").then((r) => r.data),

  // Quick Connect (non-OAuth)
  listQuickConnected: () =>
    apiFetch<{ items: LocationDto[]; total: number }>(
      "/api/private/google/quick-connect",
    ).then((r) => r.data),
  disconnectQuickConnect: (locationId: string) =>
    apiFetch<{ location: LocationDto }>(
      `/api/private/google/quick-connect/${locationId}/disconnect`,
      { method: "POST" },
    ).then((r) => r.data),
  previewPlace: (input: string) =>
    apiFetch<ResolvedPlaceDto>("/api/private/google/quick-connect/preview", {
      method: "POST",
      body: JSON.stringify({ input }),
    }).then((r) => r.data),
  quickConnect: (body: {
    input: string;
    mode: "new" | "existing";
    locationId?: string;
    name?: string;
    city?: string;
    country?: string;
    gmbProfileUrl?: string;
    businessType?: string;
    description?: string;
    highlights?: string[];
    keywords?: string[];
    tone?: string;
  }) =>
    apiFetch<{ location: LocationDto; resolved: ResolvedPlaceDto }>(
      "/api/private/google/quick-connect",
      { method: "POST", body: JSON.stringify(body) },
    ).then((r) => r.data),
};

export interface ResolvedPlaceDto {
  placeId: string;
  verified: boolean;
  name?: string | null;
  formattedAddress?: string | null;
  city?: string | null;
  country?: string | null;
  rating?: number | null;
  userRatingsTotal?: number | null;
  primaryType?: string | null;
  types?: string[] | null;
  editorialSummary?: string | null;
  websiteUri?: string | null;
  phone?: string | null;
}

export interface ReviewProfileDto {
  id: string;
  gmbProfileUrl: string | null;
  websiteUrl: string | null;
  websiteSummary: string | null;
  websiteFetchedAt: string | null;
  businessType: string | null;
  description: string | null;
  highlights: string[] | null;
  keywords: string[] | null;
  tone: string;
  aiContext: string | null;
  synthesizedAt: string | null;
}

export const reviewProfileApi = {
  get: (locationId: string) =>
    apiFetch<{
      location: {
        id: string;
        name: string;
        city: string;
        googlePlaceId: string | null;
      };
      profile: ReviewProfileDto | null;
    }>(`/api/private/locations/${locationId}/review-profile`).then(
      (r) => r.data,
    ),
  save: (
    locationId: string,
    body: {
      gmbProfileUrl?: string;
      websiteUrl?: string;
      businessType?: string;
      description?: string;
      highlights?: string[];
      keywords?: string[];
      tone?: string;
      aiContext?: string;
    },
  ) =>
    apiFetch<{ profile: ReviewProfileDto | null }>(
      `/api/private/locations/${locationId}/review-profile`,
      { method: "PUT", body: JSON.stringify(body) },
    ).then((r) => r.data),
};

// ------------------------------------------------------------------
// Analytics
// ------------------------------------------------------------------

export interface AnalyticsOverviewDto {
  totalReviews: number;
  averageRating: number;
  pendingReplies: number;
  repliedReviews: number;
  replyRate: number;
  reviewGrowth: { current: number; previous: number; pct: number };
  activeLocations: number;
  activeMembers: number;
  funnel: { views: number; redirects: number; conversionPct: number };
  qrScans: number;
  newPrivateFeedback: number;
  periodDays: number;
}

export interface ReviewAnalyticsDto {
  distribution: Array<{ star: number; count: number }>;
  sentiment: Array<{ sentiment: string; count: number }>;
  byLocation: Array<{
    locationId: string;
    name: string;
    city: string;
    count: number;
    averageRating: number;
  }>;
  series: Array<{ bucket: string; count: number; averageRating: number }>;
}

export interface FunnelAnalyticsDto {
  steps: Array<{ step: string; value: number }>;
  conversionPct: number;
  privateFeedback: number;
  ratingSelections: Array<{ star: number; count: number }>;
  series: Array<{ bucket: string; views: number; redirects: number }>;
}

export interface QrAnalyticsSummaryDto {
  byType: Array<{ type: string; codes: number; scans: number }>;
  topCodes: Array<{
    id: string;
    label: string;
    type: string;
    scanCount: number;
    uniqueScanCount: number;
  }>;
  scansThisPeriod: number;
  series: Array<{ bucket: string; scans: number; unique: number }>;
}

export const analyticsApi = {
  overview: (period = 30) =>
    apiFetch<AnalyticsOverviewDto>(
      `/api/private/analytics/overview?period=${period}`,
    ).then((r) => r.data),
  reviews: (period = 30, locationId?: string) => {
    const q = new URLSearchParams({ period: String(period) });
    if (locationId) q.set("locationId", locationId);
    return apiFetch<ReviewAnalyticsDto>(
      `/api/private/analytics/reviews?${q.toString()}`,
    ).then((r) => r.data);
  },
  funnel: (period = 30, locationId?: string) => {
    const q = new URLSearchParams({ period: String(period) });
    if (locationId) q.set("locationId", locationId);
    return apiFetch<FunnelAnalyticsDto>(
      `/api/private/analytics/funnel?${q.toString()}`,
    ).then((r) => r.data);
  },
  qr: (period = 30) =>
    apiFetch<QrAnalyticsSummaryDto>(`/api/private/analytics/qr?period=${period}`).then(
      (r) => r.data,
    ),
};

// ------------------------------------------------------------------
// QR Codes
// ------------------------------------------------------------------

export interface QrCodeDto {
  id: string;
  tenantId: string;
  locationId: string | null;
  type: "GOOGLE_REVIEW" | "WEBSITE" | "WHATSAPP" | "SOCIAL_MEDIA" | "MENU" | "CUSTOM";
  label: string;
  targetUrl: string;
  shortCode: string;
  status: "ACTIVE" | "PAUSED" | "ARCHIVED";
  darkColor: string | null;
  lightColor: string | null;
  scanCount: number;
  uniqueScanCount: number;
  lastScannedAt: string | null;
  createdAt: string;
  publicUrl: string;
  location: { id: string; name: string; slug: string; city: string } | null;
}

export interface QrAnalyticsDto {
  qr: {
    id: string;
    label: string;
    type: string;
    scanCount: number;
    uniqueScanCount: number;
    lastScannedAt: string | null;
  };
  byDevice: Array<{ device: string; count: number }>;
  byCountry: Array<{ country: string; count: number }>;
  recent: Array<{
    id: string;
    device: string | null;
    browser: string | null;
    os: string | null;
    country: string | null;
    isUnique: boolean;
    createdAt: string;
  }>;
  daily: Array<{ day: string; count: number }>;
}

export const qrApi = {
  list: (q: {
    page?: number;
    pageSize?: number;
    search?: string;
    type?: string;
    status?: string;
    locationId?: string;
    sortBy?: string;
    sortDir?: "asc" | "desc";
  }) => {
    const url = new URL("/api/private/qr", window.location.origin);
    for (const [k, v] of Object.entries(q)) {
      if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
    }
    return apiFetch<Paged<QrCodeDto>>(url.pathname + url.search).then((r) => r.data);
  },
  get: (id: string) => apiFetch<QrCodeDto>(`/api/private/qr/${id}`).then((r) => r.data),
  stats: () =>
    apiFetch<{ totalCodes: number; totalScans: number; totalUniqueScans: number }>(
      "/api/private/qr/stats",
    ).then((r) => r.data),
  create: (body: Record<string, unknown>) =>
    apiFetch<QrCodeDto>("/api/private/qr", {
      method: "POST",
      body: JSON.stringify(body),
    }).then((r) => r.data),
  update: (id: string, body: Record<string, unknown>) =>
    apiFetch<QrCodeDto>(`/api/private/qr/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }).then((r) => r.data),
  remove: (id: string) =>
    apiFetch(`/api/private/qr/${id}`, { method: "DELETE" }).then((r) => r.data),
  image: (id: string) =>
    apiFetch<{ dataUrl: string; url: string }>(
      `/api/private/qr/${id}/image?format=png`,
    ).then((r) => r.data),
  analytics: (id: string) =>
    apiFetch<QrAnalyticsDto>(`/api/private/qr/${id}/analytics`).then((r) => r.data),
};

// ------------------------------------------------------------------
// Media
// ------------------------------------------------------------------

export interface MediaAssetDto {
  id: string;
  tenantId: string;
  storageKey: string;
  filename: string;
  mimeType: string;
  kind: "IMAGE" | "VIDEO" | "AUDIO" | "DOCUMENT" | "OTHER";
  category: string;
  sizeBytes: string;
  sha256: string;
  width: number | null;
  height: number | null;
  duration: number | null;
  altText: string | null;
  caption: string | null;
  visibility: "PRIVATE" | "PUBLIC";
  status: "PROCESSING" | "READY" | "FAILED" | "DELETED";
  locationId: string | null;
  location: { id: string; name: string; slug: string; city: string } | null;
  uploadedById: string | null;
  uploadedBy: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    avatar: string | null;
  } | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
  url: string;
}

export const mediaApi = {
  list: (q: {
    page?: number;
    pageSize?: number;
    search?: string;
    category?: string;
    kind?: string;
    visibility?: string;
    locationId?: string;
    sortBy?: string;
    sortDir?: "asc" | "desc";
    includeDeleted?: boolean;
  }) => {
    const url = new URL("/api/private/media", window.location.origin);
    for (const [k, v] of Object.entries(q)) {
      if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
    }
    return apiFetch<Paged<MediaAssetDto>>(url.pathname + url.search).then((r) => r.data);
  },
  get: (id: string) =>
    apiFetch<MediaAssetDto>(`/api/private/media/${id}`).then((r) => r.data),
  update: (id: string, body: Record<string, unknown>) =>
    apiFetch<MediaAssetDto>(`/api/private/media/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }).then((r) => r.data),
  remove: (id: string) =>
    apiFetch(`/api/private/media/${id}`, { method: "DELETE" }).then((r) => r.data),
  bulkRemove: (ids: string[]) =>
    apiFetch<{ removedCount: number }>("/api/private/media/bulk/delete", {
      method: "POST",
      body: JSON.stringify({ ids }),
    }).then((r) => r.data),
  stats: () =>
    apiFetch<{
      totalBytes: string;
      capBytes: string;
      usagePercent: number;
      byCategory: Array<{ category: string; count: number; sizeBytes: string }>;
    }>("/api/private/media/stats").then((r) => r.data),

  /**
   * Multipart upload — bypasses apiFetch (which sets JSON content-type)
   * so the browser can set its own boundary.
   */
  upload: async (file: File, meta: Record<string, string>) => {
    const form = new FormData();
    form.append("file", file);
    if (Object.keys(meta).length > 0) {
      form.append("json", JSON.stringify(meta));
    }
    const res = await fetch("/api/private/media/upload", {
      method: "POST",
      body: form,
    });
    const body = (await res.json().catch(() => null)) as {
      success: boolean;
      data?: MediaAssetDto;
      error?: { code: string; message: string; fields?: Record<string, string> };
    } | null;
    if (!res.ok || !body?.success) {
      throw new ApiClientError(
        body?.error?.message ?? "Upload failed",
        body?.error?.code ?? "UPLOAD_FAILED",
        res.status,
        body?.error?.fields,
      );
    }
    return body.data as MediaAssetDto;
  },
};

// ------------------------------------------------------------------
// Google Posts
// ------------------------------------------------------------------

export type PostType = "STANDARD" | "EVENT" | "OFFER" | "ALERT";
export type PostStatus = "DRAFT" | "SCHEDULED" | "PUBLISHED" | "FAILED" | "DELETED";
export type PostCtaType =
  | "BOOK"
  | "ORDER"
  | "SHOP"
  | "LEARN_MORE"
  | "SIGN_UP"
  | "CALL"
  | "NONE";

export interface GooglePostDto {
  id: string;
  tenantId: string;
  locationId: string | null;
  type: PostType;
  status: PostStatus;
  title: string | null;
  body: string;
  mediaIds: string[] | null;
  ctaType: PostCtaType;
  ctaUrl: string | null;
  eventTitle: string | null;
  startDate: string | null;
  endDate: string | null;
  couponCode: string | null;
  termsConditions: string | null;
  redeemOnlineUrl: string | null;
  scheduledAt: string | null;
  publishedAt: string | null;
  failedAt: string | null;
  failReason: string | null;
  googlePostName: string | null;
  viewCount: number;
  clickCount: number;
  createdById: string | null;
  duplicatedFromId: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
  location?: { id: string; name: string; slug: string; city: string } | null;
}

export interface PostStatsDto {
  draft: number;
  scheduled: number;
  published: number;
  failed: number;
  total: number;
}

export const postsApi = {
  list: (q: {
    page?: number;
    pageSize?: number;
    locationId?: string;
    status?: string;
    type?: string;
    includeDeleted?: boolean;
    sortBy?: string;
    sortDir?: "asc" | "desc";
  }) => {
    const url = new URL("/api/private/posts", window.location.origin);
    for (const [k, v] of Object.entries(q)) {
      if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
    }
    return apiFetch<Paged<GooglePostDto>>(url.pathname + url.search).then(
      (r) => r.data,
    );
  },
  get: (id: string) =>
    apiFetch<GooglePostDto>(`/api/private/posts/${id}`).then((r) => r.data),
  stats: () =>
    apiFetch<PostStatsDto>("/api/private/posts/stats").then((r) => r.data),
  create: (body: Record<string, unknown>) =>
    apiFetch<GooglePostDto>("/api/private/posts", {
      method: "POST",
      body: JSON.stringify(body),
    }).then((r) => r.data),
  update: (id: string, body: Record<string, unknown>) =>
    apiFetch<GooglePostDto>(`/api/private/posts/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }).then((r) => r.data),
  remove: (id: string) =>
    apiFetch(`/api/private/posts/${id}`, { method: "DELETE" }).then((r) => r.data),
  publish: (id: string, body: { publishNow: boolean; scheduledAt?: string }) =>
    apiFetch<GooglePostDto>(`/api/private/posts/${id}/publish`, {
      method: "POST",
      body: JSON.stringify(body),
    }).then((r) => r.data),
  duplicate: (id: string) =>
    apiFetch<GooglePostDto>(`/api/private/posts/${id}/duplicate`, {
      method: "POST",
    }).then((r) => r.data),
  /** AI-drafted post content for the composer. */
  generate: (body: {
    locationId?: string;
    type?: PostType;
    topic?: string;
    tone?: string;
  }) =>
    apiFetch<{
      title: string | null;
      body: string;
      ctaType: PostCtaType;
      source: "ai" | "template";
    }>("/api/private/posts/generate", {
      method: "POST",
      body: JSON.stringify(body),
    }).then((r) => r.data),
  /** Prompt-driven social captions, one per selected platform. */
  socialGenerate: (body: {
    prompt: string;
    platforms: SocialPlatform[];
    locationId?: string;
    tone?: string;
    callToAction?: string;
    includeHashtags?: boolean;
    includeEmoji?: boolean;
  }) =>
    apiFetch<SocialGenerateResultDto>("/api/private/posts/social-generate", {
      method: "POST",
      body: JSON.stringify(body),
    }).then((r) => r.data),
};

export type SocialPlatform =
  | "INSTAGRAM"
  | "FACEBOOK"
  | "LINKEDIN"
  | "X"
  | "WHATSAPP";

export interface GeneratedSocialPostDto {
  platform: SocialPlatform;
  platformLabel: string;
  caption: string;
  hashtags: string[];
  charCount: number;
  truncated: boolean;
}

export interface SocialGenerateResultDto {
  posts: GeneratedSocialPostDto[];
  source: "ai" | "template";
}

// ------------------------------------------------------------------
// AI Review Insights
// ------------------------------------------------------------------

export interface ThemeStatDto {
  theme: string;
  count: number;
  averageRating: number;
  polarity: "positive" | "negative" | "mixed";
}

export interface InsightActionDto {
  title: string;
  detail: string;
  priority: "high" | "medium" | "low";
  basis?: string[];
}

export interface ReviewInsightsPayloadDto {
  metrics: {
    totalReviews: number;
    analyzedReviews: number;
    averageRating: number;
    ratingDistribution: Array<{ star: number; count: number }>;
    sentimentMix: Array<{ sentiment: string; count: number }>;
    trend: {
      currentCount: number;
      previousCount: number;
      countChangePct: number;
      currentAvgRating: number;
      previousAvgRating: number;
      ratingChange: number;
    };
    replyRate: number;
    unrepliedNegative: number;
  };
  topPraise: ThemeStatDto[];
  topComplaints: ThemeStatDto[];
  quotes: Array<{
    excerpt: string;
    starRating: number;
    sentiment: string | null;
    createdAt: string;
  }>;
  summary: string;
  strengths: string[];
  painPoints: string[];
  actions: InsightActionDto[];
}

export interface ReviewInsightsReportDto {
  payload: ReviewInsightsPayloadDto;
  source: "ai" | "heuristic";
  sampleSize: number;
  generatedAt: string;
  periodDays: number;
  locationId: string | null;
}

export const insightsApi = {
  get: (q: { periodDays?: number; locationId?: string } = {}) => {
    const url = new URL(
      "/api/private/analytics/insights",
      window.location.origin,
    );
    for (const [k, v] of Object.entries(q)) {
      if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
    }
    return apiFetch<{ report: ReviewInsightsReportDto | null }>(
      url.pathname + url.search,
    ).then((r) => r.data);
  },
  generate: (body: { periodDays?: number; locationId?: string } = {}) =>
    apiFetch<{ report: ReviewInsightsReportDto }>(
      "/api/private/analytics/insights",
      { method: "POST", body: JSON.stringify(body) },
    ).then((r) => r.data),
};
