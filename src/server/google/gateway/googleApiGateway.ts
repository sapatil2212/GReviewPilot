/**
 * Centralized Google API gateway.
 *
 * ALL outbound Google Business Profile / Places HTTP calls must go
 * through `googleApiGateway.request`. Feature services must not call
 * Google fetch() directly.
 */

import { randomBytes } from "node:crypto";
import { prisma } from "@/server/db/prisma";
import { env } from "@/server/utils/env";
import { logger } from "@/server/utils/logger";
import {
  classifyGoogleError,
  isRetryableCategory,
  operatorRemediation,
} from "./errorClassifier";
import { withGoogleRateLimit } from "./rateLimiter";
import {
  detectApiName,
  parseRetryAfterMs,
  sanitizeEndpoint,
  type GoogleApiName,
  type GoogleErrorCategory,
  type GoogleGatewayRequest,
  type GoogleGatewayResponse,
} from "./types";

export class GoogleGatewayError extends Error {
  readonly status: number;
  readonly category: GoogleErrorCategory;
  readonly code?: string;
  readonly body?: unknown;
  readonly requestId: string;
  readonly retryable: boolean;
  /** Parsed from the `Retry-After` response header, when Google sent one. */
  readonly retryAfterMs?: number;

  constructor(opts: {
    status: number;
    message: string;
    category: GoogleErrorCategory;
    requestId: string;
    code?: string;
    body?: unknown;
    retryAfterMs?: number;
  }) {
    super(opts.message);
    this.name = "GoogleGatewayError";
    this.status = opts.status;
    this.category = opts.category;
    this.code = opts.code;
    this.body = opts.body;
    this.requestId = opts.requestId;
    this.retryAfterMs = opts.retryAfterMs;
    this.retryable = isRetryableCategory(opts.category);
  }
}

/** Short-lived GET coalesce cache (same process). */
const coalesce = new Map<
  string,
  { expiresAt: number; promise: Promise<GoogleGatewayResponse> }
>();
const COALESCE_TTL_MS = 10_000;

function coalesceKey(req: GoogleGatewayRequest): string | null {
  const method = (req.method ?? "GET").toUpperCase();
  if (method !== "GET") return null;
  return `${req.tenantId ?? ""}:${req.apiName}:${req.url}`;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text.slice(0, 500) };
  }
}

function pickError(body: unknown): string | null {
  if (body && typeof body === "object") {
    const b = body as Record<string, unknown>;
    if (typeof b.error_description === "string") return b.error_description;
    if (typeof b.error === "string") return b.error;
    const inner = b.error as Record<string, unknown> | undefined;
    if (inner && typeof inner.message === "string") return inner.message;
  }
  return null;
}

function pickErrorCode(body: unknown): string | undefined {
  if (body && typeof body === "object") {
    const b = body as Record<string, unknown>;
    if (typeof b.error === "string") return b.error;
    const inner = b.error as Record<string, unknown> | undefined;
    if (inner && typeof inner.status === "string") return inner.status;
  }
  return undefined;
}

async function logRequest(entry: {
  requestId: string;
  tenantId?: string | null;
  googleAccountId?: string | null;
  apiName: GoogleApiName;
  endpoint: string;
  method: string;
  statusCode: number | null;
  durationMs: number;
  retryCount: number;
  errorCategory?: string | null;
}): Promise<void> {
  try {
    await prisma.googleApiRequestLog.create({
      data: {
        requestId: entry.requestId,
        tenantId: entry.tenantId ?? null,
        googleAccountId: entry.googleAccountId ?? null,
        apiName: entry.apiName,
        endpoint: entry.endpoint.slice(0, 500),
        method: entry.method.slice(0, 10),
        statusCode: entry.statusCode,
        durationMs: entry.durationMs,
        retryCount: entry.retryCount,
        errorCategory: entry.errorCategory ?? null,
      },
    });
  } catch (err) {
    // Telemetry must never break the request path.
    logger.debug("GoogleApiRequestLog write skipped", {
      err: err instanceof Error ? err.message : String(err),
    });
  }
}

function backoffMs(attempt: number, retryAfterMs?: number): number {
  if (retryAfterMs && retryAfterMs > 0) return retryAfterMs;
  const base = env.GOOGLE_BACKOFF_BASE_MS;
  const max = env.GOOGLE_BACKOFF_MAX_MS;
  const jitter = 1 + (Math.random() * 0.4 - 0.2);
  return Math.min(max, Math.round(base * Math.pow(2, attempt) * jitter));
}

async function executeOnce<T>(
  req: GoogleGatewayRequest,
  requestId: string,
): Promise<GoogleGatewayResponse<T>> {
  const method = (req.method ?? "GET").toUpperCase();
  const started = Date.now();
  let status = 0;
  let retryCount = 0;

  const runFetch = async (): Promise<GoogleGatewayResponse<T>> => {
    const headers: Record<string, string> = {
      Accept: "application/json",
      ...(req.headers ?? {}),
    };
    if (req.accessToken) {
      headers.Authorization = `Bearer ${req.accessToken}`;
    }

    let res: Response;
    try {
      res = await fetch(req.url, {
        method,
        headers,
        body: req.body ?? undefined,
      });
    } catch (err) {
      const durationMs = Date.now() - started;
      const category = classifyGoogleError(0, undefined, true);
      await logRequest({
        requestId,
        tenantId: req.tenantId,
        googleAccountId: req.googleAccountId,
        apiName: req.apiName,
        endpoint: sanitizeEndpoint(req.url),
        method,
        statusCode: null,
        durationMs,
        retryCount,
        errorCategory: category,
      });
      throw new GoogleGatewayError({
        status: 0,
        message: err instanceof Error ? err.message : "Network error",
        category,
        requestId,
      });
    }

    status = res.status;
    const text = await res.text();
    const data = text.length > 0 ? safeJson(text) : {};
    const durationMs = Date.now() - started;

    if (!res.ok) {
      const category = classifyGoogleError(res.status, data);

      // Misconfiguration is invisible to tenants by design (their message is
      // sanitized), so make it loud for operators with the raw Google text.
      const remediation = operatorRemediation(category);
      if (remediation) {
        logger.error("Google API rejected the request — operator action needed", {
          requestId,
          apiName: req.apiName,
          endpoint: sanitizeEndpoint(req.url),
          status: res.status,
          category,
          googleMessage: pickError(data) ?? `${res.status} ${res.statusText}`,
          remediation,
        });
      }

      await logRequest({
        requestId,
        tenantId: req.tenantId,
        googleAccountId: req.googleAccountId,
        apiName: req.apiName,
        endpoint: sanitizeEndpoint(req.url),
        method,
        statusCode: res.status,
        durationMs,
        retryCount,
        errorCategory: category,
      });
      throw new GoogleGatewayError({
        status: res.status,
        message: pickError(data) ?? `${res.status} ${res.statusText}`,
        category,
        requestId,
        code: pickErrorCode(data),
        body: data,
        // Prefer Google's own backoff hint over our exponential guess.
        retryAfterMs: parseRetryAfterMs(res.headers.get("retry-after")),
      });
    }

    await logRequest({
      requestId,
      tenantId: req.tenantId,
      googleAccountId: req.googleAccountId,
      apiName: req.apiName,
      endpoint: sanitizeEndpoint(req.url),
      method,
      statusCode: res.status,
      durationMs,
      retryCount,
      errorCategory: null,
    });

    return {
      ok: true,
      status: res.status,
      data: data as T,
      requestId,
      durationMs,
      retryCount,
    };
  };

  const maxRetries = req.maxRetries ?? env.GOOGLE_RETRY_LIMIT;
  let lastErr: GoogleGatewayError | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (req.skipRateLimit) {
        return await runFetch();
      }
      return await withGoogleRateLimit(req.apiName, runFetch);
    } catch (err) {
      if (!(err instanceof GoogleGatewayError) || !err.retryable) {
        throw err;
      }
      lastErr = err;
      retryCount = attempt + 1;
      if (attempt >= maxRetries) break;

      // Quota / rate-limit: do not hot-loop — throw so the sync job can reschedule.
      if (
        err.category === "GOOGLE_QUOTA_EXCEEDED" ||
        err.category === "GOOGLE_RATE_LIMIT"
      ) {
        throw err;
      }

      const wait = backoffMs(attempt, err.retryAfterMs);
      logger.warn("Google gateway retrying", {
        requestId,
        apiName: req.apiName,
        attempt: attempt + 1,
        waitMs: wait,
        retryAfterHonored: err.retryAfterMs !== undefined,
        category: err.category,
        status,
      });
      await new Promise((r) => setTimeout(r, wait));
    }
  }

  throw (
    lastErr ??
    new GoogleGatewayError({
      status: 429,
      message: "Google API quota exceeded after retries",
      category: "GOOGLE_QUOTA_EXCEEDED",
      requestId,
    })
  );
}

export const googleApiGateway = {
  async request<T = unknown>(
    req: Omit<GoogleGatewayRequest, "apiName"> & { apiName?: GoogleApiName },
  ): Promise<GoogleGatewayResponse<T>> {
    const apiName = req.apiName ?? detectApiName(req.url);
    const full: GoogleGatewayRequest = { ...req, apiName };
    const requestId = randomBytes(8).toString("hex");

    const key = coalesceKey(full);
    if (key) {
      const hit = coalesce.get(key);
      if (hit && hit.expiresAt > Date.now()) {
        return hit.promise as Promise<GoogleGatewayResponse<T>>;
      }
      // A rejected promise must never be cached: a single transient 503
      // would otherwise be replayed to every caller for the whole TTL,
      // and an entry that outlives its own TTL check leaks the URL key.
      const promise = executeOnce<T>(full, requestId);
      coalesce.set(key, { expiresAt: Date.now() + COALESCE_TTL_MS, promise });
      promise.catch(() => {
        if (coalesce.get(key)?.promise === promise) coalesce.delete(key);
      });
      scheduleCoalesceEviction(key, promise);
      return promise;
    }

    return executeOnce<T>(full, requestId);
  },
};

/**
 * Drop the entry once its TTL elapses. `unref` keeps the timer from
 * holding a serverless invocation or a test runner open.
 */
function scheduleCoalesceEviction(
  key: string,
  promise: Promise<GoogleGatewayResponse<unknown>>,
): void {
  const timer = setTimeout(() => {
    if (coalesce.get(key)?.promise === promise) coalesce.delete(key);
  }, COALESCE_TTL_MS);
  if (typeof timer.unref === "function") timer.unref();
}
