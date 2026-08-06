/**
 * Typed client for workspace settings (email/SMTP delivery for now).
 * Same conventions as the rest of lib/api: one method per route, every
 * request through apiFetch, no hand-built URLs in components.
 */

import { apiFetch } from "@/lib/fetcher";

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
  ownerEmail: string | null;
}

export interface UpdateSmtpBody {
  host: string;
  port: number;
  secure: boolean;
  username: string;
  /** Omit to keep the stored password when editing. */
  password?: string;
  fromEmail: string;
  fromName?: string;
}

export const settingsApi = {
  async getEmail() {
    const { data } = await apiFetch<EmailSettingsDto>("/api/private/settings/email");
    return data;
  },

  async updateSmtp(body: UpdateSmtpBody) {
    const { data } = await apiFetch<EmailSettingsDto>("/api/private/settings/email", {
      method: "PUT",
      body: JSON.stringify(body),
    });
    return data;
  },

  async setLeadNotificationEmail(leadNotificationEmail: string) {
    const { data } = await apiFetch<EmailSettingsDto>("/api/private/settings/email", {
      method: "PATCH",
      body: JSON.stringify({ leadNotificationEmail }),
    });
    return data;
  },

  async disconnectSmtp() {
    const { data } = await apiFetch<EmailSettingsDto>("/api/private/settings/email", {
      method: "DELETE",
    });
    return data;
  },

  async testSmtp(to?: string) {
    const { data, message } = await apiFetch<{ sentTo: string }>(
      "/api/private/settings/email/test",
      { method: "POST", body: JSON.stringify(to ? { to } : {}) },
    );
    return { ...data, message };
  },
};
