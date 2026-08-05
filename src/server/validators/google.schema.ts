/**
 * Zod schemas for the Google Business Integration module.
 */

import { SyncKind, SyncStatus } from "@prisma/client";
import { z } from "zod";

// OAuth state token payload — signed with AUTH_SECRET-derived HMAC
// (see src/server/utils/crypto.ts) and echoed via the `state` query
// parameter through Google's consent screen.
export const oauthStateSchema = z.object({
  tid: z.string().cuid(),
  uid: z.string().cuid(),
  nonce: z.string().min(16),
  exp: z.number().int(),
});
export type OauthState = z.infer<typeof oauthStateSchema>;

export const googleCallbackQuerySchema = z.object({
  code: z.string().min(1).optional(),
  state: z.string().min(1).optional(),
  error: z.string().optional(),
  error_description: z.string().optional(),
});

export const syncTriggerSchema = z.object({
  kind: z.nativeEnum(SyncKind).default(SyncKind.LOCATIONS),
});
export type SyncTriggerInput = z.infer<typeof syncTriggerSchema>;

export const linkLocationSchema = z.object({
  localLocationId: z.string().cuid(),
});
export type LinkLocationInput = z.infer<typeof linkLocationSchema>;

export const listSyncRunsQuerySchema = z.object({
  kind: z.nativeEnum(SyncKind).optional(),
  status: z.nativeEnum(SyncStatus).optional(),
});

// ---------- Quick Connect (Maps URL / Place ID, no OAuth) ----------

export const quickConnectSchema = z.object({
  // Raw Place ID or a Google Maps URL.
  input: z.string().trim().min(3).max(2000),
  // Where to apply the resolved Place ID:
  //  - "existing": attach to an existing location (locationId required)
  //  - "new": create a lightweight location from the resolved details
  mode: z.enum(["existing", "new"]).default("new"),
  locationId: z.string().cuid().optional(),
  // Overrides / fallbacks when Places API isn't verifying.
  name: z.string().trim().max(150).optional(),
  city: z.string().trim().max(100).optional(),
  country: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/, "Country must be a 2-letter ISO code")
    .optional(),

  // --- AI review context (optional but recommended) ---
  gmbProfileUrl: z.string().trim().max(1000).optional(),
  businessType: z.string().trim().max(150).optional(),
  description: z.string().trim().max(2000).optional(),
  highlights: z.array(z.string().trim().max(80)).max(15).optional(),
  keywords: z.array(z.string().trim().max(80)).max(15).optional(),
  tone: z.enum(["warm", "professional", "casual", "enthusiastic"]).optional(),
});
export type QuickConnectInput = z.infer<typeof quickConnectSchema>;

export const previewPlaceSchema = z.object({
  input: z.string().trim().min(3).max(2000),
});
