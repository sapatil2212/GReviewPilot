/**
 * Business Personality service.
 *
 * Owns the onboarding lifecycle and, more importantly, `getKnowledge()` — the
 * single entry point every AI feature uses to ask "who is this business and how
 * do they speak?". Features must go through this rather than reading the table
 * directly, because the answer is not just the row: it is the row merged with
 * the tenant's real business data, with defaults filled in for anything not yet
 * answered. Centralising that means a half-finished personality still produces
 * a usable voice instead of an empty prompt.
 */

import { AuditAction } from "@prisma/client";
import type { AuthContext } from "@/server/auth/requireSession";
import { businessPersonalityRepository } from "@/server/repositories/businessPersonality.repository";
import { auditRepository } from "@/server/repositories/audit.repository";
import { extractRequestContext } from "@/server/middleware/requestContext";
import { loadTenantContext } from "@/server/services/site.service";
import { NotFoundError } from "@/server/utils/errors";
import {
  isComplete,
  type AiConfidenceLevel,
  type AppreciationPolicy,
  type BusinessKnowledge,
  type EmojiUsage,
  type NegativeStrategy,
  type PositiveStrategy,
  type ReplyApprovalMode,
  type ReplyLength,
} from "@/server/ai/personality.types";
import type { UpdatePersonalityInput } from "@/server/validators/ai.schema";

/** Read a Json column that should hold string[], tolerating anything else. */
function readStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string" && v.trim().length > 0);
}

/**
 * Strategy defaults, applied when a business has not answered those steps.
 *
 * Chosen to be the safe, uncontroversial behaviour rather than the most
 * feature-rich: apologise, empathise, take it offline, never argue. A business
 * that skips the negative-review step still gets replies it would not be
 * embarrassed by.
 */
const DEFAULT_NEGATIVE: NegativeStrategy[] = [
  "APOLOGIZE_FIRST",
  "SHOW_EMPATHY",
  "INVITE_OFFLINE",
  "NEVER_ARGUE",
  "ESCALATE_SERIOUS",
];

const DEFAULT_POSITIVE: PositiveStrategy[] = ["INVITE_RETURN"];

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
  emojiUsage: EmojiUsage;
  replyLength: ReplyLength;
  primaryLanguage: string;
  secondaryLanguages: string[];
  autoDetectLanguage: boolean;
  translateBeforeReply: boolean;
  appreciationPolicy: AppreciationPolicy;
  appreciationMessage: string | null;
  negativeStrategies: NegativeStrategy[];
  positiveStrategies: PositiveStrategy[];
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
  approvalMode: ReplyApprovalMode;
  confidenceLevel: AiConfidenceLevel;
  completedSteps: string[];
  complete: boolean;
  revision: number;
  /** Null until the wizard's required steps are all answered. */
  completedAt: string | null;
  /**
   * Suggested values pulled from the workspace's existing business data, so
   * step 1 arrives pre-filled instead of blank.
   */
  suggestions: {
    businessName: string | null;
    industry: string | null;
    shortDescription: string | null;
    city: string | null;
  };
}

export const businessPersonalityService = {
  /** Current personality, or sensible defaults when onboarding hasn't started. */
  async get(ctx: AuthContext): Promise<PersonalityDto> {
    const [row, tenantContext] = await Promise.all([
      businessPersonalityRepository.findByTenantId(ctx.tenantId),
      loadTenantContext(ctx).catch(() => null),
    ]);

    const completedSteps = readStringList(row?.completedSteps);

    return {
      businessName: row?.businessName ?? null,
      businessType: row?.businessType ?? null,
      industry: row?.industry ?? null,
      shortDescription: row?.shortDescription ?? null,
      uniqueness: row?.uniqueness ?? null,
      values: readStringList(row?.values),
      communicationStyles: readStringList(row?.communicationStyles),
      greetingStyle: row?.greetingStyle ?? null,
      signature: row?.signature ?? null,
      emojiUsage: (row?.emojiUsage ?? "NEVER") as EmojiUsage,
      replyLength: (row?.replyLength ?? "SHORT") as ReplyLength,
      primaryLanguage: row?.primaryLanguage ?? tenantContext?.language ?? "en",
      secondaryLanguages: readStringList(row?.secondaryLanguages),
      autoDetectLanguage: row?.autoDetectLanguage ?? true,
      translateBeforeReply: row?.translateBeforeReply ?? false,
      appreciationPolicy: (row?.appreciationPolicy ?? "ALWAYS") as AppreciationPolicy,
      appreciationMessage: row?.appreciationMessage ?? null,
      negativeStrategies: row
        ? (readStringList(row.negativeStrategies) as NegativeStrategy[])
        : DEFAULT_NEGATIVE,
      positiveStrategies: row
        ? (readStringList(row.positiveStrategies) as PositiveStrategy[])
        : DEFAULT_POSITIVE,
      services: readStringList(row?.services),
      products: readStringList(row?.products),
      pricingPhilosophy: row?.pricingPhilosophy ?? null,
      guarantees: row?.guarantees ?? null,
      usp: row?.usp ?? null,
      experience: row?.experience ?? null,
      certifications: readStringList(row?.certifications),
      awards: readStringList(row?.awards),
      businessStory: row?.businessStory ?? null,
      neverSay: readStringList(row?.neverSay),
      complianceRules: readStringList(row?.complianceRules),
      complianceNotes: row?.complianceNotes ?? null,
      approvalMode: (row?.approvalMode ?? "DRAFT_ONLY") as ReplyApprovalMode,
      confidenceLevel: (row?.confidenceLevel ?? "BALANCED") as AiConfidenceLevel,
      completedSteps,
      complete: isComplete(completedSteps),
      revision: row?.revision ?? 0,
      completedAt: row?.completedAt?.toISOString() ?? null,
      suggestions: {
        businessName: tenantContext?.businessName ?? null,
        industry: tenantContext?.industry ?? null,
        shortDescription: tenantContext?.description ?? null,
        city: tenantContext?.city ?? null,
      },
    };
  },

  /**
   * Apply one step's answers.
   *
   * Patch semantics, because the wizard auto-saves per step and must never
   * clear an answer the user gave earlier. `completedStep` is merged into the
   * set rather than replacing it, so revisiting a step is idempotent and going
   * back never loses progress.
   */
  async update(ctx: AuthContext, input: UpdatePersonalityInput, req?: Request) {
    const { completedStep, ...fields } = input;

    const existing = await businessPersonalityRepository.findByTenantId(ctx.tenantId);
    const priorSteps = readStringList(existing?.completedSteps);
    const steps = completedStep
      ? Array.from(new Set([...priorSteps, completedStep]))
      : priorSteps;

    const nowComplete = isComplete(steps);
    const wasComplete = isComplete(priorSteps);

    await businessPersonalityRepository.upsert(ctx.tenantId, {
      ...fields,
      completedSteps: steps,
      // Stamped once, on the transition. Re-stamping on every later edit would
      // lose the date onboarding was actually finished.
      ...(nowComplete && !wasComplete ? { completedAt: new Date() } : {}),
    });

    const rc = req ? extractRequestContext(req) : null;
    await auditRepository.record({
      action:
        nowComplete && !wasComplete
          ? AuditAction.AI_PERSONALITY_COMPLETED
          : AuditAction.AI_PERSONALITY_UPDATED,
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      metadata: { step: completedStep ?? null, fields: Object.keys(fields) },
      ...(rc ? { ipAddress: rc.ipAddress, userAgent: rc.userAgent, browser: rc.browser, device: rc.device } : {}),
    });

    return this.get(ctx);
  },

  /**
   * The knowledge base every AI feature consumes.
   *
   * Merges the personality with live business data so a feature never has to
   * know which of the two a fact came from. Personality wins where it is set —
   * it is what the business chose to say about itself — with the workspace
   * record as the fallback.
   */
  async getKnowledge(ctx: AuthContext, locationId?: string | null): Promise<BusinessKnowledge> {
    const [row, tenantContext] = await Promise.all([
      businessPersonalityRepository.findByTenantId(ctx.tenantId),
      loadTenantContext(ctx, locationId).catch(() => null),
    ]);

    const completedSteps = readStringList(row?.completedSteps);
    const negative = readStringList(row?.negativeStrategies) as NegativeStrategy[];
    const positive = readStringList(row?.positiveStrategies) as PositiveStrategy[];

    return {
      identity: {
        businessName:
          row?.businessName?.trim() || tenantContext?.businessName || "our business",
        businessType: row?.businessType ?? null,
        industry: row?.industry ?? tenantContext?.industry ?? null,
        shortDescription: row?.shortDescription ?? tenantContext?.description ?? null,
        uniqueness: row?.uniqueness ?? null,
        city: tenantContext?.city ?? null,
      },
      voice: {
        values: readStringList(row?.values),
        communicationStyles: readStringList(row?.communicationStyles),
        greetingStyle: row?.greetingStyle?.trim() || null,
        signature: row?.signature?.trim() || null,
        emojiUsage: (row?.emojiUsage ?? "NEVER") as EmojiUsage,
        replyLength: (row?.replyLength ?? "SHORT") as ReplyLength,
        confidenceLevel: (row?.confidenceLevel ?? "BALANCED") as AiConfidenceLevel,
      },
      language: {
        primary: row?.primaryLanguage ?? tenantContext?.language ?? "en",
        secondary: readStringList(row?.secondaryLanguages),
        autoDetect: row?.autoDetectLanguage ?? true,
        translateBeforeReply: row?.translateBeforeReply ?? false,
      },
      replyBehaviour: {
        appreciationPolicy: (row?.appreciationPolicy ?? "ALWAYS") as AppreciationPolicy,
        appreciationMessage: row?.appreciationMessage ?? null,
        // Empty means "not answered", not "no strategy" — an empty list would
        // strip all guidance from apology replies, which is the last place to
        // leave the engine unguided.
        negativeStrategies: negative.length > 0 ? negative : DEFAULT_NEGATIVE,
        positiveStrategies: positive.length > 0 ? positive : DEFAULT_POSITIVE,
      },
      offering: {
        services: readStringList(row?.services),
        products: readStringList(row?.products),
        pricingPhilosophy: row?.pricingPhilosophy ?? null,
        guarantees: row?.guarantees ?? null,
        usp: row?.usp ?? null,
        experience: row?.experience ?? null,
        certifications: readStringList(row?.certifications),
        awards: readStringList(row?.awards),
        businessStory: row?.businessStory ?? null,
      },
      restrictions: {
        neverSay: readStringList(row?.neverSay),
        complianceRules: readStringList(row?.complianceRules),
        complianceNotes: row?.complianceNotes ?? null,
      },
      automation: {
        approvalMode: (row?.approvalMode ?? "DRAFT_ONLY") as ReplyApprovalMode,
      },
      meta: {
        revision: row?.revision ?? 0,
        complete: isComplete(completedSteps),
      },
    };
  },

  async reset(ctx: AuthContext) {
    const existing = await businessPersonalityRepository.findByTenantId(ctx.tenantId);
    if (!existing) throw new NotFoundError("No business personality to reset");
    await businessPersonalityRepository.delete(ctx.tenantId);
    await auditRepository.record({
      action: AuditAction.AI_PERSONALITY_UPDATED,
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      metadata: { reset: true },
    });
    return this.get(ctx);
  },
};
