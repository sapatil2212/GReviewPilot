/**
 * API response helpers. Enforces the { success, data | error } contract
 * everywhere so clients can rely on a stable shape.
 */

import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AppError } from "./errors";
import { logger } from "./logger";
import { isProd } from "./env";

export interface ApiSuccess<T> {
  success: true;
  message?: string;
  data: T;
}

export interface ApiError {
  success: false;
  error: {
    code: string;
    message: string;
    fields?: Record<string, string>;
  };
}

export function ok<T>(data: T, init?: { message?: string; status?: number }) {
  const body: ApiSuccess<T> = {
    success: true,
    data,
    ...(init?.message ? { message: init.message } : {}),
  };
  return NextResponse.json(body, { status: init?.status ?? 200 });
}

export function fail(
  code: string,
  message: string,
  init?: { status?: number; fields?: Record<string, string>; headers?: HeadersInit },
) {
  const body: ApiError = {
    success: false,
    error: { code, message, ...(init?.fields ? { fields: init.fields } : {}) },
  };
  return NextResponse.json(body, {
    status: init?.status ?? 400,
    headers: init?.headers,
  });
}

/**
 * Central error handler for Route Handlers. Wrap the handler body:
 *
 *   export async function POST(req: Request) {
 *     try { ... } catch (err) { return handleError(err); }
 *   }
 */
export function handleError(err: unknown): Response {
  if (err instanceof ZodError) {
    const fields = err.issues.reduce<Record<string, string>>((acc, issue) => {
      const key = issue.path.join(".") || "_";
      if (!acc[key]) acc[key] = issue.message;
      return acc;
    }, {});
    return fail("VALIDATION_ERROR", "Invalid request payload", {
      status: 400,
      fields,
    });
  }

  if (err instanceof AppError) {
    const headers: Record<string, string> = {};
    if (err.code === "RATE_LIMITED" && err.meta?.retryAfterSeconds) {
      headers["Retry-After"] = String(err.meta.retryAfterSeconds);
    }
    return fail(err.code, err.publicMessage, {
      status: err.status,
      headers,
    });
  }

  // Unknown / unexpected — never leak the raw message in prod.
  logger.error("Unhandled server error", {
    err: err instanceof Error ? { name: err.name, message: err.message, stack: err.stack } : err,
  });
  return fail(
    "INTERNAL_ERROR",
    isProd ? "Something went wrong. Please try again." : String(err instanceof Error ? err.message : err),
    { status: 500 },
  );
}
