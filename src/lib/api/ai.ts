/**
 * Typed client for the AI Business Personality and reply engine.
 *
 * Mirrors the conventions in lib/api/site.ts: one method per route, every
 * request through apiFetch, no hand-built URLs in components.
 *
 * Option catalogs and wizard steps are fetched rather than imported from
 * src/server/ai/personality.types so the browser bundle does not pull in server
 * modules, and so the form can never offer an option the API would reject.
 */

import { apiFetch } from "@/lib/fetcher";

// =====================================================================
// DTOs
// =====================================================================

export type EmojiUsageDto = "NEVER" | "RARELY" | "SOMETIMES" | "FREQUENTLY";
export type ReplyLengthDto = "VERY_SHORT" | "SHORT" | "MEDIUM" | "DETAILED";
export type ApprovalModeDto = "AUTO_SEND" | "DRAFT_ONLY" | "MANAGER_APPROVAL";
export type ConfidenceLevelDto = "CONSERVATIVE" | "BALANCED" | "CREATIVE";
export type AppreciationPolicyDto = "ALWAYS" | "POSITIVE_ONLY" | "NEVER";
export type ReplySentimentDto =
  | "VERY_POSITIVE"
  | "POSITIVE"
  | "NEUTRAL"
  | "MIXED"
  | "NEGATIVE"
  | "VERY_NEGATIVE";
export type DraftStatusDto =
  | "DRAFT"
  | "PENDING_APPROVAL"
  | "APPROVED"
  | "SENT"
  | "REJECTED"
  | "DISCARDED";

export interface PersonalityDto {
  businessName: string | null;
  businessType: string | null;
  industry: string | null;
  shortDescription: string | null;
  uniqueness: string | null;
  values: string[];
  communicationStyles: string[];
  greetingStyle: string | null;
  signature: string | null;
  emojiUsage: EmojiUsageDto;
  replyLength: ReplyLengthDto;
  primaryLanguage: string;
  secondaryLanguages: string[];
  autoDetectLanguage: boolean;
  translateBeforeReply: boolean;
  appreciationPolicy: AppreciationPolicyDto;
  appreciationMessage: string | null;
  negativeStrategies: string[];
  positiveStrategies: string[];
  services: string[];
  products: string[];
  pricingPhilosophy: string | null;
  guarantees: string | null;
  usp: string | null;
  experience: string | null;
  certifications: string[];
  awards: string[];
  businessStory: string | null;
  neverSay: string[];
  complianceRules: string[];
  complianceNotes: string | null;
  approvalMode: ApprovalModeDto;
  confidenceLevel: ConfidenceLevelDto;
  completedSteps: string[];
  complete: boolean;
  revision: number;
  completedAt: string | null;
  suggestions: {
    businessName: string | null;
    industry: string | null;
    shortDescription: string | null;
    city: string | null;
  };
}

/** Patch shape. Every field optional — the wizard saves a step at a time. */
export type PersonalityPatch = Partial<
  Omit<PersonalityDto, "complete" | "revision" | "completedAt" | "completedSteps" | "suggestions">
> & {
  /** Marks a step answered, appended to the completed set. */
  completedStep?: string;
};

export interface OptionDto {
  value: string;
  label: string;
  hint?: string;
}

export interface WizardStepDto {
  id: string;
  title: string;
  question: string;
  required: boolean;
}

export interface PersonalityOptionsDto {
  steps: WizardStepDto[];
  values: string[];
  communicationStyles: string[];
  greetings: OptionDto[];
  emojiUsage: OptionDto[];
  replyLength: OptionDto[];
  appreciation: OptionDto[];
  negativeStrategies: OptionDto[];
  positiveStrategies: OptionDto[];
  approvalModes: OptionDto[];
  confidenceLevels: OptionDto[];
  commonNeverSay: string[];
  complianceSectors: string[];
}

export interface PromptSectionDto {
  id: string;
  label: string;
  lines: string[];
}

export interface KnowledgeDto {
  knowledge: unknown;
  sections: PromptSectionDto[];
  contextPreview: string;
}

export interface HumanizationIssueDto {
  code: string;
  detail: string;
  severity: "block" | "warn";
}

export interface GeneratedDraftDto {
  id: string | null;
  text: string;
  source: "ai" | "template";
  sentiment: ReplySentimentDto;
  status: DraftStatusDto;
  issues: HumanizationIssueDto[];
  escalated: boolean;
  escalationReasons: string[];
  attempts: number;
  sections: PromptSectionDto[];
  language: string;
}

export interface DraftListItemDto {
  id: string;
  reviewId: string | null;
  status: DraftStatusDto;
  generatedText: string;
  editedText: string | null;
  sentText: string | null;
  sentiment: ReplySentimentDto | null;
  starRating: number | null;
  source: string;
  createdAt: string;
  sentAt: string | null;
  review: {
    id: string;
    reviewerName: string | null;
    starRating: number;
    comment: string | null;
  } | null;
}

export interface DraftsPageDto {
  items: DraftListItemDto[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AiAnalyticsDto {
  periodDays: number;
  generated: number;
  approved: number;
  sent: number;
  edited: number;
  rejected: number;
  pending: number;
  editRate: number | null;
  avgApprovalMs: number | null;
  avgRatingRepliedTo: number | null;
  estimatedMinutesSaved: number;
  /** How estimatedMinutesSaved was derived, so the UI can caveat it. */
  estimateBasis: string;
  aiShare: number | null;
}

// =====================================================================
// Client
// =====================================================================

const base = "/api/private/ai";

export const aiPersonalityApi = {
  async get() {
    const { data } = await apiFetch<PersonalityDto>(`${base}/personality`);
    return data;
  },

  async options() {
    const { data } = await apiFetch<PersonalityOptionsDto>(`${base}/personality/options`);
    return data;
  },

  async save(patch: PersonalityPatch) {
    const { data } = await apiFetch<PersonalityDto>(`${base}/personality`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
    return data;
  },

  async reset() {
    const { data } = await apiFetch<PersonalityDto>(`${base}/personality`, { method: "DELETE" });
    return data;
  },

  async knowledge() {
    const { data } = await apiFetch<KnowledgeDto>(`${base}/personality/knowledge`);
    return data;
  },
};

export const aiReplyApi = {
  /** Draft a reply to a made-up review. Persists nothing. */
  async preview(input: {
    starRating: number;
    comment?: string;
    reviewerName?: string;
    language?: string;
  }) {
    const { data } = await apiFetch<GeneratedDraftDto>(`${base}/reply/preview`, {
      method: "POST",
      body: JSON.stringify(input),
    });
    return data;
  },

  /** Draft and persist a reply for a real review. */
  async generate(reviewId: string, regenerate = false) {
    const { data } = await apiFetch<GeneratedDraftDto>(`${base}/reply/generate`, {
      method: "POST",
      body: JSON.stringify({ reviewId, regenerate }),
    });
    return data;
  },

  async listDrafts(params: {
    status?: DraftStatusDto;
    reviewId?: string;
    page?: number;
    pageSize?: number;
  } = {}) {
    const query = new URLSearchParams();
    if (params.status) query.set("status", params.status);
    if (params.reviewId) query.set("reviewId", params.reviewId);
    if (params.page) query.set("page", String(params.page));
    if (params.pageSize) query.set("pageSize", String(params.pageSize));
    const suffix = query.size > 0 ? `?${query.toString()}` : "";
    const { data } = await apiFetch<DraftsPageDto>(`${base}/reply/drafts${suffix}`);
    return data;
  },

  async decide(
    draftId: string,
    input: { action: "approve" | "reject" | "send" | "discard"; editedText?: string; reason?: string },
  ) {
    const { data, message } = await apiFetch<{
      id: string;
      status: DraftStatusDto;
      sentText: string | null;
    }>(`${base}/reply/drafts/${draftId}`, { method: "POST", body: JSON.stringify(input) });
    return { ...data, message };
  },

  async analytics(days = 30) {
    const { data } = await apiFetch<AiAnalyticsDto>(`${base}/analytics?days=${days}`);
    return data;
  },
};
