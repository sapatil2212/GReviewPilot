/**
 * Zod schemas for the QR Code module.
 */

import { QrStatus, QrType } from "@prisma/client";
import { z } from "zod";

const hexColor = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "Color must be a hex code like #0f172a");

export const createQrSchema = z
  .object({
    type: z.nativeEnum(QrType).default(QrType.CUSTOM),
    label: z.string().trim().min(1, "Label is required").max(150),
    locationId: z.string().cuid().optional(),

    // For CUSTOM / WEBSITE / SOCIAL_MEDIA / MENU: the destination URL.
    targetUrl: z
      .string()
      .trim()
      .max(2000)
      .optional()
      .transform((v) => (v ? v : undefined)),

    // For WHATSAPP: build a wa.me link from these.
    whatsappNumber: z
      .string()
      .trim()
      .max(20)
      .optional()
      .transform((v) => (v ? v.replace(/[^\d]/g, "") : undefined)),
    whatsappMessage: z.string().trim().max(500).optional(),

    darkColor: hexColor.optional(),
    lightColor: hexColor.optional(),
  })
  .refine(
    (v) =>
      v.type === QrType.GOOGLE_REVIEW ||
      v.type === QrType.WHATSAPP ||
      Boolean(v.targetUrl),
    { message: "A target URL is required for this QR type", path: ["targetUrl"] },
  )
  .refine((v) => v.type !== QrType.WHATSAPP || Boolean(v.whatsappNumber), {
    message: "A WhatsApp number is required",
    path: ["whatsappNumber"],
  })
  .refine(
    (v) => v.type !== QrType.GOOGLE_REVIEW || Boolean(v.locationId),
    { message: "Select a location for a Google review QR", path: ["locationId"] },
  );
export type CreateQrInput = z.infer<typeof createQrSchema>;

export const updateQrSchema = z.object({
  label: z.string().trim().min(1).max(150).optional(),
  targetUrl: z.string().trim().max(2000).optional(),
  status: z.nativeEnum(QrStatus).optional(),
  darkColor: hexColor.optional(),
  lightColor: hexColor.optional(),
  locationId: z.string().cuid().nullable().optional(),
});
export type UpdateQrInput = z.infer<typeof updateQrSchema>;

export const listQrQuerySchema = z.object({
  type: z.nativeEnum(QrType).optional(),
  status: z.nativeEnum(QrStatus).optional(),
  locationId: z.string().cuid().optional(),
});
export type ListQrQuery = z.infer<typeof listQrQuerySchema>;
