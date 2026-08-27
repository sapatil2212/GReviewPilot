"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { ArrowLeft, ArrowRight, Loader2, Mail, AlertCircle, CheckCircle2 } from "lucide-react";
import { apiFetch, ApiClientError } from "@/lib/fetcher";

const schema = z.object({
  email: z.string().trim().email("Enter a valid email address").max(255),
});

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = schema.safeParse({ email });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message);
      return;
    }
    setError(undefined);
    setLoading(true);
    try {
      await apiFetch("/api/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email: parsed.data.email }),
      });
      setSent(true);
      toast.success("If an account exists, we've sent reset instructions.");
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
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
          <div className="glass shadow-elevated rounded-3xl border border-border/80 bg-background/90 p-6 sm:p-8 backdrop-blur-2xl">
            {sent ? (
              <div className="text-center">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-surface">
                  <CheckCircle2 className="h-7 w-7 text-emerald-500" />
                </div>
                <h2 className="text-xl font-semibold tracking-tight">Check your inbox</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  If an account exists for{" "}
                  <span className="font-medium text-foreground">{email}</span>, we&rsquo;ve
                  sent password reset instructions. The link expires in 1 hour.
                </p>
                <Link
                  href="/auth"
                  className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-foreground px-4 py-2.5 text-sm font-semibold text-background transition hover:-translate-y-0.5"
                >
                  Back to sign in
                </Link>
              </div>
            ) : (
              <>
                <div className="mb-6">
                  <h2 className="text-2xl font-semibold tracking-tight">Forgot password?</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Enter the email associated with your account and we&rsquo;ll send you a
                    reset link.
                  </p>
                </div>

                <form onSubmit={submit} noValidate className="space-y-4">
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-foreground">
                      Email
                    </label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => {
                          setEmail(e.target.value);
                          if (error) setError(undefined);
                        }}
                        placeholder="you@company.com"
                        className={
                          "w-full rounded-xl border bg-background pl-10 pr-3 py-2.5 text-sm outline-none transition focus:ring-4 " +
                          (error
                            ? "border-red-500/80 focus:border-red-500 focus:ring-red-500/20"
                            : "border-border focus:border-primary focus:ring-primary/15")
                        }
                      />
                    </div>
                    {error && (
                      <p className="mt-1 flex items-center gap-1.5 text-[11.5px] font-medium text-red-500">
                        <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                        <span>{error}</span>
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
                        Send reset link
                        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                      </>
                    )}
                  </button>
                </form>

                <p className="mt-6 text-center text-xs text-muted-foreground">
                  Remembered it?{" "}
                  <Link
                    href="/auth"
                    className="font-medium text-foreground underline underline-offset-4"
                  >
                    Sign in
                  </Link>
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
