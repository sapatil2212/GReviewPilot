/**
 * Per-tenant email delivery settings.
 *
 * Stored inside the existing `Tenant.settings` JSON blob (under an `email`
 * key) rather than a dedicated table, so connecting SMTP needs no migration.
 * The SMTP password is encrypted at rest with the same AES-256-GCM helper
 * used for OAuth tokens and is NEVER returned to the client — the API exposes
 * only whether a config exists and its non-secret fields.
 */

import type { AuthContext } from "@/server/auth/requireSession";
import { tenantRepository } from "@/server/repositories/tenant.repository";
import { emailService } from "@/server/email/email.service";
import { verifySmtp, type SmtpTransportConfig } from "@/server/email/client";
import { decrypt, encrypt } from "@/server/utils/crypto";
import { NotFoundError, ValidationError } from "@/server/utils/errors";
import { logger } from "@/server/utils/logger";
import type {
  TestSmtpInput,
  UpdateLeadNotificationInput,
  UpdateSmtpInput,
} from "@/server/validators/settings.schema";

/** Stored shape inside Tenant.settings.email. `passwordEnc` is ciphertext. */
interface StoredSmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  username: string;
  passwordEnc: string;
  fromEmail: string;
  fromName?: string;
}

interface StoredEmailSettings {
  smtp?: StoredSmtpConfig;
  leadNotificationEmail?: string;
}

/** Non-secret view returned to the dashboard. */
export interface EmailSettingsDto {
  smtpConfigured: boolean;
  smtp: {
    host: string;
    port: number;
    secure: boolean;
    username: string;
    fromEmail: string;
    fromName: string | null;
  } | null;
  leadNotificationEmail: string | null;
  /** The workspace owner address leads always copy, for display. */
  ownerEmail: string | null;
}

/** What the public submit route needs to deliver a lead. */
export interface LeadDelivery {
  smtp?: SmtpTransportConfig;
  /** Owner + configured notification address, deduped by the caller with form recipients. */
  recipients: string[];
}

function readSettings(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
}

function readEmail(raw: unknown): StoredEmailSettings {
  const settings = readSettings(raw);
  const email = settings.email;
  return email && typeof email === "object" ? (email as StoredEmailSettings) : {};
}

/** Turn a stored config into a usable transport config, decrypting the password. */
function toTransportConfig(smtp: StoredSmtpConfig): SmtpTransportConfig | null {
  try {
    return {
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      username: smtp.username,
      password: decrypt(smtp.passwordEnc),
      fromEmail: smtp.fromEmail,
      fromName: smtp.fromName,
    };
  } catch (err) {
    // A key rotation (AUTH_SECRET/ENCRYPTION_KEY change) invalidates old
    // ciphertext. Fail soft: the lead still lands in the dashboard, just not
    // this mailbox, and the tenant is prompted to reconnect.
    logger.error("Failed to decrypt tenant SMTP password", {
      err: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

async function persist(tenantId: string, email: StoredEmailSettings) {
  const tenant = await tenantRepository.findById(tenantId);
  if (!tenant) throw new NotFoundError("Workspace not found");
  const settings = readSettings(tenant.settings);
  await tenantRepository.update(tenantId, {
    settings: { ...settings, email } as object,
  });
}

export const emailSettingsService = {
  async get(ctx: AuthContext): Promise<EmailSettingsDto> {
    const tenant = await tenantRepository.findById(ctx.tenantId);
    if (!tenant) throw new NotFoundError("Workspace not found");
    const email = readEmail(tenant.settings);
    return {
      smtpConfigured: Boolean(email.smtp),
      smtp: email.smtp
        ? {
            host: email.smtp.host,
            port: email.smtp.port,
            secure: email.smtp.secure,
            username: email.smtp.username,
            fromEmail: email.smtp.fromEmail,
            fromName: email.smtp.fromName ?? null,
          }
        : null,
      leadNotificationEmail: email.leadNotificationEmail ?? null,
      ownerEmail: tenant.businessEmail ?? ctx.email,
    };
  },

  async updateSmtp(ctx: AuthContext, input: UpdateSmtpInput): Promise<EmailSettingsDto> {
    const tenant = await tenantRepository.findById(ctx.tenantId);
    if (!tenant) throw new NotFoundError("Workspace not found");
    const existing = readEmail(tenant.settings);

    // Password omitted on update → keep the stored one. Requiring it only on
    // first connect means editing the host doesn't force re-entering secrets.
    const password = input.password?.trim()
      ? input.password
      : existing.smtp
        ? decryptOrThrow(existing.smtp.passwordEnc)
        : null;
    if (!password) {
      throw new ValidationError("An SMTP password is required to connect for the first time.");
    }

    const smtp: StoredSmtpConfig = {
      host: input.host,
      port: input.port,
      secure: input.secure,
      username: input.username,
      passwordEnc: encrypt(password),
      fromEmail: input.fromEmail,
      ...(input.fromName ? { fromName: input.fromName } : {}),
    };

    await persist(ctx.tenantId, { ...existing, smtp });
    return this.get(ctx);
  },

  async clearSmtp(ctx: AuthContext): Promise<EmailSettingsDto> {
    const tenant = await tenantRepository.findById(ctx.tenantId);
    if (!tenant) throw new NotFoundError("Workspace not found");
    const existing = readEmail(tenant.settings);
    const next: StoredEmailSettings = { ...existing };
    delete next.smtp;
    await persist(ctx.tenantId, next);
    return this.get(ctx);
  },

  async updateLeadNotification(
    ctx: AuthContext,
    input: UpdateLeadNotificationInput,
  ): Promise<EmailSettingsDto> {
    const tenant = await tenantRepository.findById(ctx.tenantId);
    if (!tenant) throw new NotFoundError("Workspace not found");
    const existing = readEmail(tenant.settings);
    const next: StoredEmailSettings = { ...existing };
    if (input.leadNotificationEmail) next.leadNotificationEmail = input.leadNotificationEmail;
    else delete next.leadNotificationEmail;
    await persist(ctx.tenantId, next);
    return this.get(ctx);
  },

  /**
   * Send a test email through the tenant's SMTP config. Throws with a clear
   * message when the connection or credentials are wrong.
   */
  async test(ctx: AuthContext, input: TestSmtpInput): Promise<{ sentTo: string }> {
    const tenant = await tenantRepository.findById(ctx.tenantId);
    if (!tenant) throw new NotFoundError("Workspace not found");
    const email = readEmail(tenant.settings);
    if (!email.smtp) {
      throw new ValidationError("Connect an SMTP server before sending a test.");
    }
    const config = toTransportConfig(email.smtp);
    if (!config) {
      throw new ValidationError("Stored SMTP credentials could not be read. Please reconnect.");
    }
    const to = input.to ?? tenant.businessEmail ?? ctx.email;
    try {
      await verifySmtp(config);
      await emailService.sendSmtpTestEmail({ smtp: config, to });
    } catch (err) {
      throw new ValidationError(
        `Could not send through this SMTP server: ${
          err instanceof Error ? err.message : "unknown error"
        }`,
      );
    }
    return { sentTo: to };
  },

  /**
   * Resolve how a lead should be delivered for a tenant — used by the public
   * form submit route. Returns the tenant's SMTP transport (if connected) and
   * the addresses that should always be copied: the workspace owner and any
   * dedicated notification address.
   */
  async resolveLeadDelivery(tenantId: string): Promise<LeadDelivery> {
    const tenant = await tenantRepository.findById(tenantId);
    if (!tenant) return { recipients: [] };
    const email = readEmail(tenant.settings);
    const recipients: string[] = [];
    if (tenant.businessEmail) recipients.push(tenant.businessEmail);
    if (email.leadNotificationEmail) recipients.push(email.leadNotificationEmail);
    const smtp = email.smtp ? toTransportConfig(email.smtp) : null;
    return { ...(smtp ? { smtp } : {}), recipients };
  },
};

function decryptOrThrow(payload: string): string {
  try {
    return decrypt(payload);
  } catch {
    throw new ValidationError(
      "Stored SMTP credentials could not be read. Please re-enter the password.",
    );
  }
}
