/**
 * Typed application errors.
 *
 * All errors thrown across services should be `AppError` (or subclasses)
 * so the central handler can safely map them to HTTP responses without
 * leaking internal details.
 */

export type AppErrorCode =
  // Validation / input
  | "VALIDATION_ERROR"
  | "INVALID_REQUEST"
  // Auth
  | "INVALID_CREDENTIALS"
  | "EMAIL_NOT_VERIFIED"
  | "ACCOUNT_LOCKED"
  | "ACCOUNT_BLOCKED"
  | "ACCOUNT_INACTIVE"
  | "TENANT_SUSPENDED"
  | "SESSION_EXPIRED"
  | "SESSION_REVOKED"
  | "SESSION_INVALID"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  // Resources
  | "NOT_FOUND"
  | "CONFLICT"
  | "EMAIL_ALREADY_EXISTS"
  | "TOKEN_INVALID"
  | "TOKEN_EXPIRED"
  | "TOKEN_ALREADY_USED"
  // Upload / file
  | "FILE_TOO_LARGE"
  | "UNSUPPORTED_MEDIA_TYPE"
  | "INVALID_FILE"
  // Rate limiting
  | "RATE_LIMITED"
  // Server
  | "INTERNAL_ERROR";

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly status: number;
  readonly publicMessage: string;
  readonly meta?: Record<string, unknown>;

  constructor(
    code: AppErrorCode,
    publicMessage: string,
    status: number,
    meta?: Record<string, unknown>,
  ) {
    super(publicMessage);
    this.name = "AppError";
    this.code = code;
    this.status = status;
    this.publicMessage = publicMessage;
    this.meta = meta;
  }
}

export class ValidationError extends AppError {
  constructor(message = "Invalid request payload", meta?: Record<string, unknown>) {
    super("VALIDATION_ERROR", message, 400, meta);
    this.name = "ValidationError";
  }
}

export class UnauthorizedError extends AppError {
  constructor(code: AppErrorCode = "UNAUTHENTICATED", message = "Authentication required") {
    super(code, message, 401);
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "You do not have permission to perform this action") {
    super("FORBIDDEN", message, 403);
    this.name = "ForbiddenError";
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Resource not found") {
    super("NOT_FOUND", message, 404);
    this.name = "NotFoundError";
  }
}

export class ConflictError extends AppError {
  constructor(code: AppErrorCode = "CONFLICT", message = "Resource already exists") {
    super(code, message, 409);
    this.name = "ConflictError";
  }
}

export class RateLimitError extends AppError {
  constructor(message = "Too many requests. Please try again later.", retryAfterSeconds?: number) {
    super("RATE_LIMITED", message, 429, retryAfterSeconds ? { retryAfterSeconds } : undefined);
    this.name = "RateLimitError";
  }
}
