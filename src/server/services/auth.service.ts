/**
 * Authentication service.
 *
 * Business logic for signup, credential verification, email verification,
 * password reset, and password change. All HTTP entry points (Route
 * Handlers, Auth.js callbacks) delegate to methods on this service.
 *
 * Security invariants enforced here:
 *   - Passwords are hashed with Argon2id before persistence.
 *   - Failed logins always run through Argon2 verify (dummy hash on
 *     unknown email) to prevent user enumeration via timing.
 *   - Verification and reset tokens are single-use and stored as
 *     SHA-256 digests only.
 *   - Signup responses do not disclose whether an email already exists
 *     (uniform response for enumeration protection).
 *   - Successful password changes revoke all OTHER sessions of the user.
 */

import { AuditAction, UserRole, UserStatus, TenantStatus, Prisma, BillingStatus, TenantPlan } from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import { userRepository } from "@/server/repositories/user.repository";
import { tenantRepository } from "@/server/repositories/tenant.repository";
import {
  passwordResetTokenRepository,
  verificationTokenRepository,
} from "@/server/repositories/token.repository";
import { auditRepository } from "@/server/repositories/audit.repository";
import { tenantService } from "./tenant.service";
import { sessionService } from "./session.service";
import { otpService } from "./otp.service";
import { emailService } from "@/server/email/email.service";
import {
  DUMMY_PASSWORD_HASH,
  hashPassword,
  sha256,
  verifyPassword,
} from "@/server/utils/hash";
import { generateToken } from "@/server/utils/tokens";
import {
  AppError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
} from "@/server/utils/errors";
import type {
  SignupInput,
  LoginInput,
  CompleteGoogleSignupInput,
} from "@/server/validators/auth.schema";
import { extractRequestContext } from "@/server/middleware/requestContext";
import { logger } from "@/server/utils/logger";
import { env } from "@/server/utils/env";
import {
  type ActivatablePlan,
  isTrialExpired,
  readTenantMeta,
  trialEndsAtFrom,
} from "@/server/utils/trial";


const VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000; // 1h
const MAX_FAILED_LOGINS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000;

/** Tenant.metadata flag set when Google OAuth creates a provisional workspace. */
export function isSignupIncomplete(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return false;
  }
  return (metadata as Record<string, unknown>).signupIncomplete === true;
}

export const authService = {
  // ============================================================
  // SIGNUP OTP (Step 2.5 of the wizard)
  // Uniform response — never leaks whether the address is registered.
  // ============================================================
  async requestSignupOtp(email: string, request?: Request | Headers | null) {
    const normalized = email.toLowerCase();
    const ctx = request ? extractRequestContext(request) : null;
    const existing = await userRepository.findByEmail(normalized);

    // Enumeration protection: pretend to send even when the address is
    // already registered. But do NOT actually send them a signup OTP
    // (they don't need one; if they need to recover, forgot-password
    // is the correct flow). Silently no-op.
    if (existing) {
      logger.info("Signup OTP requested for existing email — no-op", {
        email: normalized,
      });
      return;
    }

    await otpService.request({
      email: normalized,
      purpose: "signup",
      ipAddress: ctx?.ipAddress,
    });
  },

  // ============================================================
  // SIGNUP (final step — OTP verified, account created)
  // ============================================================
  /**
   * Verifies the OTP the user typed, then creates Tenant + Owner in
   * an atomic transaction. Emails are proven-owned by the OTP so we
   * skip the verify-email link flow entirely and mark the user
   * ACTIVE immediately.
   *
   * Errors surface as typed AppError so the client can show precise
   * messages (bad OTP, expired OTP, email already taken, etc.). Email
   * enumeration is not a concern here because the caller had to
   * already prove control of the mailbox via the OTP.
   */
  async signup(input: SignupInput, request?: Request | Headers | null) {
    const email = input.email.toLowerCase();

    // 1) Verify OTP first — cheap failure path, no side effects.
    await otpService.verify({ email, code: input.otp, purpose: "signup" });

    // 2) Re-check email uniqueness after OTP (race-safe against parallel
    //    signups; the unique index on User.email is still the ultimate
    //    guarantor).
    const existing = await userRepository.findByEmail(email);
    if (existing) {
      throw new ConflictError("EMAIL_ALREADY_EXISTS", "An account with this email already exists");
    }

    const passwordHash = await hashPassword(input.password);

    // 3) Atomic create: tenant + user (both ACTIVE, email pre-verified).
    const { user, tenant } = await prisma.$transaction(async (tx) => {
      const now = new Date();
      const slug = await tenantService.generateUniqueSlug(input.businessName);
      const tenant = await tx.tenant.create({
        data: {
          name: input.businessName,
          slug,
          plan: TenantPlan.TRIAL,
          status: TenantStatus.TRIAL,
          billingStatus: BillingStatus.TRIALING,
          trialStartAt: now,
          trialEndsAt: trialEndsAtFrom(now),
          website: input.businessWebsite ?? null,
          phone: input.businessPhone ?? null,
        },
      });
      const user = await tx.user.create({
        data: {
          tenantId: tenant.id,
          firstName: input.firstName,
          lastName: input.lastName,
          email,
          passwordHash,
          role: UserRole.TENANT_OWNER,
          status: UserStatus.ACTIVE,
          emailVerified: new Date(),
          phone: input.businessPhone ?? null,
        },
      });
      return { user, tenant };
    });

    // 4) Fire welcome email (best-effort) and audit rows.
    void emailService.sendWelcomeEmail({ to: email, firstName: user.firstName });

    const ctx = request ? extractRequestContext(request) : null;
    await auditRepository.record({
      action: AuditAction.SIGNUP,
      userId: user.id,
      tenantId: tenant.id,
      ipAddress: ctx?.ipAddress,
      userAgent: ctx?.userAgent,
      browser: ctx?.browser,
      device: ctx?.device,
    });
    await auditRepository.record({
      action: AuditAction.EMAIL_VERIFIED,
      userId: user.id,
      tenantId: tenant.id,
      metadata: { via: "signup_otp" },
    });

    return { userId: user.id, email, tenantId: tenant.id };
  },

  // ============================================================
  // GOOGLE SIGNUP COMPLETION
  // ============================================================
  /**
   * Finishes a provisional Google signup: replaces the placeholder
   * workspace name with the real business details and clears the
   * `signupIncomplete` metadata flag. Email is already verified by
   * Google, so no OTP is required.
   */
  async completeGoogleSignup(
    userId: string,
    tenantId: string,
    input: CompleteGoogleSignupInput,
    request?: Request | Headers | null,
  ) {
    const [user, tenant] = await Promise.all([
      userRepository.findById(userId),
      tenantRepository.findById(tenantId),
    ]);
    if (!user || user.tenantId !== tenantId) {
      throw new NotFoundError("Account not found");
    }
    if (!tenant) {
      throw new NotFoundError("Workspace not found");
    }
    if (!isSignupIncomplete(tenant.metadata)) {
      // Idempotent — already finished; treat as success.
      return { userId, tenantId, alreadyComplete: true as const };
    }

    const prevMeta =
      tenant.metadata && typeof tenant.metadata === "object" && !Array.isArray(tenant.metadata)
        ? { ...(tenant.metadata as Record<string, unknown>) }
        : {};
    delete prevMeta.signupIncomplete;
    const nextMetadata: Prisma.InputJsonValue = {
      ...prevMeta,
      signupProvider: "google",
      onboarding: {
        category: input.category,
        locations: input.locations,
        achieve: input.achieve,
        completedAt: new Date().toISOString(),
      },
    };

    const slug = await tenantService.generateUniqueSlug(input.businessName, tenantId);

    await prisma.$transaction(async (tx) => {
      await tx.tenant.update({
        where: { id: tenantId },
        data: {
          name: input.businessName,
          slug,
          website: input.businessWebsite ?? null,
          phone: input.businessPhone ?? null,
          industry: input.category,
          metadata: nextMetadata,
        },
      });
      await tx.user.update({
        where: { id: userId },
        data: {
          ...(input.firstName ? { firstName: input.firstName } : {}),
          ...(input.lastName ? { lastName: input.lastName } : {}),
          phone: input.businessPhone ?? user.phone,
        },
      });
    });

    const ctx = request ? extractRequestContext(request) : null;
    await auditRepository.record({
      action: AuditAction.SIGNUP,
      userId,
      tenantId,
      ipAddress: ctx?.ipAddress,
      userAgent: ctx?.userAgent,
      browser: ctx?.browser,
      device: ctx?.device,
      metadata: { provider: "google", phase: "completed" },
    });

    void emailService.sendWelcomeEmail({
      to: user.email,
      firstName: input.firstName ?? user.firstName,
    });

    return { userId, tenantId, alreadyComplete: false as const };
  },

  // ============================================================
  // EMAIL VERIFICATION
  // ============================================================
  async verifyEmail(rawToken: string) {
    const record = await verificationTokenRepository.findByHash(sha256(rawToken));
    if (!record || record.consumedAt) {
      throw new AppError("TOKEN_INVALID", "Verification link is invalid or has already been used", 400);
    }
    if (record.expiresAt <= new Date()) {
      throw new AppError("TOKEN_EXPIRED", "Verification link has expired", 400);
    }

    const user = await userRepository.findById(record.userId);
    if (!user) throw new NotFoundError("Account not found");

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: { emailVerified: new Date(), status: UserStatus.ACTIVE },
      });
      await tx.verificationToken.update({
        where: { id: record.id },
        data: { consumedAt: new Date() },
      });
    });

    await auditRepository.record({
      action: AuditAction.EMAIL_VERIFIED,
      userId: user.id,
      tenantId: user.tenantId,
    });

    // Fire welcome email (best-effort).
    void emailService.sendWelcomeEmail({ to: user.email, firstName: user.firstName });

    return { userId: user.id };
  },

  async resendVerification(email: string) {
    const user = await userRepository.findByEmail(email);
    // Uniform response — always pretend we sent, whether or not user exists.
    if (!user || user.emailVerified) return { sent: true };

    const { raw, hash } = generateToken();
    const expiresAt = new Date(Date.now() + VERIFICATION_TTL_MS);
    await verificationTokenRepository.invalidateAllForUser(user.id);
    await verificationTokenRepository.create(user.id, user.email, hash, expiresAt);
    void emailService.sendVerificationEmail({
      to: user.email,
      firstName: user.firstName,
      token: raw,
    });
    await auditRepository.record({
      action: AuditAction.EMAIL_VERIFICATION_SENT,
      userId: user.id,
      tenantId: user.tenantId,
    });
    return { sent: true };
  },

  // ============================================================
  // LOGIN (credential verification only — session/JWT are handled
  //         by Auth.js callbacks which call into this)
  // ============================================================
  /**
   * Verify email/password and return the User row if valid.
   * Throws typed errors otherwise; callers translate to responses.
   * Handles progressive lockout and constant-time behavior for
   * unknown emails.
   */
  async ensureSuperAdminUser() {
    if (!env.SUPER_ADMIN_USER || !env.SUPER_ADMIN_PASSWORD) return null;
    const email = env.SUPER_ADMIN_USER.toLowerCase();
    let user = await userRepository.findByEmail(email);
    const passwordHash = await hashPassword(env.SUPER_ADMIN_PASSWORD);

    if (!user) {
      user = await prisma.$transaction(async (tx) => {
        let tenant = await tx.tenant.findUnique({ where: { slug: "system-admin" } });
        if (!tenant) {
          tenant = await tx.tenant.create({
            data: {
              name: "System Admin Workspace",
              slug: "system-admin",
              plan: TenantPlan.ENTERPRISE,
              status: TenantStatus.ACTIVE,
              billingStatus: BillingStatus.ACTIVE,
            },
          });
        }
        return await tx.user.create({
          data: {
            tenantId: tenant.id,
            firstName: "Super",
            lastName: "Admin",
            email,
            passwordHash,
            role: UserRole.SUPER_ADMIN,
            status: UserStatus.ACTIVE,
            emailVerified: new Date(),
          },
        });
      });
    } else {
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          passwordHash,
          role: UserRole.SUPER_ADMIN,
          status: UserStatus.ACTIVE,
          emailVerified: user.emailVerified || new Date(),
        },
      });
    }
    return user;
  },

  async verifyCredentials(input: LoginInput, request?: Request | Headers | null) {
    const email = input.email.toLowerCase();
    let user = await userRepository.findByEmail(email);

    if (!user && env.SUPER_ADMIN_USER && email === env.SUPER_ADMIN_USER.toLowerCase()) {
      user = await this.ensureSuperAdminUser();
    }

    const ctx = request ? extractRequestContext(request) : null;

    // Unknown email — constant-time dummy verify to prevent user enumeration.
    if (!user) {
      await verifyPassword(DUMMY_PASSWORD_HASH, input.password);
      await auditRepository.record({
        action: AuditAction.LOGIN_FAILED,
        ipAddress: ctx?.ipAddress,
        userAgent: ctx?.userAgent,
        browser: ctx?.browser,
        device: ctx?.device,
        metadata: { email, reason: "unknown_user" },
      });
      throw new UnauthorizedError("INVALID_CREDENTIALS", "Invalid email or password");
    }


    // Google-only account — no password set. We don't run the dummy hash here
    // because the user's existence is already known (they typed their email),
    // so timing-safety doesn't help. Surface a specific, actionable error.
    if (!user.passwordHash) {
      await auditRepository.record({
        action: AuditAction.LOGIN_FAILED,
        userId: user.id,
        tenantId: user.tenantId,
        ipAddress: ctx?.ipAddress,
        userAgent: ctx?.userAgent,
        browser: ctx?.browser,
        device: ctx?.device,
        metadata: { reason: "google_only_account" },
      });
      throw new AppError(
        "GOOGLE_ACCOUNT",
        "This account uses Google Sign-In. Please continue with Google.",
        401,
      );
    }


    // Account lockout window.
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new UnauthorizedError(
        "ACCOUNT_LOCKED",
        "Account temporarily locked due to failed sign-in attempts. Try again later.",
      );
    }

    const ok = await verifyPassword(user.passwordHash, input.password);
    if (!ok) {
      const nextCount = user.failedLoginCount + 1;
      const shouldLock = nextCount >= MAX_FAILED_LOGINS;
      await userRepository.recordFailedLogin(
        user.id,
        shouldLock ? new Date(Date.now() + LOCK_DURATION_MS) : null,
      );
      await auditRepository.record({
        action: AuditAction.LOGIN_FAILED,
        userId: user.id,
        tenantId: user.tenantId,
        ipAddress: ctx?.ipAddress,
        userAgent: ctx?.userAgent,
        browser: ctx?.browser,
        device: ctx?.device,
        metadata: { reason: "bad_password", attemptCount: nextCount },
      });
      throw new UnauthorizedError(
        "INVALID_CREDENTIALS",
        shouldLock
          ? "Too many failed attempts. Account locked for 15 minutes."
          : "Invalid email or password",
      );
    }

    // Status gates.
    if (user.status === UserStatus.BLOCKED) {
      throw new UnauthorizedError("ACCOUNT_BLOCKED", "This account has been blocked");
    }
    if (user.status === UserStatus.DELETED) {
      const deletedTenant = await tenantRepository.findById(user.tenantId);
      const meta = readTenantMeta(deletedTenant?.metadata);
      throw new AppError(
        "ACCOUNT_DELETED",
        "This account was deleted. Would you like to retrieve it?",
        403,
        {
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          businessName: deletedTenant?.name ?? null,
          plan: deletedTenant?.plan ?? null,
          industry: deletedTenant?.industry ?? null,
          website: deletedTenant?.website ?? null,
          phone: deletedTenant?.phone ?? user.phone,
          deletedAt: (meta.deletedAt as string | undefined) ?? null,
          createdAt: user.createdAt.toISOString(),
        },
      );
    }
    if (!user.emailVerified) {
      throw new UnauthorizedError(
        "EMAIL_NOT_VERIFIED",
        "Please verify your email before signing in",
      );
    }

    // Tenant status gate.
    const tenant = await tenantRepository.findById(user.tenantId);
    if (!tenant || tenant.status === TenantStatus.SUSPENDED) {
      throw new UnauthorizedError("TENANT_SUSPENDED", "Workspace is not available");
    }
    if (tenant.status === TenantStatus.DELETED) {
      const meta = readTenantMeta(tenant.metadata);
      throw new AppError(
        "ACCOUNT_DELETED",
        "This account was deleted. Would you like to retrieve it?",
        403,
        {
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          businessName: tenant.name,
          plan: tenant.plan,
          industry: tenant.industry,
          website: tenant.website,
          phone: tenant.phone ?? user.phone,
          deletedAt: (meta.deletedAt as string | undefined) ?? null,
          createdAt: user.createdAt.toISOString(),
        },
      );
    }

    if (isTrialExpired(tenant)) {
      throw new AppError(
        "TRIAL_ENDED",
        "Your free trial has ended. Subscribe to a plan to continue.",
        403,
        {
          email: user.email,
          firstName: user.firstName,
          businessName: tenant.name,
          trialEndsAt: tenant.trialEndsAt?.toISOString() ?? null,
          plan: tenant.plan,
        },
      );
    }

    // Success.
    await userRepository.recordSuccessfulLogin(user.id);
    await auditRepository.record({
      action: AuditAction.LOGIN_SUCCESS,
      userId: user.id,
      tenantId: user.tenantId,
      ipAddress: ctx?.ipAddress,
      userAgent: ctx?.userAgent,
      browser: ctx?.browser,
      device: ctx?.device,
    });

    return user;
  },

  // ============================================================
  // FORGOT / RESET PASSWORD
  // ============================================================
  async requestPasswordReset(email: string, request?: Request | Headers | null) {
    const user = await userRepository.findByEmail(email);
    const ctx = request ? extractRequestContext(request) : null;

    // Uniform response.
    if (!user) return { sent: true };

    // Invalidate any prior outstanding reset tokens before issuing new one.
    await passwordResetTokenRepository.invalidateAllForUser(user.id);

    const { raw, hash } = generateToken();
    const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MS);
    await passwordResetTokenRepository.create(user.id, hash, expiresAt, ctx?.ipAddress ?? null);

    void emailService.sendPasswordResetEmail({
      to: user.email,
      firstName: user.firstName,
      token: raw,
    });

    await auditRepository.record({
      action: AuditAction.PASSWORD_RESET_REQUESTED,
      userId: user.id,
      tenantId: user.tenantId,
      ipAddress: ctx?.ipAddress,
      userAgent: ctx?.userAgent,
      browser: ctx?.browser,
      device: ctx?.device,
    });

    return { sent: true };
  },

  async resetPassword(rawToken: string, newPassword: string, request?: Request | Headers | null) {
    const record = await passwordResetTokenRepository.findByHash(sha256(rawToken));
    if (!record || record.consumedAt) {
      throw new AppError("TOKEN_INVALID", "Reset link is invalid or has already been used", 400);
    }
    if (record.expiresAt <= new Date()) {
      throw new AppError("TOKEN_EXPIRED", "Reset link has expired", 400);
    }
    const user = await userRepository.findById(record.userId);
    if (!user) throw new NotFoundError("Account not found");

    const passwordHash = await hashPassword(newPassword);

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: {
          passwordHash,
          failedLoginCount: 0,
          lockedUntil: null,
        },
      });
      await tx.passwordResetToken.update({
        where: { id: record.id },
        data: { consumedAt: new Date() },
      });
    });

    // Revoke ALL existing sessions on password reset — critical security step.
    await sessionService.revokeAllForUser(user.id, "PASSWORD_RESET");

    const ctx = request ? extractRequestContext(request) : null;
    await auditRepository.record({
      action: AuditAction.PASSWORD_RESET_COMPLETED,
      userId: user.id,
      tenantId: user.tenantId,
      ipAddress: ctx?.ipAddress,
      userAgent: ctx?.userAgent,
      browser: ctx?.browser,
      device: ctx?.device,
    });

    void emailService.sendPasswordChangedEmail({
      to: user.email,
      firstName: user.firstName,
      ipAddress: ctx?.ipAddress ?? null,
    });

    return { userId: user.id };
  },

  // ============================================================
  // CHANGE PASSWORD (authenticated)
  // ============================================================
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
    currentSessionId?: string,
    request?: Request | Headers | null,
  ) {
    const user = await userRepository.findById(userId);
    if (!user || !user.passwordHash) {
      throw new NotFoundError("Account not found");
    }
    const ok = await verifyPassword(user.passwordHash, currentPassword);
    if (!ok) {
      throw new UnauthorizedError("INVALID_CREDENTIALS", "Current password is incorrect");
    }
    if (currentPassword === newPassword) {
      throw new ConflictError("CONFLICT", "New password must be different from the current password");
    }

    const passwordHash = await hashPassword(newPassword);
    await userRepository.updatePassword(user.id, passwordHash);

    // Revoke every OTHER session so this device stays signed in.
    await sessionService.revokeAllForUser(user.id, "PASSWORD_CHANGED", currentSessionId);

    const ctx = request ? extractRequestContext(request) : null;
    await auditRepository.record({
      action: AuditAction.PASSWORD_CHANGED,
      userId: user.id,
      tenantId: user.tenantId,
      ipAddress: ctx?.ipAddress,
      userAgent: ctx?.userAgent,
      browser: ctx?.browser,
      device: ctx?.device,
    });

    void emailService.sendPasswordChangedEmail({
      to: user.email,
      firstName: user.firstName,
      ipAddress: ctx?.ipAddress ?? null,
    });
    return { userId: user.id };
  },

  // ============================================================
  // PLAN ACTIVATION (post-trial)
  // ============================================================
  /**
   * Verifies credentials, activates a subscription plan on an expired
   * trial workspace, then returns the user so the caller can sign them in.
   */
  async activatePlan(
    input: LoginInput & { plan: ActivatablePlan },
    request?: Request | Headers | null,
  ) {
    const email = input.email.toLowerCase();
    const user = await userRepository.findByEmail(email);
    if (!user?.passwordHash) {
      await verifyPassword(DUMMY_PASSWORD_HASH, input.password);
      throw new UnauthorizedError("INVALID_CREDENTIALS", "Invalid email or password");
    }
    const ok = await verifyPassword(user.passwordHash, input.password);
    if (!ok) {
      throw new UnauthorizedError("INVALID_CREDENTIALS", "Invalid email or password");
    }
    if (user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedError("ACCOUNT_INACTIVE", "Account is not active");
    }

    const tenant = await tenantRepository.findById(user.tenantId);
    if (!tenant) throw new NotFoundError("Workspace not found");

    const planEnum =
      input.plan === "GROWTH"
        ? TenantPlan.GROWTH
        : input.plan === "SCALE"
          ? TenantPlan.SCALE
          : TenantPlan.STARTER;

    await tenantRepository.update(tenant.id, {
      plan: planEnum,
      status: TenantStatus.ACTIVE,
      billingStatus: BillingStatus.ACTIVE,
      reactivatedAt: new Date(),
    });

    const ctx = request ? extractRequestContext(request) : null;
    await auditRepository.record({
      action: AuditAction.WORKSPACE_UPDATED,
      userId: user.id,
      tenantId: tenant.id,
      ipAddress: ctx?.ipAddress,
      userAgent: ctx?.userAgent,
      metadata: { plan: input.plan, reason: "trial_ended_subscribe" },
    });

    await userRepository.recordSuccessfulLogin(user.id);
    return user;
  },

  /**
   * Activates a plan for an already-authenticated session (dashboard
   * subscribe modal when the trial expires mid-session).
   */
  async activatePlanForSession(
    userId: string,
    tenantId: string,
    plan: ActivatablePlan,
    request?: Request | Headers | null,
  ) {
    const [user, tenant] = await Promise.all([
      userRepository.findById(userId),
      tenantRepository.findById(tenantId),
    ]);
    if (!user || user.tenantId !== tenantId) throw new NotFoundError("Account not found");
    if (!tenant) throw new NotFoundError("Workspace not found");

    const planEnum =
      plan === "GROWTH"
        ? TenantPlan.GROWTH
        : plan === "SCALE"
          ? TenantPlan.SCALE
          : TenantPlan.STARTER;

    await tenantRepository.update(tenant.id, {
      plan: planEnum,
      status: TenantStatus.ACTIVE,
      billingStatus: BillingStatus.ACTIVE,
      reactivatedAt: new Date(),
    });

    const ctx = request ? extractRequestContext(request) : null;
    await auditRepository.record({
      action: AuditAction.WORKSPACE_UPDATED,
      userId,
      tenantId,
      ipAddress: ctx?.ipAddress,
      userAgent: ctx?.userAgent,
      metadata: { plan, reason: "subscribe_from_dashboard" },
    });

    return { plan: planEnum };
  },

  // ============================================================
  // ACCOUNT DELETE / RESTORE
  // ============================================================
  async deleteAccount(
    userId: string,
    tenantId: string,
    confirmation: string,
    request?: Request | Headers | null,
  ) {
    const [user, tenant] = await Promise.all([
      userRepository.findById(userId),
      tenantRepository.findById(tenantId),
    ]);
    if (!user || user.tenantId !== tenantId) throw new NotFoundError("Account not found");
    if (user.role !== UserRole.TENANT_OWNER) {
      throw new ForbiddenError("Only the workspace owner can delete this account");
    }
    if (!tenant) throw new NotFoundError("Workspace not found");
    if (confirmation.trim().toUpperCase() !== "DELETE") {
      throw new AppError(
        "VALIDATION_ERROR",
        'Type DELETE to permanently remove this account',
        400,
      );
    }

    const meta = readTenantMeta(tenant.metadata);
    const nextMeta: Prisma.InputJsonValue = {
      ...meta,
      deletedAt: new Date().toISOString(),
      deletedByUserId: userId,
      previousStatus: tenant.status,
      previousPlan: tenant.plan,
      previousBillingStatus: tenant.billingStatus,
    };

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { status: UserStatus.DELETED },
      });
      // Soft-delete every member of the workspace so team logins also fail cleanly.
      await tx.user.updateMany({
        where: { tenantId, status: { not: UserStatus.DELETED } },
        data: { status: UserStatus.DELETED },
      });
      await tx.tenant.update({
        where: { id: tenantId },
        data: {
          status: TenantStatus.DELETED,
          metadata: nextMeta,
        },
      });
    });

    await sessionService.revokeAllForUser(userId, "ACCOUNT_DELETED");

    const ctx = request ? extractRequestContext(request) : null;
    await auditRepository.record({
      action: AuditAction.USER_REMOVED,
      userId,
      tenantId,
      ipAddress: ctx?.ipAddress,
      userAgent: ctx?.userAgent,
      metadata: { reason: "owner_self_delete" },
    });

    return { deleted: true as const };
  },

  async restoreAccount(input: LoginInput, request?: Request | Headers | null) {
    const email = input.email.toLowerCase();
    const user = await userRepository.findByEmail(email);
    if (!user?.passwordHash) {
      await verifyPassword(DUMMY_PASSWORD_HASH, input.password);
      throw new UnauthorizedError("INVALID_CREDENTIALS", "Invalid email or password");
    }
    const ok = await verifyPassword(user.passwordHash, input.password);
    if (!ok) {
      throw new UnauthorizedError("INVALID_CREDENTIALS", "Invalid email or password");
    }
    if (user.status !== UserStatus.DELETED) {
      throw new ConflictError("CONFLICT", "This account is not deleted");
    }

    const tenant = await tenantRepository.findById(user.tenantId);
    if (!tenant) throw new NotFoundError("Workspace not found");

    const meta = readTenantMeta(tenant.metadata);
    const prevStatus =
      (meta.previousStatus as TenantStatus | undefined) ?? TenantStatus.TRIAL;
    const prevPlan = (meta.previousPlan as TenantPlan | undefined) ?? TenantPlan.TRIAL;
    const prevBilling =
      (meta.previousBillingStatus as BillingStatus | undefined) ?? BillingStatus.TRIALING;

    delete meta.deletedAt;
    delete meta.deletedByUserId;
    delete meta.previousStatus;
    delete meta.previousPlan;
    delete meta.previousBillingStatus;

    // If they restore after the trial window and were still on TRIAL, force
    // plan selection on next login via isTrialExpired.
    const restoreStatus =
      prevStatus === TenantStatus.DELETED ? TenantStatus.TRIAL : prevStatus;

    await prisma.$transaction(async (tx) => {
      await tx.user.updateMany({
        where: { tenantId: tenant.id },
        data: { status: UserStatus.ACTIVE },
      });
      await tx.tenant.update({
        where: { id: tenant.id },
        data: {
          status: restoreStatus,
          plan: prevPlan,
          billingStatus: prevBilling,
          reactivatedAt: new Date(),
          metadata: meta as Prisma.InputJsonValue,
        },
      });
    });

    const ctx = request ? extractRequestContext(request) : null;
    await auditRepository.record({
      action: AuditAction.WORKSPACE_REACTIVATED,
      userId: user.id,
      tenantId: tenant.id,
      ipAddress: ctx?.ipAddress,
      userAgent: ctx?.userAgent,
      metadata: { reason: "owner_restore" },
    });

    const refreshed = await tenantRepository.findById(tenant.id);
    if (refreshed && isTrialExpired(refreshed)) {
      throw new AppError(
        "TRIAL_ENDED",
        "Your account was restored, but your free trial has ended. Subscribe to continue.",
        403,
        {
          email: user.email,
          firstName: user.firstName,
          businessName: refreshed.name,
          trialEndsAt: refreshed.trialEndsAt?.toISOString() ?? null,
          plan: refreshed.plan,
          restored: true,
        },
      );
    }

    await userRepository.recordSuccessfulLogin(user.id);
    return user;
  },

  async dismissWelcome(tenantId: string) {
    const tenant = await tenantRepository.findById(tenantId);
    if (!tenant) throw new NotFoundError("Workspace not found");
    const meta = readTenantMeta(tenant.metadata);
    meta.welcomeDismissed = true;
    await tenantRepository.update(tenantId, {
      metadata: meta as Prisma.InputJsonValue,
    });
    return { dismissed: true as const };
  },
};
