"use client";

/**
 * Workspace settings — email/SMTP delivery for website leads.
 *
 * Leads always land in the dashboard inbox; this page controls where they are
 * ALSO emailed. Two independent controls:
 *   1. A notification address (in addition to the workspace owner, who always
 *      gets a copy).
 *   2. An optional SMTP connection so notifications send from the tenant's own
 *      mail server instead of the platform's shared sender.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, Mail, Send, Server, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/dashboard/page-header";
import { Field, Input } from "@/components/dashboard/field";
import { settingsApi, type EmailSettingsDto } from "@/lib/api/settings";
import { ApiClientError, apiFetch } from "@/lib/fetcher";

export default function SettingsPage() {
  const [settings, setSettings] = useState<EmailSettingsDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      setSettings(await settingsApi.getEmail());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load settings");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  return (
    <>
      <PageHeader
        title="Settings"
        description="Where your website leads are delivered, and how they are sent."
      />

      {loading && <div className="text-sm text-slate-500">Loading…</div>}

      {error && !loading && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>{error}</div>
        </div>
      )}

      {settings && !loading && (
        <div className="max-w-2xl space-y-6">
          <LeadRecipients settings={settings} onSaved={setSettings} />
          <SmtpConnection settings={settings} onSaved={setSettings} />
          <DangerZone />
        </div>
      )}
    </>
  );
}

// =====================================================================
// Lead recipients
// =====================================================================

function LeadRecipients({
  settings,
  onSaved,
}: {
  settings: EmailSettingsDto;
  onSaved: (s: EmailSettingsDto) => void;
}) {
  const [value, setValue] = useState(settings.leadNotificationEmail ?? "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const next = await settingsApi.setLeadNotificationEmail(value.trim());
      onSaved(next);
      toast.success("Notification email saved");
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <header className="mb-4 flex items-center gap-2">
        <Mail className="h-4 w-4 text-blue-600" />
        <h2 className="text-sm font-semibold text-slate-900">Where leads are emailed</h2>
      </header>

      <p className="mb-4 text-xs text-slate-500">
        Every website enquiry is saved to your{" "}
        <span className="font-medium text-slate-700">Leads</span> inbox and emailed to the
        workspace owner
        {settings.ownerEmail ? (
          <>
            {" "}
            (<span className="font-medium text-slate-700">{settings.ownerEmail}</span>)
          </>
        ) : null}
        . Add another address below to copy someone else too.
      </p>

      <div className="flex items-end gap-2">
        <Field label="Notification email" htmlFor="notify" className="flex-1">
          <Input
            id="notify"
            type="email"
            placeholder="leads@yourbusiness.com"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        </Field>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </section>
  );
}

// =====================================================================
// SMTP connection
// =====================================================================

function SmtpConnection({
  settings,
  onSaved,
}: {
  settings: EmailSettingsDto;
  onSaved: (s: EmailSettingsDto) => void;
}) {
  const [host, setHost] = useState(settings.smtp?.host ?? "");
  const [port, setPort] = useState(String(settings.smtp?.port ?? 587));
  const [secure, setSecure] = useState(settings.smtp?.secure ?? false);
  const [username, setUsername] = useState(settings.smtp?.username ?? "");
  const [password, setPassword] = useState("");
  const [fromEmail, setFromEmail] = useState(settings.smtp?.fromEmail ?? "");
  const [fromName, setFromName] = useState(settings.smtp?.fromName ?? "");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  const configured = settings.smtpConfigured;

  const connect = async () => {
    setSaving(true);
    try {
      const next = await settingsApi.updateSmtp({
        host: host.trim(),
        port: Number(port),
        secure,
        username: username.trim(),
        ...(password ? { password } : {}),
        fromEmail: fromEmail.trim(),
        ...(fromName.trim() ? { fromName: fromName.trim() } : {}),
      });
      onSaved(next);
      setPassword("");
      toast.success("SMTP connected");
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : "Could not connect");
    } finally {
      setSaving(false);
    }
  };

  const test = async () => {
    setTesting(true);
    try {
      const res = await settingsApi.testSmtp();
      toast.success(res.message ?? `Test email sent to ${res.sentTo}`);
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : "Test failed");
    } finally {
      setTesting(false);
    }
  };

  const disconnect = async () => {
    setSaving(true);
    try {
      const next = await settingsApi.disconnectSmtp();
      onSaved(next);
      setPassword("");
      toast.success("SMTP disconnected");
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : "Could not disconnect");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <header className="mb-1 flex items-center gap-2">
        <Server className="h-4 w-4 text-blue-600" />
        <h2 className="text-sm font-semibold text-slate-900">Send from your own email (SMTP)</h2>
        {configured && (
          <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
            <CheckCircle2 className="h-3 w-3" />
            Connected
          </span>
        )}
      </header>

      <p className="mb-4 text-xs text-slate-500">
        Optional. Connect your mail server so lead emails arrive from your own domain. Leave
        this blank to use the built-in sender.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="SMTP host" htmlFor="host" required>
          <Input
            id="host"
            placeholder="smtp.gmail.com"
            value={host}
            onChange={(e) => setHost(e.target.value)}
          />
        </Field>
        <Field label="Port" htmlFor="port" required hint="465 = SSL, 587 = TLS">
          <Input
            id="port"
            type="number"
            value={port}
            onChange={(e) => setPort(e.target.value)}
          />
        </Field>
        <Field label="Username" htmlFor="username" required>
          <Input
            id="username"
            placeholder="you@yourbusiness.com"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </Field>
        <Field
          label="Password"
          htmlFor="password"
          hint={configured ? "leave blank to keep" : undefined}
          required={!configured}
        >
          <Input
            id="password"
            type="password"
            placeholder={configured ? "••••••••" : "app password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <Field label="From email" htmlFor="fromEmail" required>
          <Input
            id="fromEmail"
            type="email"
            placeholder="hello@yourbusiness.com"
            value={fromEmail}
            onChange={(e) => setFromEmail(e.target.value)}
          />
        </Field>
        <Field label="From name" htmlFor="fromName" hint="optional">
          <Input
            id="fromName"
            placeholder="Your Business"
            value={fromName}
            onChange={(e) => setFromName(e.target.value)}
          />
        </Field>
      </div>

      <label className="mt-3 flex items-center gap-2 text-xs text-slate-600">
        <input
          type="checkbox"
          checked={secure}
          onChange={(e) => setSecure(e.target.checked)}
          className="h-3.5 w-3.5 rounded border-slate-300"
        />
        Use SSL/TLS (usually on for port 465)
      </label>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={connect}
          disabled={saving}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {saving ? "Saving…" : configured ? "Update connection" : "Connect"}
        </button>
        {configured && (
          <>
            <button
              type="button"
              onClick={test}
              disabled={testing}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              <Send className="h-3.5 w-3.5" />
              {testing ? "Sending…" : "Send test email"}
            </button>
            <button
              type="button"
              onClick={disconnect}
              disabled={saving}
              className="ml-auto rounded-lg px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-60"
            >
              Disconnect
            </button>
          </>
        )}
      </div>
    </section>
  );
}

// =====================================================================
// Danger zone — permanent account deletion (soft, recoverable)
// =====================================================================

function DangerZone() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [loading, setLoading] = useState(false);

  const deleteAccount = async () => {
    if (confirmation.trim().toUpperCase() !== "DELETE") {
      toast.error('Type DELETE to confirm');
      return;
    }
    setLoading(true);
    try {
      await apiFetch("/api/private/settings/account", {
        method: "DELETE",
        body: JSON.stringify({ confirmation }),
      });
      toast.success("Account deleted");
      router.replace("/auth?mode=login");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : "Could not delete account");
    } finally {
      setLoading(false);
      setOpen(false);
      setConfirmation("");
    }
  };

  return (
    <section className="rounded-xl border border-red-200 bg-red-50/40 p-5">
      <header className="mb-2 flex items-center gap-2">
        <Trash2 className="h-4 w-4 text-red-600" />
        <h2 className="text-sm font-semibold text-red-900">Danger zone</h2>
      </header>
      <p className="mb-4 text-xs leading-relaxed text-red-800/80">
        Permanently delete your GReviewPilot account and workspace. You can
        retrieve it later by signing in again with the same email and password.
        Team members will lose access immediately.
      </p>

      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50"
      >
        Delete account permanently
      </button>

      {open && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
            <h3 className="text-sm font-semibold text-slate-900">
              Delete your account?
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              This soft-deletes your workspace. Type{" "}
              <span className="font-semibold text-red-600">DELETE</span> to
              confirm. You can restore it later from the sign-in screen.
            </p>
            <input
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              placeholder="Type DELETE"
              className="mt-4 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-red-500 focus:ring-4 focus:ring-red-500/15"
              autoFocus
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                disabled={loading}
                onClick={() => {
                  setOpen(false);
                  setConfirmation("");
                }}
                className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={loading || confirmation.trim().toUpperCase() !== "DELETE"}
                onClick={deleteAccount}
                className="rounded-lg bg-red-600 px-3 py-2 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-60"
              >
                {loading ? "Deleting…" : "Delete permanently"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
