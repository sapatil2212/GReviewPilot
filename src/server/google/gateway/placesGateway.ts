/**
 * Places API access, routed through the central gateway.
 *
 * The Quick Connect and review-sync paths previously called `fetch` directly.
 * That skipped everything the gateway provides — the token-bucket rate
 * limiter, retry with backoff, request telemetry and error classification —
 * even though `detectApiName` and `qpmForApi` already had a PLACES branch
 * waiting for them. A burst of Quick Connect activity could therefore blow
 * through the Places quota with no record of it in `GoogleApiRequestLog`.
 *
 * Places is also authenticated with an API key rather than OAuth, so these
 * helpers exist separately from `GoogleBusinessClient`.
 */

import {
  GoogleGatewayError,
  googleApiGateway,
} from "./googleApiGateway";
import { classifyGoogleError } from "./errorClassifier";
import type { GoogleErrorCategory } from "./types";
import { env } from "@/server/utils/env";
import { logger } from "@/server/utils/logger";

export interface PlacesResult<T> {
  data: T | null;
  category: GoogleErrorCategory | null;
  /** Raw Google status/message, for logs only — never shown to tenants. */
  detail: string | null;
}

/**
 * Places API (New). The API key travels in a header, so it never reaches
 * request telemetry (which records only the sanitized URL).
 */
export async function placesGetNew<T>(opts: {
  placeId: string;
  fieldMask: string;
  tenantId?: string | null;
}): Promise<PlacesResult<T>> {
  const url = `https://places.googleapis.com/v1/places/${encodeURIComponent(opts.placeId)}`;
  try {
    const res = await googleApiGateway.request<T>({
      apiName: "PLACES",
      method: "GET",
      url,
      tenantId: opts.tenantId ?? null,
      headers: {
        "X-Goog-Api-Key": env.GOOGLE_MAPS_API_KEY,
        "X-Goog-FieldMask": opts.fieldMask,
      },
    });
    return { data: res.data, category: null, detail: null };
  } catch (err) {
    return toFailure(err, "Places (new)", opts.placeId);
  }
}

/**
 * Legacy Place Details.
 *
 * This endpoint answers HTTP 200 even when it refuses the request, putting the
 * real outcome in a `status` field. The gateway only sees a successful
 * response, so REQUEST_DENIED / OVER_QUERY_LIMIT would otherwise be invisible
 * to both the rate limiter's telemetry and to whoever is debugging why Quick
 * Connect silently stopped resolving places.
 */
export async function placesGetLegacy<T extends { status?: string; error_message?: string }>(
  opts: {
    path: string;
    params: Record<string, string>;
    tenantId?: string | null;
  },
): Promise<PlacesResult<T>> {
  const url = new URL(`https://maps.googleapis.com/maps/api/${opts.path}`);
  for (const [k, v] of Object.entries(opts.params)) {
    url.searchParams.set(k, v);
  }
  url.searchParams.set("key", env.GOOGLE_MAPS_API_KEY);

  try {
    const res = await googleApiGateway.request<T>({
      apiName: "PLACES",
      method: "GET",
      url: url.toString(),
      tenantId: opts.tenantId ?? null,
    });

    const status = res.data?.status;
    if (status && status !== "OK" && status !== "ZERO_RESULTS") {
      const category = classifyLegacyStatus(status);
      logger.warn("Places (legacy) refused the request", {
        status,
        category,
        // Google puts the actionable text here, e.g. "This API project is not
        // authorized to use this API" or a referrer-restriction complaint.
        errorMessage: res.data?.error_message,
      });
      return {
        data: null,
        category,
        detail: res.data?.error_message ?? status,
      };
    }

    return { data: res.data, category: null, detail: null };
  } catch (err) {
    return toFailure(err, "Places (legacy)", opts.params.place_id ?? "");
  }
}

/**
 * Map the legacy endpoint's `status` string onto our categories so a Places
 * failure reads the same way as a Business Profile one.
 */
function classifyLegacyStatus(status: string): GoogleErrorCategory {
  switch (status) {
    case "REQUEST_DENIED":
      // Almost always the API key: Places API not enabled on the project, or
      // the key is restricted to referrers/IPs that exclude this server.
      return "GOOGLE_API_DISABLED";
    case "OVER_QUERY_LIMIT":
      return "GOOGLE_QUOTA_EXCEEDED";
    case "INVALID_REQUEST":
      return "GOOGLE_INVALID_REQUEST";
    case "NOT_FOUND":
      return "GOOGLE_NOT_FOUND";
    case "UNKNOWN_ERROR":
      return "GOOGLE_SERVER_ERROR";
    default:
      return "GOOGLE_UNKNOWN_ERROR";
  }
}

function toFailure<T>(
  err: unknown,
  label: string,
  placeId: string,
): PlacesResult<T> {
  const category =
    err instanceof GoogleGatewayError
      ? err.category
      : classifyGoogleError(0, undefined, true);
  const detail = err instanceof Error ? err.message : String(err);
  logger.warn(`${label} lookup failed`, { placeId, category, detail });
  return { data: null, category, detail };
}
