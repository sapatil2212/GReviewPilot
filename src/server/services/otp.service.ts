/**
 * Email OTP service.
 *
 * Used for pre-signup email verification. A 6-digit numeric code is
 * generated, hashed (SHA-256), stored with a 10-minute TTL and sent
 * to the target address. Verification is single-use and rate-limited
 * to 5 attempts per code.
 *
 * Invariants:
 *   - Requesting a new code invalidates any prior unconsumed code
 *     for the same (email, purpose) pair.
 *   - We do NOT leak whether the address is already registered — the
 *     signup handler will short-circuit with a uniform response later.
 */

import { randomInt } from "node:crypto";
import { emailOtpRepository, type OtpPurpose } from "@/server/repositories/emailOtp.repository";
import { emailService } from "@/server/email/email.service";
import { sha256 } from "@/server/utils/hash";
import { AppError } from "@/server/utils/errors";
import { logger } from "@/server/utils/logger";

const OTP_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;

function generate6DigitCode(): string {
  // randomInt is CSPRNG-backed; padded to always be 6 digits.
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

export const otpService = {
  /**
   * Issue a new OTP for the given (email, purpose) and send it via
   * email. Returns quietly so callers can respond uniformly regardless
   * of whether the address is registered (enumeration protection).
   */
  async request(opts: {
    email: string;
    purpose: OtpPurpose;
    firstName?: string;
    ipAddress?: string | null;
  }): Promise<void> {
    const email = opts.email.toLowerCase();

    // Invalidate any outstanding code so the fresh one is the only valid one.
    await emailOtpRepository.invalidateAll(email, opts.purpose);

    const code = generate6DigitCode();
    const expiresAt = new Date(Date.now() + OTP_TTL_MS);
    await emailOtpRepository.create({
      email,
      codeHash: sha256(code),
      purpose: opts.purpose,
      expiresAt,
      ipAddress: opts.ipAddress,
    });

    // Fire-and-forget email; failures are logged by emailService.
    void emailService.sendSignupOtpEmail({
      to: email,
      firstName: opts.firstName,
      code,
    });

    logger.info("OTP issued", { email, purpose: opts.purpose });
  },

  /**
   * Verify a user-supplied code against the latest active OTP.
   * On success, marks the OTP consumed. Throws typed AppErrors on
   * every failure path so route handlers translate cleanly to HTTP.
   *
   * IMPORTANT: this method itself does NOT consume the OTP on failure —
   * it increments the attempt counter and invalidates the whole record
   * once MAX_ATTEMPTS is reached. This limits online brute-force to at
   * most 5 tries against any given 6-digit code (odds < 1 in 200,000).
   */
  async verify(opts: { email: string; code: string; purpose: OtpPurpose }): Promise<void> {
    const email = opts.email.toLowerCase();
    const record = await emailOtpRepository.findLatestActive(email, opts.purpose);

    if (!record) {
      throw new AppError("TOKEN_INVALID", "No active verification code. Please request a new one.", 400);
    }
    if (record.expiresAt <= new Date()) {
      await emailOtpRepository.consume(record.id);
      throw new AppError("TOKEN_EXPIRED", "Verification code has expired. Please request a new one.", 400);
    }
    if (record.attempts >= MAX_ATTEMPTS) {
      await emailOtpRepository.consume(record.id);
      throw new AppError(
        "TOKEN_INVALID",
        "Too many incorrect attempts. Please request a new code.",
        400,
      );
    }

    const incoming = String(opts.code).trim();
    if (!/^\d{6}$/.test(incoming)) {
      await emailOtpRepository.incrementAttempts(record.id);
      throw new AppError("TOKEN_INVALID", "Invalid verification code", 400);
    }

    if (sha256(incoming) !== record.codeHash) {
      await emailOtpRepository.incrementAttempts(record.id);
      const remaining = Math.max(0, MAX_ATTEMPTS - (record.attempts + 1));
      throw new AppError(
        "TOKEN_INVALID",
        remaining > 0
          ? `Incorrect code. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.`
          : "Too many incorrect attempts. Please request a new code.",
        400,
      );
    }

    // Success — mark consumed.
    await emailOtpRepository.consume(record.id);
  },
};
