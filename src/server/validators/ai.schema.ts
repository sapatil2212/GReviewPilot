/**
 * AI Business Personality validators.
 *
 * Option lists are derived from personality.types.ts rather than restated here,
 * so adding a communication style or a negative-review strategy is a one-line
 * change that the API accepts automatically. Restating them would guarantee the
 * form and the API eventually disagree about what is valid.
 *
 * Every field is optional: the wizard saves after each step, so a request
 * legitimately carries one answer at a time. Completeness is tracked by
 * `completedSteps`, not by which columns happen to be filled.
 */

import { z } from "zod";
import {
  COMMUNICATION_STYLES,
  NEGATIVE_STRATEGIES,
  POSITIVE_STRATEGIES,
  WIZARD_STEPS,
} from "@/server/ai/personality.types";

const stepIds = WIZARD_STEPS.map((s) => s.id) as [string, ...string[]];

/** Trimmed, de-duplicated, capped string list. Empty entries are dropped. */
function stringList(max: number, itemMax = 120) {
  return z
    .array(z.string().trim().min(1).max(itemMax))
    .max(max)
    .transform((items) => Array.from(new Set(items.map((i) => i.trim()))).filter(Boolean));
}

/** BCP-47-ish. Deliberately permissive: "en", "en-GB", "pt-BR" all pass. */
const languageCode = z
  .string()
  .trim()
  .min(2)
  .max(10)
  .regex(/^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})?$/, "Use a language code like 'en' or 'pt-BR'");

/**
 * Personality patch.
 *
 * `.strict()` is deliberate: a typo'd key would otherwise be silently dropped
 * and the user would think their answer saved.
 */
export const updatePersonalitySchema = z
  .object({
    // Step 1
    businessName: z.string().trim().max(200).optional(),
    businessType: z.string().trim().max(120).optional(),
    industry: z.string().trim().max(120).optional(),
    shortDescription: z.string().trim().max(2000).optional(),
    uniqueness: z.string().trim().max(2000).optional(),

    // Step 2 — custom values allowed, so this is a free list, not an enum.
    values: stringList(20).optional(),

    // Step 3 — constrained to the catalog, since the prompt builder maps them.
    communicationStyles: z.array(z.enum(COMMUNICATION_STYLES)).max(5).optional(),

    // Steps 4-7
    greetingStyle: z.string().trim().max(120).optional(),
    signature: z.string().trim().max(200).optional(),
    emojiUsage: z.enum(["NEVER", "RARELY", "SOMETIMES", "FREQUENTLY"]).optional(),
    replyLength: z.enum(["VERY_SHORT", "SHORT", "MEDIUM", "DETAILED"]).optional(),

    // Step 8
    primaryLanguage: languageCode.optional(),
    secondaryLanguages: z.array(languageCode).max(10).optional(),
    autoDetectLanguage: z.boolean().optional(),
    translateBeforeReply: z.boolean().optional(),

    // Step 9
    appreciationPolicy: z.enum(["ALWAYS", "POSITIVE_ONLY", "NEVER"]).optional(),
    appreciationMessage: z.string().trim().max(500).optional(),

    // Steps 10-11
    negativeStrategies: z.array(z.enum(NEGATIVE_STRATEGIES)).max(10).optional(),
    positiveStrategies: z.array(z.enum(POSITIVE_STRATEGIES)).max(10).optional(),

    // Step 12
    services: stringList(50).optional(),
    products: stringList(50).optional(),
    pricingPhilosophy: z.string().trim().max(1000).optional(),
    guarantees: z.string().trim().max(1000).optional(),
    usp: z.string().trim().max(1000).optional(),
    experience: z.string().trim().max(500).optional(),
    certifications: stringList(30).optional(),
    awards: stringList(30).optional(),
    businessStory: z.string().trim().max(3000).optional(),

    // Steps 13-14
    neverSay: stringList(40, 200).optional(),
    complianceRules: stringList(15).optional(),
    complianceNotes: z.string().trim().max(2000).optional(),

    // Steps 15-16
    approvalMode: z.enum(["AUTO_SEND", "DRAFT_ONLY", "MANAGER_APPROVAL"]).optional(),
    confidenceLevel: z.enum(["CONSERVATIVE", "BALANCED", "CREATIVE"]).optional(),

    /** Step just answered, appended to the completed set. */
    completedStep: z.enum(stepIds).optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to update" });

/**
 * Preview request.
 *
 * Takes a hypothetical review rather than a stored one so a business can test
 * its personality before any reviews exist — which is exactly when they are
 * setting it up.
 */
export const previewReplySchema = z.object({
  starRating: z.coerce.number().int().min(1).max(5),
  comment: z.string().trim().max(4000).optional(),
  reviewerName: z.string().trim().max(120).optional(),
  /** Overrides auto-detection for testing a specific language. */
  language: languageCode.optional(),
});

/** Generate a draft for a real review. */
export const generateDraftSchema = z.object({
  reviewId: z.string().min(1).max(40),
  /** Set when asking for a different take on the same review. */
  regenerate: z.boolean().default(false),
});

export const listDraftsSchema = z.object({
  status: z
    .enum(["DRAFT", "PENDING_APPROVAL", "APPROVED", "SENT", "REJECTED", "DISCARDED"])
    .optional(),
  reviewId: z.string().max(40).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

/**
 * Draft decision.
 *
 * `editedText` is captured separately from the original rather than overwriting
 * it: the difference between what the engine wrote and what a human sent is the
 * learning signal, and overwriting would destroy it.
 */
export const decideDraftSchema = z.object({
  action: z.enum(["approve", "reject", "send", "discard"]),
  editedText: z.string().trim().min(1).max(4000).optional(),
  /** Recorded on a rejection so patterns in refusals are visible. */
  reason: z.string().trim().max(500).optional(),
});

export const analyticsRangeSchema = z.object({
  days: z.coerce.number().int().min(1).max(365).default(30),
});

export type UpdatePersonalityInput = z.infer<typeof updatePersonalitySchema>;
export type PreviewReplyInput = z.infer<typeof previewReplySchema>;
export type GenerateDraftInput = z.infer<typeof generateDraftSchema>;
export type ListDraftsInput = z.infer<typeof listDraftsSchema>;
export type DecideDraftInput = z.infer<typeof decideDraftSchema>;
