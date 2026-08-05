/**
 * Zod schemas for every authentication input.
 * These are the ONLY source of truth for input validation on the server.
 */

import { z } from "zod";

const email = z
  .string()
  .trim()
  .toLowerCase()
  .email("Enter a valid email address")
  .max(255);

const password = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128, "Password must be at most 128 characters")
  .regex(/[A-Z]/, "Password must contain an uppercase letter")
  .regex(/[a-z]/, "Password must contain a lowercase letter")
  .regex(/\d/, "Password must contain a number")
  .regex(/[^A-Za-z0-9]/, "Password must contain a special character");

const name = z.string().trim().min(1, "Required").max(100);

// ------- Signup OTP request -------
// User submits their email at the end of onboarding; server emails a
// 6-digit code they then confirm as part of the final signup call.
export const requestSignupOtpSchema = z.object({ email });
export type RequestSignupOtpInput = z.infer<typeof requestSignupOtpSchema>;

// ------- Website field (shared) -------
// Accept "acme.com" or "https://acme.com". Empty string → undefined.
const businessWebsite = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? v : undefined))
  .refine(
    (v) => !v || /^(https?:\/\/)?[^\s]+\.[^\s]{2,}$/i.test(v),
    "Enter a valid website (e.g. acme.com or https://acme.com)",
  );

// ------- Signup -------
export const signupSchema = z.object({
  firstName: name,
  lastName: name,
  email,
  password,
  businessName: z.string().trim().min(1, "Business name is required").max(150),
  businessWebsite,
  businessPhone: z.string().trim().max(30).optional().transform((v) => v || undefined),
  acceptTerms: z.literal(true, {
    errorMap: () => ({ message: "You must accept the Terms and Privacy Policy" }),
  }),
  // 6-digit code that was emailed to `email` and typed back in the wizard.
  otp: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "Enter the 6-digit code from your email"),
});
export type SignupInput = z.infer<typeof signupSchema>;

// ------- Login -------
export const loginSchema = z.object({
  email,
  password: z.string().min(1, "Password is required").max(128),
  rememberMe: z.boolean().optional().default(false),
});
export type LoginInput = z.infer<typeof loginSchema>;

// ------- Email verification -------
export const verifyEmailSchema = z.object({
  token: z.string().min(20, "Invalid verification token").max(200),
});
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;

export const resendVerificationSchema = z.object({ email });
export type ResendVerificationInput = z.infer<typeof resendVerificationSchema>;

// ------- Forgot / reset password -------
export const forgotPasswordSchema = z.object({ email });
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z
  .object({
    token: z.string().min(20).max(200),
    password,
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

// ------- Change password (authenticated) -------
export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1),
    newPassword: password,
    confirmPassword: z.string(),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
