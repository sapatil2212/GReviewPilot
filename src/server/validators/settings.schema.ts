/**
 * Workspace settings validators.
 *
 * Currently scoped to email/SMTP delivery for website leads. Kept in its own
 * file so the settings surface can grow (notifications, locale, AI defaults)
 * without bloating the large site.schema.ts.
 */

import { z } from "zod";

/**
 * SMTP connection details a tenant supplies to send lead notifications from
 * their own mail server. `password` is optional on update: an empty value
 * means "keep the stored password", so the client never has to re-send (or
 * even receive) the secret to change the host or port.
 */
export const updateSmtpSchema = z.object({
  host: z.string().trim().min(1).max(255),
  port: z.coerce.number().int().min(1).max(65535),
  secure: z.boolean().default(false),
  username: z.string().trim().min(1).max(320),
  password: z.string().max(1024).optional(),
  fromEmail: z.string().trim().email().max(320),
  fromName: z.string().trim().max(120).optional(),
});

export const updateLeadNotificationSchema = z.object({
  /** Where website leads are emailed. Empty string clears it. */
  leadNotificationEmail: z.union([z.string().trim().email().max(320), z.literal("")]),
});

export const testSmtpSchema = z.object({
  /** Optional override; defaults to the owner's email on the server. */
  to: z.string().trim().email().max(320).optional(),
});

export type UpdateSmtpInput = z.infer<typeof updateSmtpSchema>;
export type UpdateLeadNotificationInput = z.infer<typeof updateLeadNotificationSchema>;
export type TestSmtpInput = z.infer<typeof testSmtpSchema>;
