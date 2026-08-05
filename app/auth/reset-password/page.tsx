"use client";

import Link from "next/link";
import Image from "next/image";
import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { z } from "zod";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  XCircle,
} from "lucide-react";
import { apiFetch, ApiClientError } from "@/lib/fetcher";
import { evaluatePassword } from "@/lib/password";

const schema = z
  .object({
    password: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .max(128)
      .regex(/[A-Z]/, "Password must contain an uppercase letter")
      .regex(/[a-z]/, "Password must contain a lowercase letter")
      .regex(/\d/, "Password must contain a number")
      .regex(/[^A-Za-z0-9]/, "Password must contain a special character"),
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-background flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <ResetPasswordContent />
    </Suspense>
  );
}

function ResetPasswordContent() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const strength = useMemo(() => evaluatePassword(password), [password]);

  if (!token) {
    return <MissingTokenState />;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = schema.safeParse({ password, confirmPassword });
    if (!parsed.success) {
      const map: Record<string, string> = {};
      parsed.error.issues.forEach((i) => {
        map[i.path[0] as string] = i.message;
      });
      setErrors(map);
      return;
    }
    setErrors({});
    setLoading(true);
    try {
      await apiFetch("/api/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({
          token,
          password: parsed.data.password,
          confirmPassword: parsed.data.confirmPassword,
        }),
      });
      setDone(true);
      toast.success("Password updated. Please sign in.");
      setTimeout(() => router.push("/auth"), 1200);
    } catch (err) {
      if (err instanceof ApiClientError) {
        if (err.code === "TOKEN_INVALID" || err.code === "TOKEN_EXPIRED") {
          setErrors({ _form: err.message });
        }
        toast.error(err.message);
      } else {
        toast.error("Something went wrong. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  }

  const passwordsMatch =
    confirmPassword.length > 0 && password === confirmPassword && password.length > 0;
  const passwordsMismatch = confirmPassword.length > 0 && password !== confirmPassword;

  return (
    <Layout>
      {done ? (
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-surface">
            <CheckCircle2 className="h-7 w-7 text-emerald-500" />
          </div>
          <h2 className="text-xl font-semibold tracking-tight">Password updated</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Redirecting you to sign in...
          </p>
        </div>
      ) : (
        <>
          <div className="mb-6">
            <h2 className="text-2xl font-semibold tracking-tight">Set a new password</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Choose a strong password you don&rsquo;t use anywhere else.
            </p>
          </div>

          {errors._form && (
            <div className="mb-4 flex items-start gap-2 rounded-xl border border-red-500/40 bg-red-500/5 p-3 text-xs text-red-600">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{errors._form}</span>
            </div>
          )}

          <form onSubmit={submit} noValidate className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-foreground">
                New password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (errors.password) setErrors((p) => ({ ...p, password: "" }));
                  }}
                  placeholder="At least 8 characters"
                  className={
                    "w-full rounded-xl border bg-background pl-10 pr-10 py-2.5 text-sm outline-none transition focus:ring-4 " +
                    (errors.password
                      ? "border-red-500/80 focus:border-red-500 focus:ring-red-500/20"
                      : "border-border focus:border-primary focus:ring-primary/15")
                  }
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground hover:bg-surface"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.password && (
                <p className="mt-1 flex items-center gap-1.5 text-[11.5px] font-medium text-red-500">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  <span>{errors.password}</span>
                </p>
              )}

              {password && (
                <div className="mt-2.5 space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    {[0, 1, 2, 3, 4].map((i) => (
                      <div
                        key={i}
                        className={
                          "h-1 flex-1 rounded-full transition-all " +
                          (i <= strength.score ? strength.color : "bg-border")
                        }
                      />
                    ))}
                  </div>
                  <div className="flex items-center justify-between text-[10.5px] text-muted-foreground">
                    <span>{strength.label}</span>
                    <span>
                      {strength.checks.filter((c) => c.ok).length}/5 passed
                    </span>
                  </div>
                </div>
              )}
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label className="block text-xs font-medium text-foreground">
                  Confirm password
                </label>
                {confirmPassword.length > 0 && (
                  <div className="flex items-center gap-1 text-[11px] font-medium">
                    {passwordsMatch ? (
                      <span className="flex items-center gap-1 font-semibold text-emerald-600">
                        <CheckCircle2 className="h-3.5 w-3.5 fill-emerald-100 text-emerald-600" />
                        Passwords match
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 font-semibold text-red-500">
                        <XCircle className="h-3.5 w-3.5 fill-red-100 text-red-500" />
                        Do not match
                      </span>
                    )}
                  </div>
                )}
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type={showConfirm ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value);
                    if (errors.confirmPassword)
                      setErrors((p) => ({ ...p, confirmPassword: "" }));
                  }}
                  placeholder="Re-enter password"
                  className={
                    "w-full rounded-xl border bg-background pl-10 pr-10 py-2.5 text-sm outline-none transition focus:ring-4 " +
                    (passwordsMatch
                      ? "border-emerald-500/80 focus:border-emerald-500 focus:ring-emerald-500/20"
                      : passwordsMismatch || errors.confirmPassword
                        ? "border-red-500/80 focus:border-red-500 focus:ring-red-500/20"
                        : "border-border focus:border-primary focus:ring-primary/15")
                  }
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground hover:bg-surface"
                >
                  {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.confirmPassword && (
                <p className="mt-1 flex items-center gap-1.5 text-[11.5px] font-medium text-red-500">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  <span>{errors.confirmPassword}</span>
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="group relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-foreground px-4 py-2.5 text-sm font-semibold text-background transition-all hover:-translate-y-0.5 disabled:opacity-60"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  Update password
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </>
              )}
            </button>
          </form>
        </>
      )}
    </Layout>
  );
}

function MissingTokenState() {
  return (
    <Layout>
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-surface">
          <XCircle className="h-7 w-7 text-red-500" />
        </div>
        <h2 className="text-xl font-semibold tracking-tight">Invalid reset link</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The reset link is missing a token. Request a new one below.
        </p>
        <Link
          href="/auth/forgot-password"
          className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-foreground px-4 py-2.5 text-sm font-semibold text-background transition hover:-translate-y-0.5"
        >
          Request new link
        </Link>
      </div>
    </Layout>
  );
}

function Layout({ children }: { children: React.ReactNode }) {
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
          <div className="glass shadow-elevated rounded-3xl border border-border/60 bg-background/85 p-6 sm:p-8 backdrop-blur-xl">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
