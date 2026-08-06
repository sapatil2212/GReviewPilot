/**
 * Email service — orchestrates template rendering and delivery.
 * Route handlers and services call this; they never touch templates
 * or the transport directly.
 */

import { emailClient, sendWithSmtp, type SmtpTransportConfig } from "./client";
import {
  invitationTemplate,
  newDeviceLoginTemplate,
  passwordChangedTemplate,
  passwordResetTemplate,
  signupOtpTemplate,
  siteLeadTemplate,
  verifyEmailTemplate,
  welcomeTemplate,
} from "./templates";
import { env } from "@/server/utils/env";
import { logger } from "@/server/utils/logger";

/**
 * Fire-and-forget send. Wraps every send so a broken SMTP call
 * never crashes the primary request (signup, reset, etc.).
 */
async function safeSend(to: string, msg: { subject: string; html: string; text?: string }) {
  try {
    await emailClient.send({ to, ...msg });
  } catch (err) {
    logger.error("Failed to send email", {
      to,
      subject: msg.subject,
      err: err instanceof Error ? err.message : String(err),
    });
  }
}

export const emailService = {
  /**
   * Notify a tenant of a new website enquiry.
   *
   * Sent to each recipient separately rather than as one multi-recipient
   * message, so notification addresses are not disclosed to each other.
   */
  async sendSiteLeadEmail(opts: {
    to: string[];
    siteName: string;
    formName: string;
    fields: Array<{ label: string; value: string }>;
    pagePath?: string | null;
    /** When present, deliver through the tenant's own mail server. */
    smtp?: SmtpTransportConfig;
  }) {
    const msg = siteLeadTemplate({
      appUrl: env.APP_URL,
      siteName: opts.siteName,
      formName: opts.formName,
      fields: opts.fields,
      pagePath: opts.pagePath,
      dashboardUrl: `${env.APP_URL}/dashboard/website`,
    });
    await Promise.all(
      opts.to.map((recipient) =>
        opts.smtp
          ? sendWithSmtp(opts.smtp, { to: recipient, ...msg }).catch((err) =>
              logger.error("Tenant SMTP lead email failed", {
                to: recipient,
                err: err instanceof Error ? err.message : String(err),
              }),
            )
          : safeSend(recipient, msg),
      ),
    );
  },

  /**
   * Send a test message through a tenant's SMTP config, so they can confirm
   * the connection works before relying on it for real leads. Throws on
   * failure (unlike the fire-and-forget lead path) so the UI can surface why.
   */
  async sendSmtpTestEmail(opts: { smtp: SmtpTransportConfig; to: string }) {
    await sendWithSmtp(opts.smtp, {
      to: opts.to,
      subject: "Your SMTP connection works",
      html: `<p>This is a test email from your website builder. If you are reading this, your SMTP settings are working and new website leads will be delivered to your inbox.</p>`,
      text: "This is a test email from your website builder. Your SMTP settings are working.",
    });
  },

  async sendVerificationEmail(opts: { to: string; firstName?: string; token: string }) {
    const verifyUrl = `${env.APP_URL}/auth/verify-email?token=${encodeURIComponent(opts.token)}`;
    const msg = verifyEmailTemplate({
      appUrl: env.APP_URL,
      firstName: opts.firstName,
      verifyUrl,
    });
    await safeSend(opts.to, msg);
  },

  async sendWelcomeEmail(opts: { to: string; firstName?: string }) {
    const msg = welcomeTemplate({ appUrl: env.APP_URL, firstName: opts.firstName });
    await safeSend(opts.to, msg);
  },

  async sendPasswordResetEmail(opts: { to: string; firstName?: string; token: string }) {
    const resetUrl = `${env.APP_URL}/auth/reset-password?token=${encodeURIComponent(opts.token)}`;
    const msg = passwordResetTemplate({
      appUrl: env.APP_URL,
      firstName: opts.firstName,
      resetUrl,
    });
    await safeSend(opts.to, msg);
  },

  async sendPasswordChangedEmail(opts: {
    to: string;
    firstName?: string;
    ipAddress?: string | null;
  }) {
    const msg = passwordChangedTemplate({
      appUrl: env.APP_URL,
      firstName: opts.firstName,
      ipAddress: opts.ipAddress,
    });
    await safeSend(opts.to, msg);
  },

  async sendSignupOtpEmail(opts: { to: string; firstName?: string; code: string }) {
    const msg = signupOtpTemplate({
      appUrl: env.APP_URL,
      firstName: opts.firstName,
      code: opts.code,
    });
    await safeSend(opts.to, msg);
  },

  async sendInvitationEmail(opts: {
    to: string;
    firstName?: string;
    inviterName?: string;
    tenantName: string;
    role: string;
    token: string;
    message?: string;
    expiresInHours: number;
  }) {
    const inviteUrl = `${env.APP_URL}/auth/invitation?token=${encodeURIComponent(opts.token)}`;
    const msg = invitationTemplate({
      appUrl: env.APP_URL,
      firstName: opts.firstName,
      inviterName: opts.inviterName,
      tenantName: opts.tenantName,
      role: opts.role,
      inviteUrl,
      message: opts.message,
      expiresInHours: opts.expiresInHours,
    });
    await safeSend(opts.to, msg);
  },

  async sendNewDeviceLoginEmail(opts: {
    to: string;
    firstName?: string;
    browser?: string | null;
    os?: string | null;
    ipAddress?: string | null;
  }) {
    const msg = newDeviceLoginTemplate({
      appUrl: env.APP_URL,
      firstName: opts.firstName,
      browser: opts.browser,
      os: opts.os,
      ipAddress: opts.ipAddress,
    });
    await safeSend(opts.to, msg);
  },
};
