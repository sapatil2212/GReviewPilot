/**
 * Unit tests for Google gateway error classification + helpers.
 * Run: npx tsx --test src/server/google/__tests__/errorClassifier.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  classifyGoogleError,
  isRetryableCategory,
  isTerminalCategory,
  operatorRemediation,
  requiresReconnect,
  userFacingGoogleMessage,
} from "../gateway/errorClassifier";
import {
  detectApiName,
  parseRetryAfterMs,
  sanitizeEndpoint,
} from "../gateway/types";

describe("classifyGoogleError", () => {
  it("maps 429 / RESOURCE_EXHAUSTED to quota or rate limit", () => {
    assert.equal(
      classifyGoogleError(429, {
        error: { status: "RESOURCE_EXHAUSTED", message: "Quota exceeded" },
      }),
      "GOOGLE_QUOTA_EXCEEDED",
    );
    assert.equal(
      classifyGoogleError(429, { error: { message: "Rate limit exceeded" } }),
      "GOOGLE_RATE_LIMIT",
    );
  });

  it("maps auth and permission errors", () => {
    assert.equal(classifyGoogleError(401, {}), "GOOGLE_AUTH_ERROR");
    assert.equal(
      classifyGoogleError(403, { error: { status: "PERMISSION_DENIED" } }),
      "GOOGLE_PERMISSION_ERROR",
    );
  });

  it("maps 404 and 5xx", () => {
    assert.equal(classifyGoogleError(404, {}), "GOOGLE_NOT_FOUND");
    assert.equal(classifyGoogleError(503, {}), "GOOGLE_SERVER_ERROR");
  });

  it("marks network errors", () => {
    assert.equal(
      classifyGoogleError(0, undefined, true),
      "GOOGLE_NETWORK_ERROR",
    );
  });

  it("does not retry auth / not found", () => {
    assert.equal(isRetryableCategory("GOOGLE_AUTH_ERROR"), false);
    assert.equal(isRetryableCategory("GOOGLE_NOT_FOUND"), false);
    assert.equal(isRetryableCategory("GOOGLE_QUOTA_EXCEEDED"), true);
    assert.equal(isRetryableCategory("GOOGLE_SERVER_ERROR"), true);
  });

  it("never exposes raw quota text in user messages", () => {
    const msg = userFacingGoogleMessage("GOOGLE_QUOTA_EXCEEDED");
    assert.equal(msg.includes("mybusiness"), false);
    assert.equal(msg.includes("Requests per minute"), false);
    assert.match(msg, /queued|retry/i);
  });
});

describe("detectApiName", () => {
  it("detects Account Management vs Business Info vs Reviews", () => {
    assert.equal(
      detectApiName(
        "https://mybusinessaccountmanagement.googleapis.com/v1/accounts",
      ),
      "ACCOUNT_MANAGEMENT",
    );
    assert.equal(
      detectApiName(
        "https://mybusinessbusinessinformation.googleapis.com/v1/accounts/x/locations",
      ),
      "BUSINESS_INFORMATION",
    );
    assert.equal(
      detectApiName(
        "https://mybusiness.googleapis.com/v4/accounts/x/locations/y/reviews",
      ),
      "REVIEWS",
    );
  });
});

describe("sanitizeEndpoint", () => {
  it("strips query values but keeps path", () => {
    const s = sanitizeEndpoint(
      "https://example.com/v1/accounts?pageToken=secret&pageSize=50",
    );
    assert.equal(s.includes("secret"), false);
    assert.equal(s.includes("/v1/accounts"), true);
  });
});

describe("OAuth error bodies (classified by body, not status)", () => {
  it("treats invalid_grant as an auth error despite its HTTP 400", () => {
    // Regression: a revoked/expired refresh token arrives as 400
    // { error: "invalid_grant" }. Classifying on status alone produced
    // GOOGLE_INVALID_REQUEST, which never flipped the account to
    // REAUTH_REQUIRED, so auto-sync retried it on every interval forever.
    const category = classifyGoogleError(400, {
      error: "invalid_grant",
      error_description: "Token has been expired or revoked.",
    });
    assert.equal(category, "GOOGLE_AUTH_ERROR");
    assert.equal(requiresReconnect(category), true);
    assert.equal(isRetryableCategory(category), false);
  });

  it("maps access_denied to a consent problem, not a permission problem", () => {
    const category = classifyGoogleError(403, { error: "access_denied" });
    assert.equal(category, "GOOGLE_CONSENT_REQUIRED");
    assert.equal(isRetryableCategory(category), false);
    assert.equal(isTerminalCategory(category), true);
  });

  it("maps bad client credentials to a config error", () => {
    assert.equal(
      classifyGoogleError(401, { error: "invalid_client" }),
      "GOOGLE_CONFIG_ERROR",
    );
    assert.equal(
      classifyGoogleError(400, { error: "redirect_uri_mismatch" }),
      "GOOGLE_CONFIG_ERROR",
    );
  });

  it("does not ask the user to reconnect for project-level failures", () => {
    // Reconnecting cannot fix a Cloud project problem, so these must not
    // drive the "Reconnect" banner even though they are terminal.
    for (const c of ["GOOGLE_API_DISABLED", "GOOGLE_CONFIG_ERROR"] as const) {
      assert.equal(isTerminalCategory(c), true);
      assert.equal(requiresReconnect(c), false);
    }
  });
});

describe("403 reason extraction", () => {
  it("detects a disabled / non-allowlisted API from error.details[].reason", () => {
    assert.equal(
      classifyGoogleError(403, {
        error: {
          code: 403,
          status: "PERMISSION_DENIED",
          message:
            "My Business Account Management API has not been used in project 123 before or it is disabled.",
          details: [{ reason: "SERVICE_DISABLED" }],
        },
      }),
      "GOOGLE_API_DISABLED",
    );
  });

  it("detects a disabled API from prose when no reason code is present", () => {
    assert.equal(
      classifyGoogleError(403, {
        error: {
          status: "PERMISSION_DENIED",
          message:
            "Business Profile API has not been used in project 456 before or it is disabled.",
        },
      }),
      "GOOGLE_API_DISABLED",
    );
  });

  it("detects an insufficient scope from the legacy errors[].reason shape", () => {
    assert.equal(
      classifyGoogleError(403, {
        error: {
          message: "Request had insufficient authentication scopes.",
          errors: [{ reason: "ACCESS_TOKEN_SCOPE_INSUFFICIENT" }],
        },
      }),
      "GOOGLE_SCOPE_INSUFFICIENT",
    );
  });

  it("still reports a plain 403 as a permission error", () => {
    assert.equal(
      classifyGoogleError(403, {
        error: { status: "PERMISSION_DENIED", message: "The caller does not have permission" },
      }),
      "GOOGLE_PERMISSION_ERROR",
    );
  });
});

describe("user-facing vs operator-facing messages", () => {
  it("gives every new category a sanitized user message", () => {
    for (const c of [
      "GOOGLE_API_DISABLED",
      "GOOGLE_CONSENT_REQUIRED",
      "GOOGLE_SCOPE_INSUFFICIENT",
      "GOOGLE_CONFIG_ERROR",
    ] as const) {
      const msg = userFacingGoogleMessage(c);
      assert.ok(msg.length > 0);
      // Project ids, scope URLs and env var names must never reach a tenant.
      assert.equal(/project|googleapis\.com|GOOGLE_CLIENT/i.test(msg), false);
    }
  });

  it("gives operators remediation only for the failures they own", () => {
    assert.ok(operatorRemediation("GOOGLE_API_DISABLED"));
    assert.ok(operatorRemediation("GOOGLE_CONFIG_ERROR"));
    assert.ok(operatorRemediation("GOOGLE_CONSENT_REQUIRED"));
    // Transient conditions need no human action.
    assert.equal(operatorRemediation("GOOGLE_RATE_LIMIT"), null);
    assert.equal(operatorRemediation("GOOGLE_SERVER_ERROR"), null);
  });
});

describe("parseRetryAfterMs", () => {
  it("parses delay-seconds", () => {
    assert.equal(parseRetryAfterMs("30"), 30_000);
  });

  it("parses an HTTP date in the future", () => {
    const at = new Date(Date.now() + 20_000).toUTCString();
    const ms = parseRetryAfterMs(at);
    assert.ok(ms !== undefined && ms > 5_000 && ms <= 20_000);
  });

  it("ignores absent, malformed, and past values", () => {
    assert.equal(parseRetryAfterMs(null), undefined);
    assert.equal(parseRetryAfterMs(""), undefined);
    assert.equal(parseRetryAfterMs("soon"), undefined);
    assert.equal(parseRetryAfterMs("0"), undefined);
    assert.equal(parseRetryAfterMs(new Date(Date.now() - 60_000).toUTCString()), undefined);
  });
});

describe("detectApiName covers Places", () => {
  it("routes both Places endpoints to the PLACES quota bucket", () => {
    assert.equal(
      detectApiName("https://places.googleapis.com/v1/places/abc"),
      "PLACES",
    );
    assert.equal(
      detectApiName("https://maps.googleapis.com/maps/api/place/details/json"),
      "PLACES",
    );
  });
});

describe("sanitizeEndpoint hides the Places API key", () => {
  it("keeps the param name but drops the key value", () => {
    const s = sanitizeEndpoint(
      "https://maps.googleapis.com/maps/api/place/details/json?place_id=X&key=SECRET",
    );
    assert.equal(s.includes("SECRET"), false);
    assert.equal(s.includes("key"), true);
  });
});
