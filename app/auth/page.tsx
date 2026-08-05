"use client";

import Link from "next/link";
import Image from "next/image";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { toast } from "sonner";
import { evaluatePassword } from "@/lib/password";
import { apiFetch, ApiClientError } from "@/lib/fetcher";
import {
  Mail,
  Lock,
  User,
  Eye,
  EyeOff,
  Check,
  ArrowRight,
  ArrowLeft,
  Loader2,
  Building2,
  Globe,
  Phone,
  Search,
  CheckSquare,
  Square,
  TrendingUp,
  Target,
  ShieldCheck,
  MessageSquare,
  BarChart3,
  ChevronDown,
  AlertCircle,
  CheckCircle2,
  XCircle,
  RefreshCw,
  MailCheck,
} from "lucide-react";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { z } from "zod";

const loginSchema = z.object({
  email: z.string().trim().email("Enter a valid email address").max(255),
  password: z.string().min(1, "Password is required").max(128),
});

const signupStep1Schema = z
  .object({
    firstName: z.string().trim().min(1, "First name is required"),
    lastName: z.string().trim().min(1, "Last name is required"),
    email: z.string().trim().email("Enter a valid email address").max(255),
    password: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .max(128)
      .regex(/[A-Z]/, "Password must contain an uppercase letter")
      .regex(/[a-z]/, "Password must contain a lowercase letter")
      .regex(/\d/, "Password must contain a number"),
    confirmPassword: z.string().min(1, "Please confirm your password"),
    businessName: z.string().trim().min(1, "Business name is required"),
    businessWebsite: z.string().optional(),
    businessPhone: z.string().optional(),
    terms: z.literal(true, {
      errorMap: () => ({
        message: "You must agree to the Terms of Service & Privacy Policy",
      }),
    }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

const CATEGORIES = [
  "Coffee Shop & Café",
  "Restaurant & Fine Dining",
  "Dental & Medical Clinic",
  "Retail & Boutique Store",
  "Salon, Spa & Beauty",
  "Auto Repair & Dealership",
  "Fitness Gym & Wellness",
  "Legal & Financial Services",
  "Real Estate & Property",
  "Education & Coaching Institute",
  "Hotel & Hospitality",
  "Home Services & Contracting",
  "Other Local Business",
];

const ACHIEVE_OPTIONS = [
  { id: "trust", label: "Increase Customer Trust", icon: ShieldCheck },
  { id: "customers", label: "Get More Customers", icon: Target },
  { id: "presence", label: "Improve Online Presence", icon: TrendingUp },
  { id: "feedback", label: "Manage Customer Feedback", icon: MessageSquare },
  { id: "analytics", label: "Business Analytics", icon: BarChart3 },
];

export default function AuthPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-background flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <AuthContent />
    </Suspense>
  );
}

function AuthContent() {
  const searchParams = useSearchParams();
  const mode = searchParams.get("mode") === "signup" ? "signup" : "login";

  const [tab, setTab] = useState<"login" | "signup">(mode);
  const [loading, setLoading] = useState(false);

  useEffect(() => setTab(mode), [mode]);

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      {/* Ambient mesh */}
      <div className="pointer-events-none absolute inset-0 opacity-70">
        <div className="absolute -top-32 -left-24 h-96 w-96 rounded-full bg-[#3B82F6]/25 blur-3xl" />
        <div className="absolute top-40 -right-24 h-[28rem] w-[28rem] rounded-full bg-[#1D4ED8]/20 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 h-96 w-96 rounded-full bg-[#0F172A]/30 blur-3xl" />
      </div>

      {/* Top Page Header (Outside of form card) */}
      <header className="absolute inset-x-0 top-0 z-20 flex items-center justify-between px-6 py-6 sm:px-10">
        <Link
          href="/"
          className="group flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1 text-primary" />
          <span>Back to home</span>
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

      <div
        className={
          "relative z-10 mx-auto flex min-h-screen items-center justify-center px-4 pt-20 pb-12 transition-all duration-500 ease-out " +
          (tab === "signup" ? "max-w-2xl" : "max-w-md")
        }
      >
        <div className="w-full">
          <div className="glass shadow-elevated rounded-3xl border border-border/60 bg-background/85 p-6 sm:p-8 backdrop-blur-xl">

            <div
              key={`header-${tab}`}
              className="mb-6 animate-in fade-in slide-in-from-top-3 duration-400 ease-out"
            >
              <h2 className="text-2xl font-semibold tracking-tight">
                {tab === "login" ? "Welcome back" : "Create your account"}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {tab === "login"
                  ? "Sign in to your GReviewPilot workspace."
                  : "Start your 14-day trial. No credit card required."}
              </p>
            </div>

            {/* Sliding Animated Tabs */}
            <div className="relative mb-6 grid grid-cols-2 gap-1 rounded-xl border border-border/60 bg-surface p-1">
              <div
                className={
                  "absolute bottom-1 top-1 w-[calc(50%-4px)] rounded-lg bg-background shadow-sm transition-all duration-300 ease-out " +
                  (tab === "login" ? "left-1" : "left-[calc(50%+2px)]")
                }
              />
              {(["login", "signup"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={
                    "relative z-10 rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-200 " +
                    (tab === t
                      ? "text-foreground font-semibold"
                      : "text-muted-foreground hover:text-foreground")
                  }
                >
                  {t === "login" ? "Log in" : "Sign up"}
                </button>
              ))}
            </div>

            <div
              key={`view-${tab}`}
              className="animate-in fade-in zoom-in-95 duration-300 ease-out"
            >
              {tab === "login" ? (
                <>
                  {/* Google */}
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => signIn("google", { callbackUrl: "/dashboard" })}
                    className="group flex w-full items-center justify-center gap-3 rounded-xl border border-border bg-background px-4 py-2.5 text-sm font-medium text-foreground shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-soft disabled:opacity-60"
                  >
                    <GoogleIcon />
                    Continue with Google
                  </button>

                  <div className="my-5 flex items-center gap-3">
                    <div className="h-px flex-1 bg-border" />
                    <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
                      or with email
                    </span>
                    <div className="h-px flex-1 bg-border" />
                  </div>

                  <LoginForm loading={loading} setLoading={setLoading} />
                </>
              ) : (
                <SignupWizard loading={loading} setLoading={setLoading} />
              )}
            </div>

            <p className="mt-6 text-center text-xs text-muted-foreground">
              {tab === "login" ? (
                <>
                  New to GReviewPilot?{" "}
                  <button
                    onClick={() => setTab("signup")}
                    className="font-medium text-foreground underline underline-offset-4"
                  >
                    Create an account
                  </button>
                </>
              ) : (
                <>
                  Already have an account?{" "}
                  <button
                    onClick={() => setTab("login")}
                    className="font-medium text-foreground underline underline-offset-4"
                  >
                    Log in
                  </button>
                </>
              )}
            </p>

            <p className="mt-4 text-center text-[11px] leading-relaxed text-muted-foreground">
              By continuing you agree to our{" "}
              <a href="#" className="underline underline-offset-4">
                Terms
              </a>{" "}
              and{" "}
              <a href="#" className="underline underline-offset-4">
                Privacy Policy
              </a>
              .
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path
        fill="#EA4335"
        d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.7 2.4 30.2 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.5 13 17.8 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.5 24.6c0-1.6-.1-3.2-.4-4.7H24v9h12.7c-.6 3-2.3 5.5-4.9 7.2l7.7 6c4.5-4.2 7-10.4 7-17.5z"
      />
      <path
        fill="#FBBC05"
        d="M10.5 28.7c-.5-1.5-.8-3-.8-4.7s.3-3.2.8-4.7l-7.9-6.1C1 16.7 0 20.2 0 24s1 7.3 2.6 10.8l7.9-6.1z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.5 0 11.9-2.2 15.9-5.9l-7.7-6c-2.2 1.5-5 2.4-8.2 2.4-6.2 0-11.5-3.5-13.5-9.3l-7.9 6.1C6.5 42.6 14.6 48 24 48z"
      />
    </svg>
  );
}

function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null;
  return (
    <p className="mt-1 flex items-center gap-1.5 text-[11.5px] font-medium text-red-500 animate-in fade-in slide-in-from-top-1 duration-200">
      <AlertCircle className="h-3.5 w-3.5 shrink-0" />
      <span>{msg}</span>
    </p>
  );
}

function LoginForm({
  loading,
  setLoading,
}: {
  loading: boolean;
  setLoading: (v: boolean) => void;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>(
    {},
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      const fe: typeof errors = {};
      parsed.error.issues.forEach((i) => {
        fe[i.path[0] as "email" | "password"] = i.message;
      });
      setErrors(fe);
      return;
    }
    setErrors({});
    setLoading(true);
    try {
      const result = await signIn("credentials", {
        email: parsed.data.email,
        password: parsed.data.password,
        redirect: false,
      });
      if (!result || result.error) {
        // Auth.js hides specific errors under a generic "CredentialsSignin"
        // code; map to a friendly message.
        toast.error("Invalid email or password");
        setErrors({ password: "Invalid email or password" });
        return;
      }
      toast.success("Signed in");
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      toast.error("Something went wrong. Please try again.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  return (
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
              if (errors.email) setErrors((prev) => ({ ...prev, email: undefined }));
            }}
            placeholder="you@company.com"
            className={
              "w-full rounded-xl border bg-background pl-10 pr-3 py-2.5 text-sm outline-none transition focus:ring-4 " +
              (errors.email
                ? "border-red-500/80 focus:border-red-500 focus:ring-red-500/20"
                : "border-border focus:border-primary focus:ring-primary/15")
            }
          />
        </div>
        <FieldError msg={errors.email} />
      </div>

      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <label className="text-xs font-medium text-foreground">Password</label>
          <Link
            href="/auth/forgot-password"
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Forgot password?
          </Link>
        </div>
        <div className="relative">
          <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type={show ? "text" : "password"}
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              if (errors.password) setErrors((prev) => ({ ...prev, password: undefined }));
            }}
            placeholder="••••••••"
            className={
              "w-full rounded-xl border bg-background pl-10 pr-10 py-2.5 text-sm outline-none transition focus:ring-4 " +
              (errors.password
                ? "border-red-500/80 focus:border-red-500 focus:ring-red-500/20"
                : "border-border focus:border-primary focus:ring-primary/15")
            }
          />
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground hover:bg-surface"
            aria-label={show ? "Hide password" : "Show password"}
          >
            {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        <FieldError msg={errors.password} />
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
            Sign in
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </>
        )}
        <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
      </button>
    </form>
  );
}

function SignupWizard({
  loading,
  setLoading,
}: {
  loading: boolean;
  setLoading: (v: boolean) => void;
}) {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Step 3 (OTP) state
  const [otp, setOtp] = useState("");
  const [otpError, setOtpError] = useState<string | undefined>();
  const [resending, setResending] = useState(false);
  const [otpResentAt, setOtpResentAt] = useState<number | null>(null);

  // Step 1 Form Data
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [businessWebsite, setBusinessWebsite] = useState("");
  const [businessPhone, setBusinessPhone] = useState("");
  const [terms, setTerms] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [errors, setErrors] = useState<Record<string, string>>({});

  // Step 2 Onboarding Data
  const [category, setCategory] = useState("");
  const [categoryQuery, setCategoryQuery] = useState("");
  const [isCategoryOpen, setIsCategoryOpen] = useState(false);
  const [locations, setLocations] = useState("1 location");
  const [achieve, setAchieve] = useState<string[]>([
    "trust",
    "customers",
    "presence",
  ]);

  const strength = useMemo(() => evaluatePassword(password), [password]);

  const filteredCategories = useMemo(() => {
    if (!categoryQuery.trim()) return CATEGORIES;
    return CATEGORIES.filter((c) =>
      c.toLowerCase().includes(categoryQuery.toLowerCase()),
    );
  }, [categoryQuery]);

  function handleStep1Submit(e: React.FormEvent) {
    e.preventDefault();
    const result = signupStep1Schema.safeParse({
      firstName,
      lastName,
      email,
      password,
      confirmPassword,
      businessName,
      businessWebsite,
      businessPhone,
      terms,
    });

    if (!result.success) {
      const errMap: Record<string, string> = {};
      result.error.issues.forEach((issue) => {
        if (issue.path[0]) errMap[issue.path[0].toString()] = issue.message;
      });
      setErrors(errMap);
      return;
    }

    setErrors({});
    setStep(2);
  }

  /**
   * Step 2 → Step 3.
   * We DON'T create the account here. We only request an email OTP;
   * the account is created in Step 3 after the OTP is confirmed.
   */
  async function handleStep2Submit(e: React.FormEvent) {
    e.preventDefault();
    if (!category) {
      setErrors({ category: "Please select or search your business category" });
      return;
    }
    setErrors({});
    setLoading(true);
    try {
      await apiFetch<{ sent: boolean }>(
        "/api/auth/signup/otp/request",
        {
          method: "POST",
          body: JSON.stringify({ email }),
        },
      );
      // Stash onboarding preferences for the workspace setup module.
      try {
        sessionStorage.setItem(
          "gp_onboarding",
          JSON.stringify({ category, locations, achieve }),
        );
      } catch {
        /* ignore quota errors */
      }
      setOtp("");
      setOtpError(undefined);
      setStep(3);
      toast.success(`We sent a 6-digit code to ${email}`);
    } catch (err) {
      if (err instanceof ApiClientError) {
        toast.error(err.message);
      } else {
        toast.error("Couldn't send the verification code. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  }

  /**
   * Step 3 — verify OTP, create the account, auto sign in.
   */
  async function handleStep3Submit(e: React.FormEvent) {
    e.preventDefault();
    const clean = otp.replace(/\D/g, "");
    if (clean.length !== 6) {
      setOtpError("Enter the 6-digit code from your email");
      return;
    }
    setOtpError(undefined);
    setLoading(true);
    try {
      await apiFetch<{ userId: string; email: string; tenantId: string }>(
        "/api/auth/signup",
        {
          method: "POST",
          body: JSON.stringify({
            firstName,
            lastName,
            email,
            password,
            businessName,
            businessWebsite: businessWebsite || undefined,
            businessPhone: businessPhone || undefined,
            acceptTerms: true,
            otp: clean,
          }),
        },
      );
      toast.success("Welcome to GReviewPilot");
      // Auto sign-in with the same credentials — no email link needed.
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });
      if (result?.error) {
        // Extremely rare — sign-in of a just-created account failed.
        router.push("/auth");
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      if (err instanceof ApiClientError) {
        if (err.code === "TOKEN_INVALID" || err.code === "TOKEN_EXPIRED") {
          setOtpError(err.message);
        } else if (err.code === "EMAIL_ALREADY_EXISTS") {
          toast.error(err.message);
          // Reset the wizard to step 1 so the user can log in instead.
          setStep(1);
        } else if (err.fields) {
          setErrors(err.fields);
          setStep(1);
          toast.error("Please review the highlighted fields.");
        } else {
          toast.error(err.message);
        }
      } else {
        toast.error("Couldn't finish signup. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleResendOtp() {
    // Simple client-side throttle so the button can't be spammed.
    if (otpResentAt && Date.now() - otpResentAt < 30_000) {
      toast.info("Please wait a few seconds before requesting another code.");
      return;
    }
    setResending(true);
    try {
      await apiFetch("/api/auth/signup/otp/request", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      setOtpResentAt(Date.now());
      setOtp("");
      setOtpError(undefined);
      toast.success("A new code is on its way.");
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : "Try again in a moment.");
    } finally {
      setResending(false);
    }
  }

  function toggleAchieve(id: string) {
    setAchieve((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  }

  const clearErr = (field: string) => {
    if (errors[field]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  return (
    <div>
      {/* Wizard Header / Indicator */}
      <div className="mb-6 flex items-center justify-between border-b border-border/60 pb-3">
        <div className="text-xs font-semibold uppercase tracking-wider text-primary">
          {step === 1
            ? "Step 1: Sign Up"
            : step === 2
              ? "Step 2: Business Onboarding"
              : "Step 3: Verify your email"}
        </div>
        <div className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground bg-surface px-2.5 py-0.5 rounded-full border border-border/60">
          <span
            className={
              "h-1.5 w-1.5 rounded-full " +
              (step === 1
                ? "bg-primary"
                : step === 2
                  ? "bg-primary"
                  : "bg-emerald-500")
            }
          />
          Step {step} of 3
        </div>
      </div>

      {step === 1 ? (
        <form
          key="step-1"
          onSubmit={handleStep1Submit}
          noValidate
          className="space-y-5 animate-in fade-in slide-in-from-right-4 duration-300"
        >
          {/* Personal Information */}
          <div>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <User className="h-3.5 w-3.5 text-primary" /> Personal Information
            </h3>
            {/* 2x2 Grid */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-foreground">
                  First Name *
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="text"
                    value={firstName}
                    onChange={(e) => {
                      setFirstName(e.target.value);
                      clearErr("firstName");
                    }}
                    placeholder="Ada"
                    className={
                      "w-full rounded-xl border bg-background pl-9 pr-3 py-2 text-sm outline-none transition focus:ring-4 " +
                      (errors.firstName
                        ? "border-red-500/80 focus:border-red-500 focus:ring-red-500/20"
                        : "border-border focus:border-primary focus:ring-primary/15")
                    }
                  />
                </div>
                <FieldError msg={errors.firstName} />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-foreground">
                  Last Name *
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="text"
                    value={lastName}
                    onChange={(e) => {
                      setLastName(e.target.value);
                      clearErr("lastName");
                    }}
                    placeholder="Lovelace"
                    className={
                      "w-full rounded-xl border bg-background pl-9 pr-3 py-2 text-sm outline-none transition focus:ring-4 " +
                      (errors.lastName
                        ? "border-red-500/80 focus:border-red-500 focus:ring-red-500/20"
                        : "border-border focus:border-primary focus:ring-primary/15")
                    }
                  />
                </div>
                <FieldError msg={errors.lastName} />
              </div>

              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-medium text-foreground">
                  Email *
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      clearErr("email");
                    }}
                    placeholder="you@company.com"
                    className={
                      "w-full rounded-xl border bg-background pl-9 pr-3 py-2 text-sm outline-none transition focus:ring-4 " +
                      (errors.email
                        ? "border-red-500/80 focus:border-red-500 focus:ring-red-500/20"
                        : "border-border focus:border-primary focus:ring-primary/15")
                    }
                  />
                </div>
                <FieldError msg={errors.email} />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-foreground">
                  Password *
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      clearErr("password");
                    }}
                    placeholder="At least 8 characters"
                    className={
                      "w-full rounded-xl border bg-background pl-9 pr-9 py-2 text-sm outline-none transition focus:ring-4 " +
                      (errors.password
                        ? "border-red-500/80 focus:border-red-500 focus:ring-red-500/20"
                        : "border-border focus:border-primary focus:ring-primary/15")
                    }
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:bg-surface"
                  >
                    {showPassword ? (
                      <EyeOff className="h-3.5 w-3.5" />
                    ) : (
                      <Eye className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
                <FieldError msg={errors.password} />
              </div>

              <div>
                <div className="mb-1 flex items-center justify-between">
                  <label className="block text-xs font-medium text-foreground">
                    Confirm Password *
                  </label>
                  {confirmPassword.length > 0 && (
                    <div className="flex items-center gap-1 text-[11px] font-medium animate-in zoom-in-75 fade-in duration-200">
                      {password === confirmPassword && password.length > 0 ? (
                        <span className="flex items-center gap-1 font-semibold text-emerald-600">
                          <CheckCircle2 className="h-3.5 w-3.5 fill-emerald-100 text-emerald-600" />
                          Passwords match
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 font-semibold text-red-500">
                          <XCircle className="h-3.5 w-3.5 fill-red-100 text-red-500" />
                          Passwords do not match
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type={showConfirmPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => {
                      setConfirmPassword(e.target.value);
                      clearErr("confirmPassword");
                    }}
                    placeholder="Re-enter password"
                    className={
                      "w-full rounded-xl border bg-background pl-9 pr-14 py-2 text-sm outline-none transition focus:ring-4 " +
                      (confirmPassword.length > 0 && password === confirmPassword && password.length > 0
                        ? "border-emerald-500/80 focus:border-emerald-500 focus:ring-emerald-500/20"
                        : confirmPassword.length > 0 && password !== confirmPassword
                        ? "border-red-500/80 focus:border-red-500 focus:ring-red-500/20"
                        : errors.confirmPassword
                        ? "border-red-500/80 focus:border-red-500 focus:ring-red-500/20"
                        : "border-border focus:border-primary focus:ring-primary/15")
                    }
                  />
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                    {confirmPassword.length > 0 && (
                      <span className="animate-in zoom-in-50 fade-in duration-200">
                        {password === confirmPassword && password.length > 0 ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-500 fill-emerald-100" />
                        ) : (
                          <XCircle className="h-4 w-4 text-red-500 fill-red-100" />
                        )}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword((v) => !v)}
                      className="rounded-md p-1 text-muted-foreground hover:bg-surface"
                    >
                      {showConfirmPassword ? (
                        <EyeOff className="h-3.5 w-3.5" />
                      ) : (
                        <Eye className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                </div>
                <FieldError msg={errors.confirmPassword} />
              </div>
            </div>

            {/* Password strength */}
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
                  <span>{strength.checks.filter((c) => c.ok).length}/5 passed</span>
                </div>
              </div>
            )}
          </div>

          {/* Business Information */}
          <div className="border-t border-border/60 pt-4">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Building2 className="h-3.5 w-3.5 text-primary" /> Business Information
            </h3>
            {/* 2x2 Grid */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-medium text-foreground">
                  Business Name *
                </label>
                <div className="relative">
                  <Building2 className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="text"
                    value={businessName}
                    onChange={(e) => {
                      setBusinessName(e.target.value);
                      clearErr("businessName");
                    }}
                    placeholder="Acme Coffee Roasters"
                    className={
                      "w-full rounded-xl border bg-background pl-9 pr-3 py-2 text-sm outline-none transition focus:ring-4 " +
                      (errors.businessName
                        ? "border-red-500/80 focus:border-red-500 focus:ring-red-500/20"
                        : "border-border focus:border-primary focus:ring-primary/15")
                    }
                  />
                </div>
                <FieldError msg={errors.businessName} />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-foreground">
                  Business Website <span className="text-muted-foreground font-normal">(Optional)</span>
                </label>
                <div className="relative">
                  <Globe className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="text"
                    value={businessWebsite}
                    onChange={(e) => setBusinessWebsite(e.target.value)}
                    placeholder="acmecoffee.com"
                    className="w-full rounded-xl border border-border bg-background pl-9 pr-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/15"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-foreground">
                  Business Phone <span className="text-muted-foreground font-normal">(Optional)</span>
                </label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="tel"
                    value={businessPhone}
                    onChange={(e) => setBusinessPhone(e.target.value)}
                    placeholder="+91 98765 43210"
                    className="w-full rounded-xl border border-border bg-background pl-9 pr-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/15"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Agreement Checkbox */}
          <div className="border-t border-border/60 pt-3">
            <label className="flex items-start gap-2.5 cursor-pointer group">
              <button
                type="button"
                onClick={() => {
                  setTerms((v) => !v);
                  clearErr("terms");
                }}
                className="mt-0.5 text-primary transition shrink-0"
              >
                {terms ? (
                  <CheckSquare className="h-4.5 w-4.5 fill-primary text-background" />
                ) : (
                  <Square className={"h-4.5 w-4.5 " + (errors.terms ? "text-red-500" : "text-muted-foreground group-hover:text-foreground")} />
                )}
              </button>
              <span className="text-xs text-muted-foreground leading-snug">
                I agree to the{" "}
                <a href="#" className="font-medium text-foreground underline underline-offset-2">
                  Terms of Service
                </a>{" "}
                &{" "}
                <a href="#" className="font-medium text-foreground underline underline-offset-2">
                  Privacy Policy
                </a>
              </span>
            </label>
            <FieldError msg={errors.terms} />
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            className="group relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-foreground px-4 py-3 text-sm font-semibold text-background transition-all hover:-translate-y-0.5"
          >
            Continue to Business Onboarding
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
          </button>
        </form>
      ) : step === 2 ? (
        /* Step 2: Business Onboarding Wizard */
        <form
          key="step-2"
          onSubmit={handleStep2Submit}
          noValidate
          className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300"
        >
          <div>
            <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Building2 className="h-3.5 w-3.5 text-primary" /> Business Details
            </h3>

            <div className="space-y-4">
              {/* Business Name (pre-filled) */}
              <div>
                <label className="mb-1 block text-xs font-medium text-foreground">
                  Business Name
                </label>
                <div className="relative">
                  <Building2 className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="text"
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                    className="w-full rounded-xl border border-border bg-background pl-9 pr-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/15"
                  />
                </div>
              </div>

              {/* Business Category Search Dropdown */}
              <div className="relative">
                <label className="mb-1 block text-xs font-medium text-foreground">
                  Business Category *
                </label>
                <button
                  type="button"
                  onClick={() => setIsCategoryOpen((v) => !v)}
                  className={
                    "flex w-full items-center justify-between rounded-xl border bg-background px-3 py-2.5 text-sm transition focus:ring-4 " +
                    (errors.category
                      ? "border-red-500/80 focus:border-red-500 focus:ring-red-500/20"
                      : "border-border focus:border-primary focus:ring-primary/15")
                  }
                >
                  <span className={category ? "text-foreground font-medium" : "text-muted-foreground"}>
                    {category || "Select or search category..."}
                  </span>
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                </button>
                <FieldError msg={errors.category} />

                {isCategoryOpen && (
                  <div className="absolute z-20 mt-1 w-full rounded-xl border border-border bg-background p-2 shadow-elevated">
                    <div className="relative mb-2">
                      <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                      <input
                        type="text"
                        autoFocus
                        value={categoryQuery}
                        onChange={(e) => setCategoryQuery(e.target.value)}
                        placeholder="Search category..."
                        className="w-full rounded-lg border border-border bg-surface pl-8 pr-2 py-1.5 text-xs outline-none focus:border-primary"
                      />
                    </div>
                    <div className="max-h-48 overflow-y-auto space-y-0.5">
                      {filteredCategories.length > 0 ? (
                        filteredCategories.map((c) => (
                          <button
                            type="button"
                            key={c}
                            onClick={() => {
                              setCategory(c);
                              clearErr("category");
                              setIsCategoryOpen(false);
                            }}
                            className={
                              "flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-xs text-left transition " +
                              (category === c
                                ? "bg-primary/10 font-semibold text-primary"
                                : "hover:bg-surface text-foreground")
                            }
                          >
                            <span>{c}</span>
                            {category === c && <Check className="h-3.5 w-3.5 text-primary" />}
                          </button>
                        ))
                      ) : (
                        <div className="p-2 text-center text-xs text-muted-foreground">
                          No category found
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Number of Locations */}
              <div>
                <label className="mb-2 block text-xs font-medium text-foreground">
                  Number of Locations
                </label>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {["1 location", "2–5 locations", "6–20 locations", "20+ locations"].map((loc) => (
                    <button
                      type="button"
                      key={loc}
                      onClick={() => setLocations(loc)}
                      className={
                        "rounded-xl border px-3 py-2 text-xs font-medium transition text-center " +
                        (locations === loc
                          ? "border-primary bg-primary/10 text-primary font-semibold shadow-sm"
                          : "border-border bg-background text-muted-foreground hover:text-foreground hover:bg-surface")
                      }
                    >
                      {loc}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* What do you want to achieve? (Multi-select) */}
          <div className="border-t border-border/60 pt-4">
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Target className="h-3.5 w-3.5 text-primary" /> What do you want to achieve?
            </h3>
            <p className="mb-3 text-xs text-muted-foreground">
              Select all that apply to customize your workspace.
            </p>

            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {ACHIEVE_OPTIONS.map((opt) => {
                const selected = achieve.includes(opt.id);
                const Icon = opt.icon;
                return (
                  <button
                    type="button"
                    key={opt.id}
                    onClick={() => toggleAchieve(opt.id)}
                    className={
                      "flex items-center gap-3 rounded-xl border p-3 text-left transition-all " +
                      (selected
                        ? "border-primary bg-primary/10 text-foreground font-semibold shadow-sm"
                        : "border-border bg-background text-muted-foreground hover:border-foreground/30")
                    }
                  >
                    <div
                      className={
                        "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition " +
                        (selected
                          ? "bg-primary text-white"
                          : "bg-surface text-muted-foreground")
                      }
                    >
                      <Icon className="h-4 w-4" />
                    </div>
                    <span className="text-xs font-medium text-foreground leading-snug flex-1">
                      {opt.label}
                    </span>
                    {selected && <Check className="h-4 w-4 text-primary shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="rounded-xl border border-border bg-background px-4 py-2.5 text-sm font-medium text-muted-foreground transition hover:bg-surface hover:text-foreground"
            >
              ← Back
            </button>
            <button
              type="submit"
              disabled={loading}
              className="group relative flex flex-1 items-center justify-center gap-2 overflow-hidden rounded-xl bg-foreground px-4 py-2.5 text-sm font-semibold text-background transition-all hover:-translate-y-0.5 disabled:opacity-60"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  Complete Onboarding
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </>
              )}
              <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
            </button>
          </div>
        </form>
      ) : (
        /* Step 3: Email OTP Verification */
        <form
          key="step-3"
          onSubmit={handleStep3Submit}
          noValidate
          className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300"
        >
          <div className="flex flex-col items-center text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
              <MailCheck className="h-6 w-6 text-primary" />
            </div>
            <h3 className="text-lg font-semibold tracking-tight">
              Check your email
            </h3>
            <p className="mt-1 text-sm text-muted-foreground max-w-xs">
              We sent a 6-digit verification code to{" "}
              <span className="font-medium text-foreground break-all">
                {email}
              </span>
            </p>
          </div>

          <div className="flex flex-col items-center gap-2">
            <InputOTP
              maxLength={6}
              value={otp}
              onChange={(v) => {
                setOtp(v);
                if (otpError) setOtpError(undefined);
              }}
              autoFocus
              disabled={loading}
              inputMode="numeric"
              pattern="[0-9]*"
            >
              <InputOTPGroup className="gap-2">
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <InputOTPSlot
                    key={i}
                    index={i}
                    className={
                      "h-12 w-12 rounded-xl border text-lg font-semibold transition " +
                      (otpError
                        ? "border-red-500/80"
                        : "border-border focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/15")
                    }
                  />
                ))}
              </InputOTPGroup>
            </InputOTP>
            {otpError && (
              <p className="flex items-center gap-1.5 text-[11.5px] font-medium text-red-500">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                <span>{otpError}</span>
              </p>
            )}
          </div>

          <div className="flex items-center justify-center text-xs text-muted-foreground">
            Didn&rsquo;t get the code?{" "}
            <button
              type="button"
              onClick={handleResendOtp}
              disabled={resending || loading}
              className="ml-1 inline-flex items-center gap-1 font-medium text-foreground underline-offset-4 hover:underline disabled:opacity-60 disabled:no-underline"
            >
              {resending ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin" /> Resending
                </>
              ) : (
                <>
                  <RefreshCw className="h-3 w-3" /> Resend
                </>
              )}
            </button>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setStep(2)}
              disabled={loading}
              className="rounded-xl border border-border bg-background px-4 py-2.5 text-sm font-medium text-muted-foreground transition hover:bg-surface hover:text-foreground disabled:opacity-60"
            >
              ← Back
            </button>
            <button
              type="submit"
              disabled={loading || otp.length < 6}
              className="group relative flex flex-1 items-center justify-center gap-2 overflow-hidden rounded-xl bg-foreground px-4 py-2.5 text-sm font-semibold text-background transition-all hover:-translate-y-0.5 disabled:opacity-60"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  Verify & create account
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </>
              )}
              <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
