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
