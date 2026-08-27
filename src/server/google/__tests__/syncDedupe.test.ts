/**
 * Sync job dedupe + retry scheduling helpers (pure logic tests).
 * Run: npx tsx --test src/server/google/__tests__/syncDedupe.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { syncLockKey } from "../sync/syncLock.service";
import { isRetryableCategory } from "../gateway/errorClassifier";

describe("syncLockKey", () => {
  it("namespaces tenant + account + kind", () => {
    const a = syncLockKey({
      tenantId: "t1",
      googleAccountId: "g1",
      kind: "LOCATIONS",
    });
    const b = syncLockKey({
      tenantId: "t1",
      googleAccountId: "g1",
      kind: "REVIEWS",
    });
    assert.notEqual(a, b);
    assert.equal(a.startsWith("t1:g1:"), true);
  });
});

describe("429 handling policy", () => {
  it("quota and rate limit are retryable; auth is not", () => {
    assert.equal(isRetryableCategory("GOOGLE_QUOTA_EXCEEDED"), true);
    assert.equal(isRetryableCategory("GOOGLE_RATE_LIMIT"), true);
    assert.equal(isRetryableCategory("GOOGLE_AUTH_ERROR"), false);
    assert.equal(isRetryableCategory("GOOGLE_PERMISSION_ERROR"), false);
  });
});

describe("backoff progression concept", () => {
  it("grows exponentially and caps", () => {
    const base = 2000;
    const max = 300_000;
    const delays = [0, 1, 2, 3, 4, 5].map((attempt) =>
      Math.min(max, base * Math.pow(2, attempt)),
    );
    assert.equal(delays[0], 2000);
    assert.equal(delays[1], 4000);
    assert.equal(delays[2], 8000);
    assert.ok(delays[5]! <= max);
    assert.ok(delays.every((d, i) => i === 0 || d >= delays[i - 1]!));
  });
});
