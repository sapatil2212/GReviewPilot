/**
 * Email service — orchestrates template rendering and delivery.
 * Route handlers and services call this; they never touch templates
 * or the transport directly.
 */

import { emailClient } from "./client";
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
  }) {
    const msg = siteLeadTemplate({
      appUrl: env.APP_URL,
      siteName: opts.siteName,
      formName: opts.formName,
      fields: opts.fields,
      pagePath: opts.pagePath,
      dashboardUrl: `${env.APP_URL}/dashboard/website`,
    });
    await Promise.all(opts.to.map((recipient) => safeSend(recipient, msg)));
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
