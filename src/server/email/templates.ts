/**
 * Responsive HTML email templates.
 *
 * Deliberately dependency-free (no react-email) — keeps bundle lean.
 * All templates share the same wrapper for consistent branding.
 */

interface BaseParams {
  appUrl: string;
  firstName?: string;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function layout({
  title,
  preheader,
  bodyHtml,
  ctaLabel,
  ctaUrl,
  footerNote,
}: {
  title: string;
  preheader: string;
  bodyHtml: string;
  ctaLabel?: string;
  ctaUrl?: string;
  footerNote?: string;
}): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <meta name="color-scheme" content="light" />
  <title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background:#f6f8fb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">
  <span style="display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;overflow:hidden;">${escapeHtml(preheader)}</span>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f8fb;padding:32px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:16px;box-shadow:0 1px 3px rgba(15,23,42,0.06);overflow:hidden;">
          <tr>
            <td style="padding:28px 32px 8px;">
              <div style="font-size:18px;font-weight:700;letter-spacing:-0.01em;color:#0f172a;">GReviewPilot</div>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 32px 24px;">
              <h1 style="margin:12px 0 8px;font-size:22px;line-height:1.3;font-weight:700;color:#0f172a;">${escapeHtml(title)}</h1>
              <div style="font-size:15px;line-height:1.65;color:#334155;">${bodyHtml}</div>
              ${
                ctaLabel && ctaUrl
                  ? `<div style="margin:24px 0 8px;"><a href="${escapeHtml(ctaUrl)}" style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:600;font-size:14px;">${escapeHtml(ctaLabel)}</a></div>
                     <div style="font-size:12px;color:#64748b;margin-top:16px;">If the button doesn't work, paste this URL into your browser:<br /><span style="word-break:break-all;color:#334155;">${escapeHtml(ctaUrl)}</span></div>`
                  : ""
              }
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px 28px;border-top:1px solid #e2e8f0;">
              <div style="font-size:12px;color:#64748b;line-height:1.6;">
                ${footerNote ? escapeHtml(footerNote) + "<br/>" : ""}
                This is an automated message from GReviewPilot. If you didn't request this, you can safely ignore this email.
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ---------- Verify Email ----------
export function verifyEmailTemplate(params: BaseParams & { verifyUrl: string }) {
  const greeting = params.firstName ? `Hi ${escapeHtml(params.firstName)},` : "Hi there,";
  const html = layout({
    title: "Verify your email",
    preheader: "Confirm your email address to activate your GReviewPilot account.",
    bodyHtml: `
      <p style="margin:0 0 12px;">${greeting}</p>
      <p style="margin:0 0 12px;">Welcome to GReviewPilot. Confirm your email address to activate your account.</p>
      <p style="margin:0;color:#64748b;font-size:13px;">This link expires in 24 hours.</p>`,
    ctaLabel: "Verify email address",
    ctaUrl: params.verifyUrl,
  });
  return {
    subject: "Verify your email — GReviewPilot",
    html,
    text: `Verify your email: ${params.verifyUrl}`,
  };
}

// ---------- Welcome (post-verification) ----------
export function welcomeTemplate(params: BaseParams) {
  const greeting = params.firstName ? `Welcome, ${escapeHtml(params.firstName)}!` : "Welcome!";
  const html = layout({
    title: greeting,
    preheader: "Your GReviewPilot workspace is ready.",
    bodyHtml: `
      <p style="margin:0 0 12px;">Your workspace is ready. You can now sign in and start capturing reviews.</p>`,
    ctaLabel: "Open dashboard",
    ctaUrl: `${params.appUrl}/dashboard`,
  });
  return {
    subject: "Welcome to GReviewPilot",
    html,
    text: `Welcome. Open your dashboard: ${params.appUrl}/dashboard`,
  };
}

// ---------- Password reset ----------
export function passwordResetTemplate(params: BaseParams & { resetUrl: string }) {
  const greeting = params.firstName ? `Hi ${escapeHtml(params.firstName)},` : "Hi there,";
  const html = layout({
    title: "Reset your password",
    preheader: "Use this link to reset your GReviewPilot password.",
    bodyHtml: `
      <p style="margin:0 0 12px;">${greeting}</p>
      <p style="margin:0 0 12px;">We received a request to reset your password. Click the button below to choose a new one.</p>
      <p style="margin:0;color:#64748b;font-size:13px;">This link expires in 1 hour. If you didn't request a reset, you can safely ignore this email.</p>`,
    ctaLabel: "Reset password",
    ctaUrl: params.resetUrl,
  });
  return {
    subject: "Reset your password — GReviewPilot",
    html,
    text: `Reset your password: ${params.resetUrl}`,
  };
}

// ---------- Password changed notification ----------
export function passwordChangedTemplate(params: BaseParams & { ipAddress?: string | null }) {
  const greeting = params.firstName ? `Hi ${escapeHtml(params.firstName)},` : "Hi there,";
  const html = layout({
    title: "Your password was changed",
    preheader: "Confirmation that your GReviewPilot password was changed.",
    bodyHtml: `
      <p style="margin:0 0 12px;">${greeting}</p>
      <p style="margin:0 0 12px;">Your GReviewPilot password was just changed${
        params.ipAddress ? ` from IP <strong>${escapeHtml(params.ipAddress)}</strong>` : ""
      }.</p>
      <p style="margin:0;color:#64748b;font-size:13px;">If this wasn't you, reset your password immediately and contact support.</p>`,
    ctaLabel: "Sign in",
    ctaUrl: `${params.appUrl}/auth`,
  });
  return {
    subject: "Password changed — GReviewPilot",
    html,
    text: `Your password was changed. If this wasn't you, reset it immediately: ${params.appUrl}/auth`,
  };
}

// ---------- New device login notification ----------
export function newDeviceLoginTemplate(
  params: BaseParams & { browser?: string | null; os?: string | null; ipAddress?: string | null },
) {
  const greeting = params.firstName ? `Hi ${escapeHtml(params.firstName)},` : "Hi there,";
  const details = [
    params.browser ? `Browser: ${escapeHtml(params.browser)}` : null,
    params.os ? `OS: ${escapeHtml(params.os)}` : null,
    params.ipAddress ? `IP: ${escapeHtml(params.ipAddress)}` : null,
  ]
    .filter(Boolean)
    .join(" &middot; ");
  const html = layout({
    title: "New sign-in to your account",
    preheader: "A new device signed in to your GReviewPilot account.",
    bodyHtml: `
      <p style="margin:0 0 12px;">${greeting}</p>
      <p style="margin:0 0 12px;">We noticed a new sign-in to your account.</p>
      ${details ? `<p style="margin:0 0 12px;color:#334155;font-size:13px;">${details}</p>` : ""}
      <p style="margin:0;color:#64748b;font-size:13px;">If this was you, no action is needed. Otherwise, reset your password immediately.</p>`,
    ctaLabel: "Review activity",
    ctaUrl: `${params.appUrl}/settings/security`,
  });
  return {
    subject: "New sign-in to GReviewPilot",
    html,
    text: `A new sign-in was detected. If it wasn't you, secure your account: ${params.appUrl}/settings/security`,
  };
}


// ---------- Team invitation ----------
export function invitationTemplate(
  params: BaseParams & {
    inviterName?: string;
    tenantName: string;
    role: string;
    inviteUrl: string;
    message?: string;
    expiresInHours: number;
  },
) {
  const greeting = params.firstName
    ? `Hi ${escapeHtml(params.firstName)},`
    : "Hi there,";
  const inviter = params.inviterName
    ? escapeHtml(params.inviterName)
    : "Someone";
  const html = layout({
    title: `You're invited to join ${escapeHtml(params.tenantName)}`,
    preheader: `${inviter} invited you to join ${escapeHtml(params.tenantName)} on GReviewPilot.`,
    bodyHtml: `
      <p style="margin:0 0 12px;">${greeting}</p>
      <p style="margin:0 0 12px;"><strong>${inviter}</strong> invited you to join <strong>${escapeHtml(params.tenantName)}</strong> on GReviewPilot as <strong>${escapeHtml(params.role)}</strong>.</p>
      ${
        params.message
          ? `<blockquote style="margin:12px 0;padding:10px 14px;border-left:3px solid #cbd5e1;background:#f8fafc;color:#334155;font-size:14px;">${escapeHtml(params.message)}</blockquote>`
          : ""
      }
      <p style="margin:0;color:#64748b;font-size:13px;">This invite expires in ${params.expiresInHours} hours.</p>`,
    ctaLabel: "Accept invitation",
    ctaUrl: params.inviteUrl,
  });
  return {
    subject: `You're invited to join ${params.tenantName} on GReviewPilot`,
    html,
    text: `${inviter} invited you to join ${params.tenantName} on GReviewPilot as ${params.role}. Accept: ${params.inviteUrl}`,
  };
}

// ---------- Signup OTP ----------
export function signupOtpTemplate(params: BaseParams & { code: string }) {
  const greeting = params.firstName ? `Hi ${escapeHtml(params.firstName)},` : "Hi there,";
  const codeHtml = `<div style="font-family:'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace;letter-spacing:0.4em;font-size:28px;font-weight:700;color:#0f172a;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:12px;padding:16px 24px;display:inline-block;">${escapeHtml(params.code)}</div>`;
  const html = layout({
    title: "Your verification code",
    preheader: `Your GReviewPilot verification code is ${params.code}`,
    bodyHtml: `
      <p style="margin:0 0 12px;">${greeting}</p>
      <p style="margin:0 0 16px;">Use this code to verify your email and finish creating your GReviewPilot account.</p>
      <div style="margin:20px 0 12px;text-align:center;">${codeHtml}</div>
      <p style="margin:0;color:#64748b;font-size:13px;">This code expires in 10 minutes. If you didn't request it, you can safely ignore this email.</p>`,
  });
  return {
    subject: `Your GReviewPilot verification code is ${params.code}`,
    html,
    text: `Your GReviewPilot verification code is ${params.code}. It expires in 10 minutes.`,
  };
}

// ---------- Website lead notification ----------

/**
 * A new enquiry from a tenant's published website.
 *
 * Every value is escaped: this is the only template whose content originates
 * from an anonymous internet visitor, so unescaped output would be an HTML
 * injection straight into the business owner's inbox.
 */
export function siteLeadTemplate(
  params: BaseParams & {
    siteName: string;
    formName: string;
    fields: Array<{ label: string; value: string }>;
    pagePath?: string | null;
    dashboardUrl: string;
  },
) {
  const rows = params.fields
    .filter((f) => f.value.trim().length > 0)
    .map(
      (f) => `<tr>
        <td style="padding:8px 14px;font-weight:600;color:#0f172a;vertical-align:top;white-space:nowrap;">${escapeHtml(f.label)}</td>
        <td style="padding:8px 14px;color:#334155;white-space:pre-line;">${escapeHtml(f.value)}</td>
      </tr>`,
    )
    .join("");

  const bodyHtml = `
    <p style="margin:0 0 16px;">You have a new <strong>${escapeHtml(params.formName)}</strong> enquiry from your website <strong>${escapeHtml(params.siteName)}</strong>.</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;font-size:14px;">
      ${rows || '<tr><td style="padding:14px;color:#64748b;">No field values were submitted.</td></tr>'}
    </table>
    ${params.pagePath ? `<p style="margin:16px 0 0;font-size:13px;color:#64748b;">Submitted from ${escapeHtml(params.pagePath)}</p>` : ""}
  `;

  const html = layout({
    title: "New website enquiry",
    preheader: `New ${params.formName} enquiry from ${params.siteName}`,
    bodyHtml,
    ctaLabel: "View in dashboard",
    ctaUrl: params.dashboardUrl,
    footerNote: "You are receiving this because you are listed as a notification recipient for this form.",
  });

  return { subject: `New website enquiry — ${params.siteName}`, html };
}
