/**
 * Email client abstraction. The rest of the app depends on `EmailClient`,
 * not on nodemailer directly, so we can swap to Resend / Postmark / SES
 * without touching call sites.
 */

import nodemailer, { type Transporter } from "nodemailer";
import { env } from "@/server/utils/env";
import { logger } from "@/server/utils/logger";

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text?: string;
  bcc?: string;
}

export interface EmailClient {
  send(message: EmailMessage): Promise<void>;
}

class NodemailerEmailClient implements EmailClient {
  private transporter: Transporter | null = null;

  private getTransporter(): Transporter {
    if (this.transporter) return this.transporter;
    this.transporter = nodemailer.createTransport({
      host: env.EMAIL_HOST,
      port: env.EMAIL_PORT,
      secure: env.EMAIL_PORT === 465,
      auth: {
        user: env.EMAIL_USERNAME,
        pass: env.EMAIL_PASSWORD,
      },
    });
    return this.transporter;
  }

  async send(message: EmailMessage): Promise<void> {
    const transporter = this.getTransporter();
    const bcc = message.bcc ?? env.EMAIL_BCC ?? undefined;
    const info = await transporter.sendMail({
      from: env.EMAIL_FROM,
      to: message.to,
      bcc: bcc || undefined,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
    logger.info("Email sent", {
      to: message.to,
      subject: message.subject,
      messageId: info.messageId,
    });
  }
}

export const emailClient: EmailClient = new NodemailerEmailClient();

// ---------------------------------------------------------------------
// Per-tenant SMTP
//
// Tenants can connect their own mail server so lead notifications arrive
// from their own domain rather than the platform's shared sender. These
// helpers build a FRESH transport per call rather than reusing the cached
// global one — a tenant's credentials must never leak into another tenant's
// (or the platform's) transport.
// ---------------------------------------------------------------------

export interface SmtpTransportConfig {
  host: string;
  port: number;
  secure: boolean;
  username: string;
  password: string;
  fromEmail: string;
  fromName?: string;
}

function buildTenantTransport(config: SmtpTransportConfig): Transporter {
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.username, pass: config.password },
  });
}

function fromHeader(config: SmtpTransportConfig): string {
  return config.fromName ? `"${config.fromName}" <${config.fromEmail}>` : config.fromEmail;
}

/** Send a message through a tenant's own SMTP server. Throws on failure. */
export async function sendWithSmtp(
  config: SmtpTransportConfig,
  message: EmailMessage,
): Promise<void> {
  const transporter = buildTenantTransport(config);
  const info = await transporter.sendMail({
    from: fromHeader(config),
    to: message.to,
    bcc: message.bcc || undefined,
    subject: message.subject,
    text: message.text,
    html: message.html,
  });
  logger.info("Email sent via tenant SMTP", {
    to: message.to,
    subject: message.subject,
    host: config.host,
    messageId: info.messageId,
  });
}

/**
 * Verify a tenant's SMTP credentials without sending anything (SMTP handshake
 * + AUTH). Used by the "Test connection" button before a config is saved.
 */
export async function verifySmtp(config: SmtpTransportConfig): Promise<void> {
  const transporter = buildTenantTransport(config);
  await transporter.verify();
}
