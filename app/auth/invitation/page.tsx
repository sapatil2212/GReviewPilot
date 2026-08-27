"use client";

/**
 * /auth/invitation?token=<raw>
 *
 * Public page. Previews the invitation, lets the invitee set their
 * name + password, and calls POST /api/auth/invitations/accept.
 * On success we send them to the sign-in page — auto-login isn't
 * done here to keep the accept flow cookie-side-effect-free.
 */

import Link from "next/link";
import Image from "next/image";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, CheckCircle2, MailCheck } from "lucide-react";
import { toast } from "sonner";
import { Field, Input } from "@/components/dashboard/field";
import { apiFetch, ApiClientError } from "@/lib/fetcher";

interface Preview {
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: string;
  message: string | null;
  tenant: { id: string; name: string; slug: string } | null;
  invitedBy: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  } | null;
  expiresAt: string;
}

/**
 * `useSearchParams` opts the subtree into client-side rendering, so the
 * page shell wraps it in Suspense to keep the route prerenderable.
 */
export default function InvitationAcceptPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center px-4">
          <div className="text-xs text-slate-500">Loading invitation…</div>
        </div>
      }
    >
      <InvitationAcceptContent />
    </Suspense>
  );
}

function InvitationAcceptContent() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params?.get("token") ?? "";

  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) {
      setPreviewError("This link is missing a token.");
      setLoading(false);
      return;
    }
    let cancelled = false;
    apiFetch<Preview>(
      `/api/auth/invitations/preview?token=${encodeURIComponent(token)}`,
    )
      .then((r) => {
        if (cancelled) return;
        setPreview(r.data);
        setFirstName(r.data.firstName ?? "");
        setLastName(r.data.lastName ?? "");
      })
      .catch((err) => {
        if (cancelled) return;
        setPreviewError(
          err instanceof ApiClientError
            ? err.message
            : "This invitation link is invalid.",
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setErrors({});
    try {
      await apiFetch("/api/auth/invitations/accept", {
        method: "POST",
        body: JSON.stringify({
          token,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          password,
          confirmPassword,
        }),
      });
      setDone(true);
      toast.success("Welcome to the team");
      setTimeout(
        () => router.push(`/auth?mode=login&email=${encodeURIComponent(preview?.email ?? "")}`),
        1200,
      );
    } catch (err) {
      if (err instanceof ApiClientError) {
        setErrors(err.fields ?? {});
        toast.error(err.message);
      } else {
        toast.error("Could not accept invitation");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      <div className="pointer-events-none absolute inset-0 opacity-80">
        <div className="absolute -top-32 -left-24 h-96 w-96 rounded-full bg-primary/20 blur-3xl animate-pulse-glow" />
        <div className="absolute top-40 -right-24 h-[28rem] w-[28rem] rounded-full bg-secondary/20 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 h-96 w-96 rounded-full bg-accent/20 blur-3xl" />
      </div>

      <header className="absolute inset-x-0 top-0 z-20 flex items-center justify-between px-6 py-6 sm:px-10">
        <Link href="/" className="group flex items-center">
          <Image
            src="/assets/logo/greviewpilot-logo.png"
            alt="GReviewPilot Logo"
            width={180}
            height={40}
            className="h-9 w-auto object-contain transition-transform group-hover:scale-105"
            priority
          />
        </Link>
      </header>

      <div className="relative z-10 mx-auto flex min-h-screen max-w-md items-center justify-center px-4 pt-20 pb-12">
        <div className="w-full">
          <div className="glass shadow-elevated rounded-3xl border border-border/80 bg-background/90 p-6 sm:p-8 backdrop-blur-2xl">
            <div className="mb-4 flex items-center gap-2 text-base font-semibold text-foreground">
          <MailCheck className="h-5 w-5 text-blue-600" />
          You&apos;re invited
        </div>

        {loading && <div className="text-xs text-slate-500">Loading invitation…</div>}

        {!loading && previewError && (
          <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <div className="font-semibold">Invitation unavailable</div>
              <div className="text-xs">{previewError}</div>
              <Link
                href="/auth?mode=login"
                className="mt-2 inline-block text-xs font-semibold text-red-800 underline"
              >
                Go to sign in
              </Link>
            </div>
          </div>
        )}

        {!loading && preview && !done && (
          <>
            <div className="mb-4 rounded-xl border border-slate-100 bg-slate-50 p-3 text-xs">
              <div className="font-semibold text-slate-900">
                {preview.tenant?.name ?? "A workspace"}
              </div>
              <div className="text-slate-500">
                Invited as <span className="font-semibold text-slate-800">{preview.role}</span>
                {preview.invitedBy &&
                  ` by ${preview.invitedBy.firstName} ${preview.invitedBy.lastName}`}
              </div>
              <div className="mt-1 text-slate-500">
                For <span className="font-mono">{preview.email}</span>
              </div>
              {preview.message && (
                <blockquote className="mt-2 border-l-2 border-slate-300 pl-2 text-slate-600">
                  {preview.message}
                </blockquote>
              )}
            </div>

            <form onSubmit={submit} className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="First name" required error={errors.firstName}>
                  <Input
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    maxLength={100}
                    required
                  />
                </Field>
                <Field label="Last name" required error={errors.lastName}>
                  <Input
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    maxLength={100}
                    required
                  />
                </Field>
              </div>
              <Field
                label="Password"
                required
                hint="8+ chars, upper, lower, number, symbol"
                error={errors.password}
              >
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={8}
                  maxLength={128}
                  required
                />
              </Field>
              <Field label="Confirm password" required error={errors.confirmPassword}>
                <Input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  minLength={8}
                  maxLength={128}
                  required
                />
              </Field>
              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-lg bg-blue-600 px-3 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-60"
              >
                {submitting ? "Setting up your account…" : "Accept & create account"}
              </button>
            </form>
          </>
        )}

        {done && (
          <div className="flex flex-col items-center gap-2 py-4 text-center">
            <CheckCircle2 className="h-8 w-8 text-emerald-500" />
            <div className="text-sm font-semibold text-slate-900">
              You&apos;re in
            </div>
            <div className="text-xs text-slate-500">
              Redirecting you to sign in…
            </div>
          </div>
        )}
          </div>
        </div>
      </div>
    </div>
  );
}
