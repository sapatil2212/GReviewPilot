"use client";

/**
 * Two-mode page:
 *   - `?token=...`  → verify the token via API
 *   - `?email=...`  → show "check your inbox" with a resend button
 */

import Link from "next/link";
import Image from "next/image";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft,
  CheckCircle2,
  Loader2,
  Mail,
  XCircle,
  RefreshCw,
} from "lucide-react";
import { apiFetch, ApiClientError } from "@/lib/fetcher";

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-background flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <VerifyEmailContent />
    </Suspense>
  );
}

type Status = "idle" | "loading" | "success" | "error";

function VerifyEmailContent() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get("token");
  const email = params.get("email") ?? "";

  const [status, setStatus] = useState<Status>(token ? "loading" : "idle");
  const [message, setMessage] = useState<string | null>(null);
  const [resending, setResending] = useState(false);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        await apiFetch("/api/auth/verify-email", {
          method: "POST",
          body: JSON.stringify({ token }),
        });
        if (cancelled) return;
        setStatus("success");
        setMessage("Your email is verified. You can now sign in.");
      } catch (err) {
        if (cancelled) return;
        setStatus("error");
        setMessage(
          err instanceof ApiClientError
            ? err.message
            : "Verification link is invalid or expired.",
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function handleResend() {
    if (!email) {
      toast.error("Please enter the email you signed up with.");
      return;
    }
    setResending(true);
    try {
      await apiFetch("/api/auth/resend-verification", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      toast.success("If an account exists, a new verification email is on its way.");
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : "Try again in a moment.");
    } finally {
      setResending(false);
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      <div className="pointer-events-none absolute inset-0 opacity-70">
        <div className="absolute -top-32 -left-24 h-96 w-96 rounded-full bg-[#3B82F6]/25 blur-3xl" />
        <div className="absolute top-40 -right-24 h-[28rem] w-[28rem] rounded-full bg-[#1D4ED8]/20 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 h-96 w-96 rounded-full bg-[#0F172A]/30 blur-3xl" />
      </div>

      <header className="absolute inset-x-0 top-0 z-20 flex items-center justify-between px-6 py-6 sm:px-10">
        <Link
          href="/auth"
          className="group flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1 text-primary" />
          <span>Back to sign in</span>
        </Link>
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
          <div className="glass shadow-elevated rounded-3xl border border-border/60 bg-background/85 p-6 sm:p-8 backdrop-blur-xl text-center">
            {token ? (
              <>
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-surface">
                  {status === "loading" && (
                    <Loader2 className="h-7 w-7 animate-spin text-primary" />
                  )}
                  {status === "success" && (
                    <CheckCircle2 className="h-7 w-7 text-emerald-500" />
                  )}
                  {status === "error" && (
                    <XCircle className="h-7 w-7 text-red-500" />
                  )}
                </div>
                <h2 className="text-xl font-semibold tracking-tight">
                  {status === "loading" && "Verifying your email..."}
                  {status === "success" && "Email verified"}
                  {status === "error" && "Verification failed"}
                </h2>
                <p className="mt-2 text-sm text-muted-foreground">{message ?? " "}</p>
                {status === "success" && (
                  <button
                    onClick={() => router.push("/auth")}
                    className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-foreground px-4 py-2.5 text-sm font-semibold text-background transition hover:-translate-y-0.5"
                  >
                    Continue to sign in
                  </button>
                )}
                {status === "error" && (
                  <Link
                    href="/auth"
                    className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-background px-4 py-2.5 text-sm font-medium text-foreground transition hover:bg-surface"
                  >
                    Back to sign in
                  </Link>
                )}
              </>
            ) : (
              <>
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-surface">
                  <Mail className="h-7 w-7 text-primary" />
                </div>
                <h2 className="text-xl font-semibold tracking-tight">Check your inbox</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  We&rsquo;ve sent a verification link to
                  {email ? (
                    <>
                      {" "}
                      <span className="font-medium text-foreground">{email}</span>.
                    </>
                  ) : (
                    " the email you signed up with."
                  )}{" "}
                  Click it to activate your account.
                </p>
                <div className="mt-6 space-y-3">
                  <button
                    onClick={handleResend}
                    disabled={resending}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-background px-4 py-2.5 text-sm font-medium text-foreground transition hover:bg-surface disabled:opacity-60"
                  >
                    {resending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4" />
                    )}
                    Resend verification email
                  </button>
                  <Link
                    href="/auth"
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-foreground px-4 py-2.5 text-sm font-semibold text-background transition hover:-translate-y-0.5"
                  >
                    Back to sign in
                  </Link>
                </div>
                <p className="mt-6 text-[11px] text-muted-foreground">
                  Wrong address? Contact support and we&rsquo;ll help you update it.
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
